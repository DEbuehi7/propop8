# PropOps8

The propops8.com site and its back office, in one Next.js app:

- **PropOps8**: the paid maintenance cost audit (Tally intake, deterministic
  engine, human review, PDF report), the recertification flow and the free
  calculators.
- **AIM-B5R**: real-estate intelligence behind the admin login:
  - the Kern/Fresno identity kit;
  - the BRRRR underwriting engine and deal pipeline;
  - the photo screen;
  - the Façade Intelligence workbench.
- **Plate8 / Dance8 / Stuttr / Late8**: the personal media rig and its
  command-line tools. These are kept apart from property data (canon GOV-15).

## Where to look

| | |
|---|---|
| What exists right now (versions, routes, env names, migrations, what is built) | [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md), generated |
| Every document, by area | [docs/README.md](docs/README.md) |
| Rules for every change | [CLAUDE.md](CLAUDE.md) and the canon, [docs/canon/README.md](docs/canon/README.md) |
| Security gate and owner steps | [docs/security/README.md](docs/security/README.md) |

## Run and check

```
npm install
npm run dev        # http://localhost:3000
npm run verify     # typecheck, lint and every test; must pass before a merge
npm run state      # regenerate docs/PROJECT_STATE.md after adding a route, env name, migration or version
```

Copy `.env.local.example` to `.env.local` and fill in values locally. Values
never go in git, chat or screenshots; the secret-scan test fails `verify` if
one does.

## Shipping

1. Work on a feature branch.
2. Open a pull request.
3. The owner merges it.
4. Netlify builds `main` (`netlify.toml`, Node 22).
5. Everything under `/admin` sits behind the login in `proxy.ts`.
6. Every API route is denied unless `tests/routeAuth.test.ts` lists it as public, with a reason.

**This repository is public**: nothing confidential, no resident or
employer data, and no audio or real-song files.
