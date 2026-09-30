#!/usr/bin/env python3
"""
Fill the OFFICIAL blank CTCAC HOTMA TIC (hotma_tic.pdf) as a real interactive
AcroForm — this is the "Fillable PDF" button's renderer.

This is a DIFFERENT mechanism from fill_packets.py. fill_packets.py stamps
text onto a flattened "go-by" packet at hand-measured (page, x, y) coordinates
— it never touches a named form field. This script instead sets real AcroForm
field values by name, using:

  - a data file exported from engine.html ("Export data file" — JSON with
    "schema": "propops8.recert.v1")
  - tic_field_map.json          (field-name map — built from the rendered,
                                  numbered, hand-verified TIC pages)
  - ctcac_checkbox_states.json  (the literal on/off value each checkbox needs
                                  — extracted separately because field name
                                  and tooltip don't reveal it)

Usage:
    pip install pypdf --break-system-packages
    python3 fill_tic_fillable.py DATA_FILE.json hotma_tic.pdf OUTPUT.pdf

DATA_FILE.json is what engine.html's "Export" produces for one household —
NOT the ctcac_fields.json / tic_field_map.json files, which describe the PDF,
not a tenant.

NOT a gap: "Vacant" (Part II) is always left unchecked. Recertifications are
never run on a vacant unit — there's no household to recertify — so this
script has nothing to fill there and doesn't warn about it.

KNOWN GAPS — printed as warnings, never guessed silently:
  - Average Income Test tier (Part V/VI) — S.property.setAside can be "ait",
    but nothing in the exported state says WHICH tier (20/30/40/50/60/70/80%)
    applies to this unit. When setAside == "ait", none of the AIT boxes are
    checked; pick the right one by hand.
  - Part IV column (K) "Actual Income from Asset", per row — the export only
    gives the FORM TOTAL (tic.part_iv.K), not a per-asset breakdown. This
    script derives each row as value * (rate / 100) and warns if the rows
    don't sum back to the exported total, so a mismatch is visible instead of
    silently wrong.
"""
import json
import sys
from pathlib import Path

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import DictionaryObject, NameObject
except ImportError:
    raise SystemExit("Missing dependency — run: pip install pypdf --break-system-packages")

HERE = Path(__file__).parent

ASSET_LABELS = {
    "checking": "Checking account", "savings": "Savings account", "ebt": "EBT / debit card",
    "payapp": "Payment app", "cd": "CD / money market", "stocks": "Stocks, bonds, T-bills",
    "crypto": "Cryptocurrency", "trust": "Revocable trust", "realestate": "Real estate",
    "lifeins": "Life insurance cash value", "cash": "Cash on hand", "retirement": "Retirement (401k/IRA)",
}
FED_SOURCE_NAMES = {  # matches the *Source of Federal Assistance list printed on the TIC itself
    "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "0": "0",
}


def load_json(path):
    return json.loads(Path(path).read_text())


def load_maps():
    field_map = load_json(HERE / "tic_field_map.json")
    states = load_json(HERE / "ctcac_checkbox_states.json")["tic"]
    on_state = {}
    for name, info in states.items():
        if info.get("widget_count"):
            on_state[name] = info["on_states"][0] if len(info["on_states"]) == 1 else info["on_states"]
    return field_map, on_state


def money(v):
    try:
        return f"{float(v or 0):,.2f}"
    except (TypeError, ValueError):
        return ""


def build_values(data, field_map, on_state, warn):
    """Returns (text_values, checkbox_values) — both {pdf_field_name: value}."""
    S = data["state"]
    tic = data.get("tic", {})
    cert, prop, limits, rent, special = S["cert"], S["property"], S.get("limits", {}), S["rent"], S["special"]
    members = S["members"]
    ON = "/On"

    text, chk = {}, {}
    m1, m2 = field_map["page1_certification_type"], field_map["page1_development_data"]

    # --- certification type / header ---------------------------------------
    chk[m1[{"initial": "initial_certification_checkbox", "recert": "recertification_checkbox",
            "other": "other_checkbox"}[cert["type"]]]] = on_state.get(
        {"initial": "Initial Certification", "recert": "Recertification", "other": "Other"}[cert["type"]], ON)
    text[m1["effective_date"]] = cert.get("effective", "")
    text[m1["move_in_date"]] = cert.get("moveIn", "")

    # --- Part I development data --------------------------------------------
    text[m2["property_name"]] = prop.get("name", "")
    text[m2["county"]] = prop.get("county", "")
    text[m2["tcac_number"]] = prop.get("tcac", "")
    text[m2["bin_number"]] = prop.get("bin", "")
    text[m2["address"]] = prop.get("address", "")
    text[m2["cdlac_number"]] = prop.get("cdlac", "")
    text[m2["unit_number"]] = prop.get("unit", "")
    text[m2["bedrooms"]] = prop.get("bedrooms", "")
    text[m2["square_footage"]] = prop.get("sqft", "")

    # --- Part II household composition --------------------------------------
    hc = field_map["page1_household_composition"]
    # "Vacant" is intentionally never checked here — see module docstring.
    row = hc["member_row"]
    for i, mem in enumerate(members[:7]):
        n = i + 1
        text[row["last_name"].format(n=n)] = mem.get("last", "")
        text[row["first_name"].format(n=n)] = mem.get("first", "")
        text[row["middle_initial"].format(n=n)] = mem.get("mi", "")
        if n > 1:
            text[row["relationship_to_head"]["n_2_to_7"].format(n=n)] = mem.get("rel", "")
        dob_field = row["date_of_birth"]["n_eq_1"] if n == 1 else row["date_of_birth"]["n_2_to_7"].format(n=n)
        text[dob_field] = mem.get("dob", "")
        ssn_field = row["ssn_last4"]["n_eq_1"] if n == 1 else row["ssn_last4"]["n_2_to_7"].format(n=n)
        text[ssn_field] = mem.get("ssn4", "")
        ss = row["student_status"]
        ft_field = ss["FT_checkbox"]["n_eq_1"] if n == 1 else ss["FT_checkbox"]["n_2_to_7"].format(n=n)
        pt_field = ss["PT_checkbox"]["n_eq_1"] if n == 1 else ss["PT_checkbox"]["n_2_to_7"].format(n=n)
        na_field = f"undefined_{n + 1}"  # ss["NA_checkbox"]["n_1_to_7"] pattern — see GOTCHA 1
        student = mem.get("student", "NA")  # engine values: "FT" / "PT" / "NA"
        target = {"FT": ft_field, "PT": pt_field, "NA": na_field}.get(student)
        if target:
            chk[target] = on_state.get(target, ON)

    # --- Part III gross annual income ---------------------------------------
    p3 = field_map["page1_gross_annual_income_part3"]
    by_member_col = {}
    for line in tic.get("income_lines", []):
        key = (line["member"], line["column"])
        by_member_col[key] = by_member_col.get(key, 0) + line["annual"]
    col_field = {"A": "col_A_employment_or_wages", "B": "col_B_social_security_pensions",
                 "C": "col_C_public_assistance", "D": "col_D_other_income"}
    for i in range(min(len(members), 5)):
        n = i + 1
        text[p3["row"]["hh_member_number"].format(n=n)] = str(n)
        for col, fkey in col_field.items():
            amt = by_member_col.get((i, col))
            if amt:
                text[p3["row"][fkey].format(n=n)] = money(amt)
    tot = p3["totals"]
    pi3 = tic.get("part_iii", {})
    text[tot["total_A"]] = money(pi3.get("A"))
    text[tot["total_B"]] = money(pi3.get("B"))
    text[tot["total_C"]] = money(pi3.get("C"))
    text[tot["total_D"]] = money(pi3.get("D"))
    text[tot["total_E_total_income"]] = money(pi3.get("E"))

    # --- Part IV income from assets ------------------------------------------
    p4 = field_map["page1_income_from_assets_part4"]
    assets = [a for a in S.get("assets", []) if a.get("type") != "retirement"]
    excluded_ct = len(S.get("assets", [])) - len(assets)
    if excluded_ct:
        warn(f"{excluded_ct} retirement account(s) excluded from the Part IV table (correct under HOTMA) — "
             "make sure any pension distribution is on the Part III income grid instead.")
    row_k_sum = 0.0
    for i, a in enumerate(assets[:5]):
        n = i + 1
        r = p4["row"]
        text[r["hh_member_number"].format(n=n)] = str((a.get("member", 0) if a.get("member") != "joint" else 0) + 1)
        text[r["col_F_type_of_asset"].format(n=n)] = ASSET_LABELS.get(a.get("type"), a.get("type", ""))
        text[r["col_G_bank_or_source"].format(n=n)] = a.get("institution", "")
        text[r["col_H_last4_of_account"].format(n=n)] = a.get("last4", "")
        cash_value = float(a.get("value") or 0)
        rate = float(a.get("rate") or 0)
        actual_income = round(cash_value * rate / 100, 2)
        row_k_sum += actual_income
        text[r["col_J_cash_value"].format(n=n)] = money(cash_value)
        text[r["col_K_actual_income"].format(n=n)] = money(actual_income)
        text[r["col_L_imputed"].format(n=n)] = "0.00"
    pi4 = tic.get("part_iv", {})
    exported_k = float(pi4.get("K") or 0)
    if assets and abs(row_k_sum - exported_k) > 0.01:
        warn(f"Per-asset 'Actual Income' rows sum to {row_k_sum:.2f} but the data file's Part IV (K) total is "
             f"{exported_k:.2f} — the row-level figures are this script's own derivation (value × rate), "
             "not read from the export; check them against the engine before sending the packet out.")
    tot4 = p4["totals"]
    text[tot4["total_J_cash_value"]] = money(sum(float(a.get("value") or 0) for a in assets))
    text[tot4["total_K_actual_income"]] = money(exported_k)
    text[tot4["total_L_imputed"]] = "0.00"

    # --- Part (M) tax return / (N)/(O) totals --------------------------------
    tr = field_map["page1_tax_return_and_totals"]
    refund_yes = special.get("taxRefund") == "yes"
    chk[tr["has_tax_refund_yes_checkbox" if refund_yes else "has_tax_refund_no_checkbox"]] = on_state.get(
        tr["has_tax_refund_yes_checkbox" if refund_yes else "has_tax_refund_no_checkbox"], ON)
    if refund_yes:
        text[tr["refund_value_if_yes"]] = money(special.get("taxRefundAmount"))
    text[tr["subtract_refund_from_net_assets"]] = money(pi4.get("tax_refund"))
    text[tr["total_N_income_from_assets"]] = money(pi4.get("N"))
    text[tr["total_O_annual_household_income"]] = money(tic.get("O_total_household_income"))

    # --- page 2: Part V income eligibility -----------------------------------
    p5 = field_map["page2_part5_income_eligibility"]
    piv5 = tic.get("part_v", {})
    text[p5["total_annual_household_income_from_L"]] = money(tic.get("O_total_household_income"))
    text[p5["current_federal_lihtc_limit_per_family_size"]] = money(piv5.get("income_limit"))
    text[p5["household_income_as_of_movein"]] = money(limits.get("incomeAtMoveIn"))
    sa = prop.get("setAside")
    if sa in ("60", "50"):
        fkey = p5["federal_income_restriction_checkboxes"][sa]
        chk[fkey] = on_state.get(fkey, ON)
    elif sa == "ait":
        warn("setAside is 'ait' (Average Income Test) but the engine doesn't export which tier (20-80%) — "
             "no Federal AIT box checked on page 2; pick the right one by hand.")
    recert = p5["recert_only"]
    text[recert["current_federal_lihtc_limit_x_140pct"]] = money(piv5.get("limit_x140"))
    text[recert["household_size_at_movein"]] = str(limits.get("sizeAtMoveIn", ""))
    chk[recert["income_exceeds_140pct_radio"]] = (recert["income_exceeds_140pct_radio_yes_value"]
        if piv5.get("over_140") else recert["income_exceeds_140pct_radio_no_value"])

    # --- Part VI rent ----------------------------------------------------------
    p6 = field_map["page2_part6_rent"]
    piv6 = tic.get("part_vi", {})
    text[p6["tenant_paid_monthly_rent"]] = money(piv6.get("tenant_rent"))
    text[p6["monthly_utility_allowance"]] = money(piv6.get("utility_allowance"))
    text[p6["other_monthly_nonoptional_charges"]] = money(piv6.get("other_charges"))
    text[p6["gross_monthly_rent_for_unit"]] = money(piv6.get("gross_rent"))
    text[p6["federal_rent_assistance_amount"]] = money(piv6.get("federal_ra"))
    text[p6["federal_rent_assistance_source_code"]] = str(piv6.get("federal_source_code", ""))
    text[p6["non_federal_rent_assistance_amount"]] = money(piv6.get("non_federal_ra"))
    text[p6["total_monthly_rent_assistance"]] = money(piv6.get("total_ra"))
    rr = rent.get("restriction")
    if rr in ("60", "50"):
        fkey = p6["federal_rent_restriction_checkboxes"][rr]
        chk[fkey] = on_state.get(fkey, ON)

    # --- Part VII student status -------------------------------------------
    p7 = field_map["page2_part7_student_status"]
    piv7 = tic.get("part_vii", {})
    fkey = p7["all_full_time_students_yes"] if piv7.get("all_full_time_students") else p7["all_full_time_students_no"]
    chk[fkey] = on_state.get(fkey, ON)

    # --- Part VIII program type -----------------------------------------------
    p8 = field_map["page2_part8_program_type"]
    prog = prop.get("program")
    prog_field = {"9": "9pct_tax_credit", "4": "4pct_tax_credit", "bond": "tax_exempt_bond_only"}.get(prog)
    if prog_field:
        fkey = p8["select_one"][prog_field]
        chk[fkey] = on_state.get(fkey, ON)
    other = prop.get("other", {})
    for flag, key in (("home", "home_including_tcap"), ("cdbg", "cdbg"), ("hud", "other_hud_202_811_236"),
                       ("nhtf", "national_housing_trust_fund"), ("usda", "usda_rural_housing_514_515_538"),
                       ("local", "other_state_or_local")):
        if other.get(flag):
            fkey = p8["select_all_that_apply"][key]
            chk[fkey] = on_state.get(fkey, ON)

    # --- page 3: race / ethnicity --------------------------------------------
    p9 = field_map["page3_race_ethnicity"]
    for i, mem in enumerate(members[:7]):
        n = i + 1
        r = p9["row"]
        text[r["last_name"].format(n=n)] = mem.get("last", "")
        text[r["first_name"].format(n=n)] = mem.get("first", "")
        text[r["middle_initial"].format(n=n)] = mem.get("mi", "")
        text[r["race"].format(n=n)] = mem.get("race", "")
        text[r["ethnicity"].format(n=n)] = mem.get("ethnicity", "")
        text[r["disabled"].format(n=n)] = "Y" if mem.get("disabled") else "N"

    return text, chk


def patch_missing_appearance_states(writer):
    """Work around a pypdf crash on this PDF: at least one field (the official
    hotma_tic.pdf ships with 'fill_140' like this) is a plain text field split
    into a parent object (/T, /FT) plus a single anonymous Kid widget that has
    never been rendered and so has no /AP at all. pypdf's
    update_page_form_field_values() assumes every Kid of a matched parent is a
    checkbox/radio widget with on/off appearance sub-states, and does
    `kid["/AP"]["/N"]` unconditionally — which raises KeyError('/AP') the
    moment it walks a Kid that has none.

    Giving that Kid an empty /AP/N dict avoids the crash without changing what
    ends up on the page: for a genuine checkbox/radio Kid it just means "no
    matching on-state here, leave it /Off" (correct — a widget with no
    appearance streams could never have shown as checked anyway); for a text
    field's Kid, /AS is not what renders the value (that's /V plus the
    NeedAppearances flag set below), so it's inert either way.
    """
    patched = []
    for page in writer.pages:
        annots = page.get("/Annots")
        if annots is None:
            continue
        for a in annots.get_object():
            obj = a.get_object()
            if obj.get("/Subtype") != "/Widget" or obj.get("/Parent") is None:
                continue
            if "/AP" not in obj:
                obj[NameObject("/AP")] = DictionaryObject({NameObject("/N"): DictionaryObject()})
                parent_t = obj["/Parent"].get_object().get("/T")
                patched.append(str(parent_t))
    return patched


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    data_path, blank_pdf, out_pdf = sys.argv[1:4]
    data = load_json(data_path)
    if data.get("schema") != "propops8.recert.v1":
        print(f"warning: data file schema is {data.get('schema')!r}, expected 'propops8.recert.v1' — "
              "continuing, but field names may not line up.", file=sys.stderr)
    field_map, on_state = load_maps()

    warnings_ = []
    text_values, checkbox_values = build_values(data, field_map, on_state, warnings_.append)

    reader = PdfReader(blank_pdf)
    writer = PdfWriter()
    writer.append(reader)
    patched = patch_missing_appearance_states(writer)
    if patched:
        warnings_.append(
            f"worked around {len(patched)} PDF widget(s) with no appearance stream in the official "
            f"form ({', '.join(patched)}) — their text/value still gets written, this is just a "
            "pypdf compatibility shim, not a data gap.")
    all_values = {**text_values, **checkbox_values}
    for page in writer.pages:
        writer.update_page_form_field_values(page, all_values, auto_regenerate=False)
    if hasattr(writer, "set_need_appearances_writer"):
        writer.set_need_appearances_writer(True)  # ask the PDF viewer to redraw field appearances on open
    with open(out_pdf, "wb") as f:
        writer.write(f)

    print(f"wrote {out_pdf}  ({len(text_values)} text fields, {len(checkbox_values)} checkboxes)")
    if warnings_:
        print(f"\n{len(warnings_)} thing(s) this script could NOT fill from the data — check by hand:")
        for w in warnings_:
            print("  - " + w)


if __name__ == "__main__":
    main()
