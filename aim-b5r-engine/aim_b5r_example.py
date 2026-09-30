"""
Worked example for aim_b5r_engine.py.

Every number below is ASSUMED / illustrative -- a plausible Kern County
12-unit value-add deal, invented to demonstrate the engine mechanically.
None of it is sourced, none of it is a real property, and none of it
should be treated as a real underwrite. Replace every Triangular's
source/date/provenance with real evidence (assessor record, contractor
bid, rent comp, lender term sheet, etc.) before trusting an EDO call.

Run: python3 aim_b5r_example.py
"""

from aim_b5r_engine import (
    DealInputs, Triangular, Policy, simulate, tornado, edo_call, to_json_safe,
)
import json

TODAY = "2026-09-29"

deal = DealInputs(
    deal_id="EXAMPLE-KERN-12U-001",
    units=12,
    purchase_price=950_000.0,               # ASSUMED: illustrative asking price
    buy_closing_costs=19_000.0,             # ASSUMED: ~2%
    acquisition_loan_amount=712_500.0,      # ASSUMED: 75% bridge/hard-money LTC
    acquisition_loan_rate=0.105,
    acquisition_loan_interest_only=True,

    rehab_cost=Triangular(
        low=180_000, mode=240_000, high=340_000, unit="USD",
        source="ASSUMED - no contractor bid yet", date=TODAY, provenance="assumed", confidence="low",
    ),
    rehab_duration_months=Triangular(
        low=5, mode=8, high=13, unit="months",
        source="ASSUMED - no GC schedule yet", date=TODAY, provenance="assumed", confidence="low",
    ),
    gross_potential_rent_monthly=Triangular(
        low=13_200, mode=15_600, high=17_400, unit="USD/month, all 12 units at stabilized market rent",
        source="ASSUMED - no rent comp pull yet", date=TODAY, provenance="assumed", confidence="low",
    ),
    vacancy_credit_loss_pct=Triangular(
        low=0.05, mode=0.07, high=0.12, unit="fraction",
        source="ASSUMED - Kern County multifamily rule-of-thumb", date=TODAY, provenance="assumed", confidence="low",
    ),
    other_income_monthly=Triangular(
        low=200, mode=350, high=550, unit="USD/month",
        source="ASSUMED - laundry/parking placeholder", date=TODAY, provenance="assumed", confidence="low",
    ),
    opex_annual_ex_capex=Triangular(
        low=48_000, mode=58_000, high=72_000, unit="USD/year",
        source="ASSUMED - no T-12 yet", date=TODAY, provenance="assumed", confidence="low",
    ),
    property_tax_annual=Triangular(
        low=11_400, mode=11_875, high=12_400, unit="USD/year",
        source="ASSUMED - 1.25% of purchase price, Kern County typical rate", date=TODAY,
        provenance="modeled", confidence="med",
    ),
    insurance_annual=Triangular(
        low=9_000, mode=11_500, high=15_000, unit="USD/year",
        source="ASSUMED - no quote yet", date=TODAY, provenance="assumed", confidence="low",
    ),
    exit_cap_rate=Triangular(
        low=0.058, mode=0.065, high=0.075, unit="fraction",
        source="ASSUMED - no recent Kern County 10+ unit comp set yet", date=TODAY,
        provenance="assumed", confidence="low",
    ),
    refi_rate=Triangular(
        low=0.065, mode=0.072, high=0.082, unit="fraction",
        source="ASSUMED - no lender term sheet yet", date=TODAY, provenance="assumed", confidence="low",
    ),
    refi_amortization_years=30,
    refi_closing_costs_pct=0.02,
    holding_cost_monthly=Triangular(
        low=6_500, mode=7_800, high=9_500, unit="USD/month",
        source="ASSUMED - interest-only debt service + taxes/insurance/utilities during rehab",
        date=TODAY, provenance="modeled", confidence="low",
    ),
    notes="Illustrative only -- see docstring. Not a real property.",
)

policy = Policy()  # defaults from the skill; override per-deal if Daniel gives his own

if __name__ == "__main__":
    results = simulate(deal, policy)
    print("=== AIM-B5R Monte Carlo underwriting (5,000 draws, seed=8) ===")
    print("ALL INPUTS BELOW ARE ASSUMED/ILLUSTRATIVE -- see file docstring.\n")
    print(json.dumps(to_json_safe(results), indent=2))

    print("\n=== Tornado on cash_left_in ===")
    for row in tornado(deal, policy, target="cash_left_in"):
        print(f"  {row['input']:32s} swing=${row['swing']:>10,.0f}  "
              f"({row['share_of_total_swing']:.0%} of total)")

    call = edo_call(results, policy, dsa_score=None, confidence=None)
    print("\n=== EDO call ===")
    print(f"  {call['call']}")
    for r in call["reasons"]:
        print(f"  - {r}")
