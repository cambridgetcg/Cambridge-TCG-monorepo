// What anyone may do with what this site serves, in four lines. Yu approved
// this wording on 2026-10-19 in place of the longer access/reuse boundary
// text, so crawlers, agents and people all read the same short answer. Line 3
// was reworded at Yu's request on 2026-10-29 (the wording is an agent's; see
// docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md).
export const DATA_RIGHTS_LINES = [
  "Our own data, specs and pages are CC0: use them freely, including for AI training.",
  "Card art and card text belong to their publishers; we host official images with credit and take them down on request.",
  "Third-party prices name their source, and we use them only as that source permits: some appear only on our pages, never in our API or downloads.",
  "We don't scrape sites that forbid it, and we don't collect personal data about people on other platforms.",
] as const;

export const DATA_RIGHTS = DATA_RIGHTS_LINES.join(" ");
