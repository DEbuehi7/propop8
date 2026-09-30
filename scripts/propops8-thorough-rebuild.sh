#!/usr/bin/env bash
# propops8-thorough-rebuild.sh
#
# Clears every cache and junk-file class that has actually caused a real
# problem in this project before (not a generic "clear cache" checklist),
# rebuilds from a clean slate, then boots the dev server just long enough
# to run the revenue-path checker against it automatically.
#
# Run from the project root:
#   bash propops8-thorough-rebuild.sh
#
# Add --reinstall to also wipe and reinstall node_modules:
#   bash propops8-thorough-rebuild.sh --reinstall
# Slower (full re-download), and nothing in this project's actual history
# has pointed at node_modules itself as the source of a problem — only
# .next and the SWC cache have. Reach for this only if the plain version
# still leaves something unexplained.

set -uo pipefail

if [ ! -f package.json ]; then
  echo "No package.json here. Run this from the project root, e.g.:"
  echo "  cd ~/dev/propops8 && bash propops8-thorough-rebuild.sh"
  exit 1
fi

REINSTALL=0
[ "${1:-}" = "--reinstall" ] && REINSTALL=1

echo "== Clearing known cache culprits ====================================="
rm -rf .next
rm -rf ~/Library/Caches/next-swc
echo "Removed .next and the SWC cache (the two that caused the"
echo "'Failed to open database... invalid digit found in string' failure before)."

echo
echo "== Sweeping iCloud placeholder junk ==================================="
ICLOUD_FILES=$(find . -name "*.icloud" -not -path './node_modules/*' -not -path './.git/*' 2>/dev/null)
if [ -n "$ICLOUD_FILES" ]; then
  echo "Found:"
  echo "$ICLOUD_FILES"
  find . -name "*.icloud" -not -path './node_modules/*' -not -path './.git/*' -delete
  echo "Deleted — these are always inert conflict-copy placeholders, never real content."
else
  echo "None found."
fi

echo
echo "== Flagging duplicate-download junk (a stray ' N' before the extension) =="
DUP_FILES=$(find . -not -path './node_modules/*' -not -path './.git/*' -not -path './.next/*' \
  -regex '.* [0-9]+\.[A-Za-z0-9]+$' 2>/dev/null)
if [ -n "$DUP_FILES" ]; then
  echo "Found — NOT deleting automatically. One of these was a real, needed file"
  echo "once (next.config 2.ts) with genuinely broken content; a blind delete is"
  echo "the wrong instinct here. Look at each one yourself:"
  echo "$DUP_FILES"
else
  echo "None found."
fi

if [ "$REINSTALL" -eq 1 ]; then
  echo
  echo "== --reinstall: wiping and reinstalling node_modules ================="
  rm -rf node_modules package-lock.json
  npm install
fi

echo
echo "== Rebuilding from the clean slate ===================================="
npm run build > /tmp/propops8-thorough-build.log 2>&1
BUILD_STATUS=$?
cat /tmp/propops8-thorough-build.log

if [ $BUILD_STATUS -ne 0 ]; then
  echo
  echo "== BUILD FAILED even after a full clean. ============================="
  echo "That rules out cache or junk-file corruption as the cause — whatever"
  echo "this is, it's a real error in the code, not the environment. Send me"
  echo "the log above."
  exit 1
fi

echo
echo "== Build succeeded. Booting the dev server to run the full checker ==="
# Free port 3000 first in case something is already sitting on it from a
# previous run that didn't shut down cleanly.
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true

npm run dev > /tmp/propops8-thorough-dev.log 2>&1 &
DEV_PID=$!

READY=0
for i in $(seq 1 40); do
  if grep -qi "ready in" /tmp/propops8-thorough-dev.log 2>/dev/null; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" -ne 1 ]; then
  echo "Dev server didn't report ready within 20s. Log so far:"
  cat /tmp/propops8-thorough-dev.log
  pkill -P "$DEV_PID" 2>/dev/null || true
  kill "$DEV_PID" 2>/dev/null
  lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
  exit 1
fi

sleep 1  # the log line prints slightly before the port reliably accepts connections
node scripts/revenue-path-check.mjs http://localhost:3000
CHECK_STATUS=$?

pkill -P "$DEV_PID" 2>/dev/null || true
kill "$DEV_PID" 2>/dev/null
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true

echo
if [ $CHECK_STATUS -eq 0 ]; then
  echo "== Clean rebuild, clean checker run. Ready for the manual pass. ======"
else
  echo "== Rebuild succeeded but the checker found something — see above. ===="
fi
exit $CHECK_STATUS
