#!/usr/bin/env bash
# propops8-check-and-fix.sh
#
# Run this from the ROOT of your propops8 project (same folder as package.json):
#   bash propops8-check-and-fix.sh
#
# What it does, in order:
#   1. Builds the project exactly as it is right now.
#   2. If that succeeds, there's no code error — tells you it's a stale
#      deploy/cache issue instead, and what to do about that.
#   3. If it fails, checks whether the failure is specifically the
#      panelStyle-vs-cardStyle mismatch flagged earlier. Only if that's
#      confirmed (build actually failed, error actually mentions
#      panelStyle, chaosTokens.ts actually has cardStyle but not
#      panelStyle) does it patch components/FounderStrip.tsx and build
#      once more.
#   4. Anything else — a different error, or the patch not fixing it — it
#      prints the real compiler output instead of guessing at a fix. Send
#      that back rather than the "nothing shows up" description; the
#      compiler names the exact file and line.
#
# It never touches a file unless all three conditions above are true, and
# it never attempts more than one automatic patch.

set -uo pipefail

if [ ! -f package.json ]; then
  echo "No package.json here. Run this from the project root, e.g.:"
  echo "  cd ~/dev/propops8 && bash propops8-check-and-fix.sh"
  exit 1
fi

echo "== Building as-is =================================================="
npm run build > /tmp/propops8-build1.log 2>&1
STATUS=$?
cat /tmp/propops8-build1.log

if [ $STATUS -eq 0 ]; then
  echo
  echo "== BUILD SUCCEEDED. There is no code error right now. ============="
  echo "If the founder strip still isn't showing on the site, it isn't a"
  echo "bug — it's a stale build or a stale deploy. Run:"
  echo "  npm run dev"
  echo "and hard-refresh localhost:3000. If it's missing there too, send me"
  echo "this log — but a clean build means it should be there."
  exit 0
fi

echo
echo "== Build failed. Checking if it's the panelStyle issue. ==========="

CAN_AUTOFIX=0
if grep -qi "panelStyle" /tmp/propops8-build1.log \
   && [ -f lib/chaosTokens.ts ] \
   && [ -f components/FounderStrip.tsx ] \
   && ! grep -q "panelStyle" lib/chaosTokens.ts \
   && grep -q "cardStyle" lib/chaosTokens.ts; then
  CAN_AUTOFIX=1
fi

if [ "$CAN_AUTOFIX" -eq 1 ]; then
  echo "Confirmed: chaosTokens.ts exports cardStyle but not panelStyle, and"
  echo "the build error is about panelStyle. Patching components/FounderStrip.tsx"
  echo "(panelStyle -> cardStyle, both occurrences) and building once more."
  sed 's/panelStyle/cardStyle/g' components/FounderStrip.tsx > components/FounderStrip.tsx.tmp \
    && mv components/FounderStrip.tsx.tmp components/FounderStrip.tsx

  echo
  echo "== Rebuilding after the patch ======================================"
  npm run build > /tmp/propops8-build2.log 2>&1
  STATUS2=$?
  cat /tmp/propops8-build2.log

  if [ $STATUS2 -eq 0 ]; then
    echo
    echo "== FIXED. Build succeeded on the second pass. ======================"
    echo "Run 'npm run dev', hard-refresh localhost, check for the founder"
    echo "strip between the argument section and 'Who this is for.'"
    exit 0
  else
    echo
    echo "== Patched panelStyle, but the build still fails. =================="
    echo "That's a second, different problem. Send me the log above — don't"
    echo "guess further, the exact error is in it."
    exit 1
  fi
fi

echo
echo "== Not a match for the panelStyle case, so I'm not auto-patching. =="
echo "Send me everything printed above under 'Building as-is' — that's the"
echo "compiler naming the actual file and line, which beats a guess."
exit 1
