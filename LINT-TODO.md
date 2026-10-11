# Lint TODO: React-compiler warnings

Downgraded from errors to warnings in `eslint.config.mjs` so `npm run verify` can pass.
Refactor one at a time, with a behavior check for each. Remove a line here when its warning is gone.
`react-hooks/static-components` is still an error and must stay at zero.

Status (chore/lint-batch-1): 15 of 16 cleared.

Fixed in code: `react-hooks/refs` (RecertEngineClient), `react-hooks/immutability` (useAudioAnalyzer),
`react-hooks/purity` (admin/b5r), `react-hooks/set-state-in-effect` (plate8 hub, chaosHooks).

Kept as an effect on purpose, with a one-line reason on an `eslint-disable-next-line` comment:
mount-time reads of browser storage or the page URL, fetch-on-mount loaders, and one click-handler
`Date.now()` that the compiler flags in error (brrrr/page.jsx). Search for `eslint-disable-next-line react-hooks`.

Still open (changes when the effect runs, so it needs a decision):

| Rule | File | Line |
| --- | --- | --- |
| `react-hooks/exhaustive-deps` | `app/plate8/state8/page.tsx` | 73 |
