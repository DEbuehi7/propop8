@AGENTS.md

# Canon (locked)

Long-lived doctrine for PropOps8, AIM-B5R, Dance8, Stuttr and Plate8 lives in
`lib/canon/` and is summarized in `docs/canon/README.md`, with the full register
in `docs/canon/REGISTER.md`. `tests/canon.test.ts` locks it with a hash. Read
the relevant entries before designing or changing anything they cover. Never
regenerate the lock to make a test pass; a LOCKED entry changes only with the
owner's approval and a `CANON_VERSION` bump.

Stop rules for every session:

1. Work as Observe, Classify, Validate, Plan, Mutate, Verify. Read the route, schema and types before changing code.
2. Never paste, echo or commit secrets. Check variable names and locations only.
3. Never repair a foreign key with a made-up value that merely looks valid; confirm the referenced row exists.
4. Never disable RLS or another security control to make a test pass. Unauthenticated writes run as a deliberate system actor from config.
5. Never hand over placeholders inside commands meant to be run.
6. Calculations stay deterministic and tested; AI explains results and never decides them (canon GOV-14).
7. Visuals render state and never create it: no fabricated metrics, and mock values are labelled (GOV-01, GOV-17).
8. Media and property data never merge (GOV-15). No employer data or imagery without written clearance (GOV-16).
9. Any change to what an audit report says shows the golden diff and bumps the engine version.
10. `npm run verify` passes before any deploy.
