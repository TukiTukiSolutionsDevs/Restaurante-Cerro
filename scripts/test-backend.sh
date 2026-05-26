#!/usr/bin/env bash
# scripts/test-backend.sh — Backend smoke tests via curl (macOS-friendly)

set -u
BASE="${BASE:-http://localhost:3000}"
PASS=0; FAIL=0
TMP=$(mktemp -d /tmp/cerro-test.XXXXXX)
COOKIES_ADMIN="$TMP/cookies-admin.txt"
COOKIES_CASHIER="$TMP/cookies-cashier.txt"
COOKIES_WAITER="$TMP/cookies-waiter.txt"
COOKIES_KITCHEN="$TMP/cookies-kitchen.txt"

# IP única por run para evitar acumular rate-limit entre ejecuciones
FAKE_IP="10.99.$((RANDOM % 250)).$((RANDOM % 250))"

GREEN='\033[0;32m'; RED='\033[0;31m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

# do_req METHOD PATH [JSON_BODY] [COOKIES_PATH_READ] [COOKIES_PATH_WRITE]
# Writes body to $TMP/body.txt and prints status code to stdout.
do_req() {
  local method="$1" path="$2" body="${3:-}" creadfile="${4:-}" cwritefile="${5:-}"
  local args=(-s -o "$TMP/body.txt" -w "%{http_code}" -X "$method" "$BASE$path"
              -H "X-Forwarded-For: $FAKE_IP")
  if [ -n "$body" ]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  [ -n "$creadfile" ]  && args+=(-b "$creadfile")
  [ -n "$cwritefile" ] && args+=(-c "$cwritefile")
  curl "${args[@]}"
}

expect_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS+1)); printf "  ${GREEN}✓${NC} %-55s ${DIM}[%s]${NC}\n" "$name" "$actual"
  else
    FAIL=$((FAIL+1)); printf "  ${RED}✗${NC} %-55s ${RED}[got %s, want %s]${NC}\n" "$name" "$actual" "$expected"
    head -c 200 "$TMP/body.txt" 2>/dev/null | sed 's/^/      /'; echo ""
  fi
}

expect_in_body() {
  local name="$1" needle="$2"
  if grep -q -- "$needle" "$TMP/body.txt" 2>/dev/null; then
    PASS=$((PASS+1)); printf "  ${GREEN}✓${NC} %-55s ${DIM}contains '%s'${NC}\n" "$name" "$needle"
  else
    FAIL=$((FAIL+1)); printf "  ${RED}✗${NC} %-55s ${RED}missing '%s'${NC}\n" "$name" "$needle"
    head -c 300 "$TMP/body.txt" 2>/dev/null | sed 's/^/      /'; echo ""
  fi
}

# sse_first_chunk PATH [COOKIES_FILE]
# Usa curl --max-time (nativo macOS). Devuelve los primeros ~2s de SSE.
sse_first_chunk() {
  local path="$1" cookie_file="${2:-}"
  if [ -n "$cookie_file" ]; then
    curl -s --max-time 2 -b "$cookie_file" \
      -H "X-Forwarded-For: $FAKE_IP" "$BASE$path" 2>/dev/null
  else
    curl -s --max-time 2 \
      -H "X-Forwarded-For: $FAKE_IP" "$BASE$path" 2>/dev/null
  fi
}

echo ""
echo -e "${BOLD}▶ Backend tests — Restaurante Cerro${NC}"
echo -e "${DIM}  base: $BASE  tmp: $TMP${NC}"
echo ""

# 1. Healthcheck
echo -e "${BOLD}1. Healthcheck${NC}"
S=$(do_req GET /api/health)
expect_status "GET /api/health" "200" "$S"
expect_in_body "  → ok:true"      '"ok":true'
expect_in_body "  → db connected" '"db":true'
expect_in_body "  → listener up"  '"listener":"connected"'

# 2. Public endpoints
echo ""
echo -e "${BOLD}2. Public endpoints (anónimo)${NC}"
S=$(do_req GET /api/menu/today)
expect_status "GET /api/menu/today" "200" "$S"
cp "$TMP/body.txt" "$TMP/menu.json"
expect_in_body "  → tiene items"         '"items"'
expect_in_body "  → Ají de gallina"      'Ají de gallina'
expect_in_body "  → combo dineIn 1300"   '"dineInPriceCents":1300'
expect_in_body "  → combo takeaway 1500" '"takeawayPriceCents":1500'

S=$(do_req GET /api/tables)
expect_status "GET /api/tables" "200" "$S"
expect_in_body "  → M01 presente" '"code":"M01"'
expect_in_body "  → M30 presente" '"code":"M30"'

S=$(do_req GET /api/tables/free)
expect_status "GET /api/tables/free" "200" "$S"
cp "$TMP/body.txt" "$TMP/free.json"

# 3. Crear orden anónima
echo ""
echo -e "${BOLD}3. Crear orden anónima (Cliente)${NC}"
STARTER_ID=$(python3 -c "import json; d=json.load(open('$TMP/menu.json')); print(next(i['id'] for i in d['items'] if i['category']=='starter'))")
MAIN_ID=$(python3 -c "import json; d=json.load(open('$TMP/menu.json')); print(next(i['id'] for i in d['items'] if i['category']=='main'))")
TABLE_ID=$(python3 -c "import json; d=json.load(open('$TMP/free.json')); print(d[0]['id'])")
echo -e "${DIM}  starter_id=$STARTER_ID  main_id=$MAIN_ID  table_id=$TABLE_ID${NC}"

ORDER_PAYLOAD=$(cat <<JSON
{"orderType":"dine_in","tableId":$TABLE_ID,"items":[{"menuItemId":$STARTER_ID,"variant":"full_combo","quantity":1},{"menuItemId":$MAIN_ID,"variant":"full_combo","quantity":1}]}
JSON
)

S=$(do_req POST /api/orders "$ORDER_PAYLOAD")
expect_status "POST /api/orders" "201" "$S"
expect_in_body "  → tiene orderId"      '"orderId"'
expect_in_body "  → tiene shortCode"    '"shortCode"'
expect_in_body "  → tiene qrToken"      '"qrToken"'
expect_in_body "  → total 1300 (combo)" '"totalCents":1300'
expect_in_body "  → detectedCombo:true" '"detectedCombo":true'

if [ "$S" = "201" ] || [ "$S" = "200" ]; then
  QR_TOKEN=$(python3 -c "import json; print(json.load(open('$TMP/body.txt'))['qrToken'])")
  SHORT_CODE=$(python3 -c "import json; print(json.load(open('$TMP/body.txt'))['shortCode'])")
  ORDER_ID=$(python3 -c "import json; print(json.load(open('$TMP/body.txt'))['orderId'])")
  echo -e "${DIM}  shortCode=$SHORT_CODE  orderId=$ORDER_ID${NC}"

  S=$(do_req GET "/api/orders/$QR_TOKEN")
  expect_status "GET /api/orders/:token" "200" "$S"
  expect_in_body "  → status pending" '"status":"pending"'
  expect_in_body "  → tableCode"      '"tableCode"'
fi

# 4. Login staff
echo ""
echo -e "${BOLD}4. Login de staff${NC}"
S=$(do_req POST /api/staff/login '{"role":"admin","pin":"000000"}')
expect_status "POST login admin (wrong PIN)" "401" "$S"

S=$(do_req POST /api/staff/login '{"role":"admin","pin":"543210"}' "" "$COOKIES_ADMIN")
expect_status "POST login admin (correct)" "200" "$S"
expect_in_body "  → ok:true" '"ok":true'

S=$(do_req POST /api/staff/login '{"role":"cashier","pin":"742856"}' "" "$COOKIES_CASHIER")
expect_status "POST login cashier (correct)" "200" "$S"
expect_in_body "  → ok:true" '"ok":true'

S=$(do_req POST /api/staff/login '{"role":"waiter","pin":"638491"}' "" "$COOKIES_WAITER")
expect_status "POST login waiter (correct)" "200" "$S"
expect_in_body "  → ok:true" '"ok":true'

S=$(do_req POST /api/kitchen/device-pair '{"pin":"123890"}' "" "$COOKIES_KITCHEN")
expect_status "POST kitchen device-pair" "200" "$S"

# 5. SSE
echo ""
echo -e "${BOLD}5. SSE endpoints (smoke)${NC}"
OUT=$(sse_first_chunk "/api/sse/menu")
if echo "$OUT" | grep -q "event: snapshot"; then
  PASS=$((PASS+1)); printf "  ${GREEN}✓${NC} GET /api/sse/menu                                      ${DIM}[snapshot]${NC}\n"
else
  FAIL=$((FAIL+1)); printf "  ${RED}✗${NC} GET /api/sse/menu                                      ${RED}[no snapshot]${NC}\n"
  echo "$OUT" | head -c 200 | sed 's/^/      /'; echo ""
fi

OUT=$(sse_first_chunk "/api/sse/kitchen" "$COOKIES_KITCHEN")
if echo "$OUT" | grep -q "event: snapshot"; then
  PASS=$((PASS+1)); printf "  ${GREEN}✓${NC} GET /api/sse/kitchen (con device cookie)              ${DIM}[snapshot]${NC}\n"
else
  FAIL=$((FAIL+1)); printf "  ${RED}✗${NC} GET /api/sse/kitchen (con device cookie)              ${RED}[no snapshot]${NC}\n"
  echo "$OUT" | head -c 200 | sed 's/^/      /'; echo ""
fi

S=$(do_req GET /api/sse/kitchen)
expect_status "GET /api/sse/kitchen (sin auth)" "401" "$S"

# 6. Logout
echo ""
echo -e "${BOLD}6. Logout${NC}"
S=$(do_req POST /api/staff/logout "" "$COOKIES_ADMIN")
expect_status "POST /api/staff/logout (admin)" "200" "$S"

echo ""
echo -e "${BOLD}── Resultado ──${NC}"
echo -e "  ${GREEN}PASS:${NC} $PASS"
echo -e "  ${RED}FAIL:${NC} $FAIL"
echo ""

if [ -n "${QR_TOKEN:-}" ]; then
  cat > /tmp/cerro-test-vars.sh <<EOF
SHORT_CODE=$SHORT_CODE
QR_TOKEN=$QR_TOKEN
ORDER_ID=$ORDER_ID
EOF
fi

rm -rf "$TMP"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
