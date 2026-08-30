#!/usr/bin/env bash
#
# scripts/preflight.sh — everything that should pass before a deploy.
#
#   bash scripts/preflight.sh
#
# Runs in the order that fails fastest and cheapest. A broken link check takes
# a second; discovering it on the live site costs a deploy cycle and whoever
# clicked it in the meantime.

set -uo pipefail

FAILURES=0
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32mok\033[0m    %s\n' "$1"; }
bad()  { printf '  \033[31mfail\033[0m  %s\n' "$1"; FAILURES=$((FAILURES+1)); }
warn() { printf '  \033[33mwarn\033[0m  %s\n' "$1"; }

[[ -f package.json ]] || { echo "Run from the repo root."; exit 1; }

# ---------------------------------------------------------------- git ------

step "Git"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [[ -n "$(git status --porcelain)" ]]; then
    warn "uncommitted changes — commit before deploying so you can roll back"
    git status --short | head -8 | sed 's/^/        /'
  else
    ok "working tree clean"
  fi
else
  warn "not a git repository — you have no undo for any of this"
fi

# --------------------------------------------------------------- links -----

step "Internal links"
LINKS=$(grep -rhoE '(href|Href)="/[^"#?]*"' app components 2>/dev/null \
        | sed 's/.*="//;s/"$//' | sed 's|/$||' | sort -u | grep -v '^$')
ROUTES=$(find app \( -name 'page.tsx' -o -name 'route.ts' \) 2>/dev/null \
        | sed 's|^app||;s|/page.tsx$||;s|/route.ts$||' | sed 's|^$|/|' | sort -u)

for l in $LINKS; do
  # Dynamic segments can't be matched literally; skip them.
  [[ "$l" == *"["* ]] && continue
  target="${l:-/}"
  if echo "$ROUTES" | grep -qx -- "$target"; then
    ok "$target"
  else
    bad "$target — linked but no page.tsx at that path"
  fi
done

# --------------------------------------------------------------- assets ----

step "Referenced images"
IMGS=$(grep -rhoE 'src="/[^"]+\.(png|webp|jpg|jpeg|svg)"' app components 2>/dev/null \
       | sed 's/src="//;s/"$//' | sort -u)
for i in $IMGS; do
  if [[ -f "public$i" ]]; then
    size=$(wc -c < "public$i" | tr -d ' ')
    if (( size == 0 )); then
      bad "public$i is 0 bytes"
    elif (( size > 900000 )); then
      warn "public$i is $((size/1024)) KB — heavy for the web"
    else
      ok "$i"
    fi
  else
    bad "public$i missing — will 404 in production"
  fi
done

# Case sensitivity: fine on macOS, fatal on Netlify's Linux build.
step "Filename case"
CAPS=$(find public -type f \( -name '*[A-Z]*' \) -not -name '.*' 2>/dev/null | head -5)
if [[ -n "$CAPS" ]]; then
  warn "capital letters in public/ filenames — these load locally and 404 on deploy"
  echo "$CAPS" | sed 's/^/        /'
else
  ok "all lowercase"
fi

# ------------------------------------------------------------------ env ----

step "Environment"
if [[ -f scripts/check-env.mjs ]]; then
  node scripts/check-env.mjs --offline 2>&1 | grep -E 'fail|warn' | head -12 | sed 's/^/  /'
  [[ ${PIPESTATUS[0]:-0} -ne 0 ]] && warn "env has failures — fine locally, not for live payments"
else
  warn "scripts/check-env.mjs not found"
fi

# ---------------------------------------------------------------- build ----

step "Build"
if npm run build >/tmp/propops8-build.log 2>&1; then
  ok "compiled"
  printf '\n'
  grep -E '^[┌├└]' /tmp/propops8-build.log | sed 's/^/  /'
else
  bad "build failed"
  tail -25 /tmp/propops8-build.log | sed 's/^/        /'
fi

# --------------------------------------------------------------- report ----

printf '\n'
if (( FAILURES == 0 )); then
  printf '\033[32mClear to deploy.\033[0m\n\n  npx netlify deploy --prod\n\n'
  printf 'If Cloudflare proxies your DNS, purge its cache after deploying —\n'
  printf 'otherwise visitors keep getting the previous build.\n\n'
  exit 0
else
  printf '\033[31m%d problem(s). Fix before deploying.\033[0m\n\n' "$FAILURES"
  exit 1
fi
