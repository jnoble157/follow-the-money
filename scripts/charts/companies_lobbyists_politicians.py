"""Network chart: big Austin companies, the lobbyists they retain,
and the politicians their employees donate to.

Three columns:
  left   politicians (top recipients of contributions tied to a company's
         employees, since 2020)
  middle company / interest group  (curated list of firms that have BOTH a
         registered Austin lobbyist AND visible employee giving)
  right  registered Austin city lobbyists representing that company

Edge weight on the company-politician side encodes total $ given to that
politician by that company's employees.

Run: . .venv/bin/activate && python scripts/charts/companies_lobbyists_politicians.py
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import networkx as nx

REPO = Path(__file__).resolve().parents[2]
CONTRIB = REPO / "data" / "raw" / "austin" / "cf" / "contributions.csv"
CLIENTS = REPO / "data" / "raw" / "austin" / "lobby" / "clients.csv"
REGISTRANTS = REPO / "data" / "raw" / "austin" / "lobby" / "registrants.csv"
OUT = REPO / "data" / "figures"
OUT.mkdir(parents=True, exist_ok=True)

# Curated set of Austin power players with BOTH lobby presence and donation
# footprint. Each entry: display label -> (employer ILIKE pattern,
# client ILIKE pattern). Patterns are SQL ILIKE, % is wildcard.
COMPANIES = [
    ("Endeavor Real Estate",  "Endeavor%",            "Endeavor%"),
    ("Oracle",                "Oracle%",              "Oracle%"),
    ("Silicon Labs",          "Silicon Labs%",        "Silicon Lab%"),
    ("Austin Board of Realtors","Austin Board of Realtors%","Austin Board of Realtors%"),
    ("RECA (Real Estate Council)","Real Estate Council%", "Real Estate Council%"),
    ("Trammell Crow",         "Trammell Crow%",       "Trammell Crow%"),
    ("White Lodging",         "White Lodging%",       "White Lodging%"),
    ("Armbrust & Brown",      "Armbrust%",            "Armbrust%"),
    ("Lincoln Property",      "Lincoln Property%",    "Lincoln Property%"),
    ("Heritage Title",        "Heritage Title%",      "Heritage Title%"),
]

con = duckdb.connect()
con.execute(f"CREATE OR REPLACE VIEW c   AS SELECT * FROM '{CONTRIB}'")
con.execute(f"CREATE OR REPLACE VIEW lc  AS SELECT * FROM '{CLIENTS}'")
con.execute(f"CREATE OR REPLACE VIEW lr  AS SELECT * FROM '{REGISTRANTS}'")

# For each company, top politician recipients from employee giving since 2020
TOP_POLS_PER_CO = 4
politicians: dict[str, dict[str, float]] = {}  # company -> {politician: $}
for label, emp_pat, _ in COMPANIES:
    rows = con.execute(
        """
        SELECT Recipient, ROUND(SUM(Contribution_Amount)) AS total
        FROM c
        WHERE Donor_Reported_Employer ILIKE ?
          AND Contribution_Year >= 2020
          AND Recipient IS NOT NULL
          AND TRIM(Recipient) <> ''
          AND Contribution_Amount > 0
        GROUP BY Recipient
        ORDER BY total DESC NULLS LAST
        LIMIT ?
        """,
        [emp_pat, TOP_POLS_PER_CO],
    ).fetchall()
    politicians[label] = {r[0]: float(r[1]) for r in rows if r[1]}

# For each company, list registered city lobbyists (cap to keep readable)
TOP_LOBBYISTS_PER_CO = 4
lobbyists: dict[str, list[str]] = {}
for label, _, cli_pat in COMPANIES:
    rows = con.execute(
        """
        SELECT r.REGISTRANT_FULL_NAME AS name, COUNT(*) AS n
        FROM lc
        JOIN lr r USING (REGISTRANT_ID)
        WHERE lc.CLIENT_LAST_NAME ILIKE ?
        GROUP BY r.REGISTRANT_FULL_NAME
        ORDER BY n DESC
        LIMIT ?
        """,
        [cli_pat, TOP_LOBBYISTS_PER_CO],
    ).fetchall()
    lobbyists[label] = [r[0] for r in rows if r[0]]

# Filter out any companies that came up empty on both sides
COMPANIES = [(l, e, c) for (l, e, c) in COMPANIES
             if politicians[l] or lobbyists[l]]

# Print a textual summary so the user can sanity-check the data
print("\n=== company → politicians (top by $ since 2020) ===")
for label, _, _ in COMPANIES:
    print(f"\n{label}")
    for pol, amt in sorted(politicians[label].items(), key=lambda x: -x[1]):
        print(f"  ${amt:>9,.0f}   →  {pol}")
    if lobbyists[label]:
        print(f"  lobbyists: {', '.join(lobbyists[label])}")

# ---------- Build the graph ---------------------------------------------------

G = nx.Graph()
all_pols = sorted(
    {p for d in politicians.values() for p in d},
    key=lambda p: -sum(d.get(p, 0) for d in politicians.values()),
)

# Layout: 3 columns. Left=politicians, middle=companies, right=lobbyists.
pos = {}
COMP_X, POL_X, LOB_X = 0.5, 0.0, 1.0

# Companies stacked vertically, evenly
for i, (label, _, _) in enumerate(COMPANIES):
    y = 1.0 - (i / max(1, len(COMPANIES) - 1))
    pos[("co", label)] = (COMP_X, y)
    G.add_node(("co", label), kind="co")

# Politicians stacked vertically (only those reached by ≥1 company)
for i, p in enumerate(all_pols):
    y = 1.0 - (i / max(1, len(all_pols) - 1))
    pos[("pol", p)] = (POL_X, y)
    G.add_node(("pol", p), kind="pol")

# Lobbyists: dedupe across companies, lay out by which company has them
seen_lobs: list[str] = []
for label, _, _ in COMPANIES:
    for lob in lobbyists[label]:
        if lob not in seen_lobs:
            seen_lobs.append(lob)
        G.add_edge(("co", label), ("lob", lob), kind="lob", weight=1)
for i, lob in enumerate(seen_lobs):
    y = 1.0 - (i / max(1, len(seen_lobs) - 1))
    pos[("lob", lob)] = (LOB_X, y)
    G.add_node(("lob", lob), kind="lob")

# Company-politician edges with $ weight
for label, _, _ in COMPANIES:
    for pol, amt in politicians[label].items():
        G.add_edge(("co", label), ("pol", pol), kind="pol", weight=amt)

# ---------- Render ------------------------------------------------------------

fig, ax = plt.subplots(figsize=(15, 10))
ax.set_xlim(-0.18, 1.18)
ax.set_ylim(-0.07, 1.07)
ax.axis("off")

# Column headers
ax.text(POL_X, 1.05, "POLITICIANS / PACS", ha="center", va="bottom",
        fontsize=11, fontweight="bold", color="#234")
ax.text(COMP_X, 1.05, "COMPANIES", ha="center", va="bottom",
        fontsize=11, fontweight="bold", color="#234")
ax.text(LOB_X, 1.05, "REGISTERED CITY LOBBYISTS", ha="center", va="bottom",
        fontsize=11, fontweight="bold", color="#234")

# Edges: contribution dollars (left side)
max_amt = max((amt for d in politicians.values() for amt in d.values()), default=1)
for u, v, data in G.edges(data=True):
    if data["kind"] != "pol":
        continue
    x1, y1 = pos[u]; x2, y2 = pos[v]
    w = data["weight"]
    lw = 0.6 + 4.5 * (w / max_amt) ** 0.6
    ax.plot([x1, x2], [y1, y2], color="#D2691E", alpha=0.55, lw=lw, zorder=1)

# Edges: lobbyist representation (right side)
for u, v, data in G.edges(data=True):
    if data["kind"] != "lob":
        continue
    x1, y1 = pos[u]; x2, y2 = pos[v]
    ax.plot([x1, x2], [y1, y2], color="#4A6FA5", alpha=0.45, lw=1.0, zorder=1)

# Nodes
def draw_nodes(kind, color, size):
    xs, ys, labels = [], [], []
    for n in G.nodes:
        if G.nodes[n]["kind"] != kind:
            continue
        x, y = pos[n]
        xs.append(x); ys.append(y); labels.append(n[1])
    ax.scatter(xs, ys, s=size, color=color, edgecolor="white",
               linewidths=1.5, zorder=3)
    return xs, ys, labels

px, py, plabels = draw_nodes("pol", "#B23A48", 240)
lx, ly, llabels = draw_nodes("lob", "#3E5C76", 200)

# Companies rendered as labeled pill boxes (so the label always fits)
co_nodes = [(n[1], pos[n]) for n in G.nodes if G.nodes[n]["kind"] == "co"]
for label, (x, y) in co_nodes:
    ax.text(
        x, y, label,
        ha="center", va="center", fontsize=9, fontweight="bold",
        color="white", zorder=4,
        bbox=dict(boxstyle="round,pad=0.45", facecolor="#1F4E5F",
                  edgecolor="white", linewidth=1.5),
    )

for x, y, lbl in zip(px, py, plabels):
    ax.text(x - 0.015, y, lbl, ha="right", va="center", fontsize=9, zorder=4)
for x, y, lbl in zip(lx, ly, llabels):
    ax.text(x + 0.015, y, lbl, ha="left", va="center", fontsize=9, zorder=4)

# Legend
from matplotlib.lines import Line2D  # noqa: E402
ax.legend(
    handles=[
        Line2D([0], [0], color="#D2691E", lw=3,
               label="Employee → politician contribution ($, line width = amount)"),
        Line2D([0], [0], color="#4A6FA5", lw=2, alpha=0.7,
               label="Company → registered Austin city lobbyist"),
    ],
    loc="lower center", bbox_to_anchor=(0.5, -0.04),
    ncol=2, fontsize=9, frameon=False,
)
ax.set_title(
    "Money & influence in Austin — top companies, the politicians their "
    "employees fund, and the lobbyists they retain\n"
    "Curated firms with footprints in BOTH datasets · contributions 2020–2026",
    fontsize=13, pad=18,
)
fig.text(
    0.01, 0.005,
    "Sources: data.austintexas.gov contributions (3kfv-biw6), lobby clients (7ena-g23u), lobby registrants (58ix-34ma).",
    fontsize=8, alpha=0.65,
)

out = OUT / "companies_lobbyists_politicians.png"
fig.savefig(out, dpi=160, bbox_inches="tight", facecolor="white")
print(f"\nWrote {out}")
