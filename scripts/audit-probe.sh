#!/usr/bin/env bash
# Adversarial probes against a running OmniFlow instance: tenant isolation,
# storage safety, quota and limit enforcement, and input handling.
# Usage: BASE=http://localhost:3000 ./scripts/audit-probe.sh
set -uo pipefail
BASE="${BASE:-http://localhost:3000}"
TMP="$(mktemp -d)"
PASS="SuperSecret123"
FAILED=0

# Must match SUPER_ADMIN_EMAIL on the instance under test, otherwise the admin
# probes cannot run. The probe enables the platform gateways, exercises them,
# and switches them off again, so point it at a development instance.
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@omniflow.test}"
VERIFY_TOKEN="omniflow-meta-verify"

reg() { # $1 = label -> prints "username jar"
  local email="probe-$1-$(date +%s%N)@omniflow.test"
  local jar="$TMP/$1.jar"
  local out
  out=$(curl -s -X POST "$BASE/api/register" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Probe $1\",\"email\":\"$email\",\"password\":\"$PASS\"}")
  local csrf
  csrf=$(curl -s -c "$jar" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
  curl -s -b "$jar" -c "$jar" -X POST "$BASE/api/auth/callback/credentials" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "csrfToken=$csrf" --data-urlencode "email=$email" \
    --data-urlencode "password=$PASS" --data-urlencode "json=true" > /dev/null
  echo "$out" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p'
}

check() { # $1 label, $2 expected substring, $3 actual
  if echo "$3" | grep -q "$2"; then printf "  ok   %s\n" "$1";
  else printf "  FAIL %s\n     expected /%s/ got: %s\n" "$1" "$2" "$3"; FAILED=$((FAILED + 1)); fi
}

login() { # $1 = email, $2 = jar
  local csrf
  csrf=$(curl -s -c "$2" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
  curl -s -b "$2" -c "$2" -X POST "$BASE/api/auth/callback/credentials" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "csrfToken=$csrf" --data-urlencode "email=$1" \
    --data-urlencode "password=$PASS" --data-urlencode "json=true" > /dev/null
}

settings() { # $1 = json body -> PUT /api/admin/settings as the admin
  curl -s -b "$ADMIN" -X PUT "$BASE/api/admin/settings" \
    -H 'Content-Type: application/json' -d "$1"
}

echo "== setup two creators =="
A_USER=$(reg a); A="$TMP/a.jar"
B_USER=$(reg b); B="$TMP/b.jar"
echo "  A=$A_USER B=$B_USER"

echo "== setup super admin =="
ADMIN="$TMP/admin.jar"
curl -s -X POST "$BASE/api/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Platform Admin\",\"email\":\"$ADMIN_EMAIL\",\"password\":\"$PASS\"}" > /dev/null
login "$ADMIN_EMAIL" "$ADMIN"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN" "$BASE/api/admin/settings")
if [ "$CODE" != "200" ]; then
  echo "  FAIL admin session cannot reach /api/admin/settings (got $CODE)"
  echo "       set SUPER_ADMIN_EMAIL=$ADMIN_EMAIL in .env and restart the server"
  FAILED=$((FAILED + 1))
fi

# The Meta connector lives in the database now, so the webhook probes below
# need it configured before they mean anything.
settings "{\"metaEnabled\":true,\"metaAppId\":\"probe-app-id\",\"metaAppSecret\":\"probe-app-secret\",\"metaVerifyToken\":\"$VERIFY_TOKEN\"}" > /dev/null

echo "secret-a" > "$TMP/a.txt"
A_KEY=$(curl -s -b "$A" -X POST "$BASE/api/upload" -F "file=@$TMP/a.txt" -F "scope=product" \
  | sed -n 's/.*"key":"\([^"]*\)".*/\1/p')
echo "  A fileKey=$A_KEY"

echo "== 1. upload IDOR: B attaches A's deliverable =="
OUT=$(curl -s -b "$B" -X POST "$BASE/api/products" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Stolen Goods\",\"type\":\"digital_file\",\"price\":0,\"currency\":\"\$\",\"description\":\"Trying to sell another creator file.\",\"fileKey\":\"$A_KEY\",\"fileName\":\"a.txt\",\"fileSize\":9,\"fileMime\":\"text/plain\"}")
check "B cannot attach A's private upload" "not yours" "$OUT"

echo "== 2. avatar IDOR: B sets a foreign asset url =="
A_IMG=$(curl -s -b "$A" -X POST "$BASE/api/upload" -F "file=@$TMP/a.txt;type=image/png" -F "scope=asset" \
  | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
OUT=$(curl -s -b "$B" -X PATCH "$BASE/api/profile" -H 'Content-Type: application/json' \
  -d "{\"avatar\":\"$A_IMG\"}")
check "B cannot claim A's uploaded image" "again" "$OUT"

echo "== 3. path traversal on /api/files =="
for KEY in '..' '../.env' '../../.env' '%2e%2e%2f%2e%2e%2fprisma%2fdev.db' '....//.env' '..%00/.env'; do
  CODE=$(curl -sL -o "$TMP/trav.out" -w "%{http_code}" "$BASE/api/files/$KEY")
  check "GET /api/files/$KEY does not serve a file" "^40" "$CODE"
  if grep -q 'ENCRYPTION_KEY\|NEXTAUTH_SECRET' "$TMP/trav.out" 2>/dev/null; then
    echo "  FAIL $KEY leaked env contents"; FAILED=$((FAILED + 1))
  fi
done

echo "== 4. private deliverable is not public =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/files/$A_KEY")
check "private key rejected by public file route" "^404" "$CODE"

echo "== 5. upload validation =="
OUT=$(curl -s -b "$A" -X POST "$BASE/api/upload" -F "file=@$TMP/a.txt;type=text/html" -F "scope=asset")
check "non-image rejected for asset scope" "PNG, JPEG" "$OUT"
printf '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' > "$TMP/x.svg"
OUT=$(curl -s -b "$A" -X POST "$BASE/api/upload" -F "file=@$TMP/x.svg;type=image/svg+xml" -F "scope=asset")
check "svg upload rejected" "PNG, JPEG" "$OUT"
OUT=$(curl -s -b "$A" -X POST "$BASE/api/upload" -F "file=@$TMP/a.txt" -F "scope=../../etc")
check "unknown scope rejected" "Unknown upload scope" "$OUT"

echo "== 6. keyword matcher is whole-token =="
PID=$(curl -s -b "$A" -X POST "$BASE/api/products" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Probe Kit\",\"type\":\"digital_file\",\"price\":0,\"currency\":\"\$\",\"description\":\"Probe product for matcher.\",\"fileKey\":\"$A_KEY\",\"fileName\":\"a.txt\",\"fileSize\":9,\"fileMime\":\"text/plain\"}" \
  | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
curl -s -b "$A" -X POST "$BASE/api/auto-dm" -H 'Content-Type: application/json' \
  -d "{\"platform\":\"instagram\",\"keyword\":\"KIT\",\"targetProductId\":\"$PID\",\"autoMessage\":\"Here you go:\"}" > /dev/null
sim() { curl -s -b "$A" -X POST "$BASE/api/auto-dm/simulate" -H 'Content-Type: application/json' -d "{\"comment\":\"$1\"}"; }
check "'send KIT please' matches"       '"matched":true'  "$(sim 'send KIT please')"
check "'my KITCHEN is nice' no match"   '"matched":false' "$(sim 'my KITCHEN is nice')"
check "'kit' lowercase matches"         '"matched":true'  "$(sim 'i want the kit')"
check "'SKIT' no match"                 '"matched":false' "$(sim 'that was a SKIT')"
OUT=$(curl -s -b "$A" -X POST "$BASE/api/auto-dm" -H 'Content-Type: application/json' \
  -d "{\"platform\":\"instagram\",\"keyword\":\"kit\",\"targetProductId\":\"$PID\",\"autoMessage\":\"Duplicate rule attempt.\"}")
check "duplicate keyword rejected" "already mapped" "$OUT"

echo "== 7. simulate writes no analytics =="
BEFORE=$(curl -s -b "$A" "$BASE/api/analytics?days=30")
sim 'send KIT please' > /dev/null
AFTER=$(curl -s -b "$A" "$BASE/api/analytics?days=30")
if [ "$BEFORE" = "$AFTER" ]; then echo "  ok   testbench left analytics untouched";
else printf "  FAIL testbench changed analytics\n     %s\n     %s\n" "$BEFORE" "$AFTER"; fi

echo "== 8. download limit + expiry =="
DL=$(curl -s -X POST "$BASE/api/checkout" -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PID\",\"customerName\":\"Probe Buyer\",\"customerEmail\":\"buyer@example.com\",\"gateway\":\"Stripe\"}" \
  | sed -n 's/.*"downloadUrl":"\([^"]*\)".*/\1/p')
for i in 1 2 3 4 5; do curl -s -o /dev/null "$DL"; done
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DL")
check "6th download blocked (limit 5)" "^429" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/download/not-a-real-token")
check "unknown token rejected" "^404" "$CODE"

echo "== 9. cross-tenant reads/writes =="
A_ORDERS=$(curl -s -b "$B" "$BASE/api/orders")
check "B sees no orders of A" '"orders":\[\]' "$A_ORDERS"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$B" -X DELETE "$BASE/api/products/$PID")
check "B cannot delete A's product" "^404" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$B" -X PATCH "$BASE/api/products/$PID" \
  -H 'Content-Type: application/json' -d '{"price":0.01}')
check "B cannot patch A's product" "^404" "$CODE"

echo "== 10. unauthenticated access =="
for P in /api/profile /api/products /api/orders /api/analytics /api/auto-dm /api/meta/accounts /api/account/social /api/payments/manual /api/billing/options; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$P")
  check "$P requires a session" "^401" "$CODE"
done
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
check "/api/upload requires a session" "^401" "$CODE"

echo "== 11. checkout/confirm session binding =="
CODE=$(curl -s -w "\n%{http_code}" "$BASE/api/checkout/confirm?orderId=does-not-exist")
check "unknown order rejected" "404" "$CODE"

echo "== 12. meta webhook =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/webhooks/meta" \
  -H 'Content-Type: application/json' -H 'x-hub-signature-256: sha256=deadbeef' -d '{"object":"page","entry":[]}')
check "bad signature rejected" "^401" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x")
check "wrong verify token rejected" "^403" "$CODE"
OUT=$(curl -s "$BASE/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=probe-challenge")
check "correct verify token echoes challenge" "probe-challenge" "$OUT"

echo "== 13. paid product without gateway =="
PAID=$(curl -s -b "$A" -X POST "$BASE/api/products" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Probe Paid\",\"type\":\"digital_file\",\"price\":29.99,\"currency\":\"\$\",\"description\":\"Paid probe product.\",\"fileKey\":\"$A_KEY\",\"fileName\":\"a.txt\",\"fileSize\":9,\"fileMime\":\"text/plain\"}" \
  | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
OUT=$(curl -s -X POST "$BASE/api/checkout" -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PAID\",\"customerName\":\"Probe Buyer\",\"customerEmail\":\"buyer@example.com\",\"gateway\":\"Stripe\"}")
check "paid checkout blocked without gateway" "gateway_unavailable" "$OUT"
ORDERS=$(curl -s -b "$A" "$BASE/api/orders?status=FAILED")
check "blocked checkout left no FAILED order" '"orders":\[\]' "$ORDERS"

echo "== 14. plan product limit (starter = 3) =="
for i in 4 5; do
  OUT=$(curl -s -b "$A" -X POST "$BASE/api/products" -H 'Content-Type: application/json' \
    -d "{\"title\":\"Probe Extra $i\",\"type\":\"digital_file\",\"price\":0,\"currency\":\"\$\",\"description\":\"Limit probe product.\",\"fileKey\":\"$A_KEY\",\"fileName\":\"a.txt\",\"fileSize\":9,\"fileMime\":\"text/plain\"}")
done
check "4th product blocked by Starter plan" "allows 3 products" "$OUT"

echo "== 15. malformed bodies =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$A" -X PATCH "$BASE/api/profile" \
  -H 'Content-Type: application/json' -d 'not json')
check "invalid JSON returns 400 not 500" "^400" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/checkout" \
  -H 'Content-Type: application/json' -d '{"productId":1}')
check "bad checkout body returns 400" "^400" "$CODE"

echo "== 16. bio_visit is not self-inflated =="
BEFORE=$(curl -s -b "$A" "$BASE/api/analytics?days=30" | sed -n 's/.*"bioVisits":\([0-9]*\).*/\1/p')
curl -s -b "$A" "$BASE/$A_USER" > /dev/null
AFTER=$(curl -s -b "$A" "$BASE/api/analytics?days=30" | sed -n 's/.*"bioVisits":\([0-9]*\).*/\1/p')
check "owner preview does not count as a visit" "^$BEFORE$" "$AFTER"
curl -s "$BASE/$A_USER" > /dev/null
AFTER2=$(curl -s -b "$A" "$BASE/api/analytics?days=30" | sed -n 's/.*"bioVisits":\([0-9]*\).*/\1/p')
check "anonymous visit does count" "^$((BEFORE + 1))$" "$AFTER2"

echo "== 17. the admin surface is invisible to non-admins =="
for P in /api/admin/settings /api/admin/payments /api/admin/payments/anything; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$A" "$BASE$P")
  check "GET $P is 404 for a creator" "^404" "$CODE"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$P")
  check "GET $P is 404 anonymously" "^404" "$CODE"
done
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$A" -X PUT "$BASE/api/admin/settings" \
  -H 'Content-Type: application/json' -d '{"stripeEnabled":true}')
check "a creator cannot write platform settings" "^404" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$B" -X POST "$BASE/api/admin/payments/anything" \
  -H 'Content-Type: application/json' -d '{"action":"approve"}')
check "a creator cannot approve payments" "^404" "$CODE"

echo "== 18. a disabled gateway is refused server-side =="
settings '{"bkashEnabled":false,"bkashNumber":"01700000000","bkashUsdRate":100}' > /dev/null
OUT=$(curl -s -b "$A" -X POST "$BASE/api/payments/manual" -H 'Content-Type: application/json' \
  -d '{"plan":"pro","trxId":"PROBEOFF01","senderNumber":"01711111111"}')
check "bKash submission refused while disabled" "gateway_unavailable" "$OUT"
OUT=$(curl -s -b "$A" -X POST "$BASE/api/billing/subscribe" -H 'Content-Type: application/json' \
  -d '{"plan":"pro"}')
check "Stripe subscribe refused while unconfigured" "gateway_unavailable" "$OUT"

# Enabled but with no rate, so the gateway is switched on yet still unusable.
settings '{"bkashEnabled":true,"bkashUsdRate":0}' > /dev/null
OUT=$(curl -s -b "$A" -X POST "$BASE/api/payments/manual" -H 'Content-Type: application/json' \
  -d '{"plan":"pro","trxId":"PROBENORATE","senderNumber":"01711111111"}')
check "bKash refused when enabled but unusable" "gateway_unavailable" "$OUT"

echo "== 19. a submitted payment cannot choose its own amount =="
settings '{"bkashEnabled":true,"bkashNumber":"01700000000","bkashUsdRate":100}' > /dev/null
# Pro is $49 and the rate is 100 BDT per USD, so the only honest figure is
# 4900 BDT = 490000 poisha, whatever the client claims.
OUT=$(curl -s -b "$A" -X POST "$BASE/api/payments/manual" -H 'Content-Type: application/json' \
  -d '{"plan":"pro","trxId":"PROBEPAY01","senderNumber":"01711111111","amountCents":1,"currency":"USD","status":"APPROVED"}')
check "amount is derived from the plan, not the request" '"amountCents":490000' "$OUT"
check "a submission cannot approve itself" '"status":"PENDING"' "$OUT"

echo "== 20. a transaction id can only be claimed once =="
OUT=$(curl -s -b "$B" -X POST "$BASE/api/payments/manual" -H 'Content-Type: application/json' \
  -d '{"plan":"starter","trxId":"probepay01","senderNumber":"01722222222"}')
check "duplicate TrxID rejected across accounts" "duplicate_trx" "$OUT"
OUT=$(curl -s -b "$A" -X POST "$BASE/api/payments/manual" -H 'Content-Type: application/json' \
  -d '{"plan":"pro","trxId":"PROBEPAY01","senderNumber":"01711111111"}')
check "duplicate TrxID rejected for the same account" "duplicate_trx" "$OUT"

echo "== 21. approving twice does not grant two plan periods =="
PAY_ID=$(curl -s -b "$ADMIN" "$BASE/api/admin/payments?status=PENDING" \
  | sed -n 's/.*"payments":\[{"id":"\([^"]*\)".*/\1/p')
OUT=$(curl -s -b "$ADMIN" -X POST "$BASE/api/admin/payments/$PAY_ID" \
  -H 'Content-Type: application/json' -d '{"action":"approve"}')
check "first approval activates the plan" '"status":"APPROVED"' "$OUT"
FIRST_END=$(echo "$OUT" | sed -n 's/.*"planPeriodEnd":"\([^"]*\)".*/\1/p')
if [ -z "$FIRST_END" ]; then
  echo "  FAIL approval returned no planPeriodEnd: $OUT"; FAILED=$((FAILED + 1))
fi
OUT=$(curl -s -b "$ADMIN" -X POST "$BASE/api/admin/payments/$PAY_ID" \
  -H 'Content-Type: application/json' -d '{"action":"approve"}')
check "second approval is refused" "already approved" "$OUT"
PROFILE=$(curl -s -b "$A" "$BASE/api/profile")
check "plan is Pro Growth after approval" '"plan":"pro"' "$PROFILE"
check "the paid-up-to date did not move" "$FIRST_END" "$PROFILE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$B" -X POST "$BASE/api/admin/payments/$PAY_ID" \
  -H 'Content-Type: application/json' -d '{"action":"approve"}')
check "another creator cannot re-review it" "^404" "$CODE"

echo "== cleanup: switch the platform gateways back off =="
settings '{"bkashEnabled":false,"metaEnabled":false,"metaAppId":"","metaAppSecret":"","metaVerifyToken":""}' > /dev/null

echo
if [ "$FAILED" -eq 0 ]; then
  echo "✓ all probes passed"
else
  echo "✗ $FAILED probe(s) failed"
  exit 1
fi
