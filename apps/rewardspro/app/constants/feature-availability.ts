import type { ChallengeRewardType } from "../services/challenge-management.server";

/**
 * Features that can't work end to end yet, so merchants aren't offered them.
 *
 * While one is off, the admin doesn't offer it and the storefront gets no
 * data for it, so nothing a merchant switches on fails quietly in front of a
 * shopper. Where a server path would act on it, that path refuses too. Their
 * data stays.
 *
 * Like CHANCE_MECHANICS_PAUSED, these are code constants: only a code change,
 * once the feature works, turns one on. Not a setting, not an environment
 * variable.
 */
export const FEATURES_AVAILABLE: Readonly<{
  /**
   * Shoppers have nowhere to spend points: nothing redeems them or turns them
   * into store credit, and raffles and mystery boxes are paused.
   */
  points: boolean;
  /** Gift cards need the write_gift_cards scope, which the app doesn't request. */
  giftCards: boolean;
  /** The AI email assistant ran on AWS Bedrock, which went with the AWS account. */
  aiEmailAssistant: boolean;
  /**
   * Uploading a points icon needs the write_files scope, which the app
   * doesn't request, and an uploaded icon has nowhere to be saved.
   */
  iconUpload: boolean;
  /** Giveback pools have no service behind them. */
  givebackPools: boolean;
}> = {
  points: false,
  giftCards: false,
  aiEmailAssistant: false,
  iconUpload: false,
  givebackPools: false,
};

/**
 * Mission rewards a shopper can't receive yet, and why. They are left out of
 * the reward picker and the templates, and the server refuses them.
 */
const UNAVAILABLE_MISSION_REWARDS: Partial<Record<ChallengeRewardType, string>> = {
  ...(FEATURES_AVAILABLE.points
    ? {}
    : { POINTS: "Points can't be a mission reward yet: shoppers have nowhere to spend them." }),
  // deliverStoreCreditReward (challenge-claim.server.ts) issues no Shopify store credit yet
  STORE_CREDIT: "Store credit can't be a mission reward yet: claiming it doesn't add credit in Shopify.",
  // No write_discounts scope, so Shopify can't create the code
  DISCOUNT: "Discount codes can't be a mission reward yet: RewardsPro can't create discounts in Shopify.",
};

/** Why a mission reward type can't be offered today, or null when it can. */
export function missionRewardUnavailableReason(rewardType: string): string | null {
  return UNAVAILABLE_MISSION_REWARDS[rewardType as ChallengeRewardType] ?? null;
}

export function isMissionRewardAvailable(rewardType: string): boolean {
  return missionRewardUnavailableReason(rewardType) === null;
}
