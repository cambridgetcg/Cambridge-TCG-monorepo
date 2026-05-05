#!/bin/bash
# Count usages of each "in schema, not in DB" field across the application.
# These are the cut-over breakers — for each, the field is either:
#   - referenced in code (ship migration to add the column), or
#   - dead schema (trim from schema.prisma).

triage() {
  local model="$1"
  shift
  echo ""
  echo "===== $model ====="
  for field in "$@"; do
    # Look for `.field` access (object key access) and `field:` (struct literals).
    # We exclude prisma/ from the search since fields are listed in schema.
    local refs=$(grep -rE "\.${field}\b|\b${field}:" app/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "prisma/" | wc -l | tr -d ' ')
    printf "  %4d  %s\n" "$refs" "$field"
  done
}

triage ShopSettings \
  emailEnabled emailProvider emailFromName emailFromAddress emailReplyTo \
  emailLogo emailPrimaryColor emailFooterText emailDomain emailSecondaryColor \
  emailBackgroundColor emailContentBgColor emailLinkColor emailFontFamily \
  brandKitEnabled emailApiKey emailApiSecret emailSmtpHost emailSmtpPort \
  emailSmtpUsername emailSmtpPassword emailsSentThisMonth emailQuotaLimit \
  lastEmailResetDate emailTemplates currentPlan subscriptionStatus \
  subscriptionUpdatedAt currentPlanName usageCapReached usageCapReachedAt \
  reviewBannerDismissed reviewClickedAt customerAccountBlockIsActive

triage ShopEntitlements \
  featureIntegrationKlaviyo featureIntegrationSendgrid featureIntegrationJudgeme \
  featureIntegrationSlack featureIntegrationRecharge featureIntegrationGorgias \
  featureIntegrationZapier limitMaxAutomations limitMaxCustomersSync \
  limitMaxTierProducts limitMaxHistoricalDays

triage CustomerTierState manualOverrideTierId

triage StoreCreditLedger shopifyTransactionId syncedAt syncStatus

triage MonthlyOrderUsage isLocked lockedAt lockReason

triage TierSubscription lastPaymentFailure pauseReason skipCount lastSkipDate deliveryInterval

triage SellingPlanGroup tierProducts metadata

triage SellingPlan groupId shopifyPlanId options metadata basePrice currentDiscount lastPriceUpdate

triage BulkOperationLog report successful failed total

triage Order cashbackPercentAtOrder syncedAt syncVersion

triage KlaviyoAutomationSettings \
  sendPointsEvents sendRaffleEvents sendMysteryBoxEvents sendRewardsEngagement \
  rewardsDormancyDays raffleReminderHours highPointsThreshold highPointsDormancyDays \
  sendGiftCardEvents sendStoreCreditEvents giftCardExpiryWarningDays storeCreditReminderDays

triage Raffle \
  enableInstantWins enableActivityFeed enableStreakBonuses enableLuckyNumbers \
  dailyFreeEntries earlyBirdBonusPercent earlyBirdEntryLimit

triage RaffleEntry \
  streakBonusApplied earlyBirdBonusApplied luckyNumberBonus bonusEventId \
  instantWinsTriggered isFreeEntry

triage MysteryBox \
  enableActivityFeed enableStreakBonuses enablePitySystem enableLuckyStreak \
  dailyFreeOpens pityThreshold luckyStreakMultiplier

triage MysteryBoxOpen \
  streakDay streakBonusApplied luckyStreakCount luckyStreakBonus bonusEventId \
  discountApplied isFreeOpen pityTriggered nearMissRewardId

triage Challenge totalParticipants completedCount claimedCount totalRewardsAwarded

triage ReconciliationLog localState shopifyState mismatches resolution resolvedAt resolvedBy
