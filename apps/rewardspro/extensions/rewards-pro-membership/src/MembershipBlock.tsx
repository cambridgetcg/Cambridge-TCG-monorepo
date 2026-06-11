import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  reactExtension,
  Banner,
  BlockStack,
  Text,
  useTranslate,
  useLanguage,
  InlineStack,
  Badge,
  Divider,
  View,
  useExtension,
  Button,
  SkeletonText,
  Icon,
  Pressable,
} from '@shopify/ui-extensions-react/customer-account';
import { useSessionToken } from './hooks/useSessionToken';
import { useApiClient } from './hooks/useApiClient';
import { useAuthenticatedCustomer } from './hooks/useAuthenticatedCustomer';
import { useRaffles } from './hooks/useRaffles';
import { useMysteryBoxes } from './hooks/useMysteryBoxes';
import { useChallenges } from './hooks/useChallenges';
import { useMissions } from './hooks/useMissions';
import { useGiftCards } from './hooks/useGiftCards';
import { useLoyaltyData } from './hooks/useLoyaltyData';
import { logger } from './utils/logger';
import { formatCurrency, formatDate, formatMonthYear } from './utils/format';
import { getMockData } from './mockData';
import { MAX_TRANSACTIONS_DISPLAY } from './config';
import { PointsSection, type PointsData, RafflesTab, MysteryBoxesTab, ChallengesTab, MissionsTab, GiftCardsTab, UpgradeSection, type UpgradeOptionsInfo } from './components';
import {
  MembershipSkeleton,
  WelcomeHeader,
  MembershipCard,
  BalanceCardWithPending,
  WelcomeCard,
  TierChangeBanner,
  StaleDataBanner,
  StarterTierCard,
  ProgressCard,
  MaxTierCard,
  DualProgressCard,
  ActivityCard,
  AllTiersCard,
} from './components/overview-cards';
import type {
  LoyaltyData,
  CustomerInfo,
  BalanceInfo,
  TierSourceDetails,
  TierInfo,
  ProgressInfo,
  MaintenanceInfo,
  TransactionInfo,
  AllTierInfo,
  SpendingProgressInfo,
  PendingCashbackInfo,
  TierChangeInfo,
  DataFreshnessInfo,
} from './types/loyaltyData';
import {
  safeBalance,
  safeCustomer,
  safeTier,
  safeProgress,
  safeStats,
  safeMaintenance,
  safePendingCashback,
  safeTierChange,
  safeTransactions,
  safeAllTiers,
  isNewCustomerState,
  isDataStale,
  getDataAgeMinutes,
  safeNumber,
  safeString,
  safeBoolean,
  type SafePendingCashbackInfo,
  type SafeTierChangeInfo,
} from './utils/safeData';

// ============================================================================
// Types
// ============================================================================
// Public response shape moved to `./types/loyaltyData` 2026-04-23 so the
// `useLoyaltyData` hook and any future consumer don't have to import from
// this orchestrator. Local type aliases here keep the rest of the file
// unchanged.

// ============================================================================
// Utility Functions
// ============================================================================
// formatCurrency / formatDate / formatMonthYear moved to ./utils/format.ts
// — presentation-layer formatters reusable by other components (cards, tabs)
// that previously had to import from this orchestrator.
// ============================================================================
// Sub-Components
// ============================================================================


// ============================================================================
// Tab Navigation Component
// ============================================================================

type TabId = 'membership' | 'raffles' | 'boxes' | 'challenges' | 'missions' | 'giftcards';

interface TabInfo {
  id: TabId;
  icon: string;
  labelKey: string;
  badge?: number;
}

interface TabNavigationProps {
  tabs: TabInfo[];
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
  translate: (key: string, options?: Record<string, string>) => string;
}

function TabNavigation({ tabs, activeTab, onTabChange, translate }: TabNavigationProps) {
  return (
    <View border="base" cornerRadius="base" padding="tight" background="subdued">
      <InlineStack spacing="tight" blockAlignment="center">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onTabChange(tab.id)}
            >
              <View
                padding="tight"
                cornerRadius="base"
                background={isActive ? 'base' : undefined}
                border={isActive ? 'base' : undefined}
              >
                <InlineStack spacing="extraTight" blockAlignment="center">
                  <Text size="small">{tab.icon}</Text>
                  <Text
                    size="small"
                    emphasis={isActive ? 'bold' : undefined}
                  >
                    {translate(tab.labelKey)}
                  </Text>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <Badge tone="info">{tab.badge}</Badge>
                  )}
                </InlineStack>
              </View>
            </Pressable>
          );
        })}
      </InlineStack>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function MembershipBlock() {
  const translate = useTranslate();
  const language = useLanguage();
  const locale = language.isoCode || 'en-US';

  const { editor } = useExtension();
  const isInEditor = editor?.type === 'checkout';

  const {
    customerId: authCustomerId,
    isAuthenticated: authIsAuthenticated,
  } = useAuthenticatedCustomer();

  const {
    sessionToken,
    customerId: tokenCustomerId,
    isAuthenticated: tokenIsAuthenticated,
    isLoading: tokenLoading,
    decodedToken
  } = useSessionToken();

  const shopDomain = decodedToken?.claims?.dest;

  const apiClient = useApiClient({
    shopDomain: shopDomain,
  });

  // Combined auth signals — consolidated once so downstream (hooks, early
  // returns, activity fetches) all read from the same derived value.
  const customerId = authCustomerId || tokenCustomerId;
  const isAuthenticated = authIsAuthenticated || tokenIsAuthenticated;

  // Data lifecycle moved to useLoyaltyData hook 2026-04-23. Keeps the
  // orchestrator focused on wiring — fetch/refresh/mock/error state is
  // a self-contained concern. See `./hooks/useLoyaltyData`.
  const {
    loyaltyData,
    isLoading: dataLoading,
    isRefreshing,
    error,
    refresh: handleRefresh,
  } = useLoyaltyData({
    apiClient,
    sessionToken,
    isAuthenticated,
    isInEditor,
    getMockData,
    translate,
  });

  // `isLoading` surfaces to the early-return skeleton. Token still loading
  // OR data still loading counts as "not yet ready to render."
  const isLoading = tokenLoading || dataLoading;

  const [showAllTiers, setShowAllTiers] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('membership');

  // Rewards Activity Hooks
  const {
    raffles,
    isEnabled: rafflesEnabled,
    isLoading: rafflesLoading,
    error: rafflesError,
    pointsBalance: rafflesPointsBalance,
    config: rafflesConfig,
    history: rafflesHistory,
    historyLoading: rafflesHistoryLoading,
    // Psychology data
    streak: raffleStreak,
    activities: raffleActivities,
    bonusEvents: raffleBonusEvents,
    bestBonusEvent: raffleBestBonusEvent,
    psychologyLoading: rafflePsychologyLoading,
    lastPurchaseResult: raffleLastPurchaseResult,
    clearPurchaseResult: raffleClearPurchaseResult,
    isClaimingFreeEntry: raffleIsClaimingFreeEntry,
    // Actions
    fetchRaffles,
    fetchHistory: fetchRafflesHistory,
    purchaseEntries,
    fetchPsychology: fetchRafflePsychology,
    claimFreeEntry: raffleClaimFreeEntry,
  } = useRaffles({ shopDomain });

  const {
    boxes,
    isEnabled: boxesEnabled,
    isLoading: boxesLoading,
    error: boxesError,
    pointsBalance: boxesPointsBalance,
    config: boxesConfig,
    history: boxesHistory,
    historyLoading: boxesHistoryLoading,
    fetchBoxes,
    fetchHistory: fetchBoxesHistory,
    openBox,
  } = useMysteryBoxes({ shopDomain });

  const {
    challenges,
    isEnabled: challengesEnabled,
    isLoading: challengesLoading,
    error: challengesError,
    pointsBalance: challengesPointsBalance,
    config: challengesConfig,
    message: challengesMessage,
    history: challengesHistory,
    historyLoading: challengesHistoryLoading,
    fetchChallenges,
    fetchHistory: fetchChallengesHistory,
    claimReward,
  } = useChallenges({ shopDomain });

  const {
    player: missionsPlayer,
    missions: missionsData,
    pendingEvents: missionsPendingEvents,
    config: missionsConfig,
    isEnabled: missionsEnabled,
    isLoading: missionsLoading,
    error: missionsError,
    message: missionsMessage,
    fetchMissions,
    claimReward: claimMissionReward,
    acknowledgeEvents: acknowledgeMissionEvents,
  } = useMissions({ shopDomain });

  const {
    bundles: giftCardBundles,
    issuedGiftCards,
    storeCredit: giftCardStoreCredit,
    tierName: giftCardTierName,
    tierBonus: giftCardTierBonus,
    enableConversion: giftCardEnableConversion,
    isEnabled: giftCardsEnabled,
    isLoading: giftCardsLoading,
    error: giftCardsError,
    fetchGiftCards,
    convertToGiftCard,
  } = useGiftCards({ shopDomain });

  logger.debug('Component state:', {
    customerId,
    isAuthenticated,
    hasSessionToken: !!sessionToken,
    isLoading,
  });

  // Kick off the activity-hook fetches in parallel once the customer is
  // authenticated. Loyalty data itself is loaded by `useLoyaltyData` above.
  useEffect(() => {
    if (isAuthenticated && sessionToken && !isInEditor) {
      fetchRaffles(sessionToken);
      fetchRafflePsychology(sessionToken);
      fetchBoxes(sessionToken);
      fetchChallenges(sessionToken);
      fetchMissions(sessionToken);
      fetchGiftCards(sessionToken);
    }
  }, [isAuthenticated, sessionToken, isInEditor, fetchRaffles, fetchRafflePsychology, fetchBoxes, fetchChallenges, fetchMissions, fetchGiftCards]);

  // Points redemption API client (separate base URL for points endpoint)
  // ============================================================================
  // Render States
  // ============================================================================

  if (!isAuthenticated && !isInEditor) {
    return (
      <View border="base" cornerRadius="base" padding="base" background="subdued">
        <BlockStack spacing="base">
          <Text size="medium" emphasis="bold">
            {translate('membership.preview.title')}
          </Text>
          <Text appearance="subdued">
            {translate('membership.preview.signInMessage')}
          </Text>
          <Divider />
          <BlockStack spacing="tight">
            <Text size="small" appearance="subdued">
              {translate('membership.preview.exampleTier')}
            </Text>
            <Text size="small" appearance="subdued">
              {translate('membership.preview.exampleBalance')}
            </Text>
          </BlockStack>
        </BlockStack>
      </View>
    );
  }

  if (isLoading && !loyaltyData) {
    return <MembershipSkeleton />;
  }

  if (error && !loyaltyData) {
    return (
      <Banner tone="critical" title={translate('membership.error.title')}>
        {error}
      </Banner>
    );
  }

  if (loyaltyData && !loyaltyData.enrolled) {
    return (
      <Banner tone="info" title={translate('membership.notEnrolled.title')}>
        {loyaltyData.message || translate('membership.notEnrolled.message')}
      </Banner>
    );
  }

  if (!loyaltyData) {
    return null;
  }

  // ============================================================================
  // Main Enrolled View - New Design
  // ============================================================================

  // Handle both new and legacy API response formats
  const customer = loyaltyData.customer || {
    firstName: null,
    lastName: null,
    memberSince: new Date().toISOString(),
    tags: []
  };

  const balance = typeof loyaltyData.balance === 'object' && 'current' in loyaltyData.balance
    ? loyaltyData.balance
    : { current: loyaltyData.balance as unknown as number || 0, lifetimeEarned: loyaltyData.totalEarned || 0 };

  const progress = loyaltyData.progress || {
    nextTierName: loyaltyData.nextTier?.name || null,
    nextTierCashback: loyaltyData.nextTier?.cashbackPercent || null,
    percent: loyaltyData.progressToNextTier || 0,
    amountRemaining: loyaltyData.amountToNextTier || 0,
    isMaxTier: !loyaltyData.nextTier
  };

  const benefits = loyaltyData.benefits || [];

  // Detect new customer state using safe utilities
  const safeStatsData = safeStats(loyaltyData.stats);
  const safeBalanceData = safeBalance(loyaltyData.balance);
  const isNewCustomer = isNewCustomerState(safeStatsData, safeBalanceData, loyaltyData.isNewCustomer);

  // Get tier change info if available
  const tierChange = loyaltyData.recentTierChange;

  // Edge case detection
  const isSingleTierProgram = (loyaltyData.allTiers?.length ?? 0) === 1;
  const isZeroCashbackTier = loyaltyData.tier?.cashbackPercent === 0 && !progress.isMaxTier;
  const hasHigherTiers = loyaltyData.allTiers?.some(t => t.cashbackPercent > 0) ?? false;

  // Tab configuration - only show tabs for enabled features with data
  const hasActivities = rafflesEnabled || boxesEnabled || challengesEnabled || missionsEnabled || giftCardsEnabled;
  const tabs: TabInfo[] = [
    { id: 'membership', icon: '⭐', labelKey: 'tabs.membership' },
    ...(rafflesEnabled ? [{ id: 'raffles' as TabId, icon: '🎟️', labelKey: 'tabs.raffles', badge: raffles.filter(r => r.status === 'ACTIVE').length }] : []),
    ...(boxesEnabled ? [{ id: 'boxes' as TabId, icon: '🎁', labelKey: 'tabs.boxes', badge: boxes.filter(b => b.status === 'ACTIVE').length }] : []),
    ...(challengesEnabled ? [{ id: 'challenges' as TabId, icon: '🏆', labelKey: 'tabs.challenges', badge: challenges.filter(c => c.status === 'ACTIVE' || c.status === 'COMPLETED').length }] : []),
    ...(missionsEnabled ? [{ id: 'missions' as TabId, icon: '🎯', labelKey: 'tabs.missions', badge: (missionsData.daily.length + missionsData.weekly.length + missionsData.monthly.length + missionsData.special.length) }] : []),
    ...(giftCardsEnabled ? [{ id: 'giftcards' as TabId, icon: '🎁', labelKey: 'tabs.giftcards', badge: issuedGiftCards.filter(c => c.status === 'ACTIVE').length }] : []),
  ];

  // Handler for tab change
  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
  }, []);

  // Handler callbacks for activities
  const handlePurchaseEntries = useCallback(async (raffleId: string, quantity: number) => {
    if (!sessionToken) return { success: false, error: 'Not authenticated' };
    return purchaseEntries(sessionToken, raffleId, quantity);
  }, [sessionToken, purchaseEntries]);

  const handleClaimFreeEntry = useCallback(async (raffleId: string) => {
    if (!sessionToken) return { success: false, error: 'Not authenticated' };
    return raffleClaimFreeEntry(sessionToken, raffleId);
  }, [sessionToken, raffleClaimFreeEntry]);

  const handleOpenBox = useCallback(async (boxId: string) => {
    if (!sessionToken) return { success: false, error: 'Not authenticated' };
    return openBox(sessionToken, boxId);
  }, [sessionToken, openBox]);

  const handleClaimReward = useCallback(async (challengeId: string) => {
    if (!sessionToken) return { success: false, error: 'Not authenticated' };
    return claimReward(sessionToken, challengeId);
  }, [sessionToken, claimReward]);

  return (
    <BlockStack spacing="base">
      {/* Welcome Header */}
      <WelcomeHeader
        customer={customer}
        locale={locale}
        translate={translate}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Tab Navigation - only show if there are activities */}
      {hasActivities && tabs.length > 1 && (
        <TabNavigation
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          translate={translate}
        />
      )}

      {/* Tab Content */}
      {activeTab === 'raffles' && rafflesEnabled && (
        <RafflesTab
          raffles={raffles}
          isLoading={rafflesLoading}
          error={rafflesError}
          pointsBalance={rafflesPointsBalance}
          config={rafflesConfig}
          history={rafflesHistory}
          historyLoading={rafflesHistoryLoading}
          onPurchaseEntries={handlePurchaseEntries}
          onFetchHistory={() => sessionToken && fetchRafflesHistory(sessionToken)}
          streak={raffleStreak}
          activities={raffleActivities}
          bonusEvents={raffleBonusEvents}
          bestBonusEvent={raffleBestBonusEvent}
          psychologyLoading={rafflePsychologyLoading}
          lastPurchaseResult={raffleLastPurchaseResult}
          onClearPurchaseResult={raffleClearPurchaseResult}
          onClaimFreeEntry={handleClaimFreeEntry}
          isClaimingFreeEntry={raffleIsClaimingFreeEntry}
          translate={translate}
          locale={locale}
        />
      )}

      {activeTab === 'boxes' && boxesEnabled && (
        <MysteryBoxesTab
          boxes={boxes}
          isLoading={boxesLoading}
          error={boxesError}
          pointsBalance={boxesPointsBalance}
          config={boxesConfig}
          history={boxesHistory}
          historyLoading={boxesHistoryLoading}
          onOpenBox={handleOpenBox}
          onFetchHistory={() => sessionToken && fetchBoxesHistory(sessionToken)}
          translate={translate}
          locale={locale}
        />
      )}

      {activeTab === 'challenges' && challengesEnabled && (
        <ChallengesTab
          challenges={challenges}
          isLoading={challengesLoading}
          error={challengesError}
          pointsBalance={challengesPointsBalance}
          config={challengesConfig}
          message={challengesMessage}
          history={challengesHistory}
          historyLoading={challengesHistoryLoading}
          onClaimReward={handleClaimReward}
          onFetchHistory={() => sessionToken && fetchChallengesHistory(sessionToken)}
          translate={translate}
          locale={locale}
        />
      )}

      {activeTab === 'missions' && missionsEnabled && (
        <MissionsTab
          player={missionsPlayer}
          missions={missionsData}
          pendingEvents={missionsPendingEvents}
          isLoading={missionsLoading}
          error={missionsError}
          config={missionsConfig}
          message={missionsMessage}
          onClaimReward={async (missionId: string) => {
            if (!sessionToken) return { success: false, error: 'Not authenticated' };
            return claimMissionReward(sessionToken, missionId);
          }}
          onAcknowledgeEvents={async (eventIds: string[]) => {
            if (!sessionToken) return;
            return acknowledgeMissionEvents(sessionToken, eventIds);
          }}
          translate={translate}
        />
      )}

      {activeTab === 'giftcards' && giftCardsEnabled && (
        <GiftCardsTab
          bundles={giftCardBundles}
          issuedGiftCards={issuedGiftCards}
          storeCredit={giftCardStoreCredit}
          tierName={giftCardTierName}
          tierBonus={giftCardTierBonus}
          enableConversion={giftCardEnableConversion}
          isLoading={giftCardsLoading}
          error={giftCardsError}
          customerId={customerId ?? null}
          onConvert={async (amount: number) => {
            if (!sessionToken || !customerId) return { success: false, error: 'Not authenticated' };
            return convertToGiftCard(sessionToken, customerId, amount);
          }}
          translate={translate}
        />
      )}

      {/* Membership Tab Content */}
      {activeTab === 'membership' && (
        <>
          {/* Preview Banner */}
          {loyaltyData.isPreview && (
            <Banner tone="info">
              {loyaltyData.message || translate('membership.preview.mode')}
            </Banner>
          )}

          {/* Stale Data Warning - when data is older than 15 minutes */}
          <StaleDataBanner
            lastUpdated={loyaltyData.lastUpdated}
            translate={translate}
          />

          {/* Tier Change Banner - Show upgrade/downgrade celebrations */}
          {tierChange && !isNewCustomer && (
            <TierChangeBanner
              tierChange={tierChange}
              translate={translate}
            />
          )}

          {/* New Customer Welcome Card */}
          {isNewCustomer ? (
            <WelcomeCard
              customer={customer}
              tier={loyaltyData.tier}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
            />
          ) : (
            /* Membership Status Card - for existing customers */
            loyaltyData.tier && (
              <MembershipCard
                tier={loyaltyData.tier}
                benefits={benefits}
                locale={locale}
                translate={translate}
              />
            )
          )}

          {/* Store Credit Balance - with pending cashback */}
          <BalanceCardWithPending
            balance={balance}
            currency={loyaltyData.currency}
            locale={locale}
            translate={translate}
            pendingCashback={loyaltyData.pendingCashback}
          />

          {/* Points Section - Reward Points engagement system */}
          {loyaltyData.points?.enabled && (
            <PointsSection
              points={loyaltyData.points}
              shopCurrency={loyaltyData.currency}
              locale={locale}
              translate={translate}
            />
          )}

          {/* Tier Progress - Different displays based on tier status and source */}
          {progress.isMaxTier && loyaltyData.tier ? (
            /* Max tier - show value reinforcement */
            <MaxTierCard
              tier={loyaltyData.tier}
              stats={loyaltyData.stats}
              maintenance={loyaltyData.maintenance}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
            />
          ) : isZeroCashbackTier && hasHigherTiers && loyaltyData.tier ? (
            /* Zero cashback starter tier - show encouraging progress card */
            <StarterTierCard
              tier={loyaltyData.tier}
              progress={progress}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
            />
          ) : loyaltyData.tier && loyaltyData.spendingProgress && loyaltyData.tier.sourceDetails?.type !== 'spending' ? (
            /* Non-spending tier source - show dual progress */
            <DualProgressCard
              tier={loyaltyData.tier}
              spendingProgress={loyaltyData.spendingProgress}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
            />
          ) : (
            /* Standard progress card */
            <ProgressCard
              progress={progress}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
              maintenance={loyaltyData.maintenance}
            />
          )}

          {/* Upgrade Section - Tier Products for higher tiers */}
          {loyaltyData.upgradeOptions && (
            <UpgradeSection
              upgradeOptions={loyaltyData.upgradeOptions}
              currentTierName={loyaltyData.tier?.name || null}
              isMaxTier={progress.isMaxTier}
              translate={translate}
              currency={loyaltyData.currency}
              locale={locale}
            />
          )}

          {/* Recent Activity */}
          {loyaltyData.recentTransactions && loyaltyData.recentTransactions.length > 0 && (
            <ActivityCard
              transactions={loyaltyData.recentTransactions}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
              variant="compact"
            />
          )}

          {/* View All Tiers Toggle - hide for single-tier programs */}
          {!isSingleTierProgram && loyaltyData.allTiers && loyaltyData.allTiers.length > 1 && (
            <>
              <Button
                kind="plain"
                onPress={() => setShowAllTiers(!showAllTiers)}
              >
                {showAllTiers
                  ? translate('membership.tiers.hide')
                  : translate('membership.tiers.viewAll')
                }
              </Button>

              {showAllTiers && (
                <AllTiersCard
                  tiers={loyaltyData.allTiers}
                  currency={loyaltyData.currency}
                  locale={locale}
                  currentSpending={loyaltyData.stats.totalSpent}
                  translate={translate}
                />
              )}
            </>
          )}
        </>
      )}
    </BlockStack>
  );
}

// ============================================================================
// Extension Export
// ============================================================================

export default reactExtension(
  'customer-account.profile.block.render',
  () => <MembershipBlock />
);
