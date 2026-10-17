# Lint TODO: React-compiler warnings

Downgraded from errors to warnings in `eslint.config.mjs` so `npm run verify` can pass.
Refactor one at a time, with a behavior check for each. Remove a line here when its warning is gone.
`react-hooks/static-components` is still an error and must stay at zero.

Status: 16 of 16 cleared (the last one in chore/lint-state8-effect-event).

Fixed in code: `react-hooks/refs` (RecertEngineClient), `react-hooks/immutability` (useAudioAnalyzer),
`react-hooks/purity` (admin/b5r), `react-hooks/set-state-in-effect` (plate8 hub, chaosHooks),
`react-hooks/exhaustive-deps` (plate8/state8: the save-on-stop logic moved into a `useEffectEvent`,
so the effect still runs only when recording starts or stops; checked with a fake mic, one save per stop
before and after).

Kept as an effect on purpose, with a one-line reason on an `eslint-disable-next-line` comment:
mount-time reads of browser storage or the page URL, fetch-on-mount loaders, and one click-handler
`Date.now()` that the compiler flags in error (brrrr/page.jsx). Search for `eslint-disable-next-line react-hooks`.

Still open: none.
