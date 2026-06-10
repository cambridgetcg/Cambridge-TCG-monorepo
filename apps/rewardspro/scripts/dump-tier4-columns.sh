#!/bin/bash
# Dump column metadata for all Tier 4 "in DB, not in schema" columns.
RA="$(grep '^AURORA_RESOURCE_ARN' .env.local | cut -d'=' -f2- | tr -d '"')"
SA="$(grep '^AURORA_SECRET_ARN' .env.local | cut -d'=' -f2- | tr -d '"')"

query() {
  local table="$1"; shift
  local cols=$(printf "'%s'," "$@" | sed 's/,$//')
  aws rds-data execute-statement \
    --resource-arn "$RA" --secret-arn "$SA" --database rewardspro --region eu-north-1 \
    --sql "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '$table' AND column_name IN ($cols) ORDER BY ordinal_position" 2>&1 \
    | python3 -c "import json, sys; r = json.load(sys.stdin); print('=== $table ==='); [print(f'  {x[0][\"stringValue\"]:30} {x[1][\"stringValue\"]:25} nullable={x[2][\"stringValue\"]:5} default={(x[3].get(\"stringValue\",\"\") if x[3] else \"\")[:40]}') for x in r['records']]"
}

query Session isActive
query StoreCreditLedger isExpired currency description
query BillingSubscription planName status isTest cappedAmount balanceUsed balanceRemaining
query UsageRecord billingPlanId
query BillingHistory billingPlanId
query TierSubscription monthlyPrice lastBillingAmount activatedAt failureCount lastFailureReason shopifyContractId shopifyOrderId startDate endDate currentPrice
query SubscriptionBillingAttempt billingDate shopifyChargeId shopifyInvoiceId processedAt metadata updatedAt
query SellingPlanGroup summary active position
query SellingPlan sellingPlanGroupId shopifySellingPlanId description active updatedAt
