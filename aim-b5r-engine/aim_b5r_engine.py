"""
AIM-B5R underwriting engine.

Implements the simulation-first BRRRR evolution defined in the AIM / PropOps8
Canonical Manifesto v3.2, Part 08:

    A — Assess       the property, market, regulations, opportunity
    I — Instrument   scan/inspect/construct the baseline digital twin
    M — Model        simulate, optimize, stress-test, price interventions
    B — Buy          only when the modeled acquisition clears the gates
    R1 — Rehabilitate according to the optimized intervention
    R2 — Rent and stabilize
    R3 — Recalibrate the model using actual operations
    R4 — Refinance using observed, not merely assumed, stabilization
    R5 — Repeat with a better-calibrated model

This module is the "M" (Model) + "R3" (Recalibrate) machinery: a deterministic,
reproducible Monte Carlo underwriting engine. It does not touch acquisition,
scraping, or any live data source — it takes a DealInputs record (however it
was sourced: hand-entered, or pulled from a scraper/warehouse) and produces a
full probabilistic underwriting read, per the aim-b5r-underwriting skill's
output contract.

Every uncertain input is a triangular(low, mode, high) distribution, sampled
5,000 times with a fixed seed so runs are reproducible and comparable across
BASE/A/B/C intervention twins run against the identical draws.

Nothing in this file invents real numbers. The __main__ example at the bottom
uses clearly-labeled assumed inputs for a hypothetical property -- swap in
real, sourced values (see Evidence below) before trusting an EDO call.
"""

from __future__ import annotations

import json
import csv
import os
from dataclasses import dataclass, field, asdict
from datetime import date
from typing import Literal, Optional

import numpy as np

Confidence = Literal["low", "med", "high"]
Provenance = Literal["observed", "modeled", "assumed"]


# --------------------------------------------------------------------------
# Evidence: every consequential input is tagged, not a bare number.
# --------------------------------------------------------------------------
@dataclass
class Evidence:
    value: float
    unit: str
    source: str
    date: str  # ISO date the value was observed/sourced
    provenance: Provenance
    confidence: Confidence = "med"

    def __post_init__(self):
        if self.provenance == "assumed" and self.confidence == "high":
            # An assumed number cannot honestly carry high confidence.
            self.confidence = "low"


@dataclass
class Triangular:
    """A triangular(low, mode, high) uncertain input, evidence-tagged."""
    low: float
    mode: float
    high: float
    unit: str
    source: str
    date: str
    provenance: Provenance = "assumed"
    confidence: Confidence = "low"

    def sample(self, rng: np.random.Generator, n: int) -> np.ndarray:
        if self.low == self.mode == self.high:
            return np.full(n, self.mode)
        return rng.triangular(self.low, self.mode, self.high, n)

    def p10_p50_p90(self) -> tuple[float, float, float]:
        # Closed-form percentiles of a triangular distribution.
        rng = np.random.default_rng(8)
        s = self.sample(rng, 200_000)
        return tuple(np.percentile(s, [10, 50, 90]))


# --------------------------------------------------------------------------
# Investment policy — thresholds live here, never hardcoded in the math.
# --------------------------------------------------------------------------
@dataclass
class Policy:
    policy_id: str = "b5r_default_v1"
    min_dscr: float = 1.25                     # 5+ units: NOI / annual debt service
    min_dscr_rent_based: float = 1.10          # 1-4 unit DSCR loans: gross rent / PITIA
    max_refi_ltv: float = 0.75
    min_yoc_spread_over_debt_constant: float = 0.0075
    max_cash_left_in_pct: float = 0.25         # of total cash invested, at P50
    max_p90_cash_left_in_pct: float = 0.50
    vacancy_floor: float = 0.05
    capex_reserve_per_unit_yr: float = 300.0
    mgmt_fee_pct_egi: float = 0.08
    rehab_contingency_pct: float = 0.15
    refi_seasoning_months: int = 6             # lender-specific; verify
    call_gate_dsa_min: float = 8.0
    call_gate_confidence_min: float = 80.0


# --------------------------------------------------------------------------
# Deal inputs. Fixed values (e.g. a signed contract price) are plain floats;
# uncertain values are Triangular. Units are the property's own units.
# --------------------------------------------------------------------------
@dataclass
class DealInputs:
    deal_id: str
    units: int

    # Fixed at contract (point values are only legitimate here)
    purchase_price: float
    buy_closing_costs: float
    acquisition_loan_amount: float
    acquisition_loan_rate: float          # annual rate, e.g. 0.08
    acquisition_loan_interest_only: bool = True

    # Uncertain — rehab
    rehab_cost: Triangular = None
    rehab_duration_months: Triangular = None

    # Uncertain — revenue
    gross_potential_rent_monthly: Triangular = None  # at stabilization, market rent x units
    vacancy_credit_loss_pct: Triangular = None
    other_income_monthly: Triangular = None

    # Uncertain — operating expenses (annual, excludes debt service and capex reserve)
    opex_annual_ex_capex: Triangular = None
    property_tax_annual: Triangular = None
    insurance_annual: Triangular = None

    # Uncertain — exit / refinance
    exit_cap_rate: Triangular = None
    refi_rate: Triangular = None
    refi_amortization_years: int = 30
    refi_closing_costs_pct: float = 0.02   # of new loan amount; point est. ok if lender-quoted

    # Holding costs during rehab (interest, taxes, insurance, utilities), monthly
    holding_cost_monthly: Triangular = None

    notes: str = ""


@dataclass
class DealAssumptions:
    """Convenience bundle: source doc for each field, for the run's evidence trail."""
    evidence: dict = field(default_factory=dict)


N_ITER = 5000
SEED = 8


def _debt_constant(rate: float, amortization_years: int) -> float:
    """Annual debt constant (annual debt service / loan amount) for a fully
    amortizing loan at the given annual rate and amortization."""
    r = rate / 12.0
    n = amortization_years * 12
    if r == 0:
        return 12.0 / n
    monthly_payment_factor = r / (1 - (1 + r) ** (-n))
    return monthly_payment_factor * 12.0


def simulate(deal: DealInputs, policy: Policy, n: int = N_ITER, seed: int = SEED) -> dict:
    """Run the Monte Carlo underwriting simulation for one deal/twin.

    Returns a dict with P10/P50/P90 for every output metric plus gate-pass
    probabilities, ready to feed the ten-item output contract.
    """
    rng = np.random.default_rng(seed)

    rehab_cost = deal.rehab_cost.sample(rng, n)
    rehab_cost_with_contingency = rehab_cost * (1 + policy.rehab_contingency_pct)
    rehab_months = deal.rehab_duration_months.sample(rng, n)
    gpr_monthly = deal.gross_potential_rent_monthly.sample(rng, n)
    vacancy = np.clip(deal.vacancy_credit_loss_pct.sample(rng, n), policy.vacancy_floor, None)
    other_income = deal.other_income_monthly.sample(rng, n)
    opex_ex_capex = deal.opex_annual_ex_capex.sample(rng, n)
    prop_tax = deal.property_tax_annual.sample(rng, n)
    insurance = deal.insurance_annual.sample(rng, n)
    exit_cap = deal.exit_cap_rate.sample(rng, n)
    refi_rate = deal.refi_rate.sample(rng, n)
    holding_cost_monthly = deal.holding_cost_monthly.sample(rng, n)

    # --- All-in basis ---
    acq_financing_fees = deal.acquisition_loan_amount * 0.01  # 1pt, point estimate
    holding_costs_total = holding_cost_monthly * rehab_months
    all_in_basis = (
        deal.purchase_price
        + deal.buy_closing_costs
        + rehab_cost_with_contingency
        + holding_costs_total
        + acq_financing_fees
    )
    cash_required = all_in_basis - deal.acquisition_loan_amount

    # --- Stabilized income ---
    gpr_annual = gpr_monthly * 12.0
    egi = gpr_annual * (1 - vacancy) + other_income * 12.0
    capex_reserve = policy.capex_reserve_per_unit_yr * deal.units
    mgmt_fee = egi * policy.mgmt_fee_pct_egi
    opex_total = opex_ex_capex + prop_tax + insurance + mgmt_fee + capex_reserve
    stabilized_noi = egi - opex_total

    # --- Yield on cost / positive leverage ---
    yoc = stabilized_noi / all_in_basis
    refi_debt_constant = np.array([_debt_constant(r, deal.refi_amortization_years) for r in refi_rate])
    positive_leverage = (yoc - refi_debt_constant) >= policy.min_yoc_spread_over_debt_constant

    # --- ARV / refinance ---
    arv = stabilized_noi / exit_cap
    max_loan_ltv = arv * policy.max_refi_ltv
    max_loan_dscr = stabilized_noi / (policy.min_dscr * refi_debt_constant)
    max_refi_loan = np.minimum(max_loan_ltv, max_loan_dscr)
    actual_dscr = stabilized_noi / (max_refi_loan * refi_debt_constant)

    refi_closing_costs = max_refi_loan * deal.refi_closing_costs_pct
    debt_payoff = deal.acquisition_loan_amount  # interest-only assumption; principal unchanged
    cash_out = max_refi_loan - debt_payoff - refi_closing_costs

    cash_left_in = cash_required - cash_out
    equity_recovery_pct = np.where(cash_required > 0, cash_out / cash_required, np.nan)

    post_refi_debt_service = max_refi_loan * refi_debt_constant
    post_refi_cash_flow = stabilized_noi - post_refi_debt_service
    cash_on_cash = np.where(
        cash_left_in > 0, post_refi_cash_flow / cash_left_in, np.inf
    )

    duration_of_exposure_months = rehab_months + 3 + policy.refi_seasoning_months  # +3 lease-up, assumed

    def pct(a):
        return {
            "p10": float(np.percentile(a, 10)),
            "p50": float(np.percentile(a, 50)),
            "p90": float(np.percentile(a, 90)),
        }

    # Epsilon guards against floating-point noise: when the DSCR constraint
    # is the binding one, actual_dscr is mathematically exactly min_dscr,
    # but float division can land a hair under it (e.g. 1.2499999999999998),
    # which would wrongly count an at-the-floor draw as a failure.
    dscr_pass_prob = float(np.mean(actual_dscr >= policy.min_dscr - 1e-9))
    positive_leverage_prob = float(np.mean(positive_leverage))
    cash_left_in_pct_of_required = np.where(cash_required > 0, cash_left_in / cash_required, np.nan)
    p50_cash_left_in_pct = float(np.nanpercentile(cash_left_in_pct_of_required, 50))
    p90_cash_left_in_pct = float(np.nanpercentile(cash_left_in_pct_of_required, 90))
    gate_cash_left_in_p50 = p50_cash_left_in_pct <= policy.max_cash_left_in_pct
    gate_cash_left_in_p90 = p90_cash_left_in_pct <= policy.max_p90_cash_left_in_pct

    results = {
        "deal_id": deal.deal_id,
        "n_iterations": n,
        "seed": seed,
        "cash_required": pct(cash_required),
        "all_in_basis": pct(all_in_basis),
        "stabilized_noi": pct(stabilized_noi),
        "arv": pct(arv),
        "max_refi_loan": pct(max_refi_loan),
        "cash_out": pct(cash_out),
        "cash_left_in": pct(cash_left_in),
        "equity_recovery_pct": pct(equity_recovery_pct[~np.isnan(equity_recovery_pct)])
        if np.any(~np.isnan(equity_recovery_pct)) else None,
        "cash_on_cash": pct(cash_on_cash[np.isfinite(cash_on_cash)])
        if np.any(np.isfinite(cash_on_cash)) else None,
        "duration_of_exposure_months": pct(duration_of_exposure_months),
        "actual_dscr": pct(actual_dscr),
        "yoc": pct(yoc),
        "gates": {
            "dscr_pass_probability": dscr_pass_prob,
            "positive_leverage_probability": positive_leverage_prob,
            "cash_left_in_pct_p50": p50_cash_left_in_pct,
            "cash_left_in_pct_p90": p90_cash_left_in_pct,
            "gate_cash_left_in_p50_ok": gate_cash_left_in_p50,
            "gate_cash_left_in_p90_ok": gate_cash_left_in_p90,
        },
        # raw arrays kept for tornado/VOI analysis, stripped before JSON export
        "_raw": {
            "cash_left_in": cash_left_in,
            "actual_dscr": actual_dscr,
        },
    }
    return results


def tornado(deal: DealInputs, policy: Policy, target: str = "cash_left_in", n: int = N_ITER, seed: int = SEED) -> list[dict]:
    """Swing each uncertain input from P10 to P90 (others held at their own
    P50/mode) and rank by the resulting swing in `target` ('cash_left_in' or
    'actual_dscr'). This is what tells you what to spend the next diligence
    dollar on, per the skill's value-of-information step."""
    uncertain_fields = [
        f for f in deal.__dataclass_fields__
        if isinstance(getattr(deal, f), Triangular)
    ]
    base_result = simulate(deal, policy, n=n, seed=seed)
    base_p50 = base_result[target]["p50"] if target in base_result and isinstance(base_result[target], dict) else np.median(base_result["_raw"][target])

    swings = []
    for fname in uncertain_fields:
        orig: Triangular = getattr(deal, fname)
        p10, p50, p90 = orig.p10_p50_p90()

        for label, val in (("p10", p10), ("p90", p90)):
            pinned = Triangular(low=val, mode=val, high=val, unit=orig.unit,
                                 source="tornado-pin", date=orig.date, provenance="modeled")
            setattr(deal, fname, pinned)
            r = simulate(deal, policy, n=n, seed=seed)
            metric = r["_raw"][target] if target in ("cash_left_in", "actual_dscr") else None
            swings.append((fname, label, float(np.median(metric))))
        setattr(deal, fname, orig)  # restore

    # Compute swing magnitude per field
    by_field: dict[str, dict] = {}
    for fname, label, val in swings:
        by_field.setdefault(fname, {})[label] = val
    ranked = []
    for fname, vals in by_field.items():
        swing = abs(vals.get("p90", 0) - vals.get("p10", 0))
        ranked.append({"input": fname, "p10_result": vals.get("p10"), "p90_result": vals.get("p90"),
                        "swing": swing})
    ranked.sort(key=lambda r: r["swing"], reverse=True)
    total_swing = sum(r["swing"] for r in ranked) or 1.0
    for r in ranked:
        r["share_of_total_swing"] = r["swing"] / total_swing
    return ranked


def edo_call(results: dict, policy: Policy, dsa_score: Optional[float] = None,
             confidence: Optional[float] = None) -> dict:
    """Apply the policy gates + the DSA call gate to produce an EXECUTE /
    DEFER / ESCALATE / KILL call. This does not replace judgment on anything
    the policy object doesn't cover -- it's the mechanical floor."""
    gates = results["gates"]
    reasons = []
    call = "EXECUTE"

    if gates["dscr_pass_probability"] < 0.70:
        call = "KILL"
        reasons.append(f"DSCR only clears policy ({policy.min_dscr}) in "
                        f"{gates['dscr_pass_probability']:.0%} of draws")
    if not gates["gate_cash_left_in_p50_ok"]:
        call = "KILL" if call == "KILL" else "DEFER"
        reasons.append(f"P50 cash-left-in {gates['cash_left_in_pct_p50']:.0%} of cash required "
                        f"exceeds policy max {policy.max_cash_left_in_pct:.0%}")
    if not gates["gate_cash_left_in_p90_ok"]:
        call = "DEFER" if call == "EXECUTE" else call
        reasons.append(f"P90 cash-left-in {gates['cash_left_in_pct_p90']:.0%} exceeds policy max "
                        f"{policy.max_p90_cash_left_in_pct:.0%} -- downside tail is uncapped")
    if gates["positive_leverage_probability"] < 0.70:
        call = "DEFER" if call == "EXECUTE" else call
        reasons.append(f"Positive leverage holds in only {gates['positive_leverage_probability']:.0%} of draws")

    if dsa_score is not None and confidence is not None:
        if dsa_score < policy.call_gate_dsa_min or confidence < policy.call_gate_confidence_min:
            call = "ESCALATE" if call == "EXECUTE" else call
            reasons.append(f"DSA {dsa_score} / confidence {confidence} below call gate "
                            f"({policy.call_gate_dsa_min}/{policy.call_gate_confidence_min})")

    if not reasons:
        reasons.append("All policy gates clear at P50 and P90")

    return {"call": call, "reasons": reasons, "policy_id": policy.policy_id,
            "review_date": None}  # caller fills in a real review date


# --------------------------------------------------------------------------
# Recalibrate (R3): append-only predicted-vs-actual log, never overwritten.
# --------------------------------------------------------------------------
CALIBRATION_FIELDS = [
    "deal_id", "logged_date", "metric", "predicted_p10", "predicted_p50", "predicted_p90",
    "actual", "error_pct_of_p50", "source",
]


def log_actual(calibration_csv: str, deal_id: str, metric: str, predicted: dict, actual: float, source: str):
    """Append one predicted-vs-actual observation. Never edits prior rows --
    the calibration table is a history, not a snapshot."""
    is_new = not os.path.exists(calibration_csv)
    error_pct = (actual - predicted["p50"]) / predicted["p50"] if predicted["p50"] else None
    row = {
        "deal_id": deal_id,
        "logged_date": date.today().isoformat(),
        "metric": metric,
        "predicted_p10": predicted["p10"],
        "predicted_p50": predicted["p50"],
        "predicted_p90": predicted["p90"],
        "actual": actual,
        "error_pct_of_p50": error_pct,
        "source": source,
    }
    with open(calibration_csv, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CALIBRATION_FIELDS)
        if is_new:
            w.writeheader()
        w.writerow(row)
    return row


def calibration_error_stats(calibration_csv: str, metric: str) -> Optional[dict]:
    """Read the calibration history for one metric and report how wrong the
    model has been -- use this to widen/narrow that input's triangular range
    for future runs, per the skill's Recalibrate step."""
    if not os.path.exists(calibration_csv):
        return None
    errors = []
    with open(calibration_csv) as f:
        for row in csv.DictReader(f):
            if row["metric"] == metric and row["error_pct_of_p50"]:
                errors.append(float(row["error_pct_of_p50"]))
    if not errors:
        return None
    arr = np.array(errors)
    return {
        "n": len(arr),
        "mean_error_pct": float(np.mean(arr)),
        "std_error_pct": float(np.std(arr)),
        "recommendation": (
            "widen range" if np.std(arr) > 0.15 else "range looks calibrated"
        ),
    }


def to_json_safe(results: dict) -> dict:
    """Strip the raw numpy arrays before serializing a result set."""
    out = {k: v for k, v in results.items() if k != "_raw"}
    return out
