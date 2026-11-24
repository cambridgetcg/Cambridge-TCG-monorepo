# Pictures, reports and removals: what was agreed on 2026-11-24

**Status:** decided by the owner on 2026-11-24, after agents read the whole
project that day and recommended next moves. The four decisions below are the
owner's, in the agent's plain words. The reading under them is the agents'.
The owner changes any of it by saying so.

## Decided

1. **English official pictures and rules text show again**, with their credit
   and their label. Japanese official pictures stay off until the owner says
   otherwise in a separate word (`OFFICIAL_IMAGES_JA`, off unless `show`).
2. **A check that only reports may be added without asking.** One that blocks
   a merge, a build or a page is still the owner's choice
   ([AGENTS.md](../../AGENTS.md), principle 8).
3. **The site may email the operator**, at most once a day, when something is
   newly wrong or someone wrote. The feedback door may open once that path has
   been seen to work.
4. **The recommended next moves may be done**, and code, modules and tests
   that are no longer needed may be removed.

## The agents' reading

- "No longer needed" means that a search, the typechecker and the tests found
  no use, and that a second reader went over each removal. Where only a count
  in the production database can settle it, the part stays and is listed for
  the owner.
- The code steps of RewardsPro's B5 (the retired `apps/rewardspro` and
  `rewardspro-api`) are covered. Its owner steps are not: environment names,
  keys, the schema, and the two frozen charges.
- Not covered, each needing a word of its own: production data, flags and
  migrations; the privacy notice; prices and anything that takes money;
  accounts, DNS, keys and spending.
