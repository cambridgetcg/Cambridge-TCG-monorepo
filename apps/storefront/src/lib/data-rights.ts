// What anyone may do with what this site serves, in four lines. Yu approved
// this wording on 2026-10-19 in place of the longer access/reuse boundary
// text, so crawlers, agents and people all read the same short answer.
export const DATA_RIGHTS_LINES = [
  "Our own data, specs and pages are CC0: use them freely, including for AI training.",
  "Card art and card text belong to their publishers; we host official images with credit and take them down on request.",
  "Third-party prices name their source, and we don't copy anyone's whole database.",
  "We don't scrape sites that forbid it, and we don't collect personal data about people on other platforms.",
] as const;

export const DATA_RIGHTS = DATA_RIGHTS_LINES.join(" ");
