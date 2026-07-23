import { useState, useCallback, useEffect } from 'react';
import {
  BlockStack,
  InlineStack,
  Text,
  View,
  Button,
  Banner,
  Badge,
  Divider,
  SkeletonText,
  Pressable,
} from '@shopify/ui-extensions-react/customer-account';
import type {
  MissionInfo,
  PlayerStats,
  MissionEvent,
  ClaimMissionResult,
  MissionCadence,
  MissionRarity,
} from '../hooks/useMissions';
import { ChallengeImage } from './CardImage';

// ============================================
// TYPES
// ============================================

interface MissionsTabProps {
  player: PlayerStats | null;
  missions: {
    daily: MissionInfo[];
    weekly: MissionInfo[];
    monthly: MissionInfo[];
    special: MissionInfo[];
  };
  pendingEvents: MissionEvent[];
  isLoading: boolean;
  error: string | null;
  config: { currencyName: string; currencyIcon: string } | null;
  message: string | null;
  onClaimReward: (missionId: string) => Promise<ClaimMissionResult>;
  onAcknowledgeEvents: (eventIds: string[]) => Promise<void>;
  translate: (key: string, options?: Record<string, string>) => string;
}

type TabKey = 'all' | 'daily' | 'weekly' | 'monthly' | 'special';

// ============================================
// CONSTANTS
// ============================================

const RARITY_EMOJI: Record<MissionRarity, string> = {
  COMMON: '',
  UNCOMMON: '🌿',
  RARE: '💎',
  EPIC: '🔮',
  LEGENDARY: '👑',
};

const RARITY_TONE: Record<MissionRarity, 'info' | 'success' | 'warning' | 'attention' | 'critical'> = {
  COMMON: 'info',
  UNCOMMON: 'success',
  RARE: 'attention',
  EPIC: 'warning',
  LEGENDARY: 'critical',
};

const CADENCE_EMOJI: Record<MissionCadence, string> = {
  DAILY: '☀️',
  WEEKLY: '📅',
  MONTHLY: '📆',
  SPECIAL: '⭐',
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getObjectiveIcon(objectiveType: string): string {
  switch (objectiveType) {
    case 'SPENDING':
      return '💰';
    case 'ORDER_COUNT':
      return '🛒';
    case 'REFERRAL':
      return '👥';
    case 'PRODUCT_PURCHASE':
      return '📦';
    case 'REVIEW':
      return '⭐';
    case 'STREAK':
      return '🔥';
    default:
      return '🎯';
  }
}

// ============================================
// SUB-COMPONENTS
// ============================================

function MissionsLoadingSkeleton() {
  return (
    <BlockStack spacing="base">
      {/* Player stats skeleton */}
      <View border="base" cornerRadius="base" padding="base" background="subdued">
        <BlockStack spacing="tight">
          <SkeletonText size="medium" />
          <View minBlockSize={12} background="base" cornerRadius="fullyRounded" />
          <SkeletonText size="small" />
        </BlockStack>
      </View>

      {/* Mission cards skeleton */}
      {[1, 2].map((i) => (
        <View key={i} border="base" cornerRadius="base" padding="base" background="base">
          <BlockStack spacing="base">
            <SkeletonText size="large" />
            <SkeletonText size="small" />
            <View minBlockSize={8} background="subdued" cornerRadius="fullyRounded" />
          </BlockStack>
        </View>
      ))}
    </BlockStack>
  );
}

// --------------------------------------------
// Player Stats Header
// --------------------------------------------

interface PlayerStatsHeaderProps {
  player: PlayerStats;
  translate: (key: string, options?: Record<string, string>) => string;
}

function PlayerStatsHeader({ player, translate }: PlayerStatsHeaderProps) {
  return (
    <View border="base" cornerRadius="base" padding="base" background="subdued">
      <BlockStack spacing="tight">
        {/* Level and Streak Row */}
        <InlineStack spacing="base" blockAlignment="center">
          <View inlineSize="fill">
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="medium" emphasis="bold">
                {translate('missions.level', { level: String(player.level) })}
              </Text>
              <Badge tone="info">{`${player.xp} XP`}</Badge>
            </InlineStack>
          </View>
          {player.streak > 0 && (
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="medium">
                {player.streakEmoji} {player.streak}
              </Text>
              {player.streakBonus > 0 && (
                <Badge tone="success">{`+${player.streakBonus}%`}</Badge>
              )}
            </InlineStack>
          )}
        </InlineStack>

        {/* XP Progress Bar */}
        <View
          border="base"
          cornerRadius="fullyRounded"
          background="base"
          minBlockSize={12}
          maxBlockSize={12}
        >
          <View
            cornerRadius="fullyRounded"
            background="interactive"
            minBlockSize={12}
            maxBlockSize={12}
            inlineSize={`${Math.min(100, Math.max(0, player.xpProgressPercent))}%`}
          />
        </View>

        {/* XP Info Row */}
        <InlineStack spacing="base" blockAlignment="center">
          <View inlineSize="fill">
            <Text size="small" appearance="subdued">
              {translate('missions.xpProgress', {
                current: String(player.xpProgress),
                needed: String(player.xpToNextLevel),
              })}
            </Text>
          </View>
          <Text size="small" appearance="subdued">
            {`${player.xpProgressPercent}%`}
          </Text>
        </InlineStack>

        {/* Combo Indicator */}
        {player.todayComboCount > 0 && (
          <>
            <Divider />
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="small">
                {translate('missions.combo', { count: String(player.todayComboCount) })}
              </Text>
              {player.comboBonus > 0 && (
                <Badge tone="warning">{`+${player.comboBonus}% XP`}</Badge>
              )}
              {!player.isMaxCombo && player.nextComboBonus > player.comboBonus && (
                <Text size="small" appearance="subdued">
                  {translate('missions.nextCombo', { bonus: String(player.nextComboBonus) })}
                </Text>
              )}
            </InlineStack>
          </>
        )}

        {/* Stats Summary */}
        <Divider />
        <InlineStack spacing="base" blockAlignment="center">
          <Text size="small" appearance="subdued">
            {translate('missions.totalCompleted', { count: String(player.totalCompleted) })}
          </Text>
        </InlineStack>
      </BlockStack>
    </View>
  );
}

// --------------------------------------------
// Mission Progress Bar
// --------------------------------------------

interface MissionProgressBarProps {
  progress: number;
  rarity: MissionRarity;
  height?: number;
}

function MissionProgressBar({ progress, rarity, height = 8 }: MissionProgressBarProps) {
  const safeProgress = Number.isFinite(progress) ? progress : 0;
  const clampedProgress = Math.min(100, Math.max(0, safeProgress));
  const visualProgress = clampedProgress === 0
    ? 0
    : clampedProgress === 100
      ? 100
      : Math.max(3, Math.min(97, clampedProgress));

  // Use different background based on rarity for visual distinction
  const progressBackground = rarity === 'LEGENDARY' || rarity === 'EPIC'
    ? 'accent'
    : 'interactive';

  return (
    <View
      border="base"
      cornerRadius="fullyRounded"
      background="subdued"
      minBlockSize={height}
      maxBlockSize={height}
    >
      <View
        cornerRadius="fullyRounded"
        background={progressBackground}
        minBlockSize={height}
        maxBlockSize={height}
        inlineSize={`${visualProgress}%`}
      />
    </View>
  );
}

// --------------------------------------------
// Mission Card
// --------------------------------------------

interface MissionCardProps {
  mission: MissionInfo;
  onClaim: () => Promise<void>;
  isClaiming: boolean;
  translate: (key: string, options?: Record<string, string>) => string;
}

function MissionCard({
  mission,
  onClaim,
  isClaiming,
  translate,
}: MissionCardProps) {
  const objectiveIcon = getObjectiveIcon(mission.objective.type);
  const rarityEmoji = RARITY_EMOJI[mission.rarity];
  const rarityTone = RARITY_TONE[mission.rarity];
  const cadenceEmoji = CADENCE_EMOJI[mission.cadence];

  const isCompleted = mission.status === 'COMPLETED';
  const isClaimed = mission.status === 'CLAIMED';
  const isInProgress = mission.status === 'IN_PROGRESS';
  const isAvailable = mission.status === 'AVAILABLE';

  return (
    <View border="base" cornerRadius="base" padding="none" background="base" overflow="hidden">
      <BlockStack spacing="none">
        {/* Image */}
        {mission.imageUrl && (
          <ChallengeImage
            imageUrl={mission.imageUrl}
            name={mission.name}
            objectiveType={mission.objective.type}
          />
        )}

        {/* Content */}
        <View padding="base">
          <BlockStack spacing="base">
            {/* Header with badges */}
            <BlockStack spacing="tight">
              <InlineStack spacing="tight" blockAlignment="center">
                <Text size="medium" emphasis="bold">
                  {mission.iconEmoji || objectiveIcon} {mission.name}
                </Text>
              </InlineStack>
              <InlineStack spacing="tight" blockAlignment="center">
                <Badge tone={rarityTone}>
                  {rarityEmoji ? `${rarityEmoji} ` : ''}{mission.rarity}
                </Badge>
                <Badge tone="info">{`${cadenceEmoji} ${mission.cadence}`}</Badge>
                <Badge tone="success">{`+${mission.xpReward} XP`}</Badge>
              </InlineStack>
            </BlockStack>

            {/* Description */}
            {mission.description && (
              <Text size="small" appearance="subdued">
                {mission.description}
              </Text>
            )}

            <Divider />

            {/* Progress (for available/in-progress missions) */}
            {(isAvailable || isInProgress) && (
              <BlockStack spacing="tight">
                <MissionProgressBar
                  progress={mission.objective.percent}
                  rarity={mission.rarity}
                />
                <InlineStack spacing="base" blockAlignment="center">
                  <View inlineSize="fill">
                    <Text size="small">
                      {translate('missions.progress', {
                        current: String(Math.round(mission.objective.current)),
                        target: String(mission.objective.target),
                      })}
                    </Text>
                  </View>
                  <Text size="small" appearance="subdued">
                    {`${Math.round(mission.objective.percent)}%`}
                  </Text>
                </InlineStack>
              </BlockStack>
            )}

            {/* Reward Info */}
            <InlineStack spacing="base" blockAlignment="center">
              <View inlineSize="fill">
                <Text size="small" emphasis="bold">
                  {translate('missions.reward')}: {mission.reward.description}
                </Text>
              </View>
              {mission.timeRemaining && (isAvailable || isInProgress) && (
                <Text size="small" appearance="subdued">
                  {translate('missions.endsIn', { time: mission.timeRemaining })}
                </Text>
              )}
            </InlineStack>

            {/* Eligibility warning */}
            {!mission.isEligible && (
              <Banner tone="warning">
                {translate('missions.tierRequired')}
              </Banner>
            )}

            {/* Action Button */}
            {isCompleted && !isClaimed && mission.isEligible && (
              <>
                <Divider />
                <Button
                  kind="primary"
                  loading={isClaiming}
                  disabled={isClaiming}
                  onPress={onClaim}
                >
                  {translate('missions.claimReward')}
                </Button>
              </>
            )}

            {isClaimed && (
              <InlineStack spacing="tight" blockAlignment="center">
                <Text size="small" appearance="success">
                  {translate('missions.rewardClaimed')}
                </Text>
              </InlineStack>
            )}
          </BlockStack>
        </View>
      </BlockStack>
    </View>
  );
}

// --------------------------------------------
// Tab Button
// --------------------------------------------

interface TabButtonProps {
  label: string;
  isActive: boolean;
  count: number;
  onPress: () => void;
}

function TabButton({ label, isActive, count, onPress }: TabButtonProps) {
  return (
    <Pressable onPress={onPress}>
      <View
        padding="tight"
        cornerRadius="base"
        background={isActive ? 'interactive' : 'subdued'}
      >
        <InlineStack spacing="tight" blockAlignment="center">
          <Text
            size="small"
            emphasis={isActive ? 'bold' : undefined}
            appearance={isActive ? undefined : 'subdued'}
          >
            {label}
          </Text>
          {count > 0 && (
            <Badge tone={isActive ? 'info' : undefined}>
              {String(count)}
            </Badge>
          )}
        </InlineStack>
      </View>
    </Pressable>
  );
}

// --------------------------------------------
// Event Celebration Modal
// --------------------------------------------

interface EventCelebrationProps {
  event: MissionEvent;
  onDismiss: () => void;
  translate: (key: string, options?: Record<string, string>) => string;
}

function EventCelebration({ event, onDismiss, translate }: EventCelebrationProps) {
  const isLevelUp = event.triggersLevelUp;
  const isStreak = event.triggersStreakFire;
  const totalXp = event.xpEarned + event.bonusXp;
  const payload = event.payload as Record<string, unknown> | null;

  let title = translate('missions.missionComplete');
  let emoji = '🎉';

  if (isLevelUp) {
    title = translate('missions.levelUp');
    emoji = '🌟';
  } else if (isStreak) {
    title = translate('missions.streakBonus');
    emoji = '🔥';
  }

  return (
    <View border="base" cornerRadius="base" padding="loose" background="subdued">
      <BlockStack spacing="base" inlineAlignment="center">
        <Text size="large">{emoji}</Text>
        <Text size="medium" emphasis="bold">
          {title}
        </Text>

        {totalXp > 0 && (
          <InlineStack spacing="tight" blockAlignment="center">
            <Text size="large" emphasis="bold">
              +{totalXp} XP
            </Text>
            {event.bonusXp > 0 && (
              <Badge tone="success">
                {`+${event.bonusXp} ${translate('missions.bonus')}`}
              </Badge>
            )}
          </InlineStack>
        )}

        {isLevelUp && payload?.newLevel && (
          <Text size="medium">
            {translate('missions.nowLevel', { level: String(payload.newLevel) })}
          </Text>
        )}

        {isStreak && payload?.streakCount && (
          <Text size="medium">
            {translate('missions.streakDays', { days: String(payload.streakCount) })}
          </Text>
        )}

        {payload?.rewardDescription && (
          <Text size="small" appearance="subdued">
            {String(payload.rewardDescription)}
          </Text>
        )}

        <Button onPress={onDismiss}>
          {translate('missions.continue')}
        </Button>
      </BlockStack>
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function MissionsTab({
  player,
  missions,
  pendingEvents,
  isLoading,
  error,
  message,
  onClaimReward,
  onAcknowledgeEvents,
  translate,
}: MissionsTabProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [claimingMissionId, setClaimingMissionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentEvent, setCurrentEvent] = useState<MissionEvent | null>(null);

  // Show pending events one at a time
  useEffect(() => {
    if (pendingEvents.length > 0 && !currentEvent) {
      setCurrentEvent(pendingEvents[0]);
    }
  }, [pendingEvents, currentEvent]);

  const handleDismissEvent = useCallback(async () => {
    if (currentEvent) {
      await onAcknowledgeEvents([currentEvent.id]);
      setCurrentEvent(null);
    }
  }, [currentEvent, onAcknowledgeEvents]);

  const handleClaim = useCallback(async (missionId: string) => {
    setClaimingMissionId(missionId);
    setActionError(null);
    setSuccessMessage(null);

    const result = await onClaimReward(missionId);

    if (result.success) {
      setSuccessMessage(result.message || translate('missions.claimSuccess'));
    } else {
      setActionError(result.error || translate('missions.claimError'));
    }

    setClaimingMissionId(null);
  }, [onClaimReward, translate]);

  // Loading state
  if (isLoading) {
    return <MissionsLoadingSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <Banner tone="critical" title={translate('missions.errorTitle')}>
        {error}
      </Banner>
    );
  }

  // Get missions for current tab
  const allMissions = [
    ...missions.daily,
    ...missions.weekly,
    ...missions.monthly,
    ...missions.special,
  ];

  const displayMissions = activeTab === 'all'
    ? allMissions
    : missions[activeTab];

  // Separate by status for prioritized display
  const completedMissions = displayMissions.filter(m => m.status === 'COMPLETED');
  const activeMissions = displayMissions.filter(m =>
    m.status === 'AVAILABLE' || m.status === 'IN_PROGRESS'
  );
  const claimedMissions = displayMissions.filter(m => m.status === 'CLAIMED');

  // Tab counts (active + completed unclaimed)
  const tabCounts = {
    all: allMissions.filter(m => m.status !== 'CLAIMED').length,
    daily: missions.daily.filter(m => m.status !== 'CLAIMED').length,
    weekly: missions.weekly.filter(m => m.status !== 'CLAIMED').length,
    monthly: missions.monthly.filter(m => m.status !== 'CLAIMED').length,
    special: missions.special.filter(m => m.status !== 'CLAIMED').length,
  };

  return (
    <BlockStack spacing="base">
      {/* Event Celebration Overlay */}
      {currentEvent && (
        <EventCelebration
          event={currentEvent}
          onDismiss={handleDismissEvent}
          translate={translate}
        />
      )}

      {/* Player Stats Header */}
      {player && (
        <PlayerStatsHeader player={player} translate={translate} />
      )}

      {/* Success Message */}
      {successMessage && (
        <Banner tone="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Banner>
      )}

      {/* Error Message */}
      {actionError && (
        <Banner tone="critical" onDismiss={() => setActionError(null)}>
          {actionError}
        </Banner>
      )}

      {/* Tab Navigation */}
      <View>
        <InlineStack spacing="tight" blockAlignment="center">
          <TabButton
            label={translate('missions.tabAll')}
            isActive={activeTab === 'all'}
            count={tabCounts.all}
            onPress={() => setActiveTab('all')}
          />
          <TabButton
            label={translate('missions.tabDaily')}
            isActive={activeTab === 'daily'}
            count={tabCounts.daily}
            onPress={() => setActiveTab('daily')}
          />
          <TabButton
            label={translate('missions.tabWeekly')}
            isActive={activeTab === 'weekly'}
            count={tabCounts.weekly}
            onPress={() => setActiveTab('weekly')}
          />
          <TabButton
            label={translate('missions.tabMonthly')}
            isActive={activeTab === 'monthly'}
            count={tabCounts.monthly}
            onPress={() => setActiveTab('monthly')}
          />
          <TabButton
            label={translate('missions.tabSpecial')}
            isActive={activeTab === 'special'}
            count={tabCounts.special}
            onPress={() => setActiveTab('special')}
          />
        </InlineStack>
      </View>

      {/* Mission List */}
      {displayMissions.length === 0 ? (
        <View border="base" cornerRadius="base" padding="loose" background="base">
          <BlockStack spacing="tight" inlineAlignment="center">
            <Text size="large">🎯</Text>
            <Text size="medium" emphasis="bold">
              {translate('missions.noMissions')}
            </Text>
            <Text size="small" appearance="subdued">
              {message || translate('missions.checkBackLater')}
            </Text>
          </BlockStack>
        </View>
      ) : (
        <>
          {/* Completed but unclaimed - show first for urgency */}
          {completedMissions.length > 0 && (
            <BlockStack spacing="tight">
              <Text size="small" emphasis="bold" appearance="success">
                {translate('missions.readyToClaim')}
              </Text>
              {completedMissions.map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  onClaim={() => handleClaim(mission.id)}
                  isClaiming={claimingMissionId === mission.id}
                  translate={translate}
                />
              ))}
            </BlockStack>
          )}

          {/* Active missions */}
          {activeMissions.length > 0 && (
            <BlockStack spacing="tight">
              {completedMissions.length > 0 && (
                <Text size="small" emphasis="bold">
                  {translate('missions.inProgress')}
                </Text>
              )}
              {activeMissions.map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  onClaim={() => handleClaim(mission.id)}
                  isClaiming={claimingMissionId === mission.id}
                  translate={translate}
                />
              ))}
            </BlockStack>
          )}

          {/* Claimed missions - show at bottom */}
          {claimedMissions.length > 0 && (
            <BlockStack spacing="tight">
              <Text size="small" emphasis="bold" appearance="subdued">
                {translate('missions.recentlyCompleted')}
              </Text>
              {claimedMissions.slice(0, 3).map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  onClaim={() => handleClaim(mission.id)}
                  isClaiming={claimingMissionId === mission.id}
                  translate={translate}
                />
              ))}
            </BlockStack>
          )}
        </>
      )}
    </BlockStack>
  );
}
