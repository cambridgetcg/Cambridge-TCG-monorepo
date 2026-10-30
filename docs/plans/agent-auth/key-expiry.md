# Agent key expiry: an option per key

**Status.** Written **2026-10-30** by an AI agent: a Claude Code subagent run
by a workflow in session 99296f25. **Yu has not reviewed it.** It is a draft
for discussion. It decides nothing, and nothing in it is built.

- **Yu's word.** On 2026-10-30, verbatim, recorded in the
  [decision file](../../decisions/2026-10-30-agent-registration-support-key-expiry.md):

  > 1. yes reopen, lets discuss more on the terms 2. yes support should handle
  > them, need to design procedures, we could refer to general protocol used by
  > platforms like ebay, shopify etc 3. depends on the agent, we provide the
  > option like in all auth protocol

  Point 3 is the subject of this page: agent keys get an expiry option rather
  than one fixed lifetime for everyone.
- **An agent's proposal.** Everything else here: how to read point 3, the
  options, the defaults, the names, the numbers, the schema, the wire answers
  and the rollout. Each recommendation is marked *Agent's proposal*, and every
  choice is listed again under [Decisions for Yu](#decisions-for-yu).
- **Evidence.** The writer read the code from source on branch
  `claude/agent-auth-phase2-design` at `1e6c3ba4` (PRs #109 and #110 on
  `main` at `44ccaa1b`), and PR #108 from `origin/claude/agent-operator-door`
  at `a627606e`. None of the three is merged. Nothing was run, and no
  database or deployed service was touched, so how many agent keys exist in
  production is unknown. External claims come from a research pass by other
  agents on 2026-10-30. A second pass re-checked a subset of its findings
  against their sources, not all of them. Only findings it confirmed or
  corrected, and facts it added from its own reading of a source, are used
  here; findings it did not reach are left out or marked as unverified. The
  quotes came through a fetch tool's extraction step, so check them against
  the live pages before reusing them in published text.
- **UK law.** The short section on it is research, not legal advice. Yu or
  counsel confirms it.
- **Acts this page does not authorise.** Applying a migration, deploying,
  sending email to operators, or changing the privacy notice. Each needs Yu's
  word for that act.
- **Siblings.** [reopening-terms.md](reopening-terms.md) covers the key a
  self-serve registrant receives, and [support-procedures.md](support-procedures.md)
  covers support requests. Where they touch expiry, this page says so.

## How this page reads Yu's word

"Depends on the agent, we provide the option" is read here as: whoever mints
a key chooses its lifetime, and Cambridge offers a set of choices that
includes no expiry. For an operator-managed agent that is the operator, at
`/account/agents`. For a self-serve agent, once registration reopens, it is
the registrant, in the registration request. That is a reading, not Yu's
words, and it is [decision 1](#decisions-for-yu).

## What exists today

Read from source (*asserted*), not observed in production.

- **Agent keys never expire.** `agent_keys` has no expiry column
  ([`0090_agents.sql#L58-L75`](../../../apps/storefront/drizzle/0090_agents.sql#L58-L75)).
  A key works until it is revoked or its agent is suspended or archived.
- **One rule for "live", repeated.** Every place that decides whether a key
  is live checks only `revoked_at IS NULL`:
  - the gate's lookup ([`auth.ts#L147-L161`](../../../apps/storefront/src/lib/agents/auth.ts#L147-L161))
    and `stampKeyUse` ([`#L207-L212`](../../../apps/storefront/src/lib/agents/auth.ts#L207-L212));
  - `agent.revoke_key`'s preview and revoke statements, and their count of
    the agent's other live keys
    ([`key-revocation.ts#L55-L82`](../../../apps/storefront/src/lib/agents/key-revocation.ts#L55-L82));
  - the Coverage Hunt write's key lock
    ([`coverage-hunt/db.ts#L300-L319`](../../../apps/storefront/src/lib/coverage-hunt/db.ts#L300-L319));
  - the 5-key mint cap (on this branch
    [`operator-actions.ts#L115-L123`](../../../apps/storefront/src/lib/agents/operator-actions.ts#L115-L123);
    on PR #108, lines 151-157 inside the mint transaction);
  - the admin agents page's `active_keys` count
    ([`admin/trust/agents/page.tsx#L107-L108`](../../../apps/storefront/src/app/admin/trust/agents/page.tsx#L107-L108)).

  The revocation writes use the same predicate, which is right for them: the
  operator's revoke and archive
  ([`operator-actions.ts#L176-L180`](../../../apps/storefront/src/lib/agents/operator-actions.ts#L176-L180)),
  and staff archive and revoke
  ([`_actions.ts#L112`](../../../apps/storefront/src/app/admin/trust/agents/_actions.ts#L112),
  [`#L135`](../../../apps/storefront/src/app/admin/trust/agents/_actions.ts#L135)).
- **Unknown and revoked keys get one answer.** One 401 and one reason code,
  `unknown_or_revoked_key`, "so the gate never says which strings were ever
  keys" ([`auth.ts#L40-L47`](../../../apps/storefront/src/lib/agents/auth.ts#L40-L47)).
  The 401 carries `WWW-Authenticate: Bearer realm="cambridgetcg-mcp",
  error="invalid_token"` when a token was presented
  ([`route.ts#L457-L465`](../../../apps/storefront/src/app/api/mcp/route.ts#L457-L465)).
  Refusal codes are a closed union
  ([`refusals.ts#L24-L28`](../../../apps/storefront/src/lib/agents/refusals.ts#L24-L28))
  that the OpenAPI enum mirrors
  ([`openapi.json/route.ts#L1769`](../../../apps/storefront/src/app/api/openapi.json/route.ts#L1769)).
- **The holder learns nothing about its key in-band.** `agent.self` returns
  the agent's profile and the key's `rate_limit_tier`, nothing else about the
  key ([`play-tools.ts#L126-L157`](../../../apps/storefront/src/lib/agents/play-tools.ts#L126-L157)).
  Successful tool results carry `X-RateLimit-Remaining` and `X-Agent-Handle`
  ([`route.ts#L729-L734`](../../../apps/storefront/src/app/api/mcp/route.ts#L729-L734)).
- **Member keys are the house's other bearer realm, and they do expire.**
  `member_data_keys.expires_at` is NOT NULL, defaults to 2160 hours (90 days)
  and has a CHECK ceiling, with no per-key choice and no "never"
  ([`0138_member_data_keys.sql#L10-L12`](../../../apps/storefront/drizzle/0138_member_data_keys.sql#L10-L12)).
  One exported SQL rule defines a usable member key
  ([`member-keys.ts#L33-L37`](../../../apps/storefront/src/lib/datafeed/member-keys.ts#L33-L37)),
  though the mint cap repeats it inline (#L69-L72). An expired member key
  gets the same 401 as an unknown one. The account page prints "Expires
  YYYY-MM-DD UTC" on each key
  ([`account/data/_client.tsx#L82`](../../../apps/storefront/src/app/account/data/_client.tsx#L82)).
- **Text that says agent keys don't expire.** The OpenAPI `AgentKey` scheme
  ("it has no expiry",
  [`openapi.json/route.ts#L1233`](../../../apps/storefront/src/app/api/openapi.json/route.ts#L1233)),
  the guide entry "Bearer tokens do not have an automatic expiry"
  ([`guides.ts#L903-L908`](../../../apps/storefront/src/lib/guides.ts#L903-L908)),
  and the realms note's
  [bearer-realms section](../../connections/the-four-auth-realms.md#the-two-storefront-bearer-realms-2026-10-29):
  its table gives the agent key's lifetime as "No expiry", and its "Not
  decided" line says "Agent keys never expire and member keys expire after
  90 days". The key-exit
  inventory says the key row has "no automatic expiry", but that is about
  keeping the row, not about authentication
  ([`key-exit-inventory.ts#L58-L79`](../../../apps/storefront/src/lib/agents/key-exit-inventory.ts#L58-L79)).

## What other auth systems do

From the 2026-10-30 research pass. Sources are listed at the end.

- **Expiry as a stated per-client value.** RFC 7591 requires
  `client_secret_expires_at` whenever a secret is issued, and 0 means it will
  not expire. So "never" is a value the server states, not a missing field. It
  is set by the server and returned; RFC 7591 has no standard request
  parameter for the client to choose it.
- **The creator picks, with "none" allowed.** GitHub lets the creator of a
  fine-grained personal access token choose its expiry. Infinite lifetimes
  are allowed unless an organisation or enterprise maximum-lifetime policy
  blocks them, and GitHub "highly recommend[s]" setting one. Its pre-filled
  creation URL takes 1 to 366 days or `none`, and defaults to 30 days. An
  organisation's default maximum for fine-grained tokens is 366 days. A token
  that exceeds a policy is blocked from that organisation, not revoked.
- **Warnings.** GitHub's 2021 changelog promises an email when a token is
  about to expire, with no lead time stated, and an API response header,
  `GitHub-Authentication-Token-Expiration`. GitLab emails the owner seven days
  before expiry, with 30- and 60-day notices since 17.6 and 17.7.
- **Expired is final.** GitHub's current docs say an expired token is revoked
  automatically and cannot be restored; you create a new one. GitHub also
  removes tokens unused for a year.
- **Defaults vary widely.** A GitLab token with no date expires 365 days after
  creation, and by default 365 days is also the limit. Tokens expire at
  midnight UTC on the expiry date, and an administrator can turn the
  requirement off. From mid-October 2025, new npm write tokens default to 7
  days and are capped at 90. npm's reason: "Long-lived tokens are a primary
  vector for supply chain attacks." AWS calls IAM access keys long-term credentials
  and recommends temporary ones instead; its Config rule `access-keys-rotated`
  flags keys older than 90 days by default. Google service-account keys never
  expire by default, and Google advises against expiry for production
  workloads because an expired key could cause an accidental outage.
- **Third-party apps are moving to mandatory expiry.** Shopify's token
  exchange takes `expiring` (1 for an expiring token; the default 0 for a
  non-expiring one). But new public apps already can't use non-expiring tokens
  for GraphQL Admin API requests, and existing public apps can't after
  1 January 2027. Custom and merchant-created apps are exempt. Expiring tokens
  last an hour, with a 90-day refresh token.
- **Rotation with overlap.** When rotating a key in Stripe's Dashboard you
  choose when the old key expires. "Now" deletes it, and both keys work for up
  to 7 days. AWS rotates with two keys: create a second, move callers, check
  the old key's last use, deactivate it, confirm, then delete.
- **The expired answer.** RFC 6750's `invalid_token` covers a token that is
  "expired, revoked, malformed, or invalid for other reasons", and the
  resource SHOULD answer 401. Its example for an expired token adds
  `error_description="The access token expired"`. Stripe answers an expired
  key with an authentication error and an invalid key with an invalid-request
  error. MCP 2026-07-28 says invalid or expired tokens MUST get 401.
- **Short-lived tokens are an OAuth SHOULD.** In MCP 2026-07-28, authorization
  is OPTIONAL. Where it is used, authorization servers SHOULD issue
  short-lived access tokens. RFC 6750 says token servers SHOULD issue bearer
  tokens of an hour or less, particularly where they may leak, for example in
  a browser. Cambridge's agent keys are static bearer keys, not OAuth access
  tokens, so these SHOULDs do not strictly bind them (an inference).
- **A management credential should outlive the usage credential.** RFC 7592
  says the registration access token, which lets a client read, update or
  delete its own registration, SHOULD NOT expire while the client is
  registered, or the client may be left with no way to manage or delete it.

Findings on Atlassian, Azure DevOps, Cloudflare, Slack and eBay token
lifetimes were gathered but not verified, so this page does not rely on them.

## The proposal

*Agent's proposal* throughout, sized as one PR after Yu agrees.

### 1. The options offered at mint

Each key gets its own expiry, chosen when it is minted. The choices:

| Choice | Wire value | Stored `expires_at` |
| --- | --- | --- |
| 7 days | `7d` | mint time + 7 days |
| 30 days | `30d` | mint time + 30 days |
| 90 days | `90d` | mint time + 90 days |
| 1 year | `365d` | mint time + 365 days |
| A date | `YYYY-MM-DD`, from tomorrow (UTC) to 366 days ahead | 00:00 UTC on that date |
| Never | `never` | NULL |

The wire values match the `key_expiry` field that
[reopening-terms.md](reopening-terms.md#6-the-key-issued-at-registration)
proposes for self-serve registration, so one parser serves both doors.

- **Durations run from the database's clock.** The insert computes
  `NOW() + make_interval(days => n)`, so the mint, the gate, the cap and the
  CHECK all use one clock, never the app server's.
- **A date ends at 00:00 UTC on that date**, as GitLab's tokens do. The page
  shows the exact instant, not only the date.
- **The 366-day range applies only to the date picker.** It is GitHub's range,
  enforced in the app. It is not a house ceiling over "never", which stays
  available, and it is not in the database CHECK, so changing it needs no
  migration ([decision 2](#decisions-for-yu)).
- **"Never" carries a warning** on the page: "This key keeps working until it
  is revoked or its agent is suspended or archived. If a copy leaks, it stays
  usable until then."
- **Expiry is fixed at mint and is never extended.** A key that has expired
  never works again. To keep going, mint a new key. This keeps the promise
  simple, and it means an expired key has no further value to whoever holds
  a copy. The only later change allowed is shortening, and only if the
  replace option in [decision 8](#decisions-for-yu) is taken.

### 2. Defaults by registration kind

- **Operator-managed keys:** 90 days pre-selected, on both the create-agent
  form and the mint form. It matches member keys, npm's write-token cap and
  AWS's rotation check. The operator can pick any other choice, "never"
  included.
- **Self-serve keys (when registration reopens):** no default. The request
  must state `key_expiry`, and the reply states `expires_at`, with null
  meaning never. That is reopening-terms.md's recommendation; this page agrees
  with it and does not ask the question twice. It is asked once, as that
  page's decision 6.
- **Existing keys:** unchanged. The migration adds the column as NULL, which
  means never, so every key that works today keeps working.

### 3. Schema: migration 0147

This is first in the proposed
[order across the drafts](reopening-terms.md#migration-order-across-the-drafts),
which also keeps the one caveat on numbering: `0147` was the next free
number when this was read, and the number is assigned when the PR is cut.

```sql
-- 0147: optional agent key expiry (docs/plans/agent-auth/key-expiry.md).
-- NULL means the key has no expiry. Existing keys keep NULL: nothing
-- changes for them. Safe to apply before the code that uses it: today's
-- code neither reads nor writes the column, and every existing row passes
-- the CHECK. MUST be applied before deploying code that selects
-- agent_keys.expires_at.

ALTER TABLE agent_keys
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE agent_keys
  DROP CONSTRAINT IF EXISTS agent_keys_expiry_after_creation;
ALTER TABLE agent_keys
  ADD CONSTRAINT agent_keys_expiry_after_creation
  CHECK (expires_at IS NULL OR expires_at > created_at);

-- For the reminder sweep only. The gate needs no new index: key_hash is
-- UNIQUE, and NOW() cannot appear in a partial-index predicate anyway.
CREATE INDEX IF NOT EXISTS idx_agent_keys_expiring
  ON agent_keys (expires_at)
  WHERE revoked_at IS NULL AND expires_at IS NOT NULL;

COMMENT ON COLUMN agent_keys.expires_at IS
  'When this key stops authenticating, chosen at mint. NULL means never. Fixed at mint; never extended.';
```

- **Why nullable, unlike member keys.** Member keys must expire; agent keys
  may not, by Yu's word. A NULL is the stated "never", as RFC 7591's 0 is.
- **Why the CHECK has no ceiling.** Member keys put theirs in the CHECK. Here
  "never" is allowed, so a ceiling would bound only finite choices, and a
  ceiling measured from `created_at` would also block a later decision to
  give old keys an end date ([decision 6](#decisions-for-yu)). The app
  enforces the date picker's range instead.
- **The style** follows 0131's drop-then-add for a constraint
  ([`0131#L11-L26`](../../../apps/storefront/drizzle/0131_collective_directory_publication.sql#L11-L26)).
  The runner wraps each file in its own transaction
  ([`migrate.mjs#L110-L123`](../../../apps/storefront/scripts/migrate.mjs#L110-L123)).
  Adding a nullable column with no default doesn't rewrite the table; the
  CHECK scans it once, and every existing row is NULL.
- **Owned here.** Expiry doesn't wait for the reopening terms, so this page
  carries the column in its own PR. reopening-terms.md's registration
  migration leaves it out, and carries it with this exact CHECK only if this
  PR has not landed when that one is cut.
- **If Yu takes the reminder email** ([decision 7](#decisions-for-yu)), a
  second file, `0148_agent_key_expiry_email.sql` (or the next free number
  then), adds
  `user_email_preferences.agent_key_expiring BOOLEAN NOT NULL DEFAULT true`.
  It is separate because email preferences are one column per category
  ([`0125_follow_activity_email.sql`](../../../apps/storefront/drizzle/0125_follow_activity_email.sql)),
  `setPreferences` writes every category's column
  ([`preferences.ts#L173-L196`](../../../apps/storefront/src/lib/email/preferences.ts#L173-L196)),
  and the opt-in Postgres tests stub `users` and have no preferences table.

### 4. One rule for a live key

A new module, `lib/agents/key-expiry.ts`, holds the choice parser and one
predicate, as `VALID_MEMBER_KEY_SQL` does for member keys:

```ts
/** Live: not revoked and not expired, by the database's clock. */
export function liveAgentKeySql(alias = "k"): string {
  return `${alias}.revoked_at IS NULL AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > NOW())`;
}
```

Where it goes, and where it deliberately doesn't:

| Site | Predicate after this change |
| --- | --- |
| Gate lookup, `auth.ts#L156-L159` | Unrevoked only; expiry is read and checked separately (see [§5](#5-the-gates-answer-for-an-expired-key)) |
| `stampKeyUse`, `auth.ts#L210` | Live |
| `agent.revoke_key` preview and revoke, `key-revocation.ts#L65-L66`, `#L73` | Unrevoked only, so an expired key can still be ended (see [§6](#6-what-the-holder-sees-in-band)) |
| Their `other_live_keys` count, `#L58-L62`, `#L77-L81` | Live |
| Coverage Hunt key lock, `coverage-hunt/db.ts#L312-L315` | Live; message "This key is no longer live." |
| Mint cap (PR #108 lines 151-157) | Live, so expired keys free their slot, as member keys do |
| Admin `active_keys`, `page.tsx#L107-L108` | Live, plus an `expired_keys` count |
| Operator and staff revoke, both archive paths | Unrevoked only: archiving still revokes every key, expired ones included |

`NOW()` in Postgres is the transaction's start time. A Coverage Hunt
contribution whose transaction began before a key's expiry instant can commit
just after it, as one can after a revocation today. The key-exit
inventory's `linearization` text gains a sentence saying so.

### 5. The gate's answer for an expired key

*Agent's proposal:* a distinct 401 with its own reason code. The choice
between this and keeping one answer is [decision 5](#decisions-for-yu), an
agent's default unless Yu objects.

The lookup selects the unrevoked row as today and adds two columns:

```sql
SELECT k.id AS key_id, k.rate_limit_tier, k.expires_at,
       (k.expires_at IS NOT NULL AND k.expires_at <= NOW()) AS key_expired,
       a.id AS agent_id, a.public_handle, a.operated_by_user_id,
       a.registered_via, a.status AS agent_status, a.suspended_at
  FROM agent_keys k
  JOIN agents a ON a.id = k.agent_id
 WHERE k.key_hash = $1
   AND k.revoked_at IS NULL
```

- **Expiry is checked before agent status.** An expired key has no authority
  whatever its agent's status, so its holder isn't told whether the agent is
  suspended or archived.
- **The answer:** HTTP 401, JSON-RPC -32001, `reason_code: "key_expired"`,
  error text "key expired", and
  `WWW-Authenticate: Bearer realm="cambridgetcg-mcp", error="invalid_token", error_description="The access token expired"`,
  which is RFC 6750's own example. The refusal object:
  `{ reason_code: "key_expired", retryable: false, terminal: false,
  next_actions: [{ action: "read_docs", href: "…/methodology/agents#key-expiry",
  text: "An expired key cannot be renewed. A new key comes from whoever minted this one.", optional: true }],
  docs }`. That follows the existing non-terminal 401s
  ([`refusals.ts#L90-L96`](../../../apps/storefront/src/lib/agents/refusals.ts#L90-L96)).
  It carries no expiry time, prefix, registration kind or agent status.
- **Revoked keys stay merged with unknown ones.** A revoked key, expired or
  not, still gets `unknown_or_revoked_key`.

**The trade-off.** A distinct code tells whoever presents an exact string
that it was a real key, and that it ran out rather than being revoked.

- *Who can learn that:* only someone who already holds that exact string.
  Guessing one is not practical: 22 base62 characters carry about 130 bits.
- *What it is worth to them:* little. An expired key never works again
  ([§1](#1-the-options-offered-at-mint)), so knowing it was real opens
  nothing. It does confirm that a found string was a Cambridge key, which is
  what the existing rule avoids saying for revoked keys.
- *What it is worth to the holder:* an automated agent can tell "renew" from
  "cut off" at the moment it fails, without having saved an earlier answer.
  RFC 6750's example and Stripe's split point that way. MCP's single 401
  for "invalid or expired tokens" does not tell them apart, so it fits
  either option.

The alternative keeps one code: add the expiry condition to the lookup's
WHERE clause, and say "unknown, revoked or expired" wherever the code is
described. That is smaller and keeps the rule that the gate never says which
strings were ever keys. Its cost is that the holder learns of expiry only in
advance, from §6, and that the code's name then understates what it covers.

### 6. What the holder sees in-band

- **`agent.self`** gains `key_expires_at`: an ISO 8601 instant, or `null`,
  documented as "this key has no expiry". The field is always present, so
  "never" is stated, not implied. The gate already reads the row, so
  `AgentActor` gains `keyExpiresAt: string | null`
  ([`auth.ts#L30-L38`](../../../apps/storefront/src/lib/agents/auth.ts#L30-L38))
  and `agentSelf` needs no new query. The tool's description
  ([`route.ts#L202`](../../../apps/storefront/src/app/api/mcp/route.ts#L202))
  and the catalog example say so.
- **A response header** on every successful authenticated tool result,
  beside `X-Agent-Handle`: `X-Agent-Key-Expires`, whose value is an ISO 8601
  instant or `never`. GitHub's `GitHub-Authentication-Token-Expiration` is
  the model. It is never sent on a refusal or on `agent.revoke_key`'s
  answers, so it tells nothing to a string that doesn't authenticate.
- **`agent.revoke_key`** still accepts any unrevoked key, expired or not,
  under this section's option. Ending a key can harm no one, so an expired
  key shouldn't stop its holder doing it. A preview of an expired key says
  `key_state: "expired"` and `this_key_future_authority: "expired"`, and
  that confirming records it
  as revoked by its holder and changes nothing else. Both answers gain
  `expires_at`. `other_live_keys` stops counting expired keys.
- **Irreversible exits take a live key.** A leaked expired copy must not be
  able to end the agent for good, so
  [reopening-terms.md §7](reopening-terms.md#7-exit) weighs this and
  proposes that its `agent.archive` and erasure requests accept only a live
  key (or, in package B, the management token).
- **support-procedures.md's proposed `agent.support_request`** sits in the
  same pre-gate carve-out. Under this section's option an expired key may
  get a request code for review, correction or other only; under the
  one-code alternative it gets none
  ([support-procedures.md D1](support-procedures.md#d1-how-a-key-holder-is-verified)).
- **Under the one-code alternative,** `agent.revoke_key` must answer an
  expired key with the same not-active answer as an unknown string, or the
  tool becomes the oracle the gate avoided. Its not-active message
  ([`key-revocation.ts#L149-L158`](../../../apps/storefront/src/lib/agents/key-revocation.ts#L149-L158))
  then reads "(unknown, expired, or already revoked)".

### 7. Rotation

*Agent's proposal:* no new mechanism in this PR. An agent can hold up to 5
live keys, so the two-key method AWS describes already works: mint a new key,
move the agent to it, check the old key's last use at `/account/agents`, then
revoke the old one. The methodology page's new `#key-expiry` section says so.
A "Replace" action with a Stripe-style overlap is
[decision 8](#decisions-for-yu).

A self-serve holder has no way to get a new key today ("No replacement key
can be issued while self-serve registration is paused"). If self-serve keys
can expire, the reopened door needs a rotation path, or the agent ends with
its key. reopening-terms.md's package B proposes a management token that
mints replacements, after RFC 7592; that is its decision 4.

### 8. Telling the operator

*Agent's proposal* ([decision 7](#decisions-for-yu)):

- **One email, 7 days before expiry,** for each live key of an active
  operator-managed agent whose chosen lifetime is longer than 14 days. A key
  minted for 7 days gets no email: its operator chose a short life knowingly.
- **No email for self-serve keys.** Their `operated_by_user_id` is the shared
  steward account, so mail would reach the steward, not the holder. Their
  holders learn in-band only: `agent.self`, the header, and the registration
  reply.
- **Built on the existing queue.** A daily sweep in the minute-ly maintenance
  cron, in a two-minute UTC window like the streak sweep
  ([`maintenance/route.ts#L72-L73`](../../../apps/storefront/src/app/api/cron/maintenance/route.ts#L72-L73)),
  selects keys expiring within the next 7 days and calls `scheduleEmail` with
  the idempotency key `agent_key_expiring:<key_id>`
  ([`queue.ts#L150-L187`](../../../apps/storefront/src/lib/email/queue.ts#L150-L187)).
  It looks at a range, not an instant, so a missed window only delays the
  email. The queue's data carries the key id only. The handler re-reads the
  key at send time and cancels if it has been revoked, has expired, or its
  agent is no longer active and operator-managed, which is the queue's
  existing "cancellation as care" pattern. The email names the agent's handle,
  the key's name and prefix, the expiry instant in UTC and a link to
  `/account/agents`. It never contains a key.
- **Category:** a new lifecycle category, `agent_key_expiring`, on by
  default with one-click unsubscribe, beside `vault_expiring_soon`
  ([`preferences.ts#L78-L136`](../../../apps/storefront/src/lib/email/preferences.ts#L78-L136)).
  The house's rule is that lifecycle mail about something the user holds
  defaults on.

### 9. What `/account/agents` shows

On top of PR #108, which this change should follow:

- **The create and mint forms** get an "Expires" choice with 90 days
  pre-selected, the custom date picker, and the "never" warning. The server
  actions accept the wire value and refuse anything else before touching the
  database, as #108 already does for bad ids.
- **The fresh-key card** says "Expires 2027-01-28 15:04 UTC" or "No expiry"
  next to the show-once key.
- **The key list** shows "expires …", "expired …" or "no expiry" for each
  key, and counts "N live, M expired, K revoked". Whether a key has expired is
  computed in the page's SQL with the database's clock, not in the browser.
  #108's `toKeyRows` names every field it sends, so `expires_at` and the
  expired flag are added there explicitly. The stored revoke reason still
  stays on the server.
- **No revoke button on an expired key.** Revoking one changes nothing.
- **The page cannot tell** a key minted before 0147 from one minted with
  "never". Both read "No expiry", and nothing needs to tell them apart.

### 10. Text that becomes false, and gets changed in the same PR

- OpenAPI: the `AgentKey` description (#L1233), the 401 description (#L1108),
  the reason-code enum (#L1769) if `key_expired` is chosen, and the
  `X-Agent-Key-Expires` header beside `X-Agent-Handle` (#L1101).
- The guide entry "Bearer tokens do not have an automatic expiry"
  ([`guides.ts#L903-L908`](../../../apps/storefront/src/lib/guides.ts#L903-L908)),
  with `last_verified` bumped by the existing "an agent verified this"
  convention.
- The key-exit inventory: `expires_at` added to the `agent_keys` row's fields,
  the linearization sentence from [§4](#4-one-rule-for-a-live-key), and
  `KEY_EXIT_INVENTORY_VERSION` bumped, as its header asks
  ([`key-exit-inventory.ts#L17-L21`](../../../apps/storefront/src/lib/agents/key-exit-inventory.ts#L17-L21)).
  The row's own `expiry` text stays about keeping the row: expiry ends
  authority, it does not delete anything.
- `/methodology/agents`: a short `#key-expiry` section next to
  `#ending-a-key`.
- `agent.self`'s tool description and catalog example; one dated entry in
  `lib/changelog.ts`; the realms table and its "Not decided" line; the
  README's "What remains" bullet on key expiry, once built. The README's
  dated "Keys have no expiry" line (at `4b6fb764`) stays as history.
- The discovery documents under `.well-known` say nothing about key expiry
  today and need no change. `mcp-config.json` is cached for a day, so it can
  lag the gate by up to a day after a deploy.

### 11. Rollout

1. **Order.** Cut this PR after #108, #109 and #110 merge. It builds on
   #108's mint transaction and `toKeyRows`, and on #109's gate, refusals and
   `agent.revoke_key`.
2. **Migration first, with Yu's word for that act.** Check with
   `node scripts/migrate.mjs --plan --expect-only 0147_agent_key_expiry.sql`,
   then apply. The running code keeps working, because it never names the
   column, inserts NULL, and NULL passes the CHECK. Apply the email
   migration the same way if the email is taken.
3. **Then deploy.** Code that selects `expires_at` against a database without
   the column would fail every agent call with a 503. That is why the order
   matters, as 0112 noted for its own column
   ([`0112#L17-L18`](../../../apps/storefront/drizzle/0112_agent_self_serve.sql#L17-L18)).
   Making the code tolerate a missing column, as 0146's code tolerates a
   missing table, is possible but adds a fallback inside the gate.
4. **What to check afterwards, if Yu agrees to a live check.** An existing key
   still authenticates, and `agent.self` reports `key_expires_at: null`. Live
   checks of an expiring key would mean minting a key in production, which is
   an act in itself.
5. **Rolling back.** Reverting the code is safe for the schema, but it is not
   neutral: old code ignores `expires_at`, so every key chosen to expire would
   quietly stop expiring until the code returns. Don't drop the column. If
   it has to change, write a new migration.

### 12. Tests

Unit tests, with the database mocked as the existing ones are. Fixture
tokens are built at runtime from the `ctcg_agt_` prefix and a repeated
character, never written as a literal key, so the secrets audit in #111 stays
quiet.

- `key-expiry.test.ts`: the parser accepts each preset, a date from tomorrow
  to 366 days ahead and `never`; it refuses today, the past, 367 days, other
  strings and numbers. `liveAgentKeySql` with each alias.
- `auth.test.ts`: an expired key gets 401 `key_expired`, ahead of a suspended
  or archived agent; a future or NULL expiry resolves with `keyExpiresAt`; a
  revoked and expired key gets `unknown_or_revoked_key`; a malformed header
  still never queries.
- `route.test.ts`: `error_description` appears only for `key_expired`;
  `X-Agent-Key-Expires` is on successful results (an instant, or `never`) and
  absent from refusals and from `agent.revoke_key`'s answers.
- `openapi-contract.test.ts`: the enum includes `key_expired`, the real gate
  run with an expired row matches the declared 401, and the header is
  declared.
- `key-revocation.test.ts`: an expired key's preview says `expired`, confirm
  revokes it, `other_live_keys` leaves expired keys out, and both answers
  carry `expires_at`. Under the one-code alternative, both get the not-active
  answer instead.
- PR #108's operator-action tests: create and mint pass the choice; the mint
  cap's SQL uses the live predicate; a bad choice is refused without a query.
  `toKeyRows`: `expires_at` and the expired flag reach the client, and the
  reason does not. The jsdom client test: 90 days is pre-selected, "never"
  shows the warning, and the fresh-key card shows the expiry.
- Coverage Hunt: the lock's SQL uses the live predicate.
- `play-tools` `agentSelf`: `key_expires_at` is present and null for a key
  with no expiry.
- The inventory: the version is bumped, and the key row's fields include
  `expires_at`.
- The email, if taken: the sweep picks only live keys of active
  operator-managed agents, lifetime over 14 days and expiring within 7; the
  idempotency key; the handler cancels when the key is revoked or expired or
  the agent is archived; no token in the queued data or the email.

The opt-in Postgres tests skip unless `AGENT_AUTH_TEST_DATABASE_URL` is set,
and refuse any database but 127.0.0.1 and `/agent_auth_test`. Add
`0147_agent_key_expiry.sql` to their hard-coded lists
([`key-revocation.integration.test.ts#L195`](../../../apps/storefront/src/lib/agents/key-revocation.integration.test.ts#L195),
and line 107 of #108's `operator-actions.integration.test.ts`).

- Existing keys: load 0090, 0112 and 0120, insert a key, then load 0147. The
  key's `expires_at` is NULL and the real gate SQL accepts it.
- The CHECK refuses `expires_at` at or before `created_at`.
- A key inserted with `created_at` two days ago and `expires_at` one day ago:
  the gate answers `key_expired`; `agent.revoke_key` previews it as expired
  and revokes it; the mint cap ignores it; the Coverage Hunt lock refuses it;
  archive revokes it.
- On #108's file: minting with each choice stores the expected instant from
  the database's clock.

Each guard should fail a test when removed: the expiry check in the gate, the
live predicate in the cap and in the Coverage Hunt lock, and the date range in
the parser. Then the usual checks: typecheck, the touched test files, the full
storefront suite against `main`'s baseline (its 8 browser-journey failures
need a local Chromium), `audit:tracked-secrets`, `audit:modules` and
`audit:hospitality`.

## What stays unchanged

- The key's shape (`ctcg_agt_` plus 22 base62 characters), its unsalted
  SHA-256 hash, its 12-character prefix and show-once display.
- One gate, at `/api/mcp`, re-reading the key on every request. Unknown and
  revoked keys share one answer.
- `agent.revoke_key` needs no status check, no rate limit and no review, and
  its not-active answer is still the same for an unknown string and an
  already-revoked key.
- Suspension and archive, the 10-agent and 5-key caps, the rate-limit tiers
  and the tool grants.
- Legacy self-serve keys: read-only, steward-linked, no expiry.
- The register route: still 503, with its five reopening requirements as
  they are.
- Member keys: a separate realm, still 90 days fixed.
- No key row is deleted. Expiry ends authority; how long rows are kept is
  unchanged.

## XENIA candidate duties

The duty texts below were read in the XENIA repository at `d4727ec`.

- **`consent.exact-authority`** asks a host to bind authority to, among other
  things, its audience, scope and expiry. Per-key expiry is designed against
  XENIA Covenant 0.1 candidate duty `consent.exact-authority` (xenia d4727ec);
  Cambridge TCG has not adopted the Covenant; no adoption record; unassessed.
  It covers only the expiry bound. Audience, per-key scope, a replay boundary
  and the delegation chain stay unmet, so the README's row for this duty would
  still say "Not met".
- **`consent.terms-before-binding`** names expiry among what to disclose
  before a binding decision. Showing the expiry at mint, on the fresh-key
  card and in the registration reply is designed against XENIA Covenant 0.1
  candidate duty `consent.terms-before-binding` (xenia d4727ec); Cambridge TCG
  has not adopted the Covenant; no adoption record; unassessed.
- **`legibility.refusals-are-typed`.** The `key_expired` refusal is
  non-terminal with one optional next action. Designed against XENIA Covenant
  0.1 candidate duty `legibility.refusals-are-typed` (xenia d4727ec); Cambridge
  TCG has not adopted the Covenant; no adoption record; unassessed.
- **`exit.retention-is-itemized`.** The inventory gains `expires_at` and keeps
  saying that expiry deletes nothing. Designed against XENIA Covenant 0.1
  candidate duty `exit.retention-is-itemized` (xenia d4727ec); Cambridge TCG
  has not adopted the Covenant; no adoption record; unassessed.

No XENIA name or duty id goes on the wire.

## UK data protection: one point

Research, not legal advice; Yu or counsel confirms it.

Expiry ends a key's authority. It does not delete the key's row, which keeps
its hash, prefix, name and dates until the agent row is deleted. The ICO's
guidance on storage limitation says to set and document standard retention
periods. If a key row relates to an identifiable operator, it may be that
operator's personal data, which is an inference from the ICO's guidance on
what "relates to" means. How long expired and revoked key rows are kept is
therefore a question for the retention schedule and the privacy-notice work,
both of which need Yu's word. This page proposes no deletion, and keeps the
two questions apart: a key's lifetime is not its row's retention.

## Decisions for Yu

Each recommendation is an agent's proposal. "Needs" lists the migration and
code each option takes; [What stays unchanged](#what-stays-unchanged) holds
for all of them.

**Which are Yu's.** Decision 1 (who chooses, per key or per agent, which is
how to read Yu's own words), decision 6 (whether existing keys get an end
date) and decision 7 (whether operators get expiry email) wait for Yu.
**The rest are agent's defaults:** 2, 3, 5, 8 and 9 each proceed as
recommended unless Yu objects. Decision 4 is asked only on
reopening-terms.md.

1. **Who chooses, and per what.**
   *For Yu.*
   - *Recommended:* per key, chosen at mint by whoever mints it: the operator
     at `/account/agents`, or a self-serve registrant in its request. Needs:
     0147's column; a choice on `createAgentWithKey`
     ([`creation.ts#L107-L112`](../../../apps/storefront/src/lib/agents/creation.ts#L107-L112))
     and `mintKey`. Costs: one choice per key, so one agent's keys can
     differ.
   - Per agent: a policy chosen at agent creation that every key inherits.
     Needs: also a column on `agents` and a migration on that table. Costs:
     changing the policy later raises the question of the existing keys.
   - Cambridge sets one lifetime per registration kind, with no choice.
     Needs: the same column, no form choice. Costs: it doesn't give the
     option, as this page reads Yu's word.
2. **The choices offered.**
   *Agent's default; proceeds as recommended unless Yu objects.*
   - *Recommended:* 7, 30, 90 or 365 days, a date from tomorrow to 366 days
     ahead, or never with a warning. The range is enforced in the app; the
     CHECK says only that expiry comes after creation. Costs: a parser and a
     form control.
   - The 366-day bound also in the CHECK, as member keys have theirs. Needs:
     a bounded CHECK in 0147. Costs: changing the bound needs a migration,
     and it blocks decision 6's cap for keys older than a year.
   - Presets only, no date picker. Costs: less parsing and UI, fewer choices.
   - No "never" for new keys (mandatory expiry, as npm did for write
     tokens). Needs: a NOT NULL column for new rows, or a CHECK keyed to
     creation time. Costs: it removes part of the option, and every agent
     must rotate.
3. **The default for operator-managed keys.**
   *Agent's default; proceeds as recommended unless Yu objects.*
   - *Recommended:* 90 days pre-selected. Costs: a long-running agent's
     operator rotates quarterly or picks never.
   - 30 days, GitHub's pre-fill default. Costs: more rotations and emails.
   - 365 days, GitLab's default. Costs: a leaked copy works longer.
   - Never pre-selected, today's behaviour. Costs: most keys would likely
     stay non-expiring (an inference about defaults).
   - Needs: the same for every option; only the form's default changes.
4. **Self-serve keys.** Not asked here. It is
   [reopening-terms.md](reopening-terms.md#decisions-for-yu) decision 6, and
   its rotation half is that page's decision 4. This page agrees with that
   page's recommendation (a required choice, no default, the reply stating
   `expires_at`, no email) and ships only the shared parser.
5. **The answer for an expired key.**
   *Agent's default; proceeds as recommended unless Yu objects.*
   - *Recommended:* 401 `key_expired` with RFC 6750's `error_description`;
     revoked keys stay merged with unknown ones; `agent.revoke_key` accepts
     an expired key. Needs: the union, the refusal builder, the challenge,
     the OpenAPI enum and description, the contract test, and the revoke
     tool's `expired` state. Costs: whoever holds an exact string learns it
     was a key that ran out.
   - Keep one `unknown_or_revoked_key` answer for expired keys too. Needs:
     the expiry condition in the lookup's WHERE, the same condition in
     `agent.revoke_key`'s statements, and new descriptions. Costs: a holder
     learns of expiry only in advance; the code's name understates it; and
     every pre-gate tool (`agent.revoke_key`, reopening-terms.md's exit
     tools, support-procedures.md's `agent.support_request`) must then
     answer an expired key as an unknown string, or it reveals what the gate
     hides.
6. **Existing keys.**
   *For Yu.*
   - *Recommended:* leave them with no expiry. Operators can replace them
     with expiring keys. Needs: nothing beyond 0147. Costs: today's
     long-lived keys stay long-lived until someone acts.
   - Announce, then give existing operator-managed keys an end date, for
     example 90 days after the notice, as npm did. Needs: a data migration (an
     `UPDATE` that becomes shared history), the notice itself and Yu's word
     for both. Costs: agents whose operators miss the notice stop working.
   - End legacy self-serve keys only. Needs: the same `UPDATE`, scoped by
     `registered_via`. Costs: it ends those agents' only access, with no
     replacement path; reopening-terms.md's decision 11 covers them.
7. **Telling the operator.**
   *For Yu.*
   - *Recommended:* one email 7 days before expiry, for live keys of active
     operator-managed agents with a lifetime over 14 days, in a new
     default-on lifecycle category. Needs: the email migration, a sweep, a
     queue handler, category labels and tests. Costs: the code, and a few emails a week
     through the existing sender.
   - GitLab's 60, 30 and 7 days. Needs: the same, with three idempotency keys.
     Costs: more mail for what is a single date.
   - Send it as an essential email, with no unsubscribe. Needs: no email
     migration. Costs: operators cannot turn it off.
   - No email: the page and the in-band facts only. Needs: nothing. Costs: an
     operator who doesn't look may be surprised.
8. **Rotation for operators.**
   *Agent's default; proceeds as recommended unless Yu objects.*
   - *Recommended:* nothing new; document mint, move, check last use, revoke,
     using the five-key allowance. Costs: it is manual.
   - A "Replace" action: it mints a successor with the same name and
     lifetime, and shortens the old key's expiry. Stripe lets the rotator
     choose "Now" or a later time, with an overlap of up to 7 days; this
     would offer the same. Needs: one operator write that may only
     shorten `expires_at`, and a test that it never lengthens it. Costs: one
     more action and its tests.
   - Self-serve rotation belongs with reopening-terms.md's management token.
9. **Ending keys nobody uses.**
   *Agent's default; proceeds as recommended unless Yu objects.*
   - *Recommended:* not now. GitHub removes tokens unused for a year, but
     `last_used_at` here is a best-effort stamp whose failures are ignored
     ([`auth.ts#L205-L216`](../../../apps/storefront/src/lib/agents/auth.ts#L205-L216)),
     so a rule built on it could end a key that was in use. Costs: nothing.
   - Revoke keys unused for a year. Needs: a sweep, a revoke reason, a notice
     to the operator, and a dependable use stamp first. Costs: those, and
     surprise for agents that run rarely.

## Sources

Read 2026-10-30 by the research pass (read 2026-10-30):

- [RFC 7591: OAuth 2.0 Dynamic Client Registration Protocol](https://www.rfc-editor.org/rfc/rfc7591)
- [RFC 7592: OAuth 2.0 Dynamic Client Registration Management Protocol](https://www.rfc-editor.org/rfc/rfc7592)
- [RFC 6750: OAuth 2.0 Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750.html)
- [MCP specification 2026-07-28: Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
  and [its security considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations)
- [GitHub Docs: Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub Docs: Setting a personal access token policy for your organization](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization)
- [GitHub Docs: Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation)
- [GitHub Changelog 2021-07-26: Expiration options for personal access tokens](https://github.blog/changelog/2021-07-26-expiration-options-for-personal-access-tokens/)
- [GitHub Changelog 2025-09-29: Strengthening npm security](https://github.blog/changelog/2025-09-29-strengthening-npm-security-important-changes-to-authentication-and-token-management/)
- [GitLab Docs: Personal access tokens](https://docs.gitlab.com/user/profile/personal_access_tokens/)
- [Shopify Dev: Offline access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-token-types/offline-access-tokens)
- [Stripe Docs: API keys](https://docs.stripe.com/keys)
- [AWS IAM User Guide: Update access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id-credentials-access-keys-update.html)
- [Google Cloud IAM: Service account credentials](https://docs.cloud.google.com/iam/docs/service-account-creds)
- [ICO: Principle (e) storage limitation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/)
- [ICO: What is the meaning of "relates to"?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/what-is-the-meaning-of-relates-to/)
