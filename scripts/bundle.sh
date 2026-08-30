#!/usr/bin/env bash
#
# scripts/bundle.sh — flatten source files into one pasteable text file.
#
#   bash scripts/bundle.sh                    everything (minus excludes)
#   bash scripts/bundle.sh app/api lib        only those paths
#   bash scripts/bundle.sh --out review.txt app/audit
#
# Output goes to bundle.txt by default. Paste it into a chat, get an edited
# bundle back, save it, then run apply.sh.
#
# WHAT THIS DELIBERATELY DOES NOT INCLUDE
#   .env and .env.* are hard-excluded, and the output is scanned for anything
#   that looks like a live key before it is written. Pasting a bundle that
#   contains SUPABASE_SERVICE_ROLE_KEY into a chat window hands over full
#   read/write on your database to anyone who ever sees that transcript.
#   The scan is a backstop, not a substitute for keeping secrets in .env.

set -euo pipefail

OUT="bundle.txt"
FORCE=0
PATHS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)   OUT="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help)
      sed -n '3,20p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) PATHS+=("$1"); shift ;;
  esac
done

[[ ${#PATHS[@]} -eq 0 ]] && PATHS=(".")

# ---------------------------------------------------------------- collect ---

EXCLUDE_DIRS='\./\.git/|/node_modules/|/\.next/|/out/|/dist/|/build/|/\.netlify/|/\.vercel/|/\.turbo/'
EXCLUDE_FILES='package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.env|\.env\..*|next-env\.d\.ts|bundle\.txt'
KEEP_EXT='\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|sql|md|py|sh|toml|yml|yaml|txt|html)$'

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

FILES="$(
  find "${PATHS[@]}" -type f 2>/dev/null \
    | grep -Ev "$EXCLUDE_DIRS" \
    | grep -Ev "/($EXCLUDE_FILES)$" \
    | grep -E "$KEEP_EXT" \
    | sed 's|^\./||' \
    | sort
)"

if [[ -z "$FILES" ]]; then
  echo "No matching files under: ${PATHS[*]}" >&2
  exit 1
fi

{
  echo "<<<PROPOPS8:BUNDLE $(date -u +%Y-%m-%dT%H:%M:%SZ)>>>"
  echo "<<<PROPOPS8:NOTE Edit contents freely. Keep the markers exactly as-is.>>>"
  echo
  while IFS= read -r f; do
    echo "<<<PROPOPS8:FILE ${f}>>>"
    cat "$f"
    # Guarantee a newline before the next marker even if the file lacks one.
    [[ -n "$(tail -c 1 "$f")" ]] && echo
  done <<< "$FILES"
  echo "<<<PROPOPS8:END>>>"
} > "$TMP"

# ------------------------------------------------------------ secret scan ---

SECRETS="$(
  grep -nEi \
    -e 'sk_(live|test)_[A-Za-z0-9]{10,}' \
    -e 'rk_(live|test)_[A-Za-z0-9]{10,}' \
    -e 'whsec_[A-Za-z0-9]{10,}' \
    -e 're_[A-Za-z0-9]{20,}' \
    -e 'eyJ[A-Za-z0-9_-]{30,}' \
    -e 'service_role' \
    -e 'BEGIN [A-Z ]*PRIVATE KEY' \
    "$TMP" || true
)"

if [[ -n "$SECRETS" ]]; then
  echo "" >&2
  echo "REFUSING TO WRITE — the bundle contains what look like live credentials:" >&2
  echo "$SECRETS" | head -20 | sed 's/^/  /' >&2
  echo "" >&2
  echo "Move those values into .env and read them with process.env, then re-run." >&2
  echo "If every hit is a false positive: bash scripts/bundle.sh --force" >&2
  [[ $FORCE -eq 0 ]] && exit 2
  echo "--force given; continuing anyway." >&2
fi

mv "$TMP" "$OUT"
trap - EXIT

# ---------------------------------------------------------------- report ---

COUNT="$(grep -c '^<<<PROPOPS8:FILE ' "$OUT")"
BYTES="$(wc -c < "$OUT" | tr -d ' ')"
# ~3.6 bytes/token is a reasonable rule of thumb for source code.
TOKENS="$(( BYTES / 4 ))"

echo "Wrote $OUT"
echo "  files   $COUNT"
echo "  size    $(( BYTES / 1024 )) KB"
echo "  tokens  ~${TOKENS} (rough)"

if (( TOKENS > 60000 )); then
  echo ""
  echo "That is large for a single paste. Bundle a slice instead, e.g.:"
  echo "  bash scripts/bundle.sh app/api lib"
  echo "  bash scripts/bundle.sh app/audit app/upload"
fi
