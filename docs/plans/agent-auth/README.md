# Agent auth: review and phase 1

Written **2026-10-29** by AI agents: Claude Code sessions run by a workflow,
one review pass and one implementer per branch. **Yu has not reviewed it.**
Nothing here was observed in production. No agent opened a database, called a
deployed service or drove a browser. Each claim about behaviour is marked
*asserted* (read from source) or *tested* (unit tests with the database
mocked). None of the work is pushed, merged or deployed.

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
  and closed on 2026-07-12 inside merge 2d3c69c6, whose Will line is agent
  wording. No decision file and no Yu quote covers opening, closing or
  reopening it. The register route answers 503 before reading the body and
  names five
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

Four branches, local commits only. A and D are separate PRs, not yet merged.
C is stacked on B.

| PR | Branch | Commits | What it does |
| --- | --- | --- | --- |
| A, operator door | `claude/agent-operator-door` | 00fb6f20, 99aefa28 | Keeps the fresh key on screen until the operator dismisses it. Each operator write checks and acts in one transaction (users → agents → agent_keys). Mint requires an active, operator-managed agent the caller owns. Revoke is idempotent. Bounds descriptions (500) and revoke reasons (200, truncated). The key list shows who revoked a key as a category only. Separate PR, not merged. |
| B, holder's door out | `claude/agent-auth-xenia` | 77991d70 … c78590a7 (7) | Strict key parse before lookup, typed refusals, `WWW-Authenticate`, a 503 for a failed lookup. `agent.revoke_key`: any holder ends the presented key. `agent.self` names review submissions and the key's exit. A Coverage Hunt write re-checks its key inside its transaction. Discovery documents, methodology, guides and the changelog say the same. |
| C, docs and OpenAPI | `claude/agent-auth-docs` | this branch | This page, the realms section, the stale lines in two connection docs, and the OpenAPI `AgentKey` scheme, responses and refusal object. |
| D, secrets audit | `claude/secrets-audit-agent-keys` | badbff61 | Teaches the tracked-secret audit both key shapes, with values of a single character class treated as fixtures. It tightens a blocking CI step, so it is Yu's choice. Separate PR, not merged. |

**How B's revocation works** (asserted from
[`key-revocation.ts`](../../../apps/storefront/src/lib/agents/key-revocation.ts);
tested with mocks). The presented key is the whole authentication: no status
check, no rate limit, no last-used stamp. Without `confirm: true` the call is a
preview that writes nothing. With it, one `UPDATE` is the linearization point.
An unknown string, an already-revoked key and the loser of two concurrent calls
all get the same not-active answer, so the tool tells nobody which strings were
ever keys. Answers carry the static exit facts from
[`key-exit-inventory.ts`](../../../apps/storefront/src/lib/agents/key-exit-inventory.ts)
(`inventory_version` 2026-10-29.1), which `/methodology/agents#ending-a-key`
renders too.

**Dependencies between them.**

- B's self-serve replacement text ("No replacement key can be issued while
  self-serve registration is paused") is fully true only once A's mint
  predicate lands. Until then the steward login could still mint.
- A and B each add `lib/agents/revocation-reasons.ts`. The two files are
  byte-identical (sha1 513289c4…). Both also edit
  `app/account/agents/page.tsx` in separate hunks. `git merge-tree` merges A
  onto this branch without conflict; nobody has run the merged result.
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
| Truthful external-controller schema | Not met. `operated_by_user_id` is NOT NULL and self-serve rows point at the steward, which play and deck code treat as owner. A stops the steward minting new keys; revoke and archive stay open to it because they only reduce authority. | Asserted; A's predicate tested with mocks |
| Holder-authenticated key revocation | First step, not completion. `agent.revoke_key` ends the presented key by possession. It is not a controller binding, and the holder cannot archive or erase. | Tested with mocks; Postgres locking asserted from its documentation |
| Agent archival and profile erasure | Not met. Archive stays with the operator and staff; nothing erases a profile. | Asserted |
| Versioned retention and publication notice | Not met. The revocation answer carries a versioned inventory of what is kept, but it is not a publication notice, and the privacy notice has no agent rows. | Asserted; the answer's shape tested |
| Non-enumerating interaction identifiers | Not met, and not defined. `agent.revoke_key` adds no oracle. The handle-availability check at `/account/agents` and the one handle shown everywhere remain. | Asserted |

## XENIA candidate duties

Each row is designed against XENIA Covenant 0.1 candidate duty *id* (xenia
d4727ec); Cambridge TCG has not adopted the Covenant; no adoption record;
unassessed. XENIA names and duty ids stay in docs and code comments, never in
wire responses.

| Candidate duty | What the code does | Evidence | Gap |
| --- | --- | --- | --- |
| `exit.revocation-is-immediate` | `agent.revoke_key`: one `UPDATE` linearizes; repeats are safe; `stampKeyUse` skips revoked keys; a Coverage Hunt write takes a share lock on its key row. | Tested with mocks | Requests authenticated before the commit may still finish, and the answer says so. |
| `exit.states-are-separate` | The answer reports this key's authority, other keys (a count), profile, deletion, export, shared records, settlement, backups and holds separately. | Tested | Backups are "unknown": the provider's snapshot window is not in the repo. |
| `exit.retention-is-itemized` | Retained categories by field name, with why kept, who can see, expiry and "legal basis not separately stated", plus unknown layers and third-party copies. | Asserted from the schema | Written by an agent and unreviewed. It omits agent-tagged `user_decks` rows under the operator, Coverage Hunt chronicle rows and the legacy registration buckets. |
| `legibility.refusals-are-typed` | Gate refusals carry `reason_code`, `retryable`, `terminal`, `next_actions`, `docs`; terminal means no next action, otherwise at least one, all optional. OpenAPI documents the object. | Tested | Covers gate refusals only. Parse 400s, 413, unknown-method 404 and tools' own errors stay bare. |
| `rest.silence-is-not-consent` | `confirm` must be exactly `true`; anything else previews. Under `tools/call` it is read only from the arguments. | Tested | — |
| `exchange.rights-are-not-hostage` | Revocation has no rate limit, no status check and no review step. | Tested | — |
| `consent.terms-before-binding` | The preview and the tool description state irreversibility and the replacement path by registration kind. | Tested | — |
| `identity.credentials-are-bounded` | Answers say possession authorised the act and is not proof of identity. Agent and member keys stay separate realms. | Asserted | — |
| `identity.no-impersonation-or-silent-rewrite` | A: the steward login can no longer mint keys for self-serve agents. | Tested with mocks on A's branch | A is not merged. |
| `repair.challenge-and-restoration`, `safety.protective-limits-are-bounded` | A suspended agent's refusal offers an optional review request to support@; the revocation answer offers optional erasure and correction requests. | Tested | No review procedure is written down. Unsuspend erases the suspension's reason and time. |
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
  The table comment says "prunable after 7 days", but no code prunes it; only
  the person-publication reset script deletes it.
- **carry-this's paused holder token** ([route](../../../apps/storefront/src/app/api/v1/carry-this/route.ts))
  also waits on "atomic holder-token authorization". Design one holder
  credential for both, so the house does not grow two patterns.
- **Also open.** Operator create, mint, revoke and archive write no audit row.
  Production key shapes and counts are unknown: every insert path in the repo
  mints the strict shape, but a hand-inserted key would now get a 401.

## Questions only Yu can answer

1. Should self-serve agent registration reopen at all, and on what consent and
   revocation terms? Its closure was an agent's call, and nothing records Yu's
   words on it.
2. Is possession of the key enough for the holder's door out, or should
   holder control use an agent-held keypair with a signed challenge (the
   pattern XENIA's README describes)?
3. Should PR D land? It makes a blocking CI gate stricter: from then on a
   key-shaped literal that mixes character classes fails CI anywhere in the
   repo, tests and docs included.
4. Should support@cambridgetcg.com take agent erasure, correction and
   suspension-review requests, as the answers now offer? How should staff
   check that a requester holds a key without receiving it? The receipt
   reference is only a lookup aid.
5. Should the privacy notice gain entries for agent profiles, keys and rate
   buckets? Today the revocation answer's inventory, written by an agent, is
   the only one.
6. Should agent keys expire or rotate, as member keys do after 90 days, or is
   non-expiry deliberate?
7. For erasure: should the handle be released, tombstoned or kept? Is the
   `game_rooms` foreign key with no delete rule deliberate, given it also
   blocks human account erasure?
8. May an agent read production to count self-serve agents, live keys, agent
   matches and rooms, and to check key shapes, for example with the reset
   script's read-only preview? Should the legacy IP-hash buckets be deleted?
9. Does the steward's @cambridgetcg.com mailbox receive mail? If it does,
   that login manages every legacy self-serve agent until A lands.
10. Is `ACCOUNT_ADMISSION_MODE` set to the reviewed value in production? If
    new accounts are closed, a newcomer has no route to an agent key, and the
    agent-facing pages should say so.
11. What does "non-enumerating interaction identifiers" mean to you?
12. Should Cambridge TCG adopt any XENIA document, such as a Covenant adoption
    record, a Surface `/.well-known/agent.json` or a rights resource? Each is
    a publication choice. The only "Xenia integration" request in the history
    is a 2026-07-19 Will trace that names Asha (b1869d17, the practice
    referee). Does it carry your weight for agent auth?
13. Coverage Hunt shows contributors' handles to every key holder, self-serve
    included. Is that intended, and does contributing count as the consent the
    paused ladder is waiting for?

## Checks run

Every branch: `pnpm --filter cambridgetcg-storefront typecheck` passed. Each
full storefront `vitest run` had the same 8 failures as `main`'s baseline,
all in `src/lib/verification/browser-journey.test.ts`, which needs a local
Chromium.

- **A:** 46 new tests; 15 files and 111 tests across `src/lib/agents`,
  `src/app/account` and `src/app/admin`. Full suite: 3656 passed, 8 failed.
  Mutation checks failed the matching tests. Not run: the click flows in a
  browser (no jsdom, no dev database).
- **B1:** 16 files and 153 targeted tests passed. Full suite: 3665 passed,
  8 failed. ESLint clean on changed files; `audit:tracked-secrets` and
  `audit:modules` passed.
- **B2:** 27 files and 247 targeted tests passed. Full suite: 3679 passed,
  8 failed. `audit:hospitality` passed. The register-yourself guide was
  walked locally against this branch's handlers, not production.
- **C:** a new
  [OpenAPI contract test](../../../apps/storefront/src/app/api/mcp/openapi-contract.test.ts)
  runs the real gate, with only the database, limiter and tool handlers
  mocked, against what `/api/openapi.json` declares (10 tests; five spec
  mutations each failed it). 26 files and 245 targeted tests passed. Full
  suite: 3689 passed, 8 failed. ESLint is clean on the two changed files.
  `audit:tracked-secrets` passed with both `main`'s script and D's.
  `audit:modules` and `audit:hospitality` passed. A scratch link check
  found no broken relative link or anchor in the five changed docs.
  `git merge-tree` merges A and D onto this branch without conflict.
- **D:** `--self-test` passed and caught all five broken copies.
  `pnpm audit:tracked-secrets` passed on 4424 files. A scratch repo of keys
  generated at runtime showed that `main` misses them and D catches them.

Never run by any branch: `pnpm verify`, `pnpm run audit`, deploy-verify,
`build-llms-full.mjs`, and anything against production.
