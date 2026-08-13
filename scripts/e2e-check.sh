#!/usr/bin/env bash
# End-to-end smoke test against a running OmniFlow instance.
# Usage: BASE=http://localhost:3000 ./scripts/e2e-check.sh
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
JAR="$(mktemp)"
EMAIL="e2e-$(date +%s)@omniflow.test"
PASS="SuperSecret123"
TMP="$(mktemp -d)"

step() { printf "\n▶ %s\n" "$1"; }
fail() { printf "✗ %s\n" "$1"; exit 1; }

step "Register"
REG=$(curl -s -X POST "$BASE/api/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"E2E Creator\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
USERNAME=$(echo "$REG" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')
[ -n "$USERNAME" ] || fail "registration failed: $REG"
echo "  handle: $USERNAME"

step "Login"
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/callback/credentials" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASS" --data-urlencode "json=true" > /dev/null
SESSION=$(curl -s -b "$JAR" "$BASE/api/auth/session")
echo "$SESSION" | grep -q "$EMAIL" || fail "login failed: $SESSION"

step "Upload deliverable"
echo "OmniFlow e2e deliverable" > "$TMP/playbook.txt"
UP=$(curl -s -b "$JAR" -X POST "$BASE/api/upload" -F "file=@$TMP/playbook.txt" -F "scope=product")
FILE_KEY=$(echo "$UP" | sed -n 's/.*"key":"\([^"]*\)".*/\1/p')
[ -n "$FILE_KEY" ] || fail "upload failed: $UP"

step "Create free digital product"
PROD=$(curl -s -b "$JAR" -X POST "$BASE/api/products" -H 'Content-Type: application/json' \
  -d "{\"title\":\"E2E Playbook\",\"type\":\"digital_file\",\"price\":0,\"currency\":\"\$\",\"description\":\"Automated end-to-end test product.\",\"fileKey\":\"$FILE_KEY\",\"fileName\":\"playbook.txt\",\"fileSize\":24,\"fileMime\":\"text/plain\"}")
PRODUCT_ID=$(echo "$PROD" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$PRODUCT_ID" ] || fail "product creation failed: $PROD"

step "Create Auto-DM rule"
RULE=$(curl -s -b "$JAR" -X POST "$BASE/api/auto-dm" -H 'Content-Type: application/json' \
  -d "{\"platform\":\"instagram\",\"keyword\":\"#KIT\",\"targetProductId\":\"$PRODUCT_ID\",\"autoMessage\":\"Here is your playbook:\"}")
echo "$RULE" | grep -q '"keyword":"#KIT"' || fail "rule creation failed: $RULE"

step "Keyword matcher dry run"
SIM=$(curl -s -b "$JAR" -X POST "$BASE/api/auto-dm/simulate" -H 'Content-Type: application/json' \
  -d '{"comment":"Please send #KIT now"}')
echo "$SIM" | grep -q '"matched":true' || fail "simulator did not match: $SIM"

step "Public store visit"
curl -s "$BASE/$USERNAME" | grep -q "E2E Playbook" || fail "product missing from public store"

step "Checkout (free product, no gateway needed)"
CO=$(curl -s -X POST "$BASE/api/checkout" -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PRODUCT_ID\",\"customerName\":\"Test Buyer\",\"customerEmail\":\"buyer@example.com\",\"gateway\":\"Stripe\"}")
DL=$(echo "$CO" | sed -n 's/.*"downloadUrl":"\([^"]*\)".*/\1/p')
[ -n "$DL" ] || fail "checkout failed: $CO"

step "Download delivered file"
curl -s "$DL" | grep -q "OmniFlow e2e deliverable" || fail "download did not return the file"

step "Paid products are not purchasable while store payments are off"
PAID=$(curl -s -b "$JAR" -X POST "$BASE/api/products" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Paid Guide\",\"type\":\"digital_file\",\"price\":29,\"currency\":\"\$\",\"description\":\"Paid product for gateway enforcement test.\",\"fileKey\":\"$FILE_KEY\",\"fileName\":\"playbook.txt\",\"fileSize\":24,\"fileMime\":\"text/plain\"}")
PAID_ID=$(echo "$PAID" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
GUARD=$(curl -s -X POST "$BASE/api/checkout" -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PAID_ID\",\"customerName\":\"Test Buyer\",\"customerEmail\":\"buyer@example.com\",\"gateway\":\"Stripe\"}")
echo "$GUARD" | grep -q "gateway_unavailable" || fail "paid checkout was not blocked: $GUARD"

step "Blocked checkout leaves no order behind"
ORDERS=$(curl -s -b "$JAR" "$BASE/api/orders")
echo "$ORDERS" | grep -q '"total":1' || fail "expected only the free order: $ORDERS"

step "Creator gateway settings are gone"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/settings/payments")
[ "$CODE" = "404" ] || fail "/api/settings/payments should no longer exist, got $CODE"

step "Admin surface is invisible to an ordinary creator"
for P in /api/admin/settings /api/admin/payments; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE$P")
  [ "$CODE" = "404" ] || fail "$P returned $CODE to a non-admin, expected 404"
done

step "Plan gateways report unconfigured rather than crashing"
OPTS=$(curl -s -b "$JAR" "$BASE/api/billing/options?plan=pro")
echo "$OPTS" | grep -q '"stripe":false' || fail "expected Stripe unavailable: $OPTS"
echo "$OPTS" | grep -q '"bkash":false' || fail "expected bKash unavailable: $OPTS"
SUB=$(curl -s -b "$JAR" -X POST "$BASE/api/billing/subscribe" -H 'Content-Type: application/json' \
  -d '{"plan":"pro"}')
echo "$SUB" | grep -q "gateway_unavailable" || fail "subscribe should refuse cleanly: $SUB"
MAN=$(curl -s -b "$JAR" -X POST "$BASE/api/payments/manual" -H 'Content-Type: application/json' \
  -d '{"plan":"pro","trxId":"E2ETRX0001","senderNumber":"01700000000"}')
echo "$MAN" | grep -q "gateway_unavailable" || fail "manual payment should refuse cleanly: $MAN"

step "Meta connector reports unconfigured rather than crashing"
ACC=$(curl -s -b "$JAR" "$BASE/api/meta/accounts")
echo "$ACC" | grep -q '"configured":false' || fail "expected connector unconfigured: $ACC"
START=$(curl -s -b "$JAR" "$BASE/api/meta/oauth/start")
echo "$START" | grep -q "connector_unavailable" || fail "oauth start should refuse cleanly: $START"

step "Meta webhook rejects unsigned payloads"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/webhooks/meta" \
  -H 'Content-Type: application/json' -d '{"object":"page","entry":[]}')
[ "$CODE" = "401" ] || fail "unsigned webhook returned $CODE, expected 401"

step "Analytics reflect the real order"
AN=$(curl -s -b "$JAR" "$BASE/api/analytics?days=30")
echo "$AN" | grep -q '"ordersClosed":1' || fail "analytics wrong: $AN"

printf "\n✓ All checks passed for %s\n" "$USERNAME"
