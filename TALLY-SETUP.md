# Tally setup

The code refers to this file for field names. Keep it in sync with the live form.

## 1. Environment

- `NEXT_PUBLIC_TALLY_FORM_ID` (Netlify): the live form id. If unset, `/audit` embeds the placeholder `YOUR_TALLY_FORM_ID`.
- `TALLY_SIGNING_SECRET`: the webhook signing secret. Requests without a valid `tally-signature` are rejected.
- `TALLY_PAYMENT_ENABLED`: `true` to treat a payment as paid and fulfil it. Otherwise intakes are held for manual release.

## 2. Fields

Question labels are matched case-insensitively. A hidden field is matched by its key.

Questions: `Your name`, `Work email`, `Business / portfolio`, `Your role`, `Portfolio size`,
`What's the problem you'd most want answered?`, `Data you can export`.

### Hidden fields (six; names must match exactly)

| Key | Set by | Meaning |
| --- | --- | --- |
| `days` | Vacancy calculator | Operational vacancy days |
| `exposure` | Vacancy calculator | Operational exposure, $ |
| `total_days` | Vacancy calculator | Total vacant days |
| `total_exposure` | Vacancy calculator | Total exposure, $ |
| `calculator_slug` | Any calculator | Registry slug, e.g. `vendor-money-pit` |
| `calculator_headline` | Any calculator | The number the visitor saw, e.g. `71%` |

Flow: calculator CTA -> `/audit?calculator_slug=...&calculator_headline=...` -> embed query string -> Tally hidden fields -> webhook -> `audit_intakes.calculator_snapshot` -> shown in `/admin/intakes` as "Source calculator".

## 3. Trust

Hidden fields come from a query string anyone can edit. `lib/calculatorHandoff.ts` validates both ends: the slug must exist in `lib/diagnosticCalculators.ts`, and the headline is reduced to at most 40 plain characters. Anything else is stored as null. Missing fields are fine; the intake is created with the source blank.
