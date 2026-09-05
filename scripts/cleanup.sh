#!/usr/bin/env bash
#
# scripts/cleanup.sh — shrink the deploy and clear out dead files.
#
#   bash scripts/cleanup.sh            # report only, changes nothing
#   bash scripts/cleanup.sh --apply    # actually do it
#
# Dry run by default. Every deletion is irreversible on a filesystem but
# recoverable from git, so commit before running with --apply.
#
# The big win here is images. The last deploy was 11.6 MB, and most of that is
# eight 1200px widget PNGs that no page references — the site renders the 600px
# copies in /widgets/sm/. The originals are still wanted for LinkedIn, so they
# move out of /public rather than being deleted: kept on disk, no longer
# shipped to every visitor.

set -uo pipefail
APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

cd "$(dirname "$0")/.." || exit 1
[[ -f package.json ]] || { echo "Run from the repo."; exit 1; }

say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
did()  { printf '  \033[32m•\033[0m %s\n' "$1"; }
note() { printf '  \033[33m•\033[0m %s\n' "$1"; }
run()  { if $APPLY; then eval "$1"; fi; }

$APPLY || printf '\n\033[33mDRY RUN — nothing will change. Add --apply to commit to it.\033[0m\n'

# ------------------------------------------------------------------ safety --

if $APPLY && [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  echo
  echo "Uncommitted changes present. Commit first so this is reversible:"
  echo "  git add -A && git commit -m 'before cleanup'"
  exit 1
fi

# ----------------------------------------------------------- private docs --

say "Private files under public/"
# Anything in public/ is served by URL. docs/ holds the prospect list with
# named executives and the voice reference — neither should be downloadable.
if [[ -d public/docs ]]; then
  note "public/docs is publicly readable — moving to ./docs"
  run "mkdir -p docs && mv public/docs/* docs/ 2>/dev/null; rmdir public/docs"
else
  did "no public/docs"
fi

# --------------------------------------------------------- oversized art --

say "Images over 500 KB"
find public -type f \( -name '*.png' -o -name '*.webp' -o -name '*.jpg' \) -size +500k 2>/dev/null |
while read -r f; do
  note "$(du -h "$f" | cut -f1)  $f"
done
echo "  Resize with: sips -Z 1600 <file> --out <file>"
echo "  (webp support in sips needs macOS 13+; otherwise re-export at 1600px)"

# ------------------------------------------------- unreferenced originals --

say "Widget originals"
# Referenced by pages? The landing page reads /widgets/sm/. The 1200px files
# are LinkedIn assets, not site assets.
if [[ -d public/widgets ]] && [[ -d public/widgets/sm ]]; then
  BIG=$(find public/widgets -maxdepth 1 -name '*.png' | wc -l | tr -d ' ')
  if grep -rq 'widgets/sm/' app components 2>/dev/null && (( BIG > 0 )); then
    SIZE=$(du -sh public/widgets --exclude=sm 2>/dev/null | cut -f1)
    note "$BIG full-size PNGs ($SIZE) shipping but unreferenced — moving to ./assets-source/"
    run "mkdir -p assets-source/widgets && find public/widgets -maxdepth 1 -name '*.png' -exec mv {} assets-source/widgets/ \;"
    run "printf 'assets-source/\n' >> .gitignore"
  else
    did "originals are referenced — leaving alone"
  fi
fi

# ------------------------------------------------------------ dead files --

say "Dead files"
for pat in '.DS_Store' '*.bak' '*.icloud' 'bundle.txt' '*[[:space:]]2.*'; do
  N=$(find . -name "$pat" -not -path './node_modules/*' -not -path './.git/*' 2>/dev/null | wc -l | tr -d ' ')
  if (( N > 0 )); then
    note "$N matching '$pat'"
    find . -name "$pat" -not -path './node_modules/*' -not -path './.git/*' 2>/dev/null | sed 's/^/        /'
    run "find . -name '$pat' -not -path './node_modules/*' -not -path './.git/*' -delete"
  fi
done

say "Build caches"
for d in .next .netlify/functions-serve node_modules/.cache; do
  [[ -d "$d" ]] && { note "$d ($(du -sh "$d" 2>/dev/null | cut -f1))"; run "rm -rf '$d'"; }
done

# -------------------------------------------------------------- deps ------

say "Unused dependencies"
for pkg in $(node -e "const p=require('./package.json');console.log(Object.keys(p.dependencies||{}).join(' '))" 2>/dev/null); do
  case "$pkg" in react|react-dom|next) continue;; esac
  if ! grep -rqE "from ['\"]$pkg|require\(['\"]$pkg" app components lib 2>/dev/null; then
    note "$pkg — no import found (check before removing; some are used indirectly)"
  fi
done

# ------------------------------------------------------------- report -----

say "Deploy size"
[[ -d public ]] && echo "  public/  $(du -sh public | cut -f1)"

printf '\n'
if $APPLY; then
  printf '\033[32mDone.\033[0m Rebuild and check before deploying:\n\n'
  printf '  npm run build\n  bash scripts/preflight.sh\n\n'
else
  printf 'Run again with --apply to make these changes.\n\n'
fi
