import { useState, useCallback } from 'react';
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
} from '@shopify/ui-extensions-react/customer-account';
import type { ChallengeInfo, ClaimChallengeResult } from '../hooks/useChallenges';

// ============================================
// TYPES
// ============================================

interface ChallengesTabProps {
  challenges: ChallengeInfo[];
  isLoading: boolean;
  error: string | null;
  pointsBalance: number;
  config: { currencyName: string; currencyIcon: string } | null;
  message: string | null;
  onClaimReward: (challengeId: string) => Promise<ClaimChallengeResult>;
  translate: (key: string, options?: Record<string, string>) => string;
  locale: string;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatTimeRemaining(endsAt: string, translate: (key: string, options?: Record<string, string>) => string): string {
  const end = new Date(endsAt);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) {
    return translate('challenges.ended');
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return translate('challenges.endsInDays', { days: String(days) });
  }
  if (hours > 0) {
    return translate('challenges.endsInHours', { hours: String(hours) });
  }
  return translate('challenges.endsSoon');
}

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

function getStatusBadgeTone(status: string): 'info' | 'success' | 'warning' | 'critical' {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'CLAIMED':
      return 'info';
    case 'EXPIRED':
      return 'critical';
    default:
      return 'warning';
  }
}

// ============================================
// SUB-COMPONENTS
// ============================================

function ChallengesLoadingSkeleton() {
  return (
    <BlockStack spacing="base">
      <View border="base" cornerRadius="base" padding="base" background="base">
        <BlockStack spacing="base">
          <SkeletonText size="large" />
          <SkeletonText size="small" />
          <View minBlockSize={8} background="subdued" cornerRadius="fullyRounded" />
        </BlockStack>
      </View>
      <View border="base" cornerRadius="base" padding="base" background="base">
        <BlockStack spacing="base">
          <SkeletonText size="large" />
          <SkeletonText size="small" />
          <View minBlockSize={8} background="subdued" cornerRadius="fullyRounded" />
        </BlockStack>
      </View>
    </BlockStack>
  );
}

interface ProgressBarProps {
  progress: number;
  height?: number;
}

function ChallengeProgressBar({ progress, height = 8 }: ProgressBarProps) {
  const safeProgress = Number.isFinite(progress) ? progress : 0;
  const clampedProgress = Math.min(100, Math.max(0, safeProgress));
  const visualProgress = clampedProgress === 0
    ? 0
    : clampedProgress === 100
      ? 100
      : Math.max(3, Math.min(97, clampedProgress));

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
        background="interactive"
        minBlockSize={height}
        maxBlockSize={height}
        inlineSize={`${visualProgress}%`}
      />
    </View>
  );
}

interface ChallengeCardProps {
  challenge: ChallengeInfo;
  onClaim: () => Promise<void>;
  isClaiming: boolean;
  translate: (key: string, options?: Record<string, string>) => string;
}

function ChallengeCard({
  challenge,
  onClaim,
  isClaiming,
  translate,
}: ChallengeCardProps) {
  const objectiveIcon = getObjectiveIcon(challenge.objectiveType);
  const endTime = formatTimeRemaining(challenge.endsAt, translate);
  const isCompleted = challenge.status === 'COMPLETED';
  const isClaimed = challenge.status === 'CLAIMED';
  const isActive = challenge.status === 'ACTIVE';
  const isExpired = challenge.status === 'EXPIRED';

  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="base">
        {/* Header */}
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="medium" emphasis="bold">
            {objectiveIcon} {challenge.name}
          </Text>
          {!isActive && (
            <Badge tone={getStatusBadgeTone(challenge.status)}>
              {translate(`challenges.status.${challenge.status.toLowerCase()}`)}
            </Badge>
          )}
        </InlineStack>

        {/* Description */}
        {challenge.description && (
          <Text size="small" appearance="subdued">
            {challenge.description}
          </Text>
        )}

        <Divider />

        {/* Progress */}
        {isActive && (
          <BlockStack spacing="tight">
            <ChallengeProgressBar progress={challenge.progressPercent} />
            <InlineStack spacing="base" blockAlignment="center">
              <View inlineSize="fill">
                <Text size="small">
                  {translate('challenges.progress', {
                    current: String(Math.round(challenge.currentProgress)),
                    target: String(challenge.targetValue),
                  })}
                </Text>
              </View>
              <Text size="small" appearance="subdued">
                {Math.round(challenge.progressPercent)}%
              </Text>
            </InlineStack>
          </BlockStack>
        )}

        {/* Reward Info */}
        <InlineStack spacing="base" blockAlignment="center">
          <View inlineSize="fill">
            <Text size="small" emphasis="bold">
              🎁 {translate('challenges.reward')}: {challenge.reward.description}
            </Text>
          </View>
          {isActive && (
            <Text size="small" appearance="subdued">
              ⏰ {endTime}
            </Text>
          )}
        </InlineStack>

        {/* Action Button */}
        {isCompleted && !isClaimed && (
          <>
            <Divider />
            <Button
              kind="primary"
              loading={isClaiming}
              disabled={isClaiming}
              onPress={onClaim}
            >
              {translate('challenges.claimReward')}
            </Button>
          </>
        )}

        {isClaimed && (
          <InlineStack spacing="tight" blockAlignment="center">
            <Text size="small" appearance="success">
              ✓ {translate('challenges.rewardClaimed')}
            </Text>
          </InlineStack>
        )}

        {isExpired && (
          <InlineStack spacing="tight" blockAlignment="center">
            <Text size="small" appearance="subdued">
              {translate('challenges.expired')}
            </Text>
          </InlineStack>
        )}
      </BlockStack>
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ChallengesTab({
  challenges,
  isLoading,
  error,
  pointsBalance,
  config,
  message,
  onClaimReward,
  translate,
}: ChallengesTabProps) {
  const [claimingChallengeId, setClaimingChallengeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleClaim = useCallback(async (challengeId: string) => {
    setClaimingChallengeId(challengeId);
    setActionError(null);
    setSuccessMessage(null);

    const result = await onClaimReward(challengeId);

    if (result.success) {
      setSuccessMessage(result.message || translate('challenges.claimSuccess'));
    } else {
      setActionError(result.error || translate('challenges.claimError'));
    }

    setClaimingChallengeId(null);
  }, [onClaimReward, translate]);

  if (isLoading) {
    return <ChallengesLoadingSkeleton />;
  }

  if (error) {
    return (
      <Banner tone="critical" title={translate('challenges.errorTitle')}>
        {error}
      </Banner>
    );
  }

  const currencyName = config?.currencyName || 'points';
  const currencyIcon = config?.currencyIcon || '⭐';

  // Separate challenges by status
  const activeChallenges = challenges.filter(c => c.status === 'ACTIVE');
  const completedChallenges = challenges.filter(c => c.status === 'COMPLETED');
  const claimedChallenges = challenges.filter(c => c.status === 'CLAIMED');

  return (
    <BlockStack spacing="base">
      {/* Points Balance Header */}
      <View border="base" cornerRadius="base" padding="base" background="subdued">
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="small">{translate('challenges.yourBalance')}</Text>
          <Text size="medium" emphasis="bold">
            {currencyIcon} {pointsBalance.toLocaleString()} {currencyName}
          </Text>
        </InlineStack>
      </View>

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

      {/* Challenges List */}
      {challenges.length === 0 ? (
        <View border="base" cornerRadius="base" padding="loose" background="base">
          <BlockStack spacing="tight" inlineAlignment="center">
            <Text size="large">🏆</Text>
            <Text size="medium" emphasis="bold">
              {translate('challenges.noActiveChallenges')}
            </Text>
            <Text size="small" appearance="subdued">
              {message || translate('challenges.checkBackLater')}
            </Text>
          </BlockStack>
        </View>
      ) : (
        <>
          {/* Completed but unclaimed - show first for urgency */}
          {completedChallenges.length > 0 && (
            <BlockStack spacing="tight">
              <Text size="small" emphasis="bold" appearance="success">
                🎉 {translate('challenges.readyToClaim')}
              </Text>
              {completedChallenges.map((challenge) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  onClaim={() => handleClaim(challenge.id)}
                  isClaiming={claimingChallengeId === challenge.id}
                  translate={translate}
                />
              ))}
            </BlockStack>
          )}

          {/* Active challenges */}
          {activeChallenges.length > 0 && (
            <BlockStack spacing="tight">
              {completedChallenges.length > 0 && (
                <Text size="small" emphasis="bold">
                  {translate('challenges.inProgress')}
                </Text>
              )}
              {activeChallenges.map((challenge) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  onClaim={() => handleClaim(challenge.id)}
                  isClaiming={claimingChallengeId === challenge.id}
                  translate={translate}
                />
              ))}
            </BlockStack>
          )}

          {/* Claimed challenges - show at bottom */}
          {claimedChallenges.length > 0 && (
            <BlockStack spacing="tight">
              <Text size="small" emphasis="bold" appearance="subdued">
                {translate('challenges.recentlyCompleted')}
              </Text>
              {claimedChallenges.slice(0, 3).map((challenge) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  onClaim={() => handleClaim(challenge.id)}
                  isClaiming={claimingChallengeId === challenge.id}
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
