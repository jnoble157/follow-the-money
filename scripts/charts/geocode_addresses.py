"""Extract distinct addresses from the Austin parquet, geocode via Census,
and emit per-layer aggregates as JSON for the web map.

Layers written to web/public/map/:
  filers.json      filer + treasurer addresses (PAC-house signal)
  payees.json      vendor / payee addresses (vendor concentration)
  clients.json     lobbyist client addresses
  registrants.json lobbyist business addresses
  property.json    real-property disclosures
"""

from __future__ import annotations

import csv
import io
import json
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

import duckdb

REPO = Path(__file__).resolve().parents[2]
PARQUET = REPO / "data" / "parquet" / "austin"
GEO_DIR = REPO / "data" / "parquet" / "geocoded"
WEB_OUT = REPO / "web" / "public" / "map"

CENSUS_URL = (
    "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
)
BENCHMARK = "Public_AR_Current"
BATCH = 5000  # Census limit is 10k; smaller batches recover from timeouts faster


def _norm(s: str | None) -> str:
    if s is None:
        return ""
    return re.sub(r"\s+", " ", str(s).strip())


def split_csz(csz: str | None) -> tuple[str, str, str]:
    """Split 'Austin, TX, 78704' into (city, state, zip). Returns ('','','') if unparseable."""
    if not csz:
        return "", "", ""
    parts = [p.strip() for p in str(csz).split(",")]
    if len(parts) >= 3:
        return parts[0], parts[1][:2], re.sub(r"[^0-9]", "", parts[2])[:5]
    if len(parts) == 2:
        return parts[0], parts[1][:2], ""
    return parts[0], "", ""


def collect_layers(con: duckdb.DuckDBPyConnection) -> dict[str, list[dict]]:
    """Return {layer_name: [point_dict, ...]} keyed on (addr, city, state, zip).

    Each point_dict has the join keys plus layer-specific weight + label fields.
    """
    layers: dict[str, list[dict]] = {}

    # Filers + treasurers — report_detail has both.
    rd = con.execute(f"""
        SELECT Filer_Name, Filer_Address, Filer_City_State_Zip,
               Treasurer_Name, Treasurer_Address, Treasurer_City_State_Zip
        FROM '{PARQUET}/cf/report_detail.parquet'
        WHERE Filer_Address IS NOT NULL OR Treasurer_Address IS NOT NULL
    """).fetchall()

    filer_by_addr: dict[tuple, dict] = {}
    for filer, faddr, fcsz, treas, taddr, tcsz in rd:
        if faddr:
            city, state, zip_ = split_csz(fcsz)
            k = (_norm(faddr), city, state, zip_)
            d = filer_by_addr.setdefault(k, {"filers": set(), "treasurers": set()})
            if filer:
                d["filers"].add(_norm(filer))
        if taddr:
            city, state, zip_ = split_csz(tcsz)
            k = (_norm(taddr), city, state, zip_)
            d = filer_by_addr.setdefault(k, {"filers": set(), "treasurers": set()})
            if treas:
                d["treasurers"].add(_norm(treas))

    layers["filers"] = [
        {
            "addr": k[0],
            "city": k[1],
            "state": k[2],
            "zip": k[3],
            "n_filers": len(v["filers"]),
            "n_treasurers": len(v["treasurers"]),
            "names": sorted(v["filers"] | v["treasurers"])[:20],
        }
        for k, v in filer_by_addr.items()
    ]

    # Payees / vendors — expenditures.
    pay = con.execute(f"""
        SELECT Payee, Payee_Address, City_State_Zip,
               COUNT(*) AS n,
               SUM(TRY_CAST(Payment_Amount AS DOUBLE)) AS total
        FROM '{PARQUET}/cf/expenditures.parquet'
        WHERE Payee_Address IS NOT NULL AND Payee_Address <> ''
        GROUP BY 1,2,3
    """).fetchall()
    payee_by_addr: dict[tuple, dict] = {}
    for payee, addr, csz, n, total in pay:
        city, state, zip_ = split_csz(csz)
        k = (_norm(addr), city, state, zip_)
        d = payee_by_addr.setdefault(
            k, {"payees": set(), "n": 0, "total": 0.0}
        )
        d["payees"].add(_norm(payee or ""))
        d["n"] += int(n or 0)
        d["total"] += float(total or 0.0)
    layers["payees"] = [
        {
            "addr": k[0],
            "city": k[1],
            "state": k[2],
            "zip": k[3],
            "n_payees": len(v["payees"]),
            "n_payments": v["n"],
            "total": round(v["total"], 2),
            "names": sorted(v["payees"])[:20],
        }
        for k, v in payee_by_addr.items()
    ]

    # Lobby clients.
    cli = con.execute(f"""
        SELECT
          CONCAT_WS(' ',
            COALESCE(NULLIF(CLIENT_FIRST_NAME,''), ''),
            COALESCE(NULLIF(CLIENT_LAST_NAME,''), '')) AS client_name,
          BUSINESS_DESC,
          CLIENT_ADR1, CLIENT_CITY, CLIENT_STATE, CLIENT_ZIP,
          COUNT(DISTINCT REGISTRANT_ID) AS n_lobbyists,
          COUNT(*) AS n_engagements
        FROM '{PARQUET}/lobby/clients.parquet'
        WHERE CLIENT_ADR1 IS NOT NULL AND CLIENT_ADR1 <> ''
        GROUP BY 1,2,3,4,5,6
    """).fetchall()
    client_by_addr: dict[tuple, dict] = {}
    for name, biz, addr, city, state, zip_, n_lob, n_eng in cli:
        k = (_norm(addr), _norm(city), _norm(state)[:2], _norm(zip_)[:5])
        d = client_by_addr.setdefault(
            k, {"clients": set(), "biz": set(), "n_lobbyists": 0, "n_engagements": 0}
        )
        if name and name.strip():
            d["clients"].add(_norm(name))
        if biz:
            d["biz"].add(_norm(biz))
        d["n_lobbyists"] = max(d["n_lobbyists"], int(n_lob or 0))
        d["n_engagements"] += int(n_eng or 0)
    layers["clients"] = [
        {
            "addr": k[0],
            "city": k[1],
            "state": k[2],
            "zip": k[3],
            "n_clients": len(v["clients"]),
            "n_lobbyists": v["n_lobbyists"],
            "n_engagements": v["n_engagements"],
            "names": sorted(v["clients"])[:20],
            "biz": sorted(v["biz"])[:5],
        }
        for k, v in client_by_addr.items()
    ]

    # Lobbyist business addresses.
    reg = con.execute(f"""
        SELECT REGISTRANT_BUS_ADR1, REGISTRANT_BUS_CITY, REGISTRANT_BUS_STATE, REGISTRANT_BUS_ZIP,
               COUNT(DISTINCT REGISTRANT_ID) AS n_registrants
        FROM '{PARQUET}/lobby/reports.parquet'
        WHERE REGISTRANT_BUS_ADR1 IS NOT NULL AND REGISTRANT_BUS_ADR1 <> ''
        GROUP BY 1,2,3,4
    """).fetchall()
    layers["registrants"] = [
        {
            "addr": _norm(addr),
            "city": _norm(city),
            "state": _norm(state)[:2],
            "zip": _norm(zip_)[:5],
            "n_registrants": int(n or 0),
        }
        for addr, city, state, zip_, n in reg
    ]

    # Real property — lobbyist disclosed properties.
    rp = con.execute(f"""
        SELECT RP_ADR1, RP_CITY, RP_STATE, RP_ZIP,
               COUNT(DISTINCT REPORT_ID) AS n_reports,
               ANY_VALUE(RP_PROPERTY_DESC) AS desc_sample
        FROM '{PARQUET}/lobby/real_property.parquet'
        WHERE RP_ADR1 IS NOT NULL AND RP_ADR1 <> ''
        GROUP BY 1,2,3,4
    """).fetchall()
    layers["property"] = [
        {
            "addr": _norm(addr),
            "city": _norm(city),
            "state": _norm(state)[:2],
            "zip": _norm(zip_)[:5],
            "n_reports": int(n or 0),
            "desc": _norm(desc),
        }
        for addr, city, state, zip_, n, desc in rp
    ]

    return layers


def all_unique_keys(layers: dict[str, list[dict]]) -> list[tuple[str, str, str, str]]:
    seen = set()
    keys = []
    for pts in layers.values():
        for p in pts:
            k = (p["addr"], p["city"], p["state"], p["zip"])
            if not k[0] or not k[1]:
                continue
            if k in seen:
                continue
            seen.add(k)
            keys.append(k)
    return keys


def census_batch(rows: list[tuple[int, str, str, str, str]]) -> dict[int, tuple[float, float, str]]:
    """POST a batch to Census Geocoder. Returns {row_id: (lon, lat, matched_address)}."""
    buf = io.StringIO()
    w = csv.writer(buf)
    for rid, street, city, state, zip_ in rows:
        # Census wants: id, street, city, state, zip
        w.writerow([rid, street, city, state, zip_])
    body = buf.getvalue().encode("utf-8")

    boundary = "----censusbatch" + str(int(time.time() * 1000))
    parts = []
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(
        b'Content-Disposition: form-data; name="addressFile"; filename="addr.csv"\r\n'
        b"Content-Type: text/csv\r\n\r\n"
    )
    parts.append(body)
    parts.append(b"\r\n")
    for k, v in [("benchmark", BENCHMARK)]:
        parts.append(f"--{boundary}\r\n".encode())
        parts.append(f'Content-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f"--{boundary}--\r\n".encode())
    payload = b"".join(parts)

    req = urllib.request.Request(
        CENSUS_URL,
        data=payload,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    out: dict[int, tuple[float, float, str]] = {}
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                text = resp.read().decode("utf-8", errors="replace")
            break
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"    census error attempt {attempt+1}: {e}; retrying")
            time.sleep(5)
    else:
        return out

    # Output columns: id,input_address,match_status,match_quality,matched_address,coords,tigerline,side
    reader = csv.reader(io.StringIO(text))
    for row in reader:
        if len(row) < 6:
            continue
        try:
            rid = int(row[0])
        except ValueError:
            continue
        if row[2].strip().lower() != "match":
            continue
        coords = row[5].strip()  # "lon,lat"
        if "," not in coords:
            continue
        lon_s, lat_s = coords.split(",", 1)
        try:
            lon = float(lon_s)
            lat = float(lat_s)
        except ValueError:
            continue
        out[rid] = (lon, lat, row[4].strip())
    return out


def geocode_all(keys: list[tuple], cache_path: Path) -> dict[tuple, tuple[float, float, str]]:
    cache: dict[tuple, tuple[float, float, str]] = {}
    if cache_path.exists():
        with cache_path.open() as f:
            for line in f:
                rec = json.loads(line)
                cache[tuple(rec["k"])] = (rec["lon"], rec["lat"], rec["matched"])
        print(f"  loaded {len(cache):,} cached geocodes from {cache_path}")

    todo = [k for k in keys if k not in cache]
    print(f"  geocoding {len(todo):,} new addresses ({len(cache):,} cached)")
    if not todo:
        return cache

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with cache_path.open("a") as f:
        for i in range(0, len(todo), BATCH):
            chunk = todo[i : i + BATCH]
            rows = [(j, k[0], k[1], k[2], k[3]) for j, k in enumerate(chunk)]
            t0 = time.time()
            res = census_batch(rows)
            dt = time.time() - t0
            print(
                f"    batch {i // BATCH + 1}/{(len(todo) + BATCH - 1) // BATCH}: "
                f"{len(res):,}/{len(chunk):,} matched in {dt:.1f}s"
            )
            for j, k in enumerate(chunk):
                if j in res:
                    lon, lat, matched = res[j]
                    cache[k] = (lon, lat, matched)
                    f.write(json.dumps({"k": list(k), "lon": lon, "lat": lat, "matched": matched}) + "\n")
                    f.flush()
    return cache


def write_layer(name: str, points: list[dict], geo: dict[tuple, tuple[float, float, str]]) -> None:
    out_pts = []
    for p in points:
        k = (p["addr"], p["city"], p["state"], p["zip"])
        if k not in geo:
            continue
        lon, lat, matched = geo[k]
        out_pts.append({**p, "lon": lon, "lat": lat, "matched": matched})
    WEB_OUT.mkdir(parents=True, exist_ok=True)
    path = WEB_OUT / f"{name}.json"
    path.write_text(json.dumps(out_pts, separators=(",", ":")))
    matched = len(out_pts)
    total = len(points)
    print(f"  {name}: {matched:,}/{total:,} matched -> {path.relative_to(REPO)} ({path.stat().st_size/1024:.0f} KB)")


def main() -> None:
    GEO_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()

    print("collecting layers from parquet...")
    layers = collect_layers(con)
    for name, pts in layers.items():
        print(f"  {name}: {len(pts):,} unique addresses")

    keys = all_unique_keys(layers)
    print(f"total unique (addr, city, state, zip): {len(keys):,}")

    geo = geocode_all(keys, GEO_DIR / "census_cache.jsonl")
    print(f"geocode cache size: {len(geo):,}")

    print("writing layer JSONs to web/public/map/...")
    for name, pts in layers.items():
        write_layer(name, pts, geo)

    # Summary aggregate for landing page.
    summary = {
        name: {
            "total_addresses": len(pts),
            "geocoded": sum(1 for p in pts if (p["addr"], p["city"], p["state"], p["zip"]) in geo),
        }
        for name, pts in layers.items()
    }
    (WEB_OUT / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"  summary.json -> {(WEB_OUT / 'summary.json').relative_to(REPO)}")


if __name__ == "__main__":
    main()
