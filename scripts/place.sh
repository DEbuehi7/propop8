#!/usr/bin/env bash
#
# scripts/place.sh — put every downloaded file where it belongs.
#
#   bash scripts/place.sh --dry-run           show the plan, touch nothing
#   bash scripts/place.sh                     copy from ~/Downloads
#   bash scripts/place.sh ~/Desktop/propops8  copy from somewhere else
#
# This only COPIES files that already exist and removes known-dead paths. It
# never generates source content — the one exception is two three-line wrapper
# pages, and those are written only if the file is absent.
#
# Missing sources are reported, not fatal. Run it again after downloading the
# rest.

set -uo pipefail

SRC="${HOME}/Downloads"
DRY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '3,14p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) SRC="$arg" ;;
  esac
done

[[ -d "$SRC" ]] || { echo "Source folder not found: $SRC" >&2; exit 1; }

if [[ ! -f package.json ]]; then
  echo "Run this from the repo root (no package.json here)." >&2
  exit 1
fi

FOUND=0; MISSING=0; MISSING_LIST=()

place() {  # place <source-name> <destination-path>
  local from="$SRC/$1" to="$2"
  if [[ ! -f "$from" ]]; then
    MISSING=$((MISSING+1)); MISSING_LIST+=("$1  ->  $2"); return
  fi
  FOUND=$((FOUND+1))
  if [[ $DRY -eq 1 ]]; then echo "  would place  $to"; return; fi
  mkdir -p "$(dirname "$to")"
  cp "$from" "$to"
  echo "  placed       $to"
}

echo ""
echo "Source: $SRC"
echo ""
echo "Library"
place chaosTokens.ts   lib/chaosTokens.ts
place chaosHooks.ts    lib/chaosHooks.ts
place email.ts         lib/email.ts
place uploadTokens.ts  lib/uploadTokens.ts

echo ""
echo "Pages"
place page.tsx              app/page.tsx
place audit-page-tally.tsx  app/audit/page.tsx
place thank-you-page.tsx    app/audit/thank-you/page.tsx
place VacancyBlackHole.tsx  app/tools/vacancy-calculator/VacancyBlackHole.tsx
place upload-page.tsx       "app/upload/[token]/page.tsx"
place UploadClient.tsx      "app/upload/[token]/UploadClient.tsx"

echo ""
echo "API"
place tally-webhook-route.ts  app/api/tally-webhook/route.ts
place upload-token-route.ts   "app/api/upload/[token]/route.ts"

echo ""
echo "Components"
place HeroCanvas.tsx     components/HeroCanvas.tsx
place LedgerCheck.tsx    components/LedgerCheck.tsx
place CostCalculator.tsx components/CostCalculator.tsx

for w in ChaosScore VacancyBlackHole AutomationBreakdown DeadlineGraveyard \
         PortfolioRiskMatrix VarianceSpikeChart CallbackNightmare VendorMoneyPit; do
  place "${w}Widget.jsx" "components/widgets/${w}Widget.jsx"
done

echo ""
echo "Migrations — the numbering is the run order, and 003 drops a table"
place supabase-schema.sql       supabase/migrations/001_schema.sql
place upload-migration.sql      supabase/migrations/002_uploads.sql
place upload-schema.sql         supabase/migrations/003_tokens.sql
place upload-token-seen-fn.sql  supabase/migrations/004_token_seen_fn.sql
place 005_tally.sql             supabase/migrations/005_tally.sql

echo ""
echo "Scripts"
place bundle.sh scripts/bundle.sh
place apply.sh  scripts/apply.sh

echo ""
echo "Docs"
place SETUP.md                       docs/SETUP.md
place TALLY-SETUP.md                 docs/TALLY-SETUP.md
place gemini-landing-build-brief.md  docs/build-brief.md
place propops8-repo-structure.md     docs/repo-structure.md
place propops8-launch-copy.md        docs/launch-copy.md

# ---------------------------------------------------------------- cleanup ---

echo ""
echo "Cleanup"
remove() {
  if [[ -e "$1" ]]; then
    if [[ $DRY -eq 1 ]]; then echo "  would remove $1"; else rm -rf "$1"; echo "  removed      $1"; fi
  fi
}

# Stripe is gone; Tally posts to /api/tally-webhook instead.
remove app/api/stripe-webhook
remove app/api/audit-intake
# Can't work as drawn — a Node route can't shell out to Python. Keep it local.
remove app/api/python-bridge
# Superseded by lowercase components/widgets/
remove components/Widgets
# Default scaffold art. Shipping vercel.svg on a Netlify deploy gets noticed.
remove public/next.svg
remove public/vercel.svg
remove public/file.svg
remove public/globe.svg
remove public/window.svg
remove "public/widgets/operations-chaos-index (1).png"

if [[ $DRY -eq 0 ]]; then
  find public/assets public/widgets -type f -name '*.png' -size 0 -delete 2>/dev/null || true
  chmod +x scripts/*.sh 2>/dev/null || true
fi

# ---------------------------------------------------- wrapper pages, if new ---

if [[ $DRY -eq 0 ]]; then
  if [[ ! -f app/ingest/page.tsx ]]; then
    mkdir -p app/ingest
    cat > app/ingest/page.tsx <<'WRAPPER'
import LedgerCheck from '@/components/LedgerCheck';

export const metadata = {
  title: 'Ledger screening — PropOps8',
  description: 'Screen a rent-roll export in your browser. Nothing is transmitted.',
};

export default function IngestPage() {
  return <LedgerCheck />;
}
WRAPPER
    echo "  created      app/ingest/page.tsx (wraps LedgerCheck)"
  fi
fi

# ----------------------------------------------------------------- report ---

echo ""
echo "Placed: $FOUND   Missing: $MISSING"

if [[ $MISSING -gt 0 ]]; then
  echo ""
  echo "Not found in $SRC — download these and re-run:"
  printf '  %s\n' "${MISSING_LIST[@]}"
fi

cat <<'NEXT'

Still to do by hand
  1. app/tools/vacancy-calculator/page.tsx must render the component:
         import VacancyBlackHole from './VacancyBlackHole';
         export default function Page() { return <VacancyBlackHole />; }
     Whatever is there now is Gemini's slider version — replace it.

  2. In VacancyBlackHole.tsx and UploadClient.tsx, split the hook import:
         import { usePrefersReducedMotion, useCountUp } from '@/lib/chaosHooks';
     Everything else they import stays in chaosTokens.

  3. In tally-webhook-route.ts and upload-token-route.ts, delete the local
     Postmark functions and import from '@/lib/email' instead.

  4. Duplicate downloads: diff HeroCanvas.tsx HeroCanvas-1.tsx
     Identical means delete the -1. Different usually means the -1 is newer.

  5. Rename the repo folder: propop8 -> propops8

  6. npm run build   before anything else.
NEXT
