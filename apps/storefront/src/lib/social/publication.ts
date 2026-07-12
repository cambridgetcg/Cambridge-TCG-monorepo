export const PERSON_PUBLICATION_NOTICE_VERSION = "person-publication-v1";

export const PERSON_PUBLICATION_NOTICE_PATH = "/privacy#person-publication";

/**
 * Immutable text for the receipt version above. Change the version whenever
 * any promise in this object changes; publication receipts point to this exact
 * wording, while the rest of /privacy may continue to evolve.
 */
export const PERSON_PUBLICATION_NOTICE = Object.freeze({
  version: PERSON_PUBLICATION_NOTICE_VERSION,
  effective_from: "2026-07-11",
  profile:
    "Publishing your profile lets anyone view your username, display name, bio, avatar, pronouns, preferred form of address, tier and trust score, account age, follower, following and completed-trade counts, current seller vacation status and end date, selected showcase cards, and reviews that their reviewers separately published. Your email, internal account ID, delivery address, collection, wishlist, private notes and messages are not published by this choice.",
  messaging:
    "Enabling direct messages lets a signed-in visitor to your published profile start a conversation. Existing conversations can continue, and a person with a validated listing or trade context can start a relevant conversation, even when this setting is off. Blocks, suspension checks and rate limits still apply.",
  review:
    "Publishing a review lets anyone view its rating, comment, sub-ratings and date on the reviewed trader's public profile. Your reviewer label appears only while your own profile has a current publication receipt. The trade ID and price stay private.",
  withdrawal:
    "Turning a publication choice off stops Cambridge TCG serving it publicly. It cannot recall a copy that someone already fetched while it was public.",
});
