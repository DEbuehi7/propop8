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
echo "-- informational (audit findings M1/M2; should become 401 once fixed)"
echo "      plate8 session list without login:  $(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/api/plate8/state8/session")"
echo "-- security headers on the home page"
hdrs=$(curl -sI --max-time 20 "$BASE/")
for h in strict-transport-security content-security-policy x-content-type-options x-frame-options referrer-policy; do
  if echo "$hdrs" | grep -qi "^$h:"; then echo "  present  $h"; else echo "  missing  $h"; fi
done
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
