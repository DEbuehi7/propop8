# Source access blockers

Sources Claude's workspace cannot use directly, with the official alternative.

| Source | Status | Why | Official alternative |
|---|---|---|---|
| S01 Assessor Property Search (Kern County Assessor-Recorder) | interactive_only | Page text readable from Claude's workspace; the search itself is an interactive app. Result page has 'Copy Link' and 'View Parcel Map'. Lookups need a human screenshot. | Owner looks it up on the official site and sends a screenshot; Claude logs it as evidence with time and file hash. |
| S03 General Plan interactive maps (Kern County Planning) | not_checked |  | Check when Phase 1 reaches it. |
| S04 Mapping Division (Fresno County Assessor) | interactive_only | Page readable; exact tool URLs not shown in the page text. Lookups need a human screenshot. | Owner looks it up on the official site and sends a screenshot; Claude logs it as evidence with time and file hash. |
| S05 Fresno County GIS Portal (Fresno County Public Works and Planning) | blocked | Fetch from Claude's workspace failed. Owner phone screenshots exist (archive AIMV-001 to AIMV-003); no parcel selected in them. | Owner looks it up on the official site and sends a screenshot; Claude logs it as evidence with time and file hash. |
| S06 Department page (Fresno County Public Works and Planning) | not_checked |  | Check when Phase 1 reaches it. |
| S09 Zoning Comparison Map (web app) (City of Fresno Planning) | interactive_only | Needs a human screenshot of the parcel popup. | Owner looks it up on the official site and sends a screenshot; Claude logs it as evidence with time and file hash. |
| S10 Official city-limits map (not yet located) (City of Bakersfield) | not_checked | Needed to settle city vs county for K1-K5. Do not assume city authority from the postal city. | Check when Phase 1 reaches it. |
| S11 Kern_Parcels feature service (Unverified ArcGIS Online organisation) | blocked | Found by web search. Metadata and organisation lookup refused from Claude's workspace; not Kern County until the publisher is confirmed. | Owner looks it up on the official site and sends a screenshot; Claude logs it as evidence with time and file hash. |
| S30 Fresno County Airport Land Use Compatibility Plan (Fresno Council of Governments) | not_checked | Phase 2 source; listed so the airport zones in AIMV-001..003 have an official reference. | Check when Phase 1 reaches it. |
