#!/usr/bin/env bash
#
# scripts/apply.sh — write an edited bundle back onto the filesystem.
#
#   bash scripts/apply.sh                 reads bundle.txt
#   bash scripts/apply.sh review.txt      reads a named file
#   pbpaste | bash scripts/apply.sh -     reads stdin (macOS clipboard)
#   bash scripts/apply.sh --dry-run       show what would change, touch nothing
#
# THE SAFETY MODEL IS GIT, NOT THIS SCRIPT.
#
# This overwrites files wholesale. If a returned bundle is truncated — a chat
# window cut it off mid-file, which happens — the truncated version lands on
# disk and the good one is gone. So it refuses to run on a dirty working tree.
# Commit first, apply, then read `git diff`. That diff is the only real review
# step, and it is the reason this is safe to use at all.

set -euo pipefail

SRC="bundle.txt"
DRY=0
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --force)   FORCE=1; shift ;;
    -h|--help)
      sed -n '3,18p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    -)  SRC="-"; shift ;;
    *)  SRC="$1"; shift ;;
  esac
done

# ------------------------------------------------------------- git guard ---

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [[ -n "$(git status --porcelain)" && $FORCE -eq 0 && $DRY -eq 0 ]]; then
    echo "Working tree has uncommitted changes." >&2
    echo "" >&2
    git status --short | sed 's/^/  /' >&2
    echo "" >&2
    echo "Commit or stash first — then a bad apply is one 'git checkout .' away:" >&2
    echo "  git add -A && git commit -m 'wip before apply'" >&2
    echo "" >&2
    echo "Or override with --force (you lose the undo)." >&2
    exit 1
  fi
else
  echo "Not a git repository. This script overwrites files with no undo." >&2
  echo "Run 'git init' first, or accept the risk with --force." >&2
  [[ $FORCE -eq 0 ]] && exit 1
fi

# ------------------------------------------------------------------ read ---

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [[ "$SRC" == "-" ]]; then
  cat > "$TMP"
else
  [[ -f "$SRC" ]] || { echo "No such file: $SRC" >&2; exit 1; }
  cat "$SRC" > "$TMP"
fi

if ! grep -q '^<<<PROPOPS8:FILE ' "$TMP"; then
  echo "No file markers found in $SRC." >&2
  echo "Expected lines like:  <<<PROPOPS8:FILE app/page.tsx>>>" >&2
  exit 1
fi

# A bundle that ends mid-file is the failure mode this catches. The generator
# always emits a closing END marker; a chat window that truncated the reply
# will not have one.
if ! grep -q '^<<<PROPOPS8:END>>>$' "$TMP"; then
  echo "Bundle has no closing <<<PROPOPS8:END>>> marker." >&2
  echo "It was probably truncated in transit. Applying it would write a" >&2
  echo "half-finished file over a working one." >&2
  [[ $FORCE -eq 0 ]] && exit 1
  echo "--force given; continuing." >&2
fi

# ----------------------------------------------------------------- apply ---

awk -v DRY="$DRY" '
  function flush() { if (out != "") { close(out); out = "" } }

  /^<<<PROPOPS8:FILE / {
    flush()
    path = $0
    sub(/^<<<PROPOPS8:FILE /, "", path)
    sub(/>>>[ \t]*$/, "", path)
    if (path == "") next

    if (DRY) { print "  would write  " path; next }

    dir = path
    if (sub(/\/[^\/]*$/, "", dir) && dir != path) {
      system("mkdir -p \"" dir "\"")
    }
    out = path
    printf "" > out          # truncate now, so an empty file still lands
    print "  wrote        " path > "/dev/stderr"
    next
  }

  /^<<<PROPOPS8:DELETE / {
    flush()
    path = $0
    sub(/^<<<PROPOPS8:DELETE /, "", path)
    sub(/>>>[ \t]*$/, "", path)
    if (path == "") next
    if (DRY) { print "  would delete " path; next }
    system("rm -rf \"" path "\"")
    print "  deleted      " path > "/dev/stderr"
    next
  }

  /^<<<PROPOPS8:(END|BUNDLE|NOTE)/ { flush(); next }

  { if (out != "") print >> out }

  END { flush() }
' "$TMP"

echo ""

if [[ $DRY -eq 1 ]]; then
  echo "Dry run — nothing written."
  exit 0
fi

# ---------------------------------------------------------------- review ---

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Changed:"
  git status --short | sed 's/^/  /'
  echo ""
  echo "Review before trusting it:"
  echo "  git diff                 # what actually changed"
  echo "  npm run build            # does it still compile"
  echo "  git checkout .           # undo everything"
fi
