"""Categorize Austin campaign expenditures and chart what the money buys.

Reads data/raw/austin/cf/expenditures.csv directly with DuckDB (no Parquet
build needed). Buckets free-text Expense_Description into ~13 canonical
categories, then renders:

  data/figures/spend_by_category.png            overall $ per category
  data/figures/spend_by_politician_category.png top-15 spenders, stacked

Run:  . .venv/bin/activate && python scripts/charts/expenditures_by_category.py
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import numpy as np

REPO = Path(__file__).resolve().parents[2]
CSV = REPO / "data" / "raw" / "austin" / "cf" / "expenditures.csv"
OUT = REPO / "data" / "figures"
OUT.mkdir(parents=True, exist_ok=True)

# Bucket raw prefixes (the part before "|" in Expense_Description, uppercased
# and trimmed) into canonical categories. Order matters: first match wins.
CATEGORY_CASE = """
CASE
  WHEN p IN ('ADVERTISE', 'ADVERTISING EXPENSE', 'ADVERTISING',
             'MAIL EXPENSE', 'MAILERS - DESIGN, PRINTING, AND POSTAGE')
       OR p LIKE 'MAILER%'                              THEN 'Advertising / Mail'
  WHEN p IN ('CONSULT', 'CONSULTING EXPENSE', 'CONSULTING')
                                                        THEN 'Consulting'
  WHEN p IN ('SALARIES', 'SALARY', 'SALARIES/WAGES/CONTRACT LABOR',
             'CONTRACT LABOR', 'PAYROLL TAXES')         THEN 'Salaries / Labor'
  WHEN p = 'PRINTING' OR p = 'PRINTING EXPENSE'         THEN 'Printing'
  WHEN p LIKE 'POLL%'                                   THEN 'Polling'
  WHEN p LIKE '%CONTRIBUTION%' OR p LIKE 'DONATION%'
       OR p IN ('PAC TO PAC CONTRIBUTION', 'BALLOT MEASURE CAMPAIGN CONTRIBUTION')
                                                        THEN 'Donations to others'
  WHEN p LIKE 'PETITION%' OR p LIKE 'CANVASS%'
       OR p LIKE 'TO PROVIDE FUNDS FOR PETITION%'
       OR p LIKE 'FUNDS SPENT ON THE MANAGEMENT%'       THEN 'Petition / Canvassing'
  WHEN p LIKE 'EVENT%' OR p LIKE 'FOOD%'                THEN 'Events / Food'
  WHEN p LIKE 'LEGAL%'                                  THEN 'Legal'
  WHEN p LIKE 'LOAN%'                                   THEN 'Loans / Repayment'
  WHEN p IN ('FEES', 'ACCOUNT', 'ACCOUNTING/BANKING',
             'CREDITCARD', 'CREDIT CARD PAYMENT', 'CC PAYMENT')
                                                        THEN 'Fees / Banking'
  WHEN p IN ('OVERHEAD', 'OFFICE OVERHEAD/RENTAL EXPENSE')
                                                        THEN 'Office overhead'
  WHEN p LIKE 'FUNDRAIS%' OR p LIKE 'SOLICITATION%'     THEN 'Fundraising'
  WHEN p LIKE 'TRAVEL%'                                 THEN 'Travel'
  ELSE 'Other / Unclassified'
END
"""

con = duckdb.connect()
con.execute(f"""
CREATE OR REPLACE VIEW exp AS
SELECT
  Paid_By,
  TRY_CAST(Payment_Amount AS DOUBLE)               AS amount,
  UPPER(TRIM(SPLIT_PART(Expense_Description,'|',1))) AS p,
  Expense_Description
FROM '{CSV}'
WHERE TRY_CAST(Payment_Amount AS DOUBLE) > 0
""")
con.execute(f"CREATE OR REPLACE VIEW expc AS SELECT *, {CATEGORY_CASE} AS category FROM exp")

cat_totals = con.sql("""
  SELECT category, ROUND(SUM(amount)) AS total, COUNT(*) AS n
  FROM expc
  GROUP BY category
  ORDER BY total DESC
""").fetchall()

categories = [r[0] for r in cat_totals]
totals     = [r[1] for r in cat_totals]
counts     = [r[2] for r in cat_totals]
grand      = sum(totals)
print(f"Total categorized spend: ${grand:,.0f} across {sum(counts):,} expenditures\n")
for cat, t, n in cat_totals:
    print(f"  {cat:<24}  ${t:>13,.0f}   ({100*t/grand:5.1f}%)   {n:>5} rows")

# ---------- Chart 1: overall spend by category --------------------------------

fig, ax = plt.subplots(figsize=(11, 6.5))
y = np.arange(len(categories))
bars = ax.barh(y, totals, color="#2E7D9A")
ax.set_yticks(y)
ax.set_yticklabels(categories)
ax.invert_yaxis()
ax.set_xlabel("Total spending (USD)")
ax.set_title(
    "What Austin politicians and PACs spend campaign money on\n"
    "Austin City Council campaign-finance expenditures, 2014–2026  ·  "
    f"${grand/1e6:.1f}M across {sum(counts):,} filings",
    fontsize=12,
)
ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"${x/1e6:.1f}M"))
for bar, total, n in zip(bars, totals, counts):
    pct = 100 * total / grand
    ax.text(
        bar.get_width(),
        bar.get_y() + bar.get_height() / 2,
        f"  ${total/1e6:.2f}M  ({pct:.1f}%)",
        va="center",
        fontsize=9,
    )
ax.set_xlim(0, max(totals) * 1.18)
ax.grid(axis="x", alpha=0.25)
ax.set_axisbelow(True)
fig.text(
    0.01, 0.005,
    "Source: data.austintexas.gov dataset gd3e-xut2 (Campaign Finance Expenditures). "
    "Categories bucketed from the free-text Expense_Description prefix.",
    fontsize=8, alpha=0.7,
)
fig.tight_layout()
out1 = OUT / "spend_by_category.png"
fig.savefig(out1, dpi=160, bbox_inches="tight")
print(f"\nWrote {out1}")

# ---------- Chart 2: category mix for the top 15 spenders ---------------------

top_payers = [r[0] for r in con.sql("""
  SELECT Paid_By
  FROM expc
  WHERE Paid_By IS NOT NULL
  GROUP BY Paid_By
  ORDER BY SUM(amount) DESC
  LIMIT 15
""").fetchall()]

# Build a (payer x category) matrix
pivot_rows = con.execute(f"""
  SELECT Paid_By, category, SUM(amount) total
  FROM expc
  WHERE Paid_By IN ({','.join('?' * len(top_payers))})
  GROUP BY 1, 2
""", top_payers).fetchall()

matrix = {p: {c: 0.0 for c in categories} for p in top_payers}
for payer, cat, total in pivot_rows:
    matrix[payer][cat] = total

# Sort payers by total spend descending; bars drawn top-to-bottom
top_payers.sort(key=lambda p: -sum(matrix[p].values()))

fig2, ax2 = plt.subplots(figsize=(13, 7.5))
bottoms = np.zeros(len(top_payers))
cmap = plt.get_cmap("tab20")
y2 = np.arange(len(top_payers))
for i, cat in enumerate(categories):
    vals = np.array([matrix[p][cat] for p in top_payers])
    ax2.barh(y2, vals, left=bottoms, label=cat, color=cmap(i % 20))
    bottoms += vals
ax2.set_yticks(y2)
ax2.set_yticklabels(top_payers)
ax2.invert_yaxis()
ax2.set_xlabel("Spending (USD)")
ax2.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"${x/1e6:.1f}M"))
ax2.set_title(
    "Top 15 Austin campaign-finance filers — spending by category\n"
    "Each bar is the filer's total expenditures, broken down by category",
    fontsize=12,
)
ax2.legend(
    loc="lower right",
    fontsize=8,
    ncol=2,
    framealpha=0.95,
    title="Category",
    title_fontsize=9,
)
ax2.grid(axis="x", alpha=0.25)
ax2.set_axisbelow(True)
fig2.text(
    0.01, 0.005,
    "Source: data.austintexas.gov dataset gd3e-xut2.",
    fontsize=8, alpha=0.7,
)
fig2.tight_layout()
out2 = OUT / "spend_by_politician_category.png"
fig2.savefig(out2, dpi=160, bbox_inches="tight")
print(f"Wrote {out2}")
