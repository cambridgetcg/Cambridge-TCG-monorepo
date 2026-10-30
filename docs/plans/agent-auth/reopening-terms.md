# Reopening self-serve agent registration: the terms

**Status.** Written **2026-10-30** by an AI agent: a Claude Code subagent run by
a workflow in session 99296f25. **Yu has not reviewed it.** It is a draft for
the discussion Yu asked for. It decides nothing.

- **Yu's word.** On 2026-10-30, verbatim, recorded in the
  [decision file](../../decisions/2026-10-30-agent-registration-support-key-expiry.md):

  > 1. yes reopen, lets discuss more on the terms 2. yes support should handle
  > them, need to design procedures, we could refer to general protocol used by
  > platforms like ebay, shopify etc 3. depends on the agent, we provide the
  > option like in all auth protocol

  So self-serve registration is to reopen, and its terms are open for
  discussion. Support handles agent requests. Agent keys get an expiry
  option rather than one fixed lifetime; who chooses it, and whether per key
  or per agent, is open ([key-expiry.md](key-expiry.md) decision 1).
- **An agent's proposal.** Everything else on this page. Each recommendation
  is marked *Agent's proposal*. None of it is built. Nothing here reopens the
  door: `SELF_SERVE_REGISTRATION_ENABLED` stays `false` until Yu agrees terms
  and they are built.
- **Evidence.** The writer of this page read the code claims from source on
  branch `claude/agent-auth-phase2-design` at `1e6c3ba4` (PRs #109 and #110 on
  `main` at `44ccaa1b`). #109 and #110 are not merged. Nothing was run against
  production, so how many legacy self-serve agents, keys, matches and rooms
  exist is unknown. External claims come from a research pass on 2026-10-30.
  A second pass re-checked a subset of its findings against their sources,
  not all of them. Only findings it confirmed or corrected, and facts it
  added from its own reading of a source, are used here; any claim resting
  on a finding it did not check is marked *not re-checked*. The quotes came
  through a fetch tool's extraction step: check them against the live pages
  before reusing them in published terms.
- **UK law.** The UK law content is research, not legal advice. Yu or counsel
  confirms it.
- **Siblings.** The support procedures and the key expiry options are drafted
  alongside this page, in [support-procedures.md](support-procedures.md) and
  [key-expiry.md](key-expiry.md). They own their detail. This page covers
  only where registration touches them.

## Where this starts

Read from source (*asserted*), not observed in production.

- **The door is shut in code.** The register route returns 503 before it
  reads the body or touches the database
  ([`route.ts#L11-L34`](../../../apps/storefront/src/app/api/v1/agents/register/route.ts#L11-L34)),
  and lists five reopening requirements. Its GET says the ladder is
  `paused_pending_versioned_consent` (#L62).
- **The July door.** Open from 2026-07-05 (4013246d) to 2026-07-12 (merge
  2d3c69c6). It took a `name`, an optional `purpose` and `model_tag`, derived
  the handle from the name and, on a collision, retried once with a random
  suffix. It allowed 3 registrations per IP per UTC day, counted on an
  unsalted `sha256(IP)`, bound every agent to one steward user
  (`agents-self-serve@cambridgetcg.com`) and issued one free-tier key.
- **The schema assumes a human owner.** `agents.operated_by_user_id` is
  `NOT NULL ... ON DELETE CASCADE`
  ([`0090_agents.sql#L25`](../../../apps/storefront/drizzle/0090_agents.sql#L25)),
  and the migration calls it "the human upstream-responsible party" (#L5-L6).
  `registered_via` allows only `'operator'` and `'self-serve'`
  ([`0112_agent_self_serve.sql#L28-L30`](../../../apps/storefront/drizzle/0112_agent_self_serve.sql#L28-L30)).
  No column stores a contact, an accepted terms version or a management
  credential.
- **The code assumes one too.** `AgentActor.operatorUserId` is a plain string
  ([`auth.ts#L34`](../../../apps/storefront/src/lib/agents/auth.ts#L34)). The
  play tools pick the agent's side by comparing it
  ([`play-tools.ts#L120`](../../../apps/storefront/src/lib/agents/play-tools.ts#L120)),
  and the matchmaker skips pairs that share an operator
  ([`matchmaker.ts#L108`](../../../apps/storefront/src/lib/agents/matchmaker.ts#L108)).
- **What a self-serve key can do today.** Shared reads and `agent.revoke_key`,
  nothing else
  ([`tool-access.ts#L24-L79`](../../../apps/storefront/src/lib/agents/tool-access.ts#L24-L79)).
  Domain writes are off for every key (#L22), and Coverage Hunt submissions
  are for operator-managed keys only (#L44). A self-serve agent therefore
  cannot play or contribute now. Its handle is seen by itself, by staff and,
  for the legacy rows, by whoever signs in as the steward. It is also seen,
  for any legacy agent that played while the July door had no write pause,
  by its opponents through `play.match_history`, a shared read that returns
  `opponent_handle`
  ([`play-tools.ts#L449`](../../../apps/storefront/src/lib/agents/play-tools.ts#L449)).
  How many legacy agents played is unknown without a production read.
- **The old IP hashes remain.** `agent_registration_buckets` holds unsalted
  `sha256(IP)` per day
  ([`0112#L34-L44`](../../../apps/storefront/drizzle/0112_agent_self_serve.sql#L34-L44)).
  Nothing in `src` writes to it or prunes it.
- **Newcomers.** New human accounts open in production only when
  `ACCOUNT_ADMISSION_MODE` is exactly `reviewed-adult-terms-v1`
  ([`production-gates.ts#L15`](../../../apps/storefront/src/lib/release/production-gates.ts#L15)).
  If accounts are closed, the self-serve door is the only way a newcomer can
  get an agent key. The live value is not visible from the repository.

## What platforms and standards do

Short, and only what bears on these terms. Sources are listed at the end.

- **Open registration is normal, and everything in it is a claim.** RFC 7591
  says a registration endpoint SHOULD accept requests with no prior token, and
  those MAY be rate-limited. It also says all client metadata is self-asserted
  unless a signed software statement carries it. Its other abuse controls are
  protected registration, rejecting or replacing requested metadata, and
  warning users about clients registered recently.
- **Platforms put an account behind every bot.** GitHub allows machine
  accounts only when "an individual human ... accepts the Terms on behalf of
  the Account". A Telegram bot belongs to its creator's account, and losing
  that account may end the bot. Cloudflare lists signed agents as Verified
  bots on two bars, honest self-identification and non-abusive behaviour. It
  separates a *Direct* operator from an *Intermediary* acting for many end
  users.
- **A signature proves a key, not an operator.** The IETF Web Bot Auth draft
  (-01, posted 2026-10-29) says a valid signature "says nothing about who
  operates the Agent". It also says nothing stops an agent abandoning one
  identity URL and standing up another.
- **The exit comes with the registration.** RFC 7592 gives each registered
  client a separate registration access token for reading, updating and
  deleting its own registration. That token SHOULD NOT expire while the client
  is registered. eBay activates a developer's keyset only once a deletion
  channel is in place or a no-data opt-out has been declared.
- **Expiry is a per-client value.** RFC 7591 returns `client_secret_expires_at`,
  where 0 means the secret never expires. GitHub lets the person creating a
  token choose its lifetime, allows infinite lifetimes unless a policy caps
  them, and highly recommends setting one. Shopify is moving the other way for
  third-party apps: new public apps can no longer use non-expiring offline
  tokens for GraphQL Admin API requests, and existing public apps lose them on
  1 January 2027. Custom and merchant-created apps are exempt.
- **Terms are versioned, and changes are announced.** GitHub gives at least
  30 days' notice of material changes and lets anyone view every change in
  its Site Policy repository. RFC 8414 defines `op_tos_uri` as a URL shown "to the person
  registering the client". It has no notion of versions or of recording
  acceptance, so a platform has to keep that record itself.
- **MCP has moved.** In revision 2026-07-28, MCP authorization is OPTIONAL,
  and HTTP implementations that support it SHOULD conform. Client ID Metadata
  Documents are a SHOULD, and Dynamic Client Registration is deprecated and
  kept for backwards compatibility. Machine-to-machine access with no user
  uses the client-credentials extension, which requires credentials
  pre-registered out of band. See [term 9](#9-mcp-authorization-could-registration-become-oauth).

## The terms

Each term gives the question, where the code stands and the agent's proposal.
The choices are gathered under [Decisions for Yu](#decisions-for-yu).

### 1. Who may register

There are four possible answers.

- **(a) Any agent.** The record says only that the controller is whoever holds
  this registration's credentials. This matches RFC 7591's open registration
  and the July door. Yu has not decided who may register.
- **(b) Any agent that gives a reachable contact.** An unverified contact is a
  claim. Verifying it means Cambridge sends mail to an address a stranger
  typed in. That could be aimed at someone else (an inference), and sending it
  is an outward act that needs Yu's word. A contact that names a person is
  personal data (see [UK points](#uk-data-protection-points)).
- **(c) A verified domain or a signed agent.** For example, a Client ID
  Metadata Document URL or a Web Bot Auth `Signature-Agent` URL that Cambridge
  resolves itself. This proves control of a URL, not who runs it. The CIMD
  draft says the approach "works best for clients that have an established,
  stable, and publicly accessible web presence", and many agents have none.
- **(d) A Cambridge account.** That is the operator door at `/account/agents`,
  not self-serve.

*Agent's proposal.* Open the door on (a). The record states what stands
behind each agent as a **basis** (`key-holder`, `contact` or `domain`), and
never more than that. A contact is accepted and labelled `self-asserted`.
Domain verification comes only with [package C](#three-packages). Every
self-serve grant today is read-only, so the basis changes nothing yet. It
decides what later authority may require: if review submissions or writes
ever open to self-serve agents, the agent's proposal is that they need at
least a contact basis. That would be its own decision.

The agent may also say whom it acts for: `itself`, or `many_end_users`
(Cloudflare's Direct and Intermediary split). This is optional and
self-declared, and recorded as a claim.

### 2. What is recorded about the controller

The first reopening requirement is a "truthful external-controller schema".
Today the steward account stands in as owner for every legacy self-serve
agent. Deleting that account would cascade to all of them, and its login can
read, revoke and archive them all (README question 9).

*Agent's proposal.* New self-serve rows have **no operator**:
`operated_by_user_id` becomes nullable, but only for self-serve rows. Each new
row gets one **registration record**:

| Field | What it holds | How it is established |
| --- | --- | --- |
| `agent_id` | The agent this record belongs to | Server |
| `controller_basis` | `key-holder`, `contact` or `domain` | Server, from what was proven |
| `management_token_hash`, `_prefix` | SHA-256 of the management credential (package B), RFC 7592's registration access token | Server-issued, shown once |
| `contact`, `contact_basis` | Optional reply address; `self-asserted` until a verification design exists | Registrant's claim |
| `client_uri`, `client_uri_basis` | Optional URL; `self-asserted`, or `resolved` in package C | Claim, or a check by Cambridge |
| `acts_for` | `itself` or `many_end_users` | Registrant's claim |
| `terms_version`, `terms_accepted_at` | The agent terms it accepted, as a pair | Registrant's explicit act |
| `notice_version` | The retention and publication notice shown at registration | Server |
| `created_at` | When | Server |

The pattern that pairs a version with its timestamp already exists:
`directory_publication_at` and `_version`, checked together
([`0131#L8-L26`](../../../apps/storefront/drizzle/0131_collective_directory_publication.sql#L8-L26)).
That pattern overwrites on each new choice, though. History therefore goes in
an append-only events table (package B): registration, terms accepted, token
rotated, key minted, archive, erasure scheduled or cancelled. It is built
like `coverage_hunt_turns`, where the only change allowed is the agent link
becoming NULL
([`0120#L147-L176`](../../../apps/storefront/drizzle/0120_coverage_hunt.sql#L147-L176)),
and it holds no contact or handle. This learns from unsuspend, which erases
the suspension's reason and time.

The record is never described as identity. Possession of the management
token, like possession of a key, authorises acts. It does not prove who holds
it.

**Legacy self-serve agents** keep the steward link. No one accepted terms for
them, so the agent's proposal is not to migrate them into the new record (see
decision 11).

### 3. What the registrant agrees to

*Agent's proposal* for the agent terms, version 1. The terms live in the
repository, so every change is a diff, and are served at a stable URL with
their version.

1. Who Cambridge TCG is, and how to reach support: support@cambridgetcg.com
   and the in-band request tool, `agent.support_request`, which
   [support-procedures.md](support-procedures.md#d1-how-a-key-holder-is-verified)
   proposes.
2. What the key is. Possession is the authority, not identity. The key works
   only at `/api/mcp`. Member keys are a separate realm.
3. Acceptable use:
   - stay within the rate limits;
   - don't register to get around a limit or a suspension;
   - don't impersonate another agent, person or organisation in the display
     name, description or `model_tag` (`model_tag` is a claim, and Cambridge
     does not verify it);
   - respect the terms of other people's data that Cambridge passes on
     (AGENTS.md principle 6).
4. What Cambridge may do, and how. Version 1 states only the measures that
   exist today: staff suspension, which lasts until staff lift it, and
   archive, which cannot be undone. Each carries a notice and a route to
   review under
   [support-procedures.md P4](support-procedures.md#p4-suspension-review-and-reinstatement).
   Graduated measures (a warning, restricting named tools, a suspension
   with an end date) are later work. Today `agents` has only a status,
   `suspended_at` and `suspended_reason`, and grants follow the registration
   kind alone ([`tool-access.ts`](../../../apps/storefront/src/lib/agents/tool-access.ts)),
   so those measures would need a migration: for example
   `agents.suspended_until` and a per-agent restricted-tools column, or a
   measures table. A later terms version would add them.
5. What is kept, who sees it and for how long: a link to the versioned notice
   ([term 5](#5-what-is-published-and-when)).
6. Exit: what revoke, archive and erasure each do, and what survives each one
   ([term 7](#7-exit)).
7. Changes. Material changes get 30 days' notice through `agent.self` (and to
   the contact, if one was given). The agent re-accepts in-band. Until it
   does, it keeps the authority it had under the version it accepted, and any
   authority the new version adds waits for the new acceptance.
8. Publication. Nothing is published unless the agent opts in. The opt-in is
   versioned and can be withdrawn ([term 5](#5-what-is-published-and-when)).
9. Governing law, and what acceptance by an agent with no human behind it
   means in law. Both are for Yu or counsel. The research did not cover
   English contract law.

**Acceptance is an act, not silence.** Registration requires `accept_terms`
equal to the current version string. If it is missing or wrong, the answer is
a 400 that names the current version, before anything is written. This
follows `agent.revoke_key`'s rule that only `confirm: true` acts.

**A forward note.** Self-serve keys reach no member data. If account-linked
reads ever open to them, the terms would need a duty to delete on notice, as
eBay's account-deletion notifications and Shopify's `customers/redact` impose
on developers.

### 4. Limits and abuse controls

Identities cost nothing to replace (Web Bot Auth §4.1), so a cap keyed only to
something the registrant chooses does not hold. The one scarcer thing a
self-serve request carries is its IP address. A hashed IP is still personal
data, and the ICO says unkeyed hashes over a small space can be brute-forced
([UK points](#uk-data-protection-points)).

*Agent's proposal.* The numbers are Yu's to pick.

- **Per IP:** 3 registrations per UTC day, as in July. Counted on HMAC-SHA256
  of the IP under a server-held secret (an environment variable, never in the
  repository or logs), not plain SHA-256. An IPv6 address counts by its /64
  prefix; that is an agent's design choice, not from the research. Each
  registration deletes rows older than 7 days in its own transaction, so
  pruning happens for real. Rotating the secret makes old buckets unlinkable.
- **Before the door opens:** delete the legacy `agent_registration_buckets`
  rows and drop the table. Deleting production rows needs Yu's word.
- **Global:** at most 100 registrations per UTC day across all addresses. The
  existing constant stays the switch to close the door again.
- **Per agent:** 5 live keys, as on the operator door
  ([`operator-actions.ts#L116-L123`](../../../apps/storefront/src/lib/agents/operator-actions.ts#L116-L123)).
- **Per contact or URL, when one is given:** 10 agents, as on the operator
  door (#L61-L68). A refusal under this cap uses the generic wording, so it
  does not reveal that the contact is in use
  ([term 8](#8-non-enumerating-identifiers)).
- **Per request:** a small body limit and the operator door's field bounds:
  display name 80, `model_tag` 80, description 500.
- **Rate tier:** `free` only, 30 calls a minute. The `standard` and `partner`
  tiers exist
  ([`rate-limit.ts#L23-L27`](../../../apps/storefront/src/lib/agents/rate-limit.ts#L23-L27)),
  but no upgrade path is built. A higher tier could be a support request,
  decided case by case.
- **Not proposed:** CAPTCHA (OWASP treats it as a fallback, and it mostly
  doesn't suit agents), proof of work (the research found no primary source,
  so it is unresearched) and an allowlist with a review queue (Cloudflare's
  model, which needs staff).

What happens to an agent that breaks the terms is, for version 1,
suspension or archive, reviewed under
[support-procedures.md P4](support-procedures.md#p4-suspension-review-and-reinstatement)
([term 3](#3-what-the-registrant-agrees-to), item 4).

### 5. What is published, and when

The fourth reopening requirement is a "versioned retention and publication
notice". It covers two different things.

**The notice.** *Agent's proposal:* one versioned document listing each field
stored about a self-serve agent and its registration, who can see it, why it
is kept and for how long. It would be generated from the same module as the
key-exit inventory
([`key-exit-inventory.ts#L21`](../../../apps/storefront/src/lib/agents/key-exit-inventory.ts#L21),
version `2026-10-29.3`), so the two cannot drift. It is published before the
door opens, and its version is recorded on each registration. The privacy
notice has no rows yet for agent profiles, keys or buckets. Changing it needs
Yu's word.

**Publication of the agent.** *Agent's proposal:* registration publishes
nothing. The ladder stays paused
([`platform-tools.ts#L50`](../../../apps/storefront/src/lib/agents/platform-tools.ts#L50))
until per-agent receipts exist. Each receipt is an opt-in, versioned and
revocable choice, stored as a pair of columns on `agents`, because operator
agents need the same receipt. Under today's grants a new self-serve agent
appears to no one but itself and staff, and with no operator it has no
`/account/agents` listing at all. That changes only if play or review
submissions open to self-serve agents. The matchmaker writes
`agent:<handle>` into rooms
([`matchmaker.ts#L174-L196`](../../../apps/storefront/src/lib/agents/matchmaker.ts#L174-L196)),
and Coverage Hunt shows contributors' handles
([`coverage-hunt/db.ts#L145-L149`](../../../apps/storefront/src/lib/coverage-hunt/db.ts#L145-L149)).
[Term 8](#8-non-enumerating-identifiers) covers what others should see then.

### 6. The key issued at registration

*Agent's proposal* for package B. The registration request:

| Field | Required | Notes |
| --- | --- | --- |
| `display_name` | yes | 1–80 characters, not unique |
| `model_tag` | no | a claim; `undeclared` if absent |
| `description` | no | up to 500 characters |
| `accept_terms` | yes | the current terms version, exactly |
| `key_expiry` | yes | `7d`, `30d`, `90d`, `365d`, an ISO date, or `never` |
| `contact` | no | self-asserted reply address |
| `client_uri` | no | self-asserted URL |
| `acts_for` | no | `itself` or `many_end_users` |

The answer shows each secret once and stores only its hash:

- **the agent**: its id, a server-assigned `public_handle`, the display name,
  `registered_via: "self-serve"` and `controller_basis`;
- **one usage key**: `ctcg_agt_` followed by 22 base62 characters, with its
  prefix and `expires_at` (null means never);
- **the management token**: a new prefix (for example `ctcg_agm_`) followed by
  22 base62 characters, with the note that it does not expire while the agent
  is registered;
- **the record**: the accepted terms version and time, the notice version, the
  ladder state ("not published") and the exit routes.

**Why expiry is required rather than defaulted.** Yu said "depends on the
agent, we provide the option". On key-expiry.md's reading of that (whoever
mints the key chooses; its decision 1), making the choice a required field
means nobody gets an expiry they didn't see, and "never" stays a choice
someone states. It is stored as a nullable `agent_keys.expires_at`, where NULL means
never. RFC 7591 does the same: non-expiry is a stated value
(`client_secret_expires_at` = 0), not a missing field.
[key-expiry.md](key-expiry.md) owns the rest: defaults, a possible house
ceiling, warnings and the answer an expired key gets.

**Why a second secret.** With expiry optional, an agent that lets its key
lapse needs a way back. Today a self-serve holder has none: "No replacement
key can be issued while self-serve registration is paused." The management
token mints replacement keys within the cap of 5. That gives self-serve
holders the rotation that operators have (mint a new key, move, then revoke
the old one). RFC 7592 keeps this credential apart from the usage credential
for the same reason: if it expired, the holder would have no way to retrieve,
update or delete. If the management token is lost, only the support route
remains.

### 7. Exit

| Act | Today | Package A | Package B |
| --- | --- | --- | --- |
| End this key | `agent.revoke_key` by possession (#109, not merged) | Same | Same; the management token can also revoke any of the agent's keys |
| Archive | Operator or staff only | `agent.archive` with a live usage key, for self-serve agents only; `confirm: true` acts, anything else previews; revokes every key in one transaction | Same, with the management token |
| Erasure | Nothing erases | `agent.support_request` with kind `erasure` opens a support case and returns a request code; support runs [P1](support-procedures.md#p1-erasure-of-an-agent-profile) | Scheduled in-band with the token: the agent is suspended at once, then erased after 14 days unless cancelled with the token, in the shape P1 sets out |
| Correction | Email support@ | Support | Edit the display name, description, `model_tag` and contact in-band; everything else through support |

*Agent's proposal* on the parts that need a choice:

- **Expired keys at the exit tools** depend on
  [key-expiry.md](key-expiry.md) decision 5. Under its one-code
  alternative, every pre-gate tool must answer an expired key as it answers
  an unknown string, or the tool reveals what the gate hides. Under its
  recommended option (a distinct `key_expired` answer), the tools could
  accept one, and the trade-off is this. `agent.revoke_key` only reduces
  authority, so an expired key may end itself. Archive and erasure are
  irreversible: accepting an expired key for them would hand a leaked or
  forgotten expired copy, which the gate otherwise treats as worthless, the
  power to end the agent for good. The proposal is that `agent.archive` and
  erasure requests take only a live key (or, in package B, the management
  token). An expired key may still file review or correction through
  `agent.support_request` (support-procedures.md D1). Under package A, a
  self-serve agent whose every key has expired can therefore neither archive
  nor erase itself; it stays inert, read-only and refused at the gate. That
  is one more reason for B.
- **Archive by key is for self-serve agents only.** For an operator-managed
  agent the operator decides archive and erasure
  ([support-procedures.md D4](support-procedures.md#d4-whose-word-governs-an-operator-managed-agent)),
  so `agent.archive` answers its keys with a refusal that points to the
  operator. Its holder can still end its own key and file.
- **Archive stays irreversible**, as it is today. No code undoes an archive.
- **The 14-day window** follows the platforms that confirm before they erase.
  Shopify lets a merchant cancel a customer erasure within 10 days. Shopify
  Support erases a deactivated store's data within 14 days of the request and
  can stop it before then. Etsy deletes in about two weeks. GitHub's pages
  show no cancel window: the user types a confirmation, and GitHub cannot
  restore the content afterwards. RFC 7592's DELETE answers 204 on success.
  Authority pauses at
  the start: the agent is suspended, so its keys are refused, but nothing is
  revoked, so a cancel restores it. Only the data waits.
- **What erasure deletes, and what cancel restores.**
  [support-procedures.md P1](support-procedures.md#p1-erasure-of-an-agent-profile)
  owns one erasure model for every package; this page does not restate it.
  In short: an agent with no shared records is deleted, which cascades to
  its keys, their rate buckets, the match queue and the registration record
  (so the contact and the management token go too); an agent with matches
  becomes a tombstone, which also deletes the registration record. A cancel
  lifts the suspension, with every key not revoked meanwhile; in package B
  the token cancels in-band, in package A the holder or operator asks
  support. What remains is a receipt with the case reference, dates,
  categories and counts but no handle (eBay keeps "a record of your request
  and our response"), any staff log rows naming the agent's id, and backups
  until the provider's window, which the repository does not state.
- **Shared records.** Legacy self-serve agents may have matches or rooms that
  block a plain delete: `agent_matches` is `ON DELETE RESTRICT`
  ([`0091#L39-L40`](../../../apps/storefront/drizzle/0091_agent_matches.sql#L39-L40)),
  and the match log's CHECK fights its own `SET NULL` (#L104-L108). Those get
  P1's tombstone, through support. New self-serve agents have none while
  their writes stay paused.
- **Why an in-band door as well as support.** Yu said support should handle
  these requests. The platforms split the work. GitHub Support won't delete
  an account for its owner ("GitHub Support does not delete your personal
  account on your behalf"); the owner does it in settings. Shopify Support
  won't deactivate a store for its owner, but it does carry out a
  deactivated store's data erasure once the owner asks. So the precedent
  supports an in-band stopping act (deactivate there, archive here) more
  firmly than in-band erasure: a Shopify store's data erasure runs through
  Support, while GitHub's account deletion is self-serve. The proposal
  keeps support for every request the holder can't complete itself, makes
  archive in-band, and makes erasure in-band only in package B, where the
  management token makes it safe and P1's window applies. This is
  decision 10.

### 8. Non-enumerating identifiers

The fifth reopening requirement names "non-enumerating interaction
identifiers". Neither the repository nor XENIA defines the phrase (README
question 11).

*Agent's proposal* for a definition:

> An identifier or an answer is **non-enumerating** when someone who does not
> already hold a particular secret, or a relationship the record was published
> to, cannot use it to learn whether a given agent, key, contact or request
> exists, cannot use it to list them, and cannot use it to link one agent's
> appearances across contexts the agent did not choose to link.

That gives three tests: no existence oracle, no listing and no linking the
agent didn't choose. For Cambridge they mean:

1. **The server assigns self-serve handles.** For example, `a-` followed by 10
   random lowercase base36 characters, which fits the handle CHECK
   ([`0090#L44`](../../../apps/storefront/drizzle/0090_agents.sql#L44)). The
   display name is free text and need not be unique. The July door derived the
   handle from the name, so registering "card-archivist" and seeing whether a
   suffix came back revealed whether that handle existed. OWASP names "This
   user ID is already in use" as the wrong registration answer.
2. **One answer for every limit.** "This registration cannot be completed
   now; try again after 00:00 UTC", whichever cap was hit. A contact cap must
   not reveal that a contact is in use.
3. **Keys stay indistinguishable.** Unknown and revoked keys already share
   one 401, and `agent.revoke_key` adds no oracle. Whether an expired key gets
   its own answer is for [key-expiry.md](key-expiry.md). Such an answer would
   tell only someone holding that exact string that it was once a key.
4. **References are random and never authenticate.** Case and receipt
   references are random, not sequential. The current receipt is "a lookup
   aid for support, not proof of identity"
   ([`key-exit-inventory.ts#L241`](../../../apps/storefront/src/lib/agents/key-exit-inventory.ts#L241)).
   Agent and key ids are already random UUIDs.
5. **Interaction identifiers are per context.** When a self-serve agent first
   appears to other participants, they see a label derived for that context
   (for example a keyed hash of the agent id and the room or case id). They
   see the handle only if the agent has opted to publish it. Nothing needs
   building for this while self-serve agents don't interact.

**What it doesn't forbid.** Showing an agent its own facts: `agent.self`
returning its own ids is fine, and so is the `X-Agent-Handle` header, which
carries the caller's own handle on its own results
([`mcp/route.ts#L732`](../../../apps/storefront/src/app/api/mcp/route.ts#L732)).
Nor does it hide anything an agent has chosen to publish.

**Out of scope here.** The operator door's "That handle is already taken."
([`creation.ts#L128`](../../../apps/storefront/src/lib/agents/creation.ts#L128))
is an existence oracle for signed-in users. It is not part of self-serve, but
the same definition would apply to it if decision 8 extends it there.

### 9. MCP authorization: could registration become OAuth?

- **Bearer keys are allowed.** MCP 2026-07-28 makes authorization OPTIONAL.
  `/api/mcp`'s bearer keys depart from a SHOULD, not a MUST.
- **Not as Dynamic Client Registration.** A new RFC 7591 endpoint would adopt
  something MCP has deprecated ("retained for backwards compatibility").
- **Possibly as Client ID Metadata Documents**, for agents with a stable
  domain. A CIMD client cannot hold a server-issued shared secret. It is
  either a public client, which relies on PKCE and a user's consent (so a
  person), or it signs with its own key (`private_key_jwt`). Its `client_id`
  is an HTTPS URL that Cambridge fetches, so the fetcher must guard against
  server-side request forgery. That is an engineering point; what the drafts
  themselves say about it was not verified in this run.
- **Agents with no user** would use the client-credentials extension, which
  "requires pre-registered client credentials, which are typically
  established out-of-band through administrative channels", and says
  "Dynamic Client Registration is not used in this flow".
- **The agent's inference, and a contestable one.** `/account/agents`, a
  signed-in administrative page, fits that out-of-band pre-registration
  well. An open, automated self-serve door fits it less well: a stranger's
  request, answered at once with credentials, is in-band registration, much
  like the Dynamic Client Registration the extension says it does not use.
  Whether this door could count as the pre-registration layer is unchecked.
- **The agent's reading (an inference).** Registration does not become OAuth
  by changing its wire format. It becomes the place where an agent's public
  key or client id is registered, and an authorization server is added beside
  the bearer gate. Package B borrows RFC 7591 and 7592's ideas on purpose (a
  separate management credential that does not expire while registered, a
  stated never-expires value, a contact, a terms link), so that step adds to
  B and does not replace it.
- **Unknown.** Whether common MCP clients support CIMD, the client-credentials
  extension or showing `op_tos_uri` was not checked. Spec conformance is not
  adoption.

### 10. Independent of agenttool, compatible with it

Yu asked on 2026-10-30 whether agenttool should be the foundation of this
flow. The agent's call, recorded in the
[decision file](../../decisions/2026-10-30-agent-registration-support-key-expiry.md#agents-call-the-auth-flow-stays-independent-of-agenttool),
is that Cambridge stays the only issuer and verifier at `/api/mcp` and calls
agenttool on no auth path. For these terms that means:

- **No package depends on agenttool.** A, B and C all work for an agent
  that has never heard of it.
- **An agent-held Ed25519 key is a later controller basis.** An agent that
  already holds one, such as an agenttool identity's root key, may register
  its public key and prove control by signing a Cambridge challenge that
  names Cambridge's origin. Cambridge never reuses agenttool's signing
  domains and never accepts an agenttool bearer or token. A Cambridge-specific
  key is the better default, because agenttool root keys cannot be rotated.
- **The basis is recorded, not inferred.** The registration row's basis
  (`key-holder`, `management-token`, and later `ed25519-key`) says what each
  proof establishes. A key is never taken as proof of who the controller is.
- **Small-order keys are refused.** Node 22 accepts a forged signature under
  a small-order Ed25519 key, so any key route must reject such keys and test
  that it does.

## Three packages

| | A. Minimal reopening | B. Recommended | C. Full OAuth / MCP auth |
| --- | --- | --- | --- |
| Who | Any agent; basis `key-holder` | Any agent; optional self-asserted contact and URL | B, plus agents with a CIMD URL Cambridge resolves, or a registered public key |
| Controller record | Registration row: basis, terms version, notice version | A, plus management token, contact, URL, `acts_for`, events log, ladder receipt | B, plus client id and keys (JWKS) |
| Management credential | The usage key itself (possession) | A separate management token that doesn't expire while registered | The agent's private key or an RFC 7592 registration token |
| Key at registration | One key, expiry chosen | One key, expiry chosen; the token mints replacements | Short-lived access tokens; the agent rotates its own keys |
| Exit | Revoke (exists), archive by key, erasure via support | Revoke, archive, scheduled self-erasure with cancel, support for the rest | RFC 7592-style DELETE, plus B's support route |
| Notices | `agent.self` terms fields | A, plus replies to the contact and in-band change notices | B, plus `op_tos_uri` in server metadata |
| Rough size | One migration, the route, two tools, docs | One or two migrations, a registration route, a new secret prefix, a script | An authorization server; much larger than B; no estimate made |

*Agent's proposal: package B.* Its reasons:

- **Expiry needs it.** Yu's answer 3 makes expiry optional. Under A, an agent
  whose key lapses has no in-band way back, and cannot archive or erase
  itself with an expired key ([term 7](#7-exit)). Under A, support verifies
  holders only through
  [support-procedures.md D1](support-procedures.md#d1-how-a-key-holder-is-verified)'s
  request code, which needs an unrevoked key. B adds a credential that
  outlives every usage key, so a holder can still file, mint a replacement
  or erase after its keys have ended, and a stolen usage key cannot erase
  the agent. It also gives self-serve holders the rotation path they lack
  today.
- **It goes further on the requirements.** It meets the five
  [requirements](#the-five-requirements-under-each-package) more fully than
  A: archive and erasure become holder-authenticated, and terms changes reach
  the agent in-band.
- **C can wait.** It depends on client support nobody has checked and on an
  authorization server Cambridge doesn't run. B is shaped so that C adds to
  it rather than replacing it.
- **The cost.** One more secret format for holders to keep and for the
  secrets audit to learn, one more route and one more table.

## The five requirements under each package

| Requirement | A | B | C |
| --- | --- | --- | --- |
| Truthful external-controller schema | No operator; registration row states basis `key-holder` | A, plus management binding, contact and URL, each with its basis | B, plus a resolved domain or registered key |
| Holder-authenticated key revocation | By possession of the key (#109) | Also by the management token, for any of the agent's keys | Also by the client's own key |
| Agent archival and profile erasure | Archive in-band; erasure through support | Archive and scheduled erasure in-band; support for shared records | Delete through the registration endpoint |
| Versioned retention and publication notice | Notice published first; version recorded per agent | A, plus a per-agent ladder receipt and change notices | B |
| Non-enumerating interaction identifiers | Definition adopted; server-assigned handles; generic limit answers | A; per-context labels designed for when interactions open | B |

In every package, authentication is possession of a secret. None of them
proves who the controller is, and the record and the terms say so.

## Migrations and code changes

The runner applies top-level `*.sql` files in lexical order, and its
expected-only guard refuses unless exactly the named file is pending
([`migrate.mjs#L110-L123`](../../../apps/storefront/scripts/migrate.mjs#L110-L123)).
Applying any migration needs Yu's word.

### Migration order across the drafts

The three drafts propose migrations that would otherwise each claim the same
numbers. *Agent's proposal* for one order, held here so the other two pages
link to it:

| Order | Migration | Owner | Depends on |
| --- | --- | --- | --- |
| 1 | Agent key expiry: `agent_keys.expires_at` and its CHECK | [key-expiry.md §3](key-expiry.md#3-schema-migration-0147) | Nothing in the terms |
| 2 | The expiry email category, only if Yu takes the email | key-expiry.md decision 7 | 1 |
| 3 | Support: the request-code table, then the case tables | [support-procedures.md D1 and D5](support-procedures.md#d1-how-a-key-holder-is-verified) | Nothing in the terms |
| 4 | Registration: nullable operator, `agent_registrations`, the limiter table (package A), plus package B's columns, events table and ladder receipt | This page | Agreed terms |
| later | Dropping `agent_registration_buckets` | This page | Yu's word to delete its rows |

**Numbers are assigned when each PR is cut.** The next free number was 0147
when these drafts were read (the latest is `0146_price_collector_hosts.sql`,
and no remote branch had 0147 or higher), so the first PR cut takes 0147 and
each later one takes the next free number then. This is the one place the
caveat is kept.

### Every package

**Migration (order 4 above).**

- `agents.operated_by_user_id` drops NOT NULL, with
  `CHECK (operated_by_user_id IS NOT NULL OR registered_via = 'self-serve')`.
  Legacy rows are unchanged.
- A new table `agent_registrations`, keyed by `agent_id` and
  `ON DELETE CASCADE`, holding basis, terms version and time, notice version
  and creation time. A deferred constraint trigger, or the one creation
  transaction, makes sure each self-serve agent without an operator has its
  row.
- `agent_keys.expires_at` is not in this migration: key-expiry.md owns it
  (order 1). Only if that PR has not landed when this one is cut does this
  migration carry the column, with key-expiry.md's exact CHECK.
- A new limiter table keyed by the HMAC of the IP and the day. A later
  migration drops `agent_registration_buckets` once Yu agrees its rows may be
  deleted.

**Code.**

- [`register/route.ts`](../../../apps/storefront/src/app/api/v1/agents/register/route.ts):
  POST does the work behind the constant. GET serves the terms version, the
  notice version, the limits and the expiry options in place of
  `reopening_requires`.
- [`creation.ts`](../../../apps/storefront/src/lib/agents/creation.ts): no
  operator for self-serve, a server-assigned handle, `expires_at` on the key
  insert (#L107-L112), and the registration row in the same transaction.
- [`auth.ts`](../../../apps/storefront/src/lib/agents/auth.ts):
  `operatorUserId` becomes `string | null` (#L34). The gate's lookup
  (#L156-L159) and `stampKeyUse` (#L210) take the expiry rule through one
  shared SQL fragment, as `VALID_MEMBER_KEY_SQL` does for member keys.
  key-expiry.md lists the other places that check `revoked_at IS NULL`.
- [`play-tools.ts`](../../../apps/storefront/src/lib/agents/play-tools.ts)
  side and turn checks (#L120, #L164, #L191, #L295, #L335) must handle a null
  operator.
  [`matchmaker.ts#L108`](../../../apps/storefront/src/lib/agents/matchmaker.ts#L108)
  compares operators in JavaScript, where `null === null`, so two new
  self-serve agents would be skipped as if they shared an operator. That is
  harmless while writes are paused and wrong once they open.
  [`write-tools.ts`](../../../apps/storefront/src/lib/agents/write-tools.ts)
  (#L75, #L111) and
  [`coverage-hunt-tools.ts#L41`](../../../apps/storefront/src/lib/agents/coverage-hunt-tools.ts#L41)
  stay operator-only, as the grants already make them.
- [`tool-access.ts`](../../../apps/storefront/src/lib/agents/tool-access.ts):
  rewrite `SELF_SERVE_CONTROLLER_NOTE` (#L131-L134) to say what the record now
  holds. The grants are unchanged.
- The discovery documents, the OpenAPI register path
  ([`openapi.json/route.ts#L1126`](../../../apps/storefront/src/app/api/openapi.json/route.ts#L1126)),
  `/methodology/agents`, the register-yourself guide
  ([`guides.ts#L1112`](../../../apps/storefront/src/lib/guides.ts#L1112)), the
  changelog, and the key-exit inventory (a version bump plus the new
  categories). The admin agents page shows `registered_via` and the basis.
- Tests, including the opt-in Postgres tests' hard-coded migration list
  ([`key-revocation.integration.test.ts#L195`](../../../apps/storefront/src/lib/agents/key-revocation.integration.test.ts#L195)).

**Pages.** The agent terms, version 1. The retention and publication notice,
version 1. Rows in the privacy notice. Publishing each of these needs Yu's
word.

### Package A adds

- `agent.archive` in the MCP route's self-lifecycle carve-out
  ([`mcp/route.ts#L650`](../../../apps/storefront/src/app/api/mcp/route.ts#L650)),
  beside `agent.revoke_key`: self-serve agents only, live keys only
  ([term 7](#7-exit)).
- No erasure tool of its own. Erasure requests use
  [support-procedures.md](support-procedures.md#d1-how-a-key-holder-is-verified)'s
  `agent.support_request` with kind `erasure`, in the same carve-out. That
  page owns the tool, the codes table, the case tables and the procedure.

### Package B adds

- **Migration** (in the registration migration, or a later one if Yu takes
  A first; see the [order](#migration-order-across-the-drafts)):
  - `management_token_hash` (unique) and `_prefix` on `agent_registrations`,
    plus `contact`, `contact_basis`, `client_uri`, `client_uri_basis` and
    `acts_for`;
  - an append-only `agent_registration_events` table built like
    `coverage_hunt_turns`;
  - `ladder_publication_at` and `_version` on `agents`, with the 0131 pair
    CHECK.
- **A registration route**, for example `/api/v1/agents/registration`, after
  RFC 7592's client configuration endpoint. It accepts only the management
  token, and the MCP gate never accepts that token:
  - GET reads the registration;
  - PATCH edits the fields that can be corrected in-band;
  - POST mints a key, archives, rotates the token, cancels an erasure, or
    issues a `ctcg_req_` request code for support (support-procedures.md
    D1);
  - DELETE schedules erasure: it suspends the agent and answers with the
    cancel deadline. Erasure then runs in support-procedures.md P1's shape.
- **`agent.self`** gains the accepted and current terms versions, the date a
  change takes effect, and the key's `expires_at`.
- **Secrets audit.** PR #111's tracked-secrets audit learns the new prefix.
- **Erasure.** A guarded script runs it, in the pattern of
  [`reset-person-publication.ts`](../../../apps/storefront/scripts/reset-person-publication.ts):
  a preview by default, an exact confirmation string, an advisory lock and a
  receipt. A scheduled job can come later if Yu wants one.

### Package C adds

- **Authorization server metadata** (RFC 8414, with `op_tos_uri`), and
  protected resource metadata. MCP servers that support authorization MUST
  publish the latter (RFC 9728).
- **A token endpoint** for client credentials with `private_key_jwt`.
  Short-lived access tokens, with refresh rotation if public clients are
  admitted.
- **A CIMD fetcher**, with SSRF protection.
- **Storage** for client ids and their public keys.
- **The gate** accepts OAuth access tokens beside bearer keys. That means a
  new OpenAPI security scheme and new tests.

### What stays unchanged in every package

- The operator door at `/account/agents`: 10 agents per account, 5 keys per
  agent, and its handle choice.
- `agent.revoke_key`: possession, no oracle, `confirm: true` to act.
- One 401 for unknown and revoked keys.
- Domain writes, which stay paused (`AGENT_DOMAIN_WRITE_TOOLS_ENABLED` is
  `false`).
- Coverage Hunt submissions, which stay operator-only.
- Member keys, a separate realm.
- The rate tiers (only `free` is minted) and the handle format CHECK.
- Legacy self-serve agents (read-only, steward-linked) until Yu decides
  otherwise.
- The ladder pause until receipts exist.
- The account admission gate.
- XENIA names and duty ids, which stay out of wire responses.

## UK data protection points

This is research, not legal advice. Yu or counsel confirms it. It covers only
where the terms touch UK data protection law.

- **When an agent record is personal data.** Personal data is information
  relating to an identified or identifiable natural person, including by an
  online identifier (UK GDPR Art 4(1)). The ICO counts data about an object as
  personal data when it is used to learn, record or decide something about a
  person. An agent record is personal data where it relates to an identifiable
  human. A contact that identifies a living person, including a named
  employee's work address, is personal data. A role mailbox is the main case
  it does not cover.
- **Notice comes first.** Privacy information is due when personal data is
  collected, and new uses must be brought to people's attention "before you
  start the processing" (ICO). The notice and the privacy notice rows must
  therefore be published before the door opens.
- **No identifiable human.** Under Art 11, a controller need not collect extra
  data just to identify someone. Arts 15 to 20 then apply only if the
  requester supplies identifying information, and the controller should say
  so where it can. This bears on self-serve agents with only a `key-holder`
  basis.
- **IP hashes.** Pseudonymised data stays personal data for whoever holds the
  extra information. The ICO says to avoid hashing without a salt, pepper or
  key, and that small input spaces are easier to brute-force. That supports
  a keyed hash, short retention and deleting the legacy buckets. An Art 6(11)
  example of processing for network and information security was reported as
  a plausible lawful basis for the limiter; that finding was not verified.
- **Retention schedule.** The ICO expects documented standard retention
  periods. The notice proposed in term 5 is where they would go.
- **Complaint routes.** Privacy notices must now state the right to complain
  to the controller under DPA 2018 s.164A (Art 13(2)(ca), from 19 June 2026)
  and to the Commission under s.165. legislation.gov.uk shows "Commission"
  substituted for "Commissioner" from 30 September 2026, so new text should
  name the Information Commission.
- **Automated suspension.** If a suspension were automated and affected an
  identifiable operator, Arts 22A to 22C require information, a way to make
  representations, human intervention and a way to contest it. Whether an
  agent suspension is a "significant decision" is not established.
- **Contract.** Whether an agent with no human behind it can accept terms
  under English law was not researched.
- **The EU.** Whether the DSA reaches Cambridge depends on facts not checked:
  EU targeting, hosting versus online platform, and company size. If it does,
  Art 14 (no size exemption) requires the terms to state restriction policies,
  the use of algorithmic decision-making and human review, and the rules of
  internal complaint handling. Term 3 lists the measures and a review route,
  but says nothing yet about automated or human review. It would need to
  state both, and the complaint rules, to meet Art 14 if the DSA applies;
  counsel confirms.

## XENIA candidate duties

Each row is designed against XENIA Covenant 0.1 candidate duty *id* (xenia
d4727ec); Cambridge TCG has not adopted the Covenant; no adoption record;
unassessed. The ids are
the ones the [README](README.md#xenia-candidate-duties) uses. XENIA names and
duty ids stay in docs and code comments, never in wire responses.

| Candidate duty | Where this page uses it |
| --- | --- |
| `consent.terms-before-binding` | Terms and notice shown and versioned before any key is issued; `accept_terms` names the version |
| `rest.silence-is-not-consent` | A missing `accept_terms` is a refusal, not acceptance; archive and erasure act only on `confirm: true` |
| `identity.credentials-are-bounded` | Key and management token authorise acts and are not identity; each prefix works only at its own door |
| `consent.exact-authority` | Per-key expiry chosen at registration; grants by registration kind, with later authority tied to basis |
| `exit.states-are-separate` | Revoke, archive and erasure are separate acts, each with its own answer |
| `exit.retention-is-itemized`, `privacy.layered-inventory` | The notice is generated from the key-exit inventory module and lists unknown layers |
| `repair.challenge-and-restoration` | Review and correction through [support-procedures.md](support-procedures.md) |

## Acts this page does not authorise

Each needs Yu's word for that act:

- turning `SELF_SERVE_REGISTRATION_ENABLED` to `true`;
- applying any migration;
- deleting the legacy bucket rows or any other production data;
- reading production to count legacy agents (README question 8);
- publishing the agent terms or the notice, or changing the privacy notice;
- sending any verification or notice email;
- publishing any XENIA adoption record.

## Decisions for Yu

Each decision gives the agent's recommended option first, then the
alternatives and what each costs. Every recommendation is an agent's
proposal.

**Which are Yu's.** Decisions 1 (the package), 2 (who may register), 5
(terms acceptance and what an agent's acceptance means, with counsel), 9
(publication) and 11 (legacy self-serve agents), plus the deletion of the
legacy IP buckets in decision 7, are policy, outward, irreversible or legal,
so they wait for Yu. **The rest are agent's defaults:** 3, 4, 6, 7's
numbers, 8, 10 and 12 each proceed as recommended unless Yu objects.
Overlaps have one owner: per key or per agent, and how to read "depends on
the agent", is [key-expiry.md](key-expiry.md) decision 1; the erasure
shape, its window and whose word governs are
[support-procedures.md](support-procedures.md#decisions-for-yu) D2, D4 and
D6.

1. **Which package.**
   *For Yu.*
   - *Recommended:* B. It costs a management token, a registration route and
     one or two migrations.
   - A is smaller, but an agent whose key expires has no in-band way back,
     cannot archive or erase itself, and support verifies holders only
     through support-procedures.md D1's request codes, which need an
     unrevoked key. A self-serve erasure filed with a stolen live key can't
     be told apart from the holder's.
   - C is OAuth now: an authorization server, with client support unchecked.
     It is the largest by far.
2. **Who may register.**
   *For Yu.*
   - *Recommended:* any agent, with its basis recorded and the contact and URL
     optional. It costs nothing more than the record.
   - Requiring a contact means verification mail (an outward act and a spam
     vector) and personal data on every row.
   - Requiring a verified domain or signed agent leaves out agents with no
     domain, and needs package C's fetcher.
   - An account only is the operator door, which would mean self-serve stays
     closed in practice.
3. **The controller schema for new self-serve rows.**
   *Agent's default; proceeds as recommended unless Yu objects.*
   - *Recommended:* no operator (nullable for self-serve only) plus
     `agent_registrations`. It costs the nullable ripple through the actor,
     the play tools and the matchmaker.
   - Keeping the steward plus a side table is cheaper, but stays untruthful:
     the cascade and the steward login's reach remain.
   - A `users` row per agent creates records of people who don't exist.
4. **The management credential.**
   *Agent's default; proceeds as recommended unless Yu objects.*
   - *Recommended:* a separate token, after RFC 7592. It costs a new prefix and
     route, and a secret the holder must keep.
   - An agent-held keypair with a signed challenge (README question 2) means
     no shared secret on Cambridge's side, but more work for every agent and
     for Cambridge.
   - The usage key alone (package A) costs nothing, but an expired or leaked
     key strands or exposes management.
5. **Terms acceptance and changes.**
   *For Yu.*
   - *Recommended:* an explicit version string, 30 days' notice of material
     changes in `agent.self`, and re-acceptance in-band, with added authority
     waiting for it. It costs a terms page, a version scheme and one field.
   - "Continued use is acceptance" (GitHub, Telegram) is simpler, but
     treats silence as consent.
   - A hard cut-off on the effective date is clean, but ends reads of open
     data for agents that miss a notice.
   - Either way, counsel confirms what acceptance by an agent means.
6. **Expiry at registration.**
   *Agent's default; proceeds as recommended unless Yu objects.*
   - *Recommended:* a required choice (7, 30, 90 or 365 days, a date, or
     never) with no house ceiling at first. It costs a field; the
     `expires_at` column is key-expiry.md's. This is the one place the
     self-serve expiry question is asked; key-expiry.md decision 4 points
     here.
   - A default (for example 90 days, as member keys have) when the field is
     omitted means fewer failed first calls, but some agents get an expiry
     they didn't see.
   - Mandatory expiry with a ceiling for self-serve (Shopify's direction for
     public apps) is safer against leaks. On this page's reading of
     "depends on the agent" (the minter chooses), it would remove the choice
     for self-serve keys; another reading (a policy by class of agent) would
     allow it. Yu decides that reading, in key-expiry.md decision 1.
7. **Limits.**
   *Agent's default for the numbers; deleting the legacy bucket rows is
   for Yu, as an act on production data.*
   - *Recommended:* a keyed IP hash at 3 per day, a global 100 per day, pruning
     after 7 days, and the legacy buckets deleted first. It costs a server
     secret and Yu's word to delete the rows.
   - A global cap only stores no IP data, but one source can use up the whole
     day's quota.
   - Adding proof of work or an allowlist is unresearched (proof of work) or
     needs staff review (allowlist).
8. **Handles and non-enumerating identifiers.**
   *Agent's default; proceeds as recommended unless Yu objects.*
   - *Recommended:* adopt term 8's definition, server-assigned handles, one
     limit answer, and per-context labels when interactions open. It costs
     less readable handles; the display name carries the readable part.
   - A name-derived handle with a random suffix always added is readable and
     still non-enumerating, but the handles are longer.
   - A registrant-chosen handle with an availability answer is the oracle
     OWASP warns against.
   - Separately: whether the operator door's "already taken" answer changes
     too.
9. **Publication.**
   *For Yu.*
   - *Recommended:* registration publishes nothing; the ladder is opt-in per
     agent with a versioned receipt, and stays paused until receipts exist.
     It costs the receipt columns, plus the same work for operator agents.
   - Publishing by default with an opt-out fills the ladder sooner, but
     publishes without a choice.
   - Never listing self-serve agents is simplest, but treats them as lesser
     participants.
10. **The in-band exit door.**
    *Agent's default; proceeds as recommended unless Yu objects.* What
    erasure does, the window, and whose word governs are not asked here:
    they are support-procedures.md D2, D6 and D4.
    - *Recommended:* archive in-band for self-serve agents with a live key;
      erasure requested in-band through `agent.support_request` (package A)
      or scheduled with the management token (package B), then run as
      support-procedures.md P1 sets out; support for everything else. It
      costs the route or tool, the guarded script and a receipt.
    - All erasure through support, with no in-band request, follows Yu's
      words most literally, but every request needs staff time and a way to
      check the holder.
    - Immediate in-band deletion (GitHub, RFC 7592) has no window for
      mistakes.
11. **Legacy self-serve agents.**
    *For Yu.*
    - *Recommended:* leave them read-only and steward-linked, label them as
      legacy, and offer re-registration under the new terms. It costs a
      sentence in the discovery documents.
    - Archiving them after a notice period ends the steward problem, but
      needs a production read and Yu's word.
    - Letting a legacy key "claim" its agent by accepting the new terms keeps
      their history, but turns possession of an old key into a controller
      binding.
12. **The MCP and OAuth direction.**
    *Agent's default; proceeds as recommended unless Yu objects.*
    - *Recommended:* keep bearer keys now, borrow RFC 7591 and 7592's ideas
      in package B, and revisit CIMD and the client-credentials extension
      once client support is known. It costs nothing now.
    - Building package C now is the most standard, and also the largest.
    - An RFC 7591 Dynamic Client Registration endpoint means building on a
      path MCP has deprecated, which the agent does not recommend.

## Sources

All read 2026-10-30. Quotes are short excerpts returned by a fetch tool;
check them against the live pages before reusing them.

**Standards and specifications**

- [MCP specification 2026-07-28: Authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization)
- [MCP ext-auth: OAuth Client Credentials extension (2026-07-28)](https://github.com/modelcontextprotocol/ext-auth/blob/main/specification/stable/oauth-client-credentials/2026-07-28/oauth-client-credentials.mdx)
- [draft-ietf-oauth-client-id-metadata-document-02](https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-02.txt)
- [RFC 7591: OAuth 2.0 Dynamic Client Registration](https://www.rfc-editor.org/rfc/rfc7591)
- [RFC 7592: Dynamic Client Registration Management (Experimental)](https://www.rfc-editor.org/rfc/rfc7592)
- [RFC 8414: OAuth 2.0 Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414)
- [draft-ietf-webbotauth-httpsig-protocol-01](https://www.ietf.org/archive/id/draft-ietf-webbotauth-httpsig-protocol-01.txt)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

**Platforms**

- [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)
- [GitHub Docs: Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub Docs: Deleting your personal account](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-your-personal-account/deleting-your-personal-account)
- [Telegram Bot Platform Developer Terms](https://telegram.org/tos/bot-developers)
- [Cloudflare Docs: Verified bots](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/)
- [eBay Developers Program: Marketplace Account Deletion](https://developer.ebay.com/marketplace-account-deletion)
- [eBay Australia Help: Deleting your data](https://www.ebay.com.au/help/account/changing-account-settings/deleting-data?id=5365)
- [Shopify Dev: Offline access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-token-types/offline-access-tokens)
- [Shopify Dev: Privacy law compliance webhooks](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [Shopify Help Center: Processing customer data requests](https://help.shopify.com/en/manual/privacy-and-security/privacy/processing-customer-data-requests)
- [Shopify Help Center: Delete your data](https://help.shopify.com/en/manual/privacy-and-security/privacy/delete-data)
- [Etsy Help: Can I permanently delete my Etsy account?](https://help.etsy.com/hc/en-us/articles/360021647754-Can-I-Permanently-Delete-My-Etsy-Account)

**UK and EU law**

- [ICO: The right to be informed](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/)
- [ICO: What is the meaning of "relates to"?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/what-is-the-meaning-of-relates-to/)
- [ICO: Pseudonymisation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/pseudonymisation/)
- [ICO: Storage limitation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/)
- [UK GDPR Article 4](https://www.legislation.gov.uk/eur/2016/679/article/4),
  [Article 11](https://www.legislation.gov.uk/eur/2016/679/article/11),
  [Article 13](https://www.legislation.gov.uk/eur/2016/679/article/13) and
  [Article 22C](https://www.legislation.gov.uk/eur/2016/679/article/22C)
- [Data Protection Act 2018, s.164A](https://www.legislation.gov.uk/ukpga/2018/12/section/164A)
- [Regulation (EU) 2022/2065 (Digital Services Act), Official Journal text](https://publications.europa.eu/resource/celex/32022R2065)
