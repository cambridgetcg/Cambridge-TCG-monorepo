#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# RewardsPro Production — Route Health Test
# ═══════════════════════════════════════════════════════════════════
#
# Tests every route for serverless function crashes vs expected errors.
#
# Key distinction:
#   CRASH  = FUNCTION_INVOCATION_FAILED (Node.js process exited)
#   ERROR  = Function ran but returned 500 (handled error, e.g. no auth)
#
# Shopify app routes REQUIRE a Shopify session. Without it, they return
# 302 (redirect to login), 410, or 500 with a rendered error page.
# These are NOT crashes — the function runs fine, it just can't serve
# content without auth context. The test flags only real crashes.
#
# Usage:
#   bash scripts/test-routes.sh                    # default prod URL
#   bash scripts/test-routes.sh http://localhost:3000  # local dev
#
# Output: colored terminal output + TSV log in /tmp/
# Exit code: 0 if no crashes, 1 if any FUNCTION_INVOCATION_FAILED
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

BASE="${1:-https://rewardspro-production.vercel.app}"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
LOGFILE="/tmp/rewardspro-route-test_${TIMESTAMP}.tsv"
CRASH=0
PASS=0
HANDLED_ERR=0
AUTH=0
SKIP=0
TOTAL=0

echo -e "RESULT\tHTTP\tTIME_S\tROUTE\tDETAIL" > "$LOGFILE"

test_route() {
  local route="$1"
  local category="${2:-unknown}"
  local url="${BASE}${route}"
  TOTAL=$((TOTAL + 1))

  local tmpfile=$(mktemp)
  local code time
  code=$(curl -s -o "$tmpfile" -w "%{http_code}" \
    --max-time 15 --connect-timeout 5 "$url" 2>/dev/null || echo "000")
  time=$(curl -s -o /dev/null -w "%{time_total}" \
    --max-time 15 --connect-timeout 5 "$url" 2>/dev/null || echo "0")

  local body=$(cat "$tmpfile" 2>/dev/null | head -c 500)
  rm -f "$tmpfile"

  local result="" detail="" color=""

  if [[ "$code" == "000" ]]; then
    result="CRASH"
    detail="TIMEOUT/CONNECTION_FAILED"
    CRASH=$((CRASH + 1))
    color="\033[31m"
  elif [[ "$code" =~ ^5 ]]; then
    # Check if it's a real crash or a handled error
    if echo "$body" | grep -q "FUNCTION_INVOCATION_FAILED"; then
      result="CRASH"
      detail="FUNCTION_INVOCATION_FAILED"
      CRASH=$((CRASH + 1))
      color="\033[31m"
    else
      # Function ran, returned an error response — not a crash
      # Extract error message from JSON or HTML
      local msg=""
      if echo "$body" | grep -q "^{"; then
        msg=$(echo "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',d.get('message','')))" 2>/dev/null || echo "")
      else
        msg=$(echo "$body" | sed -n 's/.*<div>\(.*\)<\/div>.*/\1/p' | head -1)
      fi
      result="ERR"
      detail="Handled: ${msg:-unknown}"
      HANDLED_ERR=$((HANDLED_ERR + 1))
      color="\033[33m"
    fi
  elif [[ "$code" == "401" || "$code" == "403" ]]; then
    result="AUTH"
    detail="Auth required"
    AUTH=$((AUTH + 1))
    color="\033[36m"
  elif [[ "$code" =~ ^3 ]]; then
    result="OK"
    detail="Redirect (auth flow)"
    PASS=$((PASS + 1))
    color="\033[32m"
  elif [[ "$code" =~ ^2 ]]; then
    result="OK"
    detail="Success"
    PASS=$((PASS + 1))
    color="\033[32m"
  elif [[ "$code" == "400" ]]; then
    result="OK"
    detail="Bad request (missing params)"
    PASS=$((PASS + 1))
    color="\033[32m"
  elif [[ "$code" == "404" ]]; then
    result="MISS"
    detail="Not found"
    PASS=$((PASS + 1))
    color="\033[90m"
  elif [[ "$code" == "405" ]]; then
    result="SKIP"
    detail="POST-only"
    SKIP=$((SKIP + 1))
    color="\033[90m"
  elif [[ "$code" == "410" ]]; then
    # 410 Gone — Shopify auth redirect for embedded apps
    result="AUTH"
    detail="410 Gone (Shopify auth redirect)"
    AUTH=$((AUTH + 1))
    color="\033[36m"
  else
    result="WARN"
    detail="HTTP ${code}"
    PASS=$((PASS + 1))
    color="\033[33m"
  fi

  printf "${color}%-5s\033[0m  %3s  %5ss  %-55s  %s\n" "$result" "$code" "${time}" "$route" "$detail"
  echo -e "${result}\t${code}\t${time}\t${route}\t${detail}" >> "$LOGFILE"
}

echo "═══════════════════════════════════════════════════════════════════════════"
echo "  RewardsPro Route Health Test"
echo "  Base: $BASE"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""
echo "  Legend: OK=working  AUTH=needs session  ERR=handled error"
echo "          CRASH=function died  SKIP=POST-only"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# ─── Public & Health ───
echo "── Public & Health ──"
test_route "/" "public"
test_route "/auth/login" "auth"
test_route "/api/health" "api"

# ─── Cron Endpoints ───
echo ""
echo "── Cron Endpoints (all require CRON_SECRET) ──"
for cron in \
  billing-reconciliation cashback-reconciliation exchange-rates \
  klaviyo-events metrics mission-generator mission-status \
  monthly-reset mystery-box-delivery mystery-box-status \
  points-maintenance raffle-draw raffle-status \
  scheduled-campaigns session-cleanup session-health \
  store-credit-reconciliation subscription-expiry subscription-reconciliation \
  tier-maintenance tier-product-cleanup tier-recalculation \
  usage-billing webhook-cleanup webhook-reconciliation; do
  test_route "/api/cron/${cron}" "cron"
done

# ─── Customer Account API ───
echo ""
echo "── Customer Account API (storefront-facing) ──"
for ep in challenges gift-cards loyalty missions mystery-boxes order-points points raffles; do
  test_route "/api/customer-account/${ep}" "customer-api"
done
test_route "/api/customer-account/points/redeem" "customer-api"

# ─── Admin/Internal API ───
echo ""
echo "── Admin & Internal API ──"
test_route "/api/admin/entitlements" "admin-api"
test_route "/api/admin/tier-health" "admin-api"
test_route "/api/billing/usage" "api"
test_route "/api/order-count" "api"
test_route "/api/points-analytics" "api"
test_route "/api/members/export" "api"
test_route "/api/sentry-events" "api"
test_route "/api/email/domain" "api"
test_route "/api/integrations" "api"
test_route "/api/integrations/points-rules" "api"
test_route "/api/integrations/slack" "api"
test_route "/api/integrations/zapier" "api"
test_route "/api/subscription-action" "api"
test_route "/api/subscription-diagnostics" "api"
test_route "/api/customer-subscriptions" "api"
test_route "/api/set-currency" "api"
test_route "/api/setup-customer-metafield" "api"
test_route "/api/storefront/loyalty" "api"
test_route "/api/proxy/membership" "api"

# ─── Shopify App Routes (embedded app, need Shopify session) ───
echo ""
echo "── Shopify App Routes (need Shopify session → expect AUTH/redirect) ──"
for page in \
  "" \
  "analytics" "analytics/new" "analytics/realtime" \
  "billing" "customers" "debug" "locked" "monitoring" \
  "marketing" "marketing/analytics" "marketing/automation/create" \
  "marketing/automation/workflows" "marketing/campaigns" \
  "marketing/campaigns/create" "marketing/campaigns/smart-create" \
  "marketing/klaviyo" "marketing/klaviyo/connect" \
  "marketing/recommendations" "marketing/settings" \
  "marketing/templates" "marketing/templates/new" \
  "members" "members/gift-cards" "members/products" "members/sync" "members/tiers" \
  "orders" "orders-sync" \
  "points" "points/challenges" "points/config" "points/mystery-boxes" "points/raffles" \
  "recalculate-cashback" \
  "rewards" "rewards/challenges" "rewards/config" "rewards/missions" \
  "rewards/mystery-boxes" "rewards/raffles" \
  "settings" "settings/automation" "settings/store-metrics" \
  "tier-products" "tiers"; do
  test_route "/app/${page}" "shopify-app"
done

# ─── Webhook Endpoints (POST-only) ───
echo ""
echo "── Webhook Endpoints (POST-only → expect 400/405) ──"
for wh in \
  app-subscriptions-update app/scopes_update app/uninstalled compliance \
  customers/create customers/update \
  orders/cancelled orders/create orders/fulfilled orders/paid orders/refunded \
  products/update sendgrid shop/update \
  subscriptions/approaching-cap \
  tier-subscription/billing tier-subscription/cancelled tier-subscription/created; do
  test_route "/webhooks/${wh}" "webhook"
done

# ─── Summary ───
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "  RESULTS: ${TOTAL} routes tested"
echo ""
printf "  \033[32m✓ OK:       %3d\033[0m  (200/302/400/404 — function works)\n" "$PASS"
printf "  \033[36m○ AUTH:     %3d\033[0m  (401/403/410 — needs session, expected)\n" "$AUTH"
printf "  \033[33m⚠ ERR:      %3d\033[0m  (500 but handled — function ran, returned error)\n" "$HANDLED_ERR"
printf "  \033[90m- SKIP:     %3d\033[0m  (405 POST-only)\n" "$SKIP"
printf "  \033[31m✗ CRASH:    %3d\033[0m  (FUNCTION_INVOCATION_FAILED — process died)\n" "$CRASH"
echo ""

if [[ $CRASH -gt 0 ]]; then
  echo "  🔴 CRASHES (need immediate fix):"
  grep "^CRASH" "$LOGFILE" | while IFS=$'\t' read -r s c t r n; do
    printf "     \033[31m%s %s — %s\033[0m\n" "$c" "$r" "$n"
  done
  echo ""
fi

if [[ $HANDLED_ERR -gt 0 ]]; then
  echo "  🟡 HANDLED ERRORS (function works, returns error without auth):"
  grep "^ERR" "$LOGFILE" | while IFS=$'\t' read -r s c t r n; do
    printf "     \033[33m%s %s — %s\033[0m\n" "$c" "$r" "$n"
  done
  echo ""
fi

echo "  Log: $LOGFILE"
echo "═══════════════════════════════════════════════════════════════════════════"

# Exit 0 only if no crashes (handled errors are OK)
[[ $CRASH -eq 0 ]]
