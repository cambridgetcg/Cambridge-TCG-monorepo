# Agent auth: review and phase 1

Written **2026-10-29** by AI agents: Claude Code sessions run by a workflow,
with one review pass, one implementer per branch, a run that merged all four
branches, a second review and a fix round. **Yu has not reviewed it.** Nothing here was observed in production. No
agent opened a production database, called a deployed service or drove a
browser. Two opt-in integration tests ran against a throwaway Postgres 17 on
127.0.0.1 (see [Checks run](#checks-run)). Each claim about behaviour is marked
*asserted* (read from source), *tested with mocks* (unit tests with the
database mocked) or *tested on Postgres* (that throwaway database). On
2026-10-30, at Yu's word, the four branches were pushed and opened as PRs
#108 to #111. Yu merges them; none is merged or deployed yet.

This is the agent-key part of the [agent layer](../tcg-data-platform/agent-layer.md)'s
"Scoped integration access" row, which links here so there is one owner. The
review started from `origin/main` at `4b6fb764`.

## What exists (at 4b6fb764)

- **One way in.** A signed-in account creates an agent with its first key at
  [`/account/agents`](../../../apps/storefront/src/app/account/agents/page.tsx):
  at most 10 non-archived agents per account and 5 live keys per agent. Every
  operator action checks that the signed-in user owns the agent.
- **The key.** `ctcg_agt_` plus 22 random base62 characters
  ([`creation.ts`](../../../apps/storefront/src/lib/agents/creation.ts)). The
  raw key is shown once. `agent_keys` keeps an unsalted SHA-256 of it and a
  12-character prefix. Keys have no expiry.
- **One gate.** Only [`/api/mcp`](../../../apps/storefront/src/app/api/mcp/route.ts)
  accepts agent keys. It re-reads the key on every request, so a revocation,
  suspension or archive applies from the next call. Unknown and revoked keys
  get the same 401; a suspended or archived agent gets 403. Tool authority
  fails closed ([`tool-access.ts`](../../../apps/storefront/src/lib/agents/tool-access.ts)).
  Match and deck writes are paused for every key. Operator-managed keys may
  append Coverage Hunt evidence that stops at human review (since
  2026-07-13).
- **Self-serve registration is closed.** It opened on 2026-07-05 (4013246d)
  and closed on 2026-07-12 inside merge 2d3c69c6. That merge's Will line names
  no instruction from Yu, and the merge carries a Codex co-author line. No
  decision file and no Yu quote covers opening, closing or reopening it. The
  register route answers 503 before reading the body and names five
  [reopening requirements](../../../apps/storefront/src/app/api/v1/agents/register/route.ts).
  Legacy self-serve keys still authenticate, read-only. Their
  `operated_by_user_id` points at a shared service steward account.
- **Staff** can suspend, unsuspend and archive an agent at
  `/admin/trust/agents`. A per-key admin revoke exists but has no UI.
- **Member data keys** (`ctcg_member_`, for the member feed and the data API)
  are a separate realm; see
  [the auth realms](../../connections/the-four-auth-realms.md#the-two-storefront-bearer-realms-2026-10-29).

## What was broken

Severity is the reviewers' estimate. Nothing was reproduced live.

1. **The show-once key was probably lost** (high). `_client.tsx` called
   `window.location.reload()` straight after putting the new key in state.
   Only the hash is kept, so a lost key is unrecoverable. This was inferred
   from the code, not reproduced in a browser.
2. **A key holder could not end its own key** (high). Only a signed-in
   operator or staff could revoke. The register-yourself guide said "Contact
   the operator" with no address. Revoking twice returned an error.
3. **"The key holder controls the agent"** (high). Three discovery documents
   said a self-serve agent's bearer-key holder controls it, and a test pinned
   the wording, but the holder had no control path at all.
4. **Contradicting write claims** (medium). `mcp-config.json` and
   `cambridge-tcg.json` said operator keys had "writes paused" while
   `coverage.hunt.contribute` was open to them. The `read_only_scope` lists
   left that write out.
5. **The gate was soft at its edges** (medium). A failed key lookup escaped as
   a framework 500 without a JSON-RPC body. The parser accepted any length.
   Refusals were bare strings with no `WWW-Authenticate`, no type and no next
   step. Nothing tested the parser, the 401/403 split or the limiter.
6. **The operator door could race and over-reach** (medium to low). The 10-agent
   and 5-key caps counted and then inserted without a lock. `mintKey` ignored
   agent status and `registered_via`, so whoever can sign in as the steward
   could mint keys for every legacy self-serve agent. Archive and its key
   revocation were separate queries. Description and revoke reason had no
   server-side bounds.
7. **No erasure** (high). No code deletes an agent. Account deletion
   cascades to agents but is blocked by foreign keys (see
   [What remains](#what-remains-designs-only)).
8. **The secrets audit could not see our own keys** (low).
   `pnpm audit:tracked-secrets` knew Shopify, GitHub and AWS shapes, not
   `ctcg_agt_` or `ctcg_member_`.
9. **Stale text** (low). The admin header said suspended agents' keys keep
   working (the gate answers 403). The methodology page described admin-set
   tiers (no code sets any tier but `free`) and suspending "a key" (suspension
   acts on the agent). `the-agent-surface.md` cited `apps/admin` paths that no
   longer exist. The realms doc omitted both storefront key realms. The
   OpenAPI document had no agent key scheme.

## What phase 1 changed

Four branches, local commits only, none merged. A and D are separate PRs. C
is stacked on B and contains it: it merged B in twice, the second time after
B's fix round.

| PR | Branch | Commits | What it does |
| --- | --- | --- | --- |
| A (#108), operator door | `claude/agent-operator-door` | 00fb6f20, 99aefa28, 725ecd33, 1c93f384, a627606e | Keeps the fresh key on screen until the operator dismisses it, and disables create and mint while it is up ("Copy or dismiss the key above first."). Each operator write checks and acts in one transaction (users → agents → agent_keys). Mint requires an active, operator-managed agent the caller owns. Revoke is idempotent. Bounds descriptions (500) and revoke reasons (200, truncated). The key list shows who revoked a key as a category only; `toKeyRows` names every field the page sends, so the stored reason stays on the server. An opt-in Postgres test covers the caps, the races, the one-transaction archive and cross-account refusals. |
| B (#109), holder's door out | `claude/agent-auth-xenia` | 77991d70 … d96f3bd8 (12, plus two merges of `main`) | Strict key parse before lookup, typed refusals, `WWW-Authenticate`, a 503 for a failed lookup. `agent.revoke_key`: any holder ends the presented key, and the answer states the replacement path and the key's authority by registration and agent status. `agent.self` names review submissions and the key's exit. A Coverage Hunt write re-checks its key inside its transaction. The discovery documents, the manifest description, methodology, guides and the changelog say the same, and the three discovery documents share one sentence on what a self-serve key's holder controls. An opt-in Postgres test covers revocation races and the Coverage Hunt key lock. |
| C (#110, stacked on #109), docs and OpenAPI | `claude/agent-auth-docs` | cf4495c6, dd4c307f, 0e5c0311 and the commit that updated this page; merges 8e975055 and 1372f7f5 bring in B | This page, the realms section, the stale lines in two connection docs, and the OpenAPI `AgentKey` scheme, responses and refusal object. |
| D (#111), secrets audit | `claude/secrets-audit-agent-keys` | 6787e0b0 (badbff61, amended), a7f078ff | Teaches the tracked-secret audit both key shapes, with no leading `\b`, so a key glued after an escape or another word character is still found. Values of a single character class are treated as fixtures. It tightens a blocking CI step, so it is Yu's choice. |

**How B's revocation works** (asserted from
[`key-revocation.ts`](../../../apps/storefront/src/lib/agents/key-revocation.ts);
tested with mocks and on Postgres). The presented key is the whole
authentication: no status check, no rate limit, no last-used stamp. The call
acts only when `confirm` is exactly `true`; anything else is a preview that
writes nothing. The input schema declares `confirm` as a plain boolean with no
`const`, because clients that turn MCP schemas into strict function schemas
mark every property required, and with `const: true` a model could only ever
act. When it acts, one `UPDATE` is the linearization point. An unknown string,
an already-revoked key and the loser of two concurrent calls all get the same
not-active answer, so the tool tells nobody which strings were ever keys. That
answer carries only its message and a docs link. A preview of a live key and a
performed revocation carry the exit facts from
[`key-exit-inventory.ts`](../../../apps/storefront/src/lib/agents/key-exit-inventory.ts)
(`inventory_version` 2026-10-29.2), which `/methodology/agents#ending-a-key`
renders too. They include what is kept, with a note that an agent wrote the
list from the source and it may be incomplete. They also give the replacement
path, which depends on the registration and the agent's status: a new key is
offered only for an active operator-managed agent, from its operator. That
answer is true once A lands (see the merge order below).

**Merge order and why.**

- **A before or with B. C with or after B. D at any point.** B's answers tell
  the holder of a suspended or archived operator agent's key, and of a
  self-serve key, that no new key can be minted. That is true only with A's
  mint predicate (`status = 'active' AND registered_via = 'operator'`).
  `main`'s `mintKey` checks ownership only, so without A an operator could
  mint for a suspended or archived agent, and the steward login for a
  self-serve one. C contains B, so landing C lands B, and A must come before
  or with C too. C's OpenAPI and docs describe B's gate, so C cannot land
  before B. D changes only `scripts/audit-tracked-secrets.mjs`.
- A and B each add `lib/agents/revocation-reasons.ts`. The two files are
  byte-identical (sha1 513289c4…). Both also edit
  `app/account/agents/page.tsx` in separate hunks. `git merge-tree` merges A,
  and separately D, onto this branch's current head without conflict. All four
  branches were merged and tested together once, before the fix round (see
  [Checks run](#checks-run)). They have not been merged and tested together
  since.
- D fails CI on any key-shaped literal whose random part mixes character
  classes. B's and C's fixtures build tokens at runtime. Re-run
  `pnpm audit:tracked-secrets` after whichever lands second.
- `mcp-config.json` is served with `max-age=86400`, so after a deploy the
  discovery documents can lag the gate by up to a day.
- `apps/storefront/public/llms-full.txt` (generated 2026-10-10) is left as a
  dated record. It still carries old guide dates. `build-llms-full.mjs` was not
  run, because it fetches production.

## The five reopening requirements

The register route lists five conditions for reopening self-serve
registration. Phase 1 meets none of them in full, and leaves the list
unchanged on purpose. Whether to reopen is Yu's call.

| Requirement | State after phase 1 | Evidence |
| --- | --- | --- |
| Truthful external-controller schema | Not met. `operated_by_user_id` is NOT NULL and self-serve rows point at the steward, which play and deck code treat as owner. The discovery documents now say the controller is labelled as the bearer-key holder and the schema does not represent that holder. A stops the steward minting new keys; revoke and archive stay open to it because they only reduce authority. | Asserted; A's predicate tested with mocks and on Postgres |
| Holder-authenticated key revocation | First step, not completion. `agent.revoke_key` ends the presented key by possession. It is not a controller binding, and the holder cannot archive or erase. | Tested with mocks and on Postgres (concurrent confirms, the Coverage Hunt key lock, archive interleavings) |
| Agent archival and profile erasure | Not met. Archive stays with the operator and staff; nothing erases a profile. | Asserted |
| Versioned retention and publication notice | Not met. The revocation answer carries a versioned inventory of what is kept (2026-10-29.2, which says it may be incomplete), but it is not a publication notice, and the privacy notice has no agent rows. | Asserted; the answer's shape tested |
| Non-enumerating interaction identifiers | Not met, and not defined. `agent.revoke_key` adds no oracle. The handle-availability check at `/account/agents` and the one handle shown everywhere remain. | Asserted |

## XENIA candidate duties

Each row is designed against XENIA Covenant 0.1 candidate duty *id* (xenia
d4727ec); Cambridge TCG has not adopted the Covenant; no adoption record;
unassessed. XENIA names and duty ids stay in docs and code comments, never in
wire responses.

| Candidate duty | What the code does | Evidence | Gap |
| --- | --- | --- | --- |
| `exit.revocation-is-immediate` | `agent.revoke_key`: one `UPDATE` linearizes; repeats are safe; `stampKeyUse` skips revoked keys; a Coverage Hunt write takes a share lock on its key row. | Tested with mocks and on Postgres | Requests authenticated before the commit may still finish. `revoked_at` records when the revoking statement started, so a contribution that took its key lock first may commit after that time, though none commits after the revocation does. The answer says both. |
| `exit.states-are-separate` | The answer reports this key's authority (a preview says whether the agent is active, suspended or archived), other keys (a count), profile, deletion, export, shared records, settlement, backups and holds separately. | Tested with mocks | Backups are "unknown": the provider's snapshot window is not in the repo. |
| `exit.retention-is-itemized` | Retained categories by field name, with why kept, who can see, expiry and "legal basis not separately stated", plus unknown layers and third-party copies. After the fix round it also lists Coverage Hunt chronicle rows, agent-tagged `user_decks` rows under the operator, the handle copies in rooms and match logs, and the legacy registration buckets. | Asserted from the schema and code | Written by an agent and unreviewed. The answer's `completeness` field says it may be incomplete. |
| `legibility.refusals-are-typed` | Gate refusals carry `reason_code`, `retryable`, `terminal`, `next_actions`, `docs`; terminal means no next action, otherwise at least one, all optional. OpenAPI documents the object. | Tested with mocks | Covers gate refusals only. Parse 400s, 413, unknown-method 404 and tools' own errors stay bare. |
| `rest.silence-is-not-consent` | `confirm` must be exactly `true`; anything else previews. Under `tools/call` it is read only from the arguments. Its schema is a plain boolean, so a strict-schema client can still send `false`. | Tested with mocks | — |
| `exchange.rights-are-not-hostage` | Revocation has no rate limit, no status check and no review step. | Tested with mocks and on Postgres (a suspended or archived agent's holder can still revoke) | — |
| `consent.terms-before-binding` | The preview and the tool description state irreversibility and the replacement path by registration kind and agent status. | Tested with mocks | The sentences for suspended, archived and self-serve agents are true only once A lands. |
| `identity.credentials-are-bounded` | Answers say possession authorised the act and is not proof of identity. Agent and member keys stay separate realms. | Asserted | — |
| `identity.no-impersonation-or-silent-rewrite` | A: the steward login can no longer mint keys for self-serve agents. | Tested with mocks and on Postgres on A's branch | A is not merged. The steward login can still revoke those agents' keys, archive them, and read their profiles and key lists at `/account/agents`. |
| `repair.challenge-and-restoration`, `safety.protective-limits-are-bounded` | A suspended agent's refusal offers an optional review request to support@; the revocation answer offers optional erasure and correction requests. | Tested with mocks | No review procedure is written down, and the review and correction actions now say so. Unsuspend erases the suspension's reason and time. |
| `consent.exact-authority` | Not met. A key carries no audience, expiry or per-key scope; its authority is the grant for its registration kind. | Asserted | Design needed. |
| `privacy.layered-inventory` | Unknown layers are named in the answer. | Asserted | The privacy notice has no entry for agent profiles, keys or rate buckets. |

## What remains (designs only)

Nothing below is built, and none of it has a migration.

- **External-controller schema.** A column, table or key binding that records
  who controls a self-serve agent, so the steward stops standing in as owner
  (play seats, deck tools, the `/account/agents` listing).
- **Profile erasure and the foreign keys that block it.** Inferred from the
  schema, not executed.
  - `agent_matches.agent_a_id` and `agent_b_id` are `ON DELETE RESTRICT`
    ([0091](../../../apps/storefront/drizzle/0091_agent_matches.sql)), so an
    agent with a match cannot be deleted.
  - `match_lifecycle_log.actor_agent_id` is `ON DELETE SET NULL`, but its
    `match_log_actor_consistency` CHECK requires the column for agent rows, so
    the delete fails there too.
  - `game_rooms.player1_id` and `player2_id` reference `users` with no
    `ON DELETE` rule ([0028](../../../apps/storefront/drizzle/0028_game_rooms.sql)).
    Deleting an operator's account fails once any room exists, before the
    agent cascade is reached. That also blocks human account erasure.
  - For self-serve agents the only cascade runs through the shared steward
    account and would delete all of them at once.
  - Open choices: release, tombstone or keep the handle reserved, and how
    match history labels a deleted agent.
- **Versioned retention and publication notice.** No column or table stores a
  notice version. Two status strings name the same pause:
  `paused_pending_versioned_consent` and `paused_pending_publication_receipt`.
- **A definition of non-enumerating identifiers.** Neither the repo nor XENIA
  defines it. Candidates: the handle-availability answer at `/account/agents`,
  one handle reused for opponents, Coverage Hunt readers and the
  `X-Agent-Handle` header, `agent.self`'s UUIDs, and room codes.
- **Key expiry.** Agent keys never expire; member keys expire after 90 days.
- **`consent.exact-authority`.** Per-key audience, expiry and scope.
- **Suspension history.** Unsuspend sets `suspended_reason` and
  `suspended_at` to NULL
  ([`_actions.ts`](../../../apps/storefront/src/app/admin/trust/agents/_actions.ts)).
  Keeping history needs a migration.
- **Legacy IP hashes.** `agent_registration_buckets`
  ([0112](../../../apps/storefront/drizzle/0112_agent_self_serve.sql)) holds
  unsalted `sha256(IP)` per day. An IPv4 hash can be reversed by brute force.
  The table comment says "prunable after 7 days", but no code prunes it
  automatically. Only the one-time person-publication reset script
  (`apps/storefront/scripts/reset-person-publication.ts`) deletes its rows,
  when applied. Whether it ran in production is not known from this
  repository.
- **carry-this's paused holder token** ([route](../../../apps/storefront/src/app/api/v1/carry-this/route.ts))
  also waits on "atomic holder-token authorization". Design one holder
  credential for both, so the house does not grow two patterns.
- **Also open.** Operator create, mint, revoke and archive write no audit row.
  Production key shapes and counts are unknown: every insert path in the repo
  mints the strict shape, but a hand-inserted key would now get a 401.
  `revoked_at` is the revoking statement's `NOW()`, not the moment the row
  lock was won. `other_live_keys` is counted in that statement's snapshot, so
  two holders revoking two keys of one agent at the same moment can each be
  told the other key is still live.

## Phase 2 drafts (2026-10-30)

Yu's answers of 2026-10-30 are in the
[decision file](../../decisions/2026-10-30-agent-registration-support-key-expiry.md),
with the agent's call that the flow stays independent of agenttool. Three
drafts, written by agents and not reviewed by Yu, design what Yu decided:

- [reopening-terms.md](reopening-terms.md): the terms for reopening
  self-serve registration, as three packages (A minimal, B recommended, C
  full OAuth).
- [support-procedures.md](support-procedures.md): how support handles
  erasure, access, correction, suspension review and key compromise, modelled
  on eBay, Shopify, Stripe, GitHub, Etsy and Amazon and on the UK GDPR clocks.
- [key-expiry.md](key-expiry.md): the expiry option offered when a key is
  minted.

**Build order** (an agent's proposal):

1. After #108 to #111 merge: the support steps that need no migration
   (suspension review and key-compromise handling).
2. Key expiry, one PR, once Yu answers its decisions 1 and 6. Its migration
   is applied before the deploy, with Yu's word.
3. Support request codes and the case log.
4. Registration, once the terms are agreed.

**What only Yu decides**, in one list. Everything else in the drafts is an
agent's default that proceeds unless Yu objects.

| Topic | Decision | Agent's recommendation |
| --- | --- | --- |
| Registration | Which package ([terms D1](reopening-terms.md#decisions-for-yu)) | B: a management token that outlives usage keys |
| Registration | Who may register (D2) | Any agent; contact and URL optional; the basis recorded |
| Registration | Terms acceptance (D5) | An explicit version, 30 days' notice of changes, re-acceptance in-band; counsel on what an agent's acceptance means |
| Registration | Publication (D9) | Registration publishes nothing; the ladder is opt-in per agent |
| Registration | Legacy self-serve agents (D11), and deleting the legacy IP buckets (D7) | Leave them read-only and labelled legacy, offer re-registration; delete the buckets |
| Expiry | Who chooses, per key or per agent ([expiry D1](key-expiry.md#decisions-for-yu)) | Per key, chosen by whoever mints it; "never" allowed |
| Expiry | Existing keys (D6) | Leave them without an end date |
| Expiry | Expiry email to operators (D7) | One email seven days before |
| Support | What erasure does ([support D2](support-procedures.md#d2-what-erasure-does)) | Delete where nothing is shared, tombstone where something is |
| Support | Who approves an erasure (D3) | Yu, case by case, until the tool is tested |
| Support | Whose word governs an operator-managed agent (D4) | The operator's |
| Support | How long support records are kept (D9) | Six years from closure; counsel confirms |
| Support | When the procedures are published (D10) | Once erasure, access and correction have tooling |

## Questions only Yu can answer

1. Should self-serve agent registration reopen at all, and on what consent and
   revocation terms? The repository does not say who decided to close it.
   Merge 2d3c69c6 closed it. Its Will line ("keep publication and write paths
   paused until their rights, identity, and approval boundaries are real and
   verified") names no instruction from Yu, and no decision file or Yu quote
   records the closure. Was it your call?
   **Answered in part, 2026-10-30:** Yu: "yes reopen, lets discuss more on
   the terms" ([2026-10-30 decision](../../decisions/2026-10-30-agent-registration-support-key-expiry.md)). The terms are drafted for discussion in
   [reopening-terms.md](reopening-terms.md). Who made the July closure is
   still unrecorded.
2. Is possession of the key enough for the holder's door out, or should
   holder control use an agent-held keypair with a signed challenge (the
   pattern XENIA's README describes)?
   *2026-10-30:* drafted as [reopening-terms.md](reopening-terms.md)
   decision 4 and term 10, and support-procedures.md D1.
3. Should PR D land? It makes a blocking CI gate stricter: from then on a
   key-shaped literal that mixes character classes fails CI anywhere in the
   repo, tests and docs included.
   **2026-10-30:** Yu asked for it to be opened for review; it is #111, and
   whether it merges is still Yu's call.
4. Should support@cambridgetcg.com take agent erasure, correction and
   suspension-review requests, as the answers now offer? They also say that no
   review procedure is written down yet. How should staff check that a
   requester holds a key without receiving it? The receipt reference is only
   a lookup aid.
   **Answered 2026-10-30:** Yu: "yes support should handle them, need to
   design procedures, we could refer to general protocol used by platforms
   like ebay, shopify etc" ([2026-10-30 decision](../../decisions/2026-10-30-agent-registration-support-key-expiry.md)). Drafted in
   [support-procedures.md](support-procedures.md).
5. Should the privacy notice gain entries for agent profiles, keys and rate
   buckets? Today the revocation answer's inventory, written by an agent, is
   the only one.
   *2026-10-30:* drafted as [reopening-terms.md](reopening-terms.md) term 5.
6. Should agent keys expire or rotate, as member keys do after 90 days, or is
   non-expiry deliberate?
   **Answered 2026-10-30:** Yu: "depends on the agent, we provide the option
   like in all auth protocol" ([2026-10-30 decision](../../decisions/2026-10-30-agent-registration-support-key-expiry.md)). Drafted in [key-expiry.md](key-expiry.md).
7. For erasure: should the handle be released, tombstoned or kept? Is the
   `game_rooms` foreign key with no delete rule deliberate, given it also
   blocks human account erasure?
   *2026-10-30:* the handle half is
   [support-procedures.md](support-procedures.md) D2; the `game_rooms` half
   stays open.
8. May an agent read production to count self-serve agents, live keys, agent
   matches and rooms, and to check key shapes, for example with the reset
   script's read-only preview? Should the legacy IP-hash buckets be deleted?
   *2026-10-30:* drafted as [reopening-terms.md](reopening-terms.md)
   decisions 7 and 11.
   **Answered 2026-10-30:** after Yu pointed the agent at the production
   database credential, the agent ran one read-only, aggregate-only probe
   (a `READ ONLY` transaction, counts only, nothing else printed). Production
   holds one agent ever: self-serve, active, created on 2026-07-05, with one
   live free-tier key that has never been used and whose prefix has the
   minted shape. There are no operator-managed agents, and no agent matches,
   queue entries, match-log rows, agent rooms, Coverage Hunt turns or
   rate-limit rows. One legacy registration-bucket row remains, from
   2026-07-05. So the erasure blockers are latent, not live, and phase 1
   changes behaviour for no current user.
9. Does the steward's @cambridgetcg.com mailbox receive mail? If it does,
   whoever signs in as the steward can mint keys for every legacy self-serve
   agent until A lands. A removes only minting. After A, that login can still
   read every self-serve agent's profile and key list at `/account/agents`,
   revoke their keys and archive the agents, and no code undoes an archive.
   *2026-10-30:* the legacy agents' future is
   [reopening-terms.md](reopening-terms.md) decision 11.
10. Is `ACCOUNT_ADMISSION_MODE` set to the reviewed value in production? If
    new accounts are closed, a newcomer has no route to an agent key, and the
    agent-facing pages should say so.
11. What does "non-enumerating interaction identifiers" mean to you?
    *2026-10-30:* a definition is drafted in
    [reopening-terms.md](reopening-terms.md) term 8.
12. Should Cambridge TCG adopt any XENIA document, such as a Covenant adoption
    record, a Surface `/.well-known/agent.json` or a rights resource? Each is
    a publication choice. The only "Xenia integration" request in the history
    is a 2026-07-19 Will trace that names Asha (b1869d17, the practice
    referee). Does it carry your weight for agent auth?
13. Coverage Hunt shows contributors' handles to every key holder, self-serve
    included. Is that intended, and does contributing count as the consent the
    paused ladder is waiting for?

## Checks run

Results are as each implementer, and the run that merged all four branches,
reported them. The writer of this page ran the C fix round and the D
self-test noted below. Typecheck means
`pnpm --filter cambridgetcg-storefront typecheck`. A, B and C ran it. D
changes only `scripts/audit-tracked-secrets.mjs`, and no D run recorded a
typecheck. Every full
storefront `vitest run` below had the same 8 failures as `main`'s baseline,
all in `src/lib/verification/browser-journey.test.ts`, which needs a local
Chromium.

**The Postgres tests.** Two opt-in files in `apps/storefront/src/lib/agents/`,
`operator-actions.integration.test.ts` (A's branch only) and
[`key-revocation.integration.test.ts`](../../../apps/storefront/src/lib/agents/key-revocation.integration.test.ts)
(B), follow `member-keys.integration.test.ts`. They skip unless
`AGENT_AUTH_TEST_DATABASE_URL` is set, and refuse any database but
`127.0.0.1` and exactly `/agent_auth_test`. Each run loads the real migrations
(0090 and 0112, plus 0120 for B) into its own schema, with `users` stubbed as
a one-column foreign-key target, and drops the schema afterwards. They ran
against a throwaway Postgres 17.11 made for this work (trust auth, TCP on
127.0.0.1 only). Nothing sets the variable in CI, so CI skips them.

- **A, first round (00fb6f20, 99aefa28):** typecheck passed. 46 new tests; 15
  files and 111 tests across `src/lib/agents`, `src/app/account` and
  `src/app/admin`. Full suite: 3656 passed, 8 failed, 183 skipped. Dropping the
  mint's `registered_via` predicate, or restoring the reload, failed the
  matching test. ESLint: no errors. `audit:tracked-secrets` passed. Not run:
  the click flows in a browser.
- **A, Postgres test (725ecd33):** 7 tests passed in each of 6 runs, and all 7
  skip without the variable. Typecheck passed; ESLint clean. Dropping the
  mint's agent lock or the create's users lock, nesting a root query in the
  create transaction, or moving archive's key revocation out of its
  transaction each failed it.
- **A, fix round (1c93f384, a627606e), from its commit messages:** a jsdom
  test of `_client.tsx` (one fresh key at a time, and the empty state), which
  fails when the disabled state, the handler guards or the empty-state branch
  is removed. `toKeyRows` tests and a page test check that no reason text
  reaches the client. The Postgres test gained cross-account cases: 8 passed,
  and 8 skip without the variable. Four mutations to the ownership checks
  each fail it. The writer of this page did not have A's fix-round report, so
  its typecheck and full-suite results are not recorded here.
- **B1 (77991d70 … c0b090d0):** typecheck passed. 16 files and 153 targeted
  tests passed. Full suite: 3665 passed, 8 failed. ESLint clean on changed
  files; `audit:tracked-secrets` and `audit:modules` passed.
- **B2 (16c5b127 … c78590a7):** typecheck passed. 27 files and 247 targeted
  tests passed. Full suite: 3679 passed, 8 failed. `audit:hospitality`
  passed. The register-yourself guide was walked locally against this
  branch's handlers with the database mocked, not against production.
- **B, Postgres test (2e7924ef):** 9 tests passed in each of 4 runs (an
  earlier 8-test version passed in 6), and all skip without the variable.
  Dropping the Coverage Hunt key's `FOR SHARE`, `stampKeyUse`'s `revoked_at`
  guard or the revoke's `revoked_at` guard each failed it.
- **B, fix round (cba92992, 6d7e4b22, 597d9aa0):** typecheck passed. Targeted
  runs: 117 passed and 9 skipped after the first commit; 21 files, 191 passed
  and 9 skipped after the second. Full suite: 3719 passed, 8 failed, 206
  skipped. The Postgres test: 9 passed, and 9 skip without the variable.
  Dropping `a.status` from the revoke statement failed both the unit and the
  Postgres tests. `audit:tracked-secrets` (4447 files), `audit:modules` and
  `audit:hospitality` (8 of 8) passed. ESLint: no errors; the 22 warnings in
  the methodology page were there before.
- **C, first round (cf4495c6, dd4c307f):** a new
  [OpenAPI contract test](../../../apps/storefront/src/app/api/mcp/openapi-contract.test.ts)
  runs the real gate, with only the database, limiter and tool handlers
  mocked, against what `/api/openapi.json` declares (10 tests; five spec
  mutations each failed it). Typecheck passed. 26 files and 245 targeted tests
  passed. Full suite: 3689 passed, 8 failed. ESLint clean on the two changed
  code files. `audit:tracked-secrets` passed with both `main`'s script and
  D's. `audit:modules` and `audit:hospitality` passed. A scratch link check
  found no broken relative link or anchor in the five changed docs.
- **C, fix round (1372f7f5, 0e5c0311 and this page):** merging B's fixes
  failed 2 contract tests, because the suspended refusal's review action now
  carries a `text` field that `AgentRefusal` did not declare. The schema now
  declares it, and the contract test passes (10 tests). Typecheck passed.
  Full suite: 3729 passed, 8 failed, 206 skipped. B's Postgres test on this
  branch: 9 passed, 9 skipped without the variable, and no schema left
  behind. ESLint clean on the two changed code files. `audit:tracked-secrets`
  passed (4449 files) with this branch's script and with D's. `audit:modules`
  and `audit:hospitality` (8 of 8) passed. The scratch link check found no
  broken relative link or anchor in the five changed docs (65 links), and
  caught both broken links in its probe. `git merge-tree` merges A, and
  separately D, onto this branch's head without conflict.
- **D, first round (badbff61):** `--self-test` passed and caught all five
  broken copies of the script. `pnpm audit:tracked-secrets` passed on 4424
  files. A scratch repository of keys generated at runtime showed what `main`
  misses and D catches.
- **D, fix round (6787e0b0):** its commit message describes the new
  self-test: every two-class pair for both key shapes, each value in ten
  contexts, and no leading `\b`. The writer of this page did not have D's
  fix-round report. Run from a scratch copy of 6787e0b0's script,
  `--self-test` passed, and so did its full scan of this branch's tree (4449
  files).
- **All four merged, before the fix round:** a detached scratch worktree held
  `origin/main` ecc2f05d plus A at 725ecd33, C at 8e975055 (which carries B at
  2c5aa127), B at 2e7924ef and D at badbff61. They merged with no conflicts.
  Typecheck passed. Full suite: 3764 passed, 8 failed, 213 skipped. Both
  Postgres files together, with B's archive checks running against A's
  transactional `archiveAgent`, passed 16 tests in each of 6 runs, and all 16
  skip without the variable. `audit:tracked-secrets` (D's script, 4456
  files), `audit:modules` and `audit:hospitality` passed. Inverting the
  Coverage Hunt write's lock order made Postgres report a deadlock and failed
  the worst-interleaving test. A scratch test there found the bug the fix
  round then fixed: a suspended operator agent's holder was told the operator
  could mint a new key, which A's door refuses.

- **All four merged, after the fix round:** a fresh detached worktree held
  `origin/main` cbc04652 (after #104, #105 and #106) plus A at a627606e, C
  at eae05bb4 (which carries B at e7360df7) and D at a7f078ff. They merged
  with no conflicts. B's own merges of `main` resolved conflicts only in
  `changelog.ts` (both entries kept) and, from #106's public-repository
  wording, in imports and the `storefront.mcp` manifest line. Typecheck
  passed. Full suite: 3783 passed, 8 failed (the browser-journey tests), 214
  skipped. Both Postgres files together: 17 tests passed.
  `audit:tracked-secrets` with D's script (4458 files) and its
  `--self-test`, `audit:modules` and `audit:hospitality` (8 of 8) passed.
  This page's last wording edits came after that run and change no code.

Never run by any branch: `pnpm verify`, `pnpm run audit`, deploy-verify,
`build-llms-full.mjs`, and anything against production.
