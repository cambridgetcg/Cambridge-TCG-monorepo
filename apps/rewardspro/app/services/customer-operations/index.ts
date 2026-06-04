/**
 * Customer Operations — public surface.
 *
 * Used by admin routes / CLIs / support tooling to answer the
 * universal merchant question: "what happened to this customer's
 * loyalty state, and when?"
 */
export { getCustomerJourney } from "./journey";
export { mergeTimeline } from "./merge";
export type { TimelineSources } from "./merge";
export type {
  TimelineEvent,
  TimelineEventType,
  CustomerJourneyReport,
  CurrentState,
  JourneyOptions,
} from "./types";
