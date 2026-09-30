#!/usr/bin/env python3
"""
CTCAC HOTMA form field extractor.

Run this on YOUR OWN machine (not in a sandboxed tool) — it downloads each
CTCAC form PDF and dumps its fillable-field names, types and labels to
ctcac_fields.json. Send that file back to Claude and the recert engine's
PDF renderer (the two disabled "Fillable PDF" / "Flat PDF" buttons in
engine.html) can be wired up from it — no more manual field-name lookups.

Usage:
    pip install pypdf certifi --break-system-packages     # or inside a venv: pip install pypdf certifi
    python3 extract_ctcac_fields.py

Output:
    ctcac_fields.json — one entry per form, e.g.:
      "tic": {
        "topmostSubform[0].Page1[0].TextField1[0]": {
          "type": "text", "label": "Property Name", "value": null
        }, ...
      }

Only need the TIC to start? Comment out every other line in FORMS below —
it's the one form every household needs, so it's the highest-value one to
prove the fill mechanism on before mapping the other 18.
"""
import json
import ssl
import urllib.request

try:
    from pypdf import PdfReader
except ImportError:
    raise SystemExit("Missing dependency — run: pip install pypdf certifi --break-system-packages")

# macOS Python (python.org installers and some Homebrew builds) often ships without access to a
# system root-certificate store, so HTTPS downloads fail with
# "SSL: CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate". Point urllib at
# certifi's bundled CA list instead, so this doesn't depend on the machine's own cert setup.
try:
    import certifi
    _ctx = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    print("Note: certifi isn't installed — if downloads fail with a CERTIFICATE_VERIFY_FAILED "
          "error, run `pip install certifi --break-system-packages` and try again.")
    _ctx = ssl.create_default_context()
urllib.request.install_opener(urllib.request.build_opener(urllib.request.HTTPSHandler(context=_ctx)))

# Same form set + URLs as the FORMS registry in public/tools/recert/engine.html.
# Forms with no `src` there (tirc, vawa, selfemp, ra) aren't CTCAC PDFs, so they're not here.
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

FT_NAMES = {"/Tx": "text", "/Btn": "checkbox/radio", "/Ch": "dropdown/list", "/Sig": "signature"}


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
        fields = reader.get_fields()
        if not fields:
            print(f"  0 fields found via AcroForm — this may be an XFA form (common for older CA state PDFs).")
            print(f"  Fallback: install pdftk and run `pdftk {fn} dump_data_fields` for this one.")
            out[key] = {"_warning": "no AcroForm fields detected — try pdftk dump_data_fields"}
            continue

        out[key] = {
            name: {
                "type": FT_NAMES.get(str(f.get("/FT")), str(f.get("/FT"))),
                "label": str(f.get("/TU")) if f.get("/TU") else None,  # tooltip text — usually the real question
                "value": str(f.get("/V")) if f.get("/V") is not None else None,
            }
            for name, f in fields.items()
        }
        print(f"  {len(fields)} fields")

    with open("ctcac_fields.json", "w") as f:
        json.dump(out, f, indent=2)
    print("\nWrote ctcac_fields.json — send this file to Claude to continue the PDF renderer.")


if __name__ == "__main__":
    main()
