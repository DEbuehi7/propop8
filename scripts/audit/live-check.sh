#!/usr/bin/env bash
# Read-only checks against the live site. Prints status codes and header
# presence only; sends no credentials and changes nothing.
#   bash scripts/audit/live-check.sh            (defaults to https://propops8.com)
#   bash scripts/audit/live-check.sh https://staging.example.com
set -u
BASE="${1:-https://propops8.com}"
pass=0; fail=0
check() { # name, expected status, url, [method]
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -X "${4:-GET}" --max-time 20 "$3")
  if [ "$code" = "$2" ]; then echo "PASS  $1 ($code)"; pass=$((pass+1)); else echo "FAIL  $1 (expected $2, got $code)"; fail=$((fail+1)); fi
}
check "health endpoint answers"                 200 "$BASE/api/health"
check "admin API refuses without login"         401 "$BASE/api/admin/intakes"
check "B5R admin API refuses without login"      401 "$BASE/api/admin/b5r/deals"
check "admin page redirects to login"           307 "$BASE/admin"
check "webhook refuses unsigned posts"          401 "$BASE/api/tally-webhook" POST
check "upload page with a fake token is safe"   404 "$BASE/api/upload/not-a-real-token"
# Audit fixes M1/M2 (these FAIL until fix/audit-h1-m3 is deployed)
check "plate8 sessions need login"              401 "$BASE/api/plate8/state8/session"
check "plate8 monitoring needs login"           401 "$BASE/api/plate8/state8/monitoring"
check "rss refuses the cloud metadata address"  400 "$BASE/api/rss?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F"
# The login limit (M3) is not probed here: six wrong passwords would lock
# your own address out for 15 minutes.
echo "-- security headers on the home page"
hdrs=$(curl -sI --max-time 20 "$BASE/")
for h in strict-transport-security content-security-policy x-content-type-options x-frame-options referrer-policy; do
  if echo "$hdrs" | grep -qi "^$h:"; then echo "  present  $h"; else echo "  missing  $h"; fi
done
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
