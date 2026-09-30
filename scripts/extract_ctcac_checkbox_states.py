#!/usr/bin/env python3
"""
CTCAC HOTMA checkbox/radio on-state extractor — companion to extract_ctcac_fields.py.

Why this exists: extract_ctcac_fields.py (and the ctcac_fields.json it produced) gives
every field's name, type and tooltip, but NOT the literal on-state string a checkbox or
radio button needs when you check it. That's rarely just "Yes" — it's whatever appears
in the widget's /AP /N appearance sub-dictionary (e.g. "/1", "/Y", a custom name), and it
can differ per widget even within the same named field (a radio group's two widgets each
have their own on-state, both distinct from "/Off"). Filling a PDF checkbox with the wrong
on-state silently does nothing — the box just stays empty — so this needs to be nailed down
before the fill_packets-style renderer writes real values into these forms.

Run this the same way as extract_ctcac_fields.py (same machine, same venv):

    pip install pypdf certifi --break-system-packages
    python3 extract_ctcac_checkbox_states.py

Output:
    ctcac_checkbox_states.json — one entry per /Btn field per form, e.g.:
      "tic": {
        "140 at recertification": {
          "widget_count": 2,
          "on_states": ["/Yes", "/No"]
        }, ...
      }
    A field with widget_count > 1 and more than one on-state is a true shared-name
    radio group (see GOTCHA 4 in tic_field_map.json) — you need to know which physical
    widget corresponds to which on-state, which this script can't tell you (pypdf doesn't
    expose widget position from get_fields() alone). Cross-reference against
    tic_field_positions.json's rects for that field name if the group has more than one
    on-state and position matters.
"""
import json
import ssl
import urllib.request

try:
    from pypdf import PdfReader
    from pypdf.generic import IndirectObject
except ImportError:
    raise SystemExit("Missing dependency — run: pip install pypdf certifi --break-system-packages")

try:
    import certifi
    _ctx = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _ctx = ssl.create_default_context()
urllib.request.install_opener(urllib.request.build_opener(urllib.request.HTTPSHandler(context=_ctx)))

# Same registry as extract_ctcac_fields.py.
FORMS = {
    "tic":     "https://www.treasurer.ca.gov/sites/default/files/2025-12/hotma_tic.pdf",
    "ticq":    "https://www.treasurer.ca.gov/sites/default/files/2025-12/hotma_template.pdf",
    "asset":   "https://www.treasurer.ca.gov/sites/default/files/ctcac/52787%20Asset%20Certification%20%28Final%29.pdf",
    "finaid":  "https://www.treasurer.ca.gov/sites/default/files/ctcac/Verification%20of%20Student-Financial-Assistance-FINAL-2026.pdf",
    "csaff":   "https://www.treasurer.ca.gov/sites/default/files/2025-12/childspouseafid.pdf",
    "sec42":   "https://www.treasurer.ca.gov/sites/default/files/2025-12/Section-42.pdf",
    "evict":   "https://www.treasurer.ca.gov/sites/default/files/2025-12/eviction_docs.pdf",
    "voe":     "https://www.treasurer.ca.gov/sites/default/files/ctcac/Verification%20of%20Employment%20%28Final%29.pdf",
    "zero":    "https://www.treasurer.ca.gov/sites/default/files/2025-12/zeroincome.pdf",
    "csver":   "https://www.treasurer.ca.gov/sites/default/files/2025-12/childspouseverif.pdf",
    "sep":     "https://www.treasurer.ca.gov/sites/default/files/2025-12/separated-or-estranged-status-affidavit.pdf",
    "student": "https://www.treasurer.ca.gov/sites/default/files/2025-12/stntform.pdf",
    "single":  "https://www.treasurer.ca.gov/sites/default/files/2025-12/single.pdf",
    "foster":  "https://www.treasurer.ca.gov/sites/default/files/2025-12/foster.pdf",
    "livein":  "https://www.treasurer.ca.gov/sites/default/files/2025-12/livein.pdf",
    "thif":    "https://www.treasurer.ca.gov/sites/default/files/2025-12/tenant.pdf",
}


def widget_on_states(widget):
    """Return the set of non-/Off keys in a widget's /AP /N appearance sub-dictionary —
    these are the literal values that turn this specific widget 'on'."""
    states = set()
    ap = widget.get("/AP")
    if ap is None:
        return states
    normal = ap.get("/N")
    if normal is None:
        return states
    try:
        keys = normal.keys()
    except AttributeError:
        return states  # /N points straight at a stream, not a sub-dictionary — no named states
    for k in keys:
        if k != "/Off":
            states.add(str(k))
    return states


def main():
    out = {}
    for key, url in FORMS.items():
        fn = f"_{key}.pdf"
        print(f"[{key}] downloading...")
        try:
            urllib.request.urlretrieve(url, fn)
        except Exception as e:
            print(f"  FAILED to download: {e}")
            out[key] = {"_error": f"download failed: {e}"}
            continue

        reader = PdfReader(fn)
        fields = reader.get_fields() or {}
        btn_fields = {name: f for name, f in fields.items() if str(f.get("/FT")) == "/Btn"}
        if not btn_fields:
            out[key] = {"_note": "no /Btn fields found via AcroForm"}
            continue

        result = {}
        for name in btn_fields:
            result[name] = {"widget_count": 0, "on_states": []}

        # Walk every page's annotations (not just get_fields()) so multi-widget radio
        # groups are counted per widget, and states from EVERY widget get captured.
        for page in reader.pages:
            annots = page.get("/Annots")
            if not annots:
                continue
            for a in annots:
                obj = a.get_object()
                if obj.get("/Subtype") != "/Widget":
                    continue
                # A widget's field name is on itself (/T) or inherited from /Parent.
                name = obj.get("/T")
                node = obj
                while name is None and node.get("/Parent") is not None:
                    node = node.get("/Parent").get_object()
                    name = node.get("/T")
                name = str(name) if name is not None else None
                if name not in result:
                    continue
                result[name]["widget_count"] += 1
                for s in widget_on_states(obj):
                    if s not in result[name]["on_states"]:
                        result[name]["on_states"].append(s)

        out[key] = result
        print(f"  {len(result)} checkbox/radio fields")

    with open("ctcac_checkbox_states.json", "w") as f:
        json.dump(out, f, indent=2)
    print("\nWrote ctcac_checkbox_states.json — send this back to finish the TIC field map.")


if __name__ == "__main__":
    main()
