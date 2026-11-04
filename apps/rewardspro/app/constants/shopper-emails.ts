import type { Prisma } from "@prisma/client";
import { jsonObject } from "~/utils/json-object";
import { FEATURES_AVAILABLE } from "./feature-availability";

/**
 * Emails RewardsPro sends a shop's customers by itself. Campaigns and
 * automations are not here: the merchant writes those and sends or switches
 * each one on.
 *
 * Every kind is off for every shop until its merchant turns it on in Email
 * settings (routes/app.marketing.settings.tsx). The switches are stored in
 * EmailSettings.sendTimePrefs as `shopperEmails`; a kind that isn't stored as
 * on is off, so settings saved before the switches existed turn nothing on.
 * services/email-notifications.server.ts checks the switch before each send.
 */
export const SHOPPER_EMAIL_KINDS = [
  "welcome",
  "tierUp",
  "tierDown",
  "membershipReminder",
  "membershipEnded",
  "pointsEarned",
  "pointsExpiring",
  "pointsRedeemed",
  "streakMilestone",
] as const;

export type ShopperEmailKind = (typeof SHOPPER_EMAIL_KINDS)[number];

export type ShopperEmailSwitches = Record<ShopperEmailKind, boolean>;

/**
 * The switches Email settings shows: one for each email something in
 * RewardsPro sends today. The points email waits until points work. Nothing
 * sends the points-expiring, points-redeemed or streak emails yet, so they
 * have no switch and stay off.
 */
export const SHOPPER_EMAIL_SWITCHES: ReadonlyArray<{
  kind: ShopperEmailKind;
  label: string;
  helpText: string;
}> = [
  {
    kind: "welcome",
    label: "Welcome",
    helpText:
      "When a new customer is added to your store: at checkout, when they sign up, or when you or an import add them. Customers you already had don't get one.",
  },
  { kind: "tierUp", label: "Moved up a tier", helpText: "When a paid order moves a customer up a tier." },
  { kind: "tierDown", label: "Moved down a tier", helpText: "When a paid order moves a customer down a tier." },
  {
    kind: "membershipReminder",
    label: "Membership ending soon",
    helpText: "7 days and 1 day before a membership the customer bought (not a subscription) runs out.",
  },
  {
    kind: "membershipEnded",
    label: "Membership ended",
    helpText: "When a membership the customer bought (not a subscription) runs out.",
  },
  ...(FEATURES_AVAILABLE.points
    ? [{ kind: "pointsEarned" as const, label: "Points added", helpText: "When you add points to a customer's balance." }]
    : []),
];

/** The switches stored in EmailSettings.sendTimePrefs. Anything not stored as on is off. */
export function shopperEmailSwitches(sendTimePrefs: Prisma.JsonValue | undefined): ShopperEmailSwitches {
  const stored = jsonObject(jsonObject(sendTimePrefs).shopperEmails);
  return Object.fromEntries(
    SHOPPER_EMAIL_KINDS.map((kind) => [kind, stored[kind] === true]),
  ) as ShopperEmailSwitches;
}
