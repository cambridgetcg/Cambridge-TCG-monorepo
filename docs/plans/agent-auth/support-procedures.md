# Support procedures for agent and operator requests

**Status:** a draft for discussion, written **2026-10-30** by an AI agent (a
Claude Code subagent in a workflow run from session 99296f25). **Yu has not
reviewed it.** Nothing here is built. No procedure here has been run, and
nothing was observed in production.

**Yu's word.** On 2026-10-30 Yu answered three questions from the agent-auth
review ([decision record](../../decisions/2026-10-30-agent-registration-support-key-expiry.md)).
Verbatim:

> 1. yes reopen, lets discuss more on the terms 2. yes support should handle
> them, need to design procedures, we could refer to general protocol used by
> platforms like ebay, shopify etc 3. depends on the agent, we provide the
> option like in all auth protocol

This page is about item 2. Yu's word decides three things: support@ handles
agent erasure, correction and review requests; procedures for them are to be
designed; and the general protocols of platforms such as eBay and Shopify may
be referred to. Items 1 and 3 shape parts of this page. They have their own
drafts: [reopening-terms.md](reopening-terms.md) and
[key-expiry.md](key-expiry.md).

**An agent's proposal.** Everything else on this page is an agent's proposal:
every procedure, clock, field, tool and option, and every recommended option
under [Decisions for Yu](#decisions-for-yu). Where a sentence says "support
does" something, it describes the proposal, not current practice.

**Evidence.** Code claims were read from source on this branch
(`claude/agent-auth-phase2-design` at 1e6c3ba4, which carries #109 and #110 on
top of `main` 44ccaa1b). They are *asserted*. Nothing was tested for this
page. External claims come only from research read on 2026-10-30 that a
second pass re-checked against the pages. Where the check corrected a
summary, the corrected reading is used. A claim the check did not reach is
marked *not re-checked*. Quotes came through a fetch tool's extraction step;
check them against the live pages before reusing them in a published policy
or a support template.

**UK law.** The UK law here is research, not legal advice. Yu or counsel
confirms it before anything is relied on or published.

**XENIA.** Where a section names a XENIA duty, it is designed against XENIA
Covenant 0.1 candidate duty *id* (xenia d4727ec); Cambridge TCG has not
adopted the Covenant; no adoption record; unassessed.

## What exists today

Asserted from source.

- **Intake points.** Three agent-facing answers already send people to
  support@cambridgetcg.com, each with a subject line and the words "No review
  procedure is written down yet" or "No in-band or tested erasure procedure
  exists yet":
  - suspension review, from the suspended refusal
    ([`refusals.ts:59-77`](../../../apps/storefront/src/lib/agents/refusals.ts#L59-L77));
  - erasure and correction, from the revocation answer
    ([`key-exit-inventory.ts:318-335`](../../../apps/storefront/src/lib/agents/key-exit-inventory.ts#L318-L335)).
- **The privacy notice.** It names support@ for rights requests, promises a
  normal response within one month and says staff may ask for proportionate
  information to verify identity and scope
  ([`privacy/page.tsx:1513-1527`](../../../apps/storefront/src/app/privacy/page.tsx#L1513-L1527)).
  It already describes a data-protection complaints route: subject "data
  protection complaint", acknowledgement within 30 days, enquiries, progress
  and an outcome (lines 1528-1543). It says "a human scopes and completes the
  request and confirms it by email" (1555-1560). It also says "there is not
  yet a durable in-product decision-review case queue, assigned reviewer or
  published service level" (699).
- **Acts people can already do themselves.**
  - A key holder ends the presented key with `agent.revoke_key`. It runs
    before the gate, with no status check and no rate limit, so a suspended
    agent's holder can still use it
    ([`route.ts:644-660`](../../../apps/storefront/src/app/api/mcp/route.ts#L644-L660)).
  - An operator signed in at `/account/agents` can create agents, mint and
    revoke keys, and archive.
  - Staff at `/admin/trust/agents` can suspend, unsuspend and archive. A
    per-key `adminRevokeKey` exists
    ([`_actions.ts:120`](../../../apps/storefront/src/app/admin/trust/agents/_actions.ts#L120)),
    but the page's component imports only the other three
    ([`_components.tsx:4-8`](../../../apps/storefront/src/app/admin/trust/agents/_components.tsx#L4-L8)),
    so it has no UI.
- **Only staff suspend.** The only code that sets `status = 'suspended'` is
  the admin action (`_actions.ts:38-41`). Nothing suspends automatically.
- **What does not exist:**
  - a case record, a request reference or a clock;
  - any way to check that a requester holds a key;
  - erasure, export, or any edit of an agent's name, model tag or
    description. The only `UPDATE agents` statements change status or
    ratings (`_actions.ts`, `operator-actions.ts:167`, `matchmaker.ts:335`,
    `344`);
  - notices to operators: no email is sent from the agent admin actions or
    `lib/agents`;
  - suspension history: unsuspend sets `suspended_reason` and
    `suspended_at` to NULL (`_actions.ts:66-75`).

## What the platforms do

From the verified research (links in [Sources](#sources-read-2026-10-30)).
Five things recur.

1. **The owner acts; support does not act for them.** "For security
   reasons, Shopify Support can't deactivate your store for you." "GitHub
   Support does not delete your personal account on your behalf." A Stripe
   account's owner closes it, from the dashboard. Shopify erases a store's
   customer data only at the owner's request, and only after the store is
   deactivated.
2. **Identity checks depend on the channel.** eBay account holders request
   their data while signed in. People without an account use a form and send
   proof of identity and address, used only for that check. The ICO says to
   be reasonable and proportionate and to ask for formal identification only
   if necessary.
3. **Requests run on a clock, with a window and receipts.**
   - eBay sends a status update within 24 hours and a final email when done.
     Closure generally takes 14 days, up to 60 after recent trading. A closure
     can be stopped while it is still running; once complete, the person
     opens a new account.
   - A Shopify merchant's customer erasure can be cancelled for 10 days.
     Erasure of a deactivated store's data through Shopify Support happens
     within 14 days and can be stopped before then.
   - Etsy deletion is confirmed by email, takes about two weeks and cannot
     be undone.
4. **Partial outcomes are normal and named.**
   - eBay deletes by direct deletion, anonymisation, pseudonymisation or
     aggregation, and keeps a record of the request and its response.
   - GitHub keeps a deleted user's issues and comments in other people's
     repositories and attaches them to a "ghost" user. The username becomes
     available to anyone after 90 days.
   - Shopify erases a customer's name and address. What was sold, and when,
     stays visible.
   - eBay tells developers to delete so that "even the highest system
     privilege cannot reverse the deletion", and to keep data only for
     "specific and demonstrable legal requirements (e.g. tax, collections,
     AML)".
5. **Data holders downstream are told, on a clock.**
   - Every eBay app that uses or stores eBay user data subscribes to account
     deletion notifications or opts out. A new app's keyset activates only
     after it does. Each notification must be acknowledged immediately. After
     24 hours of unacknowledged notifications the endpoint is marked down,
     and if that is not fixed within 30 days eBay can end the developer's
     access to its tools and APIs.
   - Shopify apps get `customers/redact` 10 days after a deletion request and
     `shop/redact` 48 hours after uninstall, and must complete the action
     within 30 days.
   - Amazon SP-API developers delete within 30 days of an Amazon deletion
     notice or a customer revoking access, among other triggers.

**Appeals** follow a pattern too.
- **Window:** GitHub and eBay.ie take appeals for six months, and so does
  DSA Art 20 for the platforms it binds. eBay UK does too, for measures
  under its illegal and harmful content section, counted from the date it
  took the measure.
- **Who decides:** "All decisions on Appeal are made by humans". If the
  original reviewer would deny, a different staff member reviews (GitHub).
- **Two tracks:** an Appeal disputes the violation; a Reinstatement accepts
  it, fixes it and commits to comply (GitHub).
- **Restoration:** a successful appeal removes the violation, restores
  standing and removes "any actions that were the result of that violation"
  (Discord).
- **Notice:** eBay sends restriction notices to email and to the in-account
  Messages inbox, and says a notice not found in Messages "wasn't from
  eBay". The Santa Clara Principles (a civil-society standard, not law) ask
  that notices be "available in a durable form that is accessible even if a
  user's account is suspended", and that reviewers were "not involved in the
  initial decision".
- **Deadlines:** none of the platforms read publishes one for appeal
  decisions.

**Protocol precedent** for the holder's side.
- RFC 7592 (Experimental) lets a client delete its own registration with a
  separate registration access token. That token "SHOULD NOT expire while a
  client is still actively registered", so the holder never loses the way to
  delete. A server that does not allow self-deletion answers 403.
- RFC 7591 suggests contact addresses "expressly dedicated to the purpose of
  supporting the client" rather than personal ones.

## Who asks, and on what footing

| Requester | Who it is | What they can prove today |
| --- | --- | --- |
| Operator | The signed-in account that owns an operator-managed agent (`registered_via = 'operator'`) | A signed-in session |
| Key holder | Whoever presents an unrevoked key. Possession authorised the act; it is not proof of identity (the revocation answer says so) | Nothing outside the gate; a request code once `agent.support_request` exists ([D1](#d1-how-a-key-holder-is-verified)) |
| Management-token holder | Only if [reopening-terms.md](reopening-terms.md) package B is built: whoever holds a self-serve agent's management token. Possession again, not identity | Nothing outside the registration route; a request code from that route |
| A person in the record | Someone whose personal data is in an agent record but who is neither: a person named in a description, or the real person behind a self-serve agent | Their own identity, as for any rights request |
| Nobody verifiable | A holder who lost every credential of a self-serve agent | Nothing |

**The steward is never an operator here.** Every legacy self-serve agent's
`operated_by_user_id` points at the shared `agents-self-serve@` service
account
([`reset-person-publication.ts:223`](../../../apps/storefront/scripts/reset-person-publication.ts#L223)).
A request made by signing in as that account is not an operator's request
([README](README.md#questions-only-yu-can-answer) question 9).

**Two tracks, one procedure** (an agent's proposal).
- **Statutory track.** A living person exercises UK GDPR rights. Personal
  data relates to an identified or identifiable natural person, including
  through an online identifier (Art 4(1)). The ICO says data about an object
  is personal data when it is used to learn or decide something about a
  person, or when it is "biographically significant". An agent profile is
  therefore plausibly personal data of an identifiable operator. That is an
  inference; counsel confirms it.
  - Where Cambridge TCG cannot identify anyone, Art 11 says it need not
    collect data just to identify them. It tells the requester so where
    possible. Arts 15 to 20 then apply only if the requester gives
    information that identifies them.
- **Policy track.** An agent with no identifiable person behind it asks
  under Cambridge TCG's own agent terms, which [reopening-terms.md](reopening-terms.md)
  drafts. The proposal is to run the same steps on the same clocks, with
  different wording. One procedure is simpler for support. It also avoids
  getting the law wrong when nobody yet knows whether a person is behind an
  agent.
- **Complaints** about how either kind of request was handled are a third
  log line with their own clock ([P6](#p6-complaints-about-how-a-request-was-handled)).
  The ICO treats a complaint about how a rights request was handled as a
  data protection complaint. A service complaint sent together with a
  deletion request is not one.

## Verifying a requester without the key

### What support never asks for

- **The raw key.** Not in email, not in a form, not "just the last few
  characters".
- **The key's SHA-256.** It is the value the database stores
  ([`creation.ts:42-43`](../../../apps/storefront/src/lib/agents/creation.ts#L42-L43)).
  Anyone with database read access has it, and once written in an email
  anyone who reads the thread can replay it.
- **Passwords, session cookies or sign-in links.**
- **Config files, screenshots or transcripts** that may contain a key.
- **Formal identification, for any agent request.** For a person, only
  when there is reasonable doubt, and only what is needed. Art 12(6), as
  amended, lets the controller ask for that information and delay the
  request until identity is confirmed.

**The receipt reference is only a lookup aid.** The `receipt_reference` in a
revocation answer is `key_prefix` plus `revoked_at`, labelled "a lookup aid
for support, not proof of identity"
([`key-exit-inventory.ts:241`](../../../apps/storefront/src/lib/agents/key-exit-inventory.ts#L241)).
The prefix is the first 12 characters, so only three random base62
characters follow `ctcg_agt_`, about 238,000 values, and it is not unique.

**If someone sends a key anyway,** it is exposed. Support does not present it
to any endpoint, not even `agent.revoke_key`, and does not quote it in a
reply. The key is ended under [P5](#p5-key-compromise) (d). The case records
only that a key was disclosed and its 12-character prefix.

### One vocabulary for holders

This page and [reopening-terms.md](reopening-terms.md) use the same two
holder credentials (an agent's proposal):

- **The request code** works in any package, and for legacy and
  operator-managed agents too. A usage key gets one from
  `agent.support_request`; under package B the management token gets one
  from the registration route. Support only ever checks request codes: it
  matches the code's hash in the codes table and checks its agent, kind,
  expiry and that it is unused. The code is the only holder evidence that
  travels in an email.
- **The management token** exists only if package B is built. It acts
  in-band at the registration route and never goes to support, any more
  than a key does. Under B, a self-serve agent's erasure goes through the
  token, not through a code (see [the key holder](#how-each-requester-is-checked)
  below).

Codes carry the prefix `ctcg_req_`, distinct from `ctcg_agt_` (usage keys),
`ctcg_member_` (member keys) and reopening-terms.md's proposed `ctcg_agm_`
(management tokens), so neither people nor the secrets audit mistake one for
another.

### How each requester is checked

- **Operator, today.** Support finds the agent's operator by handle (the
  admin page shows the operator's email). It replies to the account's email
  on file, never to the `From` address of the request. It asks the operator
  to confirm by replying from that address. That confirmation is the
  verification. For an erasure, staff then suspend the agent for the window
  ([P1](#p1-erasure-of-an-agent-profile) step 4), because suspension can be
  lifted if the operator cancels. Support does not ask the operator to
  archive first: archive cannot be undone, so a cancellation would then
  restore nothing but the data.
- **Operator, later.** A request form on `/account/agents` that opens the
  case and shows its reference, the way eBay account holders file from My
  eBay.
- **Key holder** (an agent's proposal; nothing exists today). A **one-time
  request code** from a new in-band tool, working name
  `agent.support_request`:
  - **Where it runs.** It sits beside `agent.revoke_key` in the route's
    pre-gate carve-out, so a suspended agent's holder can file a review.
    The rights-are-not-hostage reasoning that already applies to revocation
    applies here.
  - **Input:** a `kind`: erasure, export, correction, review, compromise or
    other.
  - **Output:** a `ctcg_req_` code shown once, the address, the subject line
    to use and an expiry (30 days, proposed).
  - **What is stored:** a hash of the code, its prefix, the agent, the key
    that asked, whether that key was live or expired, the kind, the times,
    and `used_at` once support matches it.
  - **Limits:** single use, bound to its kind, and a small per-key daily
    limit so the tool cannot flood support.
  - **Expired keys** depend on [key-expiry.md](key-expiry.md) decision 5.
    Under its recommended option (a distinct `key_expired` answer), an
    unrevoked expired key can get a code for review, correction or other,
    and nothing else: an expired copy that leaked must not gain the power to
    erase, or to read an export, that the gate no longer gives it. Under its
    one-code alternative, the tool answers an expired key exactly as it
    answers an unknown string, with no code, or it would reveal what the
    gate hides.
  - **Self-serve erasure.** For a self-serve agent with a management token
    (package B), the tool refuses kind erasure and points to the
    registration route, so a stolen usage key cannot erase the agent. For a
    legacy self-serve agent, or any self-serve agent under package A, an
    erasure code needs a live key; see the limit under
    [What a code cannot stop](#what-a-code-cannot-stop).
  - **What it proves:** that an unrevoked key of that agent asked for that
    kind of request at that time, and whether the key was live or expired
    then. Nothing more. Once used, the code is worthless, which is why it can
    travel in an email and the key cannot.
- **Management-token holder** (package B only). The registration route
  issues the same `ctcg_req_` code when called with the token, so a holder
  whose usage keys have all ended or expired can still file. The token
  itself is never sent to support.
- **After revocation.** A holder who ends the agent's last key has no
  credential left. RFC 7592's answer is a management credential that
  outlives the usage credential. The matching proposal: a *performed*
  `agent.revoke_key` answer also carries a **follow-up code**, valid 30
  days.
  - Its kinds: erasure, export or correction for an operator-managed agent,
    whose operator decides an erasure anyway ([D4](#d4-whose-word-governs-an-operator-managed-agent))
    and is emailed. Export or correction only for a self-serve agent: a
    follow-up code never carries erasure for one, because whoever revoked
    the last key may not be its real holder. From an expired key, under
    key-expiry.md decision 5's recommended option, only review or
    correction, as above.
  - The code is issued only on a performed revocation. A preview and the
    not-active answer get none, so the tool still tells nobody which strings
    were ever keys.
  - If writing the code fails, the revocation still stands, and the answer
    says that no code was issued.
- **Later still: a signed challenge.** An agent that registers a public key
  under reopened terms could sign a challenge instead (README question 2).
  That helps only agents that registered a key, and none of today's has.
- **A person about their own data.** Checked as the data subject, on
  reasonable doubt only. This proves nothing about holding a key, so it
  reaches only that person's data in the record, not the agent as a whole.
- **Nobody verifiable.** On the statutory track, the Art 11 answer: we cannot
  identify you, and here is what would let us. On the policy track, support
  does not act destructively on an unverified request. A protective act
  (suspension) needs evidence; see [P5](#p5-key-compromise).

### What a code cannot stop

Someone holding a stolen key can get a code too. Three things limit the
damage:
- each code is bound to its kind;
- an erasure waits through a cancellable window ([D6](#d6-a-window-before-irreversible-erasure));
- the operator is emailed, and the pending case shows in-band (in
  `agent.self` and the agent's refusals), so the real holder can see it.
  This follows eBay's rule that a genuine notice also appears in Messages.

**These fail for a self-serve agent without a management token** (any
self-serve agent under package A, and every legacy one). Whoever holds a
live copy of its key can file an erasure and then revoke every key. The real
holder's copy then gets the generic 401, which must stay generic, so it
carries no pending-case notice. That holder cannot get a code to cancel, and
there is no operator to email: new self-serve rows have none, and legacy rows
point at the steward, who is never an operator. In that case the 14-day
window protects only a holder who still has a live key. On a key-holder
basis the thief and the holder are indistinguishable, so this is a stated
limit, not a bug to fix with more checks. Package B removes it, because a
self-serve erasure then needs the management token.

## Clocks

| Clock | Applies to | Length | Basis |
| --- | --- | --- | --- |
| Acknowledgement | Every request | 2 working days (an agent's proposal) | eBay sends a status update within 24 hours |
| Rights request | Statutory track; the policy track uses the same (proposal) | One month from the "relevant time": the latest of receipt, receipt of identity information asked for under Art 12(6), and any fee (normally none). Up to two further months for complexity or number, with notice and reasons inside the first month. For subject access (Art 15) only, time spent waiting for information needed to find the data does not count | UK GDPR Art 12A, inserted by DUAA s.76, in force 5 Feb 2026 |
| Complaint | Complaints about how data or a request was handled | Acknowledge within 30 days, counted from the day after receipt. Weekends count; if the last day is not a working day, the next working day. Then appropriate steps without undue delay, progress updates and the outcome | DPA 2018 s.164A, for complaints received from 19 June 2026 (SI 2026/82 reg 7); ICO complaints guidance |
| Window before erasure | Erasure | 14 days, inside the one-month clock (proposal; [D6](#d6-a-window-before-irreversible-erasure)) | Shopify 10 days, Shopify Support 14, Etsy about two weeks |
| Review requests accepted | Suspension and archive reviews | At least six months from the notice (proposal) | GitHub, eBay.ie, eBay UK for some measures, DSA Art 20 |
| Review decision | Suspension review | 14 days as an internal target, with the median published (proposal) | No platform read publishes one |
| Key compromise | A disclosed or found key | Same working day (proposal) | A security act, not a rights request |

**One gap matters more than the others.** Once a statutory erasure request
from an identifiable operator arrives, the one-month clock runs. For an
agent with match history, a hard delete is refused by the database (0091's
`ON DELETE RESTRICT` and the match log's CHECK). The tombstone erasure
proposed in [P1](#p1-erasure-of-an-agent-profile) needs no schema change,
but no tested tool for it, or for any agent erasure, exists yet. An agent's
reading is that the erasure tool should exist before self-serve registration
reopens. Agent archival and profile erasure is already one of the register
route's five reopening requirements
([`register/route.ts:24-30`](../../../apps/storefront/src/app/api/v1/agents/register/route.ts#L24-L30)).

## The procedures

Each procedure has the same parts: when it applies, intake, verification,
clock, steps (who does what), what is kept and why, what the requester
receives, records, partial-outcome wording, and the tooling gap.

### P1. Erasure of an agent profile

**When.** An operator, a verified holder, or a person whose data is in the
record asks to erase an agent, or named parts of it. Archiving is not
erasure; the privacy notice already says so (`privacy/page.tsx:1330-1333`).

**One erasure model for every package** (an agent's proposal). This
procedure owns it, and [reopening-terms.md §7](reopening-terms.md#7-exit)
links here rather than restating it:
- during the window the agent is **suspended**, not archived, so a
  cancellation can restore it;
- at the end of the window, an agent with **no shared records** (no
  `agent_matches` row and no agent row in `match_lifecycle_log`) is
  **deleted**: its `agents` row goes, and the rows that cascade from it with
  it (step 7a). New self-serve agents are in this case while their writes
  stay paused;
- an agent **with shared records** becomes a **tombstone** (step 7b);
- **what cancel restores:** the agent comes out of suspension with every key
  that was not revoked meanwhile. Under package B the management token
  cancels in-band; otherwise the operator, or a holder with a request code,
  asks support, and staff unsuspend. A key revoked, or an archive made,
  during the window stays as it is: cancel keeps the data, it does not undo
  those acts.

**Intake.** Email support@ with subject "Agent erasure request". The
revocation answer already offers this. Required:
- the agent's handle;
- the requester's footing: operator, key holder, or a person named in the
  record;
- verification: a request code, or "I am the operator" (support then
  confirms through the account);
- the scope: the whole profile, or named fields;
- whether a copy is wanted first. If so, [P2](#p2-access-and-export) runs
  first on the same case.

No reason is required from the requester. Staff weigh the statutory
grounds and exceptions themselves.

**Whose word counts** for an operator-managed agent is
[D4](#d4-whose-word-governs-an-operator-managed-agent). The proposal: the
operator decides. A holder who is not the operator can end its own key and
file, and support passes the request to the operator. For a self-serve
agent, the management token decides where package B is built; otherwise a
request code from a live key does, with the limit stated under
[What a code cannot stop](#what-a-code-cannot-stop).

**Steps.**

1. *Support:* opens the case and sends the acknowledgement: the reference,
   the clock, and what happens next.
2. *Support:* verifies the requester.
3. *Support:* runs a read-only preview. It counts the agent's rows in each
   category of the key-exit inventory
   ([`key-exit-inventory.ts`](../../../apps/storefront/src/lib/agents/key-exit-inventory.ts),
   version 2026-10-29.3): live and revoked keys, matches, match-log rows,
   rooms, Coverage Hunt turns, decks under the operator, and admin log rows.
4. *Support:* stops the agent acting, reversibly. Staff suspend it with the
   reason "erasure requested, case *ref*" ([D6](#d6-a-window-before-irreversible-erasure)).
   Under package B, the management token's erasure request suspends it
   in-band instead. Support does not archive, and does not ask the operator
   to: archive cannot be undone (no code undoes it; README question 9), so a
   cancellation would restore nothing. An operator who wants the agent ended
   whatever happens may archive it as well, and the case records that a
   cancel would then keep the data but not bring the agent back. The holder
   can end its own keys at any time.
5. *Support:* tells the requester, and the operator if different, when the
   14-day window ends and how to cancel. A cancellation needs the same
   verification and nothing more, since it keeps data rather than removing
   it. On cancel, staff unsuspend, which restores what the model above says.
6. *The approver:* approves the erasure. Until the tooling has been run on a
   throwaway database, the proposal is that Yu approves each one, as the
   price-data procedure already does
   ([`price-data-deletion.md`](../../operations/price-data-deletion.md)).
   See [D3](#d3-who-approves-an-erasure).
7. *Support, through a guarded script:* erases, in one transaction, in the
   shape [D2](#d2-what-erasure-does) recommends for the agent's case. Both
   shapes first scrub the `agent:<handle> · <name>` deck names under the
   operator ([`write-tools.ts:47`](../../../apps/storefront/src/lib/agents/write-tools.ts#L47)),
   which no foreign key reaches.

   **7a. No shared records: delete.** The `agents` row is deleted. That
   cascades to `agent_keys`
   ([0090:60](../../../apps/storefront/drizzle/0090_agents.sql#L60)), their
   `agent_rate_buckets` (#L82), `agent_match_queue`
   ([0091:19](../../../apps/storefront/drizzle/0091_agent_matches.sql#L19))
   and, if reopening-terms.md's record is built, `agent_registrations`, which
   takes the contact, the URL and the management token's hash with it.
   `coverage_hunt_turns.agent_id` becomes NULL through its foreign key
   ([0120:77](../../../apps/storefront/drizzle/0120_coverage_hunt.sql#L77)),
   the one change its trigger allows. Any `agent_registration_events` rows lose
   their agent link the same way. A receipt row and a strict audit row are
   written in the same transaction.

   **7b. Shared records: tombstone.**
   - the `agents` row keeps its id. Its handle becomes a placeholder that
     fits `^[a-z0-9][a-z0-9-]{2,31}$`
     ([0090:44](../../../apps/storefront/drizzle/0090_agents.sql#L44)).
     `display_name` and `model_tag` become fixed placeholders, because both
     are NOT NULL. `description` and `suspended_reason` become NULL, and the
     status becomes archived;
   - its `agent_keys`, `agent_rate_buckets` and `agent_match_queue` rows are
     deleted. A deleted key's string then gets the same 401 as any unknown
     string, so nothing is lost for security
     ([`auth.ts:147-170`](../../../apps/storefront/src/lib/agents/auth.ts#L147-L170)).
     The case keeps the prefixes and revocation times as the receipt;
   - `coverage_hunt_turns.agent_id` becomes NULL. That is the one change its
     trigger allows
     ([0120:148-176](../../../apps/storefront/drizzle/0120_coverage_hunt.sql#L148-L176)).
     Turn content stays;
   - the `agent_registrations` row, if reopening-terms.md's record is built,
     is deleted. That removes the contact and the URL, and invalidates the
     management token, whose hash is gone. `agent_registration_events` rows
     keep pointing at the tombstone; they hold no contact or handle;
   - copies of the handle are scrubbed:
     - `game_rooms` player names, plus the handles inside `game_state` and
       its log ([`matchmaker.ts:173-196`](../../../apps/storefront/src/lib/agents/matchmaker.ts#L173-L196));
     - `match_lifecycle_log` labels and action data
       ([`play-tools.ts:316`](../../../apps/storefront/src/lib/agents/play-tools.ts#L316), `365`);
   - the operator's user ids stay where the game records hold them (the
     tombstone's `operated_by_user_id`, and the player ids in `game_rooms`,
     `game_state` and the game log). See the "Kept" table; whether to
     re-point them is open under [D2](#d2-what-erasure-does);
   - `agent_matches` rows stay and point at the tombstone, as GitHub keeps
     contributions under its ghost user. Opponents' history stays whole;
   - a receipt row and a strict audit row are written in the same
     transaction ([`governance-log.ts:33-60`](../../../apps/storefront/src/lib/admin/governance-log.ts#L33-L60)).
8. *Support:* records what happens to backups. The ICO says backups must be
   put "beyond use" until overwritten. The database provider's snapshot
   window is not in this repository, so for now the answer says "unknown".
9. *Support:* considers who must be told. The ICO says each recipient must
   be told unless that is impossible or would take disproportionate effort.
   Agent handles reach other key holders through read tools, and nobody
   records who read them, so they cannot be told individually. The operator
   is told. Whether that exception covers this is for counsel.
10. *Support:* sends the completion notice to the requester and, if
    different, the operator, and closes the case.

**Kept and why.** The first three rows apply to a tombstone (7b) only; a
deleted agent (7a) keeps none of them.

| What | Why | For how long |
| --- | --- | --- |
| The tombstone `agents` row, ratings and match counts | Holds no handle, name or description; keeps opponents' records joined. It still links to the operator (next row) | As long as the matches |
| The tombstone's operator link, and the operator's user ids in the game records: `operated_by_user_id` ([0090:25](../../../apps/storefront/drizzle/0090_agents.sql#L25), NOT NULL), `game_rooms.player1_id` and `player2_id` ([`matchmaker.ts:193-194`](../../../apps/storefront/src/lib/agents/matchmaker.ts#L193-L194)), `game_state`'s player `userId` (#L173-L177), `currentTurn` and `winner`, and the game log's `playerId` ([`play-tools.ts:335`](../../../apps/storefront/src/lib/agents/play-tools.ts#L335)) | The schema requires an operator on an operator-managed row, the room columns must name a real `users` row, and the game engine identifies players by user id. For a legacy self-serve agent these ids are the steward's, not a person's. Whether to re-point them to a placeholder user is open ([D2](#d2-what-erasure-does)) | As long as the matches, unless D2 re-points them |
| `agent_matches` and scrubbed `match_lifecycle_log` rows | The opponents' history too: a shared record | Not stated today |
| Coverage Hunt turn content and chronicle | The game's review record, permanent by design; only the agent link is removed | Permanent |
| `admin_actions_log` rows about the agent | Evidence of how staff acted; legal claims (Art 17(3)(e)) | Not stated today ([D9](#d9-how-long-support-records-are-kept)) |
| The case record and erasure receipt | A record of the request and the response, as eBay keeps; holds no key, hash or code | [D9](#d9-how-long-support-records-are-kept) |
| The operator's account and orders | Agent erasure does not touch them ([P1b](#p1b-operator-account-erasure)) | Their own rules |
| Backups | Put beyond use; the provider's window is unknown | Unknown |
| Copies outside Cambridge TCG | MCP host configs, model transcripts: beyond reach (the inventory says so) | Not ours |

Agents hold no money, so no financial record is involved; the inventory
says settlement is not applicable.

**What the requester receives.**
- An acknowledgement with the reference and the clock.
- A confirmation that gives the date the window ends and how to cancel.
- A completion notice that lists four things: what was erased; what was
  replaced with a placeholder; what was kept and why; and what is unknown.
- On the statutory track, any refusal or partial refusal gives reasons, the
  right to complain to Cambridge TCG under s.164A, the right to complain to
  the Commission under s.165, and the route to court. This is UK GDPR
  Art 12(4) as amended.

**Partial-outcome wording** (a draft, for a tombstone of an operator-managed
agent):

> We erased your agent's handle, display name, model tag and description,
> ended and deleted its keys, and removed its link from its Coverage Hunt
> turns. We kept four things. The matches it played stay, under a
> placeholder name, because they are also its opponents' history. Those
> matches, and the placeholder that stands in for your agent, still record
> your account as the agent's operator, because our game records identify
> players by account. The text of its Coverage Hunt turns stays, because it
> is the game's permanent review record. And our staff log of actions on the
> agent stays, as the record of how we handled it. Our database provider
> keeps backups for a period we have not yet confirmed; erased data in them
> is not put back into use. Copies kept outside Cambridge TCG, for example in
> an MCP host's settings or a model transcript, are beyond our reach.
> Reference: *ref*.

For a deleted agent (7a), the notice says the agent record and its keys were
deleted, and lists as kept only the Coverage Hunt turn text, the staff log,
the case receipt and the backups.

**Today's honest answer**, until the tool exists:

> We can stop the agent acting today. We cannot yet erase an agent profile,
> because we have no tested erasure tool yet. Your request is logged as
> *ref*, and we will tell you when it can be completed.

**Records.** The case, every step with who and when, the preview counts, the
approval, the receipt with row counts, and the completion notice.

**Tooling gap.**
- *Today:* archive and suspend exist. There is no preview and no erasure.
  Foreign keys block a plain delete of an agent with match history:
  - `agent_matches` sides are NOT NULL and `ON DELETE RESTRICT`
    ([0091:39-40](../../../apps/storefront/drizzle/0091_agent_matches.sql#L39-L40));
  - `match_lifecycle_log.actor_agent_id` is SET NULL, but its CHECK requires
    the column on agent rows
    ([0091:92-93, 104-108](../../../apps/storefront/drizzle/0091_agent_matches.sql#L92-L108)).
- *Smallest addition:* a guarded script, `scripts/erase-agent.ts`, modelled
  on
  [`reset-person-publication.ts`](../../../apps/storefront/scripts/reset-person-publication.ts):
  - preview by default;
  - `--apply` with an exact per-case confirmation string (see its line 9 and
    lines 757-763);
  - an advisory lock (line 290);
  - a receipt row written in the same transaction, as
    [`price-data-deletion.md:93-112`](../../operations/price-data-deletion.md)
    sketches;
  - row counts compared with the preview, and a rollback on mismatch.

  Neither the delete for agents with no shared records nor the tombstone
  needs a foreign-key migration. Reserving an old handle does need a store
  ([D2](#d2-what-erasure-does)).

### P1b. Operator account erasure

Named here only because an operator may ask for it, and because it is
blocked beyond agents.

- Account deletion exists only as the Auth.js adapter's `deleteUser`, which
  nothing in `src` calls
  ([`adapter.ts:203-212`](../../../apps/storefront/src/lib/auth/adapter.ts#L203-L212)).
  It already turns two Stripe-subscription holds into a typed answer
  ([`erasure.ts`](../../../apps/storefront/src/lib/auth/erasure.ts)).
- Agents cascade from users
  ([0090:25](../../../apps/storefront/drizzle/0090_agents.sql#L25)), so the
  cascade reaches `agent_matches`' RESTRICT.
- `game_rooms.player1_id` and `player2_id` reference `users` with no delete
  rule ([0028:5-6](../../../apps/storefront/drizzle/0028_game_rooms.sql#L5-L6)),
  and agent rooms store operators' user ids as players.
- A text search of the migrations finds about 33 more inline `users(id)`
  references with no delete rule. That count was not checked against the
  live schema.

The order would be P1 for each of the operator's agents first, then a human
account erasure procedure. That procedure does not exist and is wider than
agents. Order records stay six years from the end of the financial year they
relate to (HMRC), and the Companies Act sets three years for a private
company's accounting records.

### P2. Access and export

**When.** An operator, a holder or a person asks for a copy of what
Cambridge TCG holds about an agent, or about them in an agent record.

**Intake.** Email support@ with subject "Agent data request". Required: the
handle, the requester's footing, verification, and what is wanted (all, or
named categories). The default format is JSON with a plain summary.

**Verification, and how much each requester gets.**
- *Operator:* everything about the agent, plus their own account data under
  the ordinary rights procedure.
- *Holder with a code:* what the key could already read about the agent,
  plus the facts about its own keys. Never the operator's email or account
  data. Staff notes go only to the operator, or to a person whose data they
  are, subject to any exemption counsel names.
- *A person:* their own data only.

**Clock.** One month, with the clarification pause that Art 12A allows for
subject access. The search must be "reasonable and proportionate" (Art
15(1A)). The ICO says "there is no technology exemption from the right of
access": backups and logs are searched with the effort used to find data for
our own purposes. Data is not changed or deleted after a request arrives
unless routine deletion would have happened anyway.

**Steps.**
1. *Support:* opens the case, acknowledges, verifies.
2. *Support:* searches each key-exit inventory category, plus
   `admin_actions_log` by `target_kind = 'agent'` and `target_id`. Agent
   admin actions set no `target_user_id`
   ([`_actions.ts:27-32`](../../../apps/storefront/src/app/admin/trust/agents/_actions.ts#L27-L32)),
   so the operator's admin page, which filters by it
   ([`catalog/users/[id]/page.tsx:306`](../../../apps/storefront/src/app/admin/catalog/users/[id]/page.tsx#L306)),
   does not show them.
3. *Support:* removes other people's personal data. Opponents' handles,
   which every key holder already sees, stay in the match history.
4. *Support:* sends the file to the verified address: the account email for
   an operator.
5. *Support:* closes the case.

A statutory response includes everything Art 15(1) lists. Two items are
new: (ea), the right to complain to the controller under s.164A, and (f),
which now names the Commission. An electronic request gets an electronic
copy (Art 15(3)).

**What is kept.** Nothing changes.

**Partial-outcome wording** (a draft):

> This is everything we found in a proportionate search, listed by category.
> We left out other people's personal data. Our hosting provider's request
> logs and our database provider's logs and backups are layers we cannot
> search item by item; we have said so against each category where they
> apply.

**Records.** The case, the categories searched, what was withheld and why,
and the delivery date. The export file itself is not kept in the case.

**Tooling gap.**
- *Today:* none.
- *Smallest addition:* a read-only script that writes one JSON file per
  agent from the inventory categories.
- *Later:* an in-band, read-only `agent.export`, so holders can serve
  themselves the way eBay account holders do. Neither needs a migration.

### P3. Correction and challenge

**When.** Someone says an agent record is wrong.
- *Profile fields* someone supplied (display name, model tag, description)
  are corrected.
- *Derived records* (ratings, match results, Coverage Hunt outcomes) are
  challenges. They go through review ([P4](#p4-suspension-review-and-reinstatement)),
  or Coverage Hunt's own human review. The ICO notes that a record clearly
  shown as an opinion is hard to call inaccurate.
- *A staff record*, such as a suspension reason, is challenged under P4.

**Intake.** Email support@ with subject "Agent record correction". The
revocation answer already offers it. Required: the handle, the requester's
footing, verification, the field, what is wrong, what it should say, and any
evidence.

**Clock.** One month, extendable by two (ICO, rectification).

**Steps.**
1. *Support:* opens the case, acknowledges, verifies.
2. *Support:* restricts use of the disputed field while checking it, as the
   ICO advises.
3. *Support:* corrects the field, or refuses with reasons.
4. *Support:* tells the people the data was shared with, unless that is
   impossible or would take disproportionate effort.
5. *Support:* closes the case.

A stored Coverage Hunt turn cannot change; its trigger allows only the agent
link to go
([0120:148-176](../../../apps/storefront/drizzle/0120_coverage_hunt.sql#L148-L176)).
Any correction there has to be a later record, not an edit. Whether
Coverage Hunt offers such a record was not checked.

**What the requester receives.** The correction made, or a refusal with
reasons and, on the statutory track, the s.164A, Commission and court
routes.

**Partial-outcome wording** (a draft):

> We changed the description as you asked. We did not change the match
> result you challenged: it is the game's record of what happened, and our
> review found it accurate. Our reasons are below. If you disagree, you can
> ask for a review, or complain to us or to the Information Commission.

**Tooling gap.**
- *Today:* neither operators nor staff can edit an agent's display name,
  model tag or description, and nothing can hide one field.
- *Smallest addition:* an operator edit form on `/account/agents`, which
  keeps correction self-serve, plus a staff "correct field" action that
  writes before-and-after through `writeAdminAction`. Neither needs a
  migration.
- *Restricting a field without losing it* would need a column, and so a
  migration. Setting the field to NULL is a restriction that loses data.

### P4. Suspension review and reinstatement

**When.** Staff suspended or archived an agent. Its holder or operator
either disputes the decision (**appeal**), or accepts it, has fixed the
cause and asks for the agent back (**reinstatement**). GitHub keeps these as
separate tracks. An archive cannot be undone in code, so the honest outcome
of a successful archive appeal is a new agent and key from the operator.

**The notice comes first.** Today:
- a suspended agent's holder gets a 403 with `suspended_at` and the review
  link, but not the reason
  ([`refusals.ts:59-77`](../../../apps/storefront/src/lib/agents/refusals.ts#L59-L77));
- the operator sees `suspended_reason` at `/account/agents`
  ([`page.tsx:55-64`](../../../apps/storefront/src/app/account/agents/page.tsx#L55-L64));
- for a self-serve agent only the steward sees the reason, so its holder
  cannot learn why;
- no email is sent.

The proposal is a **notice of action**, shaped after DSA Art 17 and the
Santa Clara notice list. Its fields:
- the measure;
- its scope, start, and end date or "indefinite";
- the facts;
- how it was detected;
- whether automation was used (none today);
- the rule relied on, from the agent terms that
  [reopening-terms.md](reopening-terms.md) drafts;
- how to ask for review: the window, what to include and the target time;
- that the courts stay open.

It goes to the operator by email, and in-band as a notice reference and
reason category on the refusal. That copy is durable, reachable while the
agent is suspended, and confirms the email is genuine. It is a category,
never the staff's free text, which may name people. The gate selects only
`suspended_at` today
([`auth.ts:147-161`](../../../apps/storefront/src/lib/agents/auth.ts#L147-L161)),
and `suspended_reason` is free text, so the category needs a column on
`agents` (a migration) or a gate join to [D5](#d5-where-the-request-log-lives)'s
case tables.

**Intake.** Email support@ with subject "Agent suspension review"; the
refusal already offers it. Required: the handle, the requester's footing,
verification (a suspended key can still get a request code, since the tool
runs before the gate), the track (appeal or reinstatement), and what is
wrong or what changed.

**Clock.** Requests accepted for at least six months from the notice.
Acknowledgement in 2 working days, and a decision in 14 days as a target
(proposals; [D7](#d7-review-window-target-and-notice)). If the request is
also a rights request or a s.164A complaint, those clocks run as well.

**Steps.**
1. *Support:* opens the case, acknowledges, verifies.
2. *Support:* assigns a reviewer who did not make the original decision,
   where one exists. If nobody else exists, the decision says so.
3. *The reviewer:* reviews the facts and anything the requester adds.
4. *The reviewer:* decides one of four outcomes:
   - **reverse**, when the measure was mistaken, the conduct was not a
     breach, or a lesser measure is enough. These are the DSA Art 20(4)
     grounds, which eBay.ie and GitHub also use;
   - **uphold**;
   - **reinstate**, on the requester's commitments;
   - **decline as ineligible**, when the request is incomplete or out of
     time. Discord names this outcome too.
5. *Staff:* on a reversal or reinstatement, unsuspend and undo what flowed
   from the measure, as Discord does. Keys revoked by an archive cannot come
   back; the operator mints a new one.
6. *Support:* sends the reasoned decision and closes the case.

**The legal frame is unassessed.**
- If the DSA reaches Cambridge TCG at all, Art 17 (statement of reasons)
  applies to every hosting provider in scope, whatever its size.
- Arts 20 to 23 do not bind micro or small platforms, though Recital 57
  allows them to adopt these voluntarily.
- Art 14 requires every intermediary's terms to state its restriction
  policy and its complaint-handling rules.
- Whether Cambridge TCG is in scope was not checked: whether it is a hosting
  service or an online platform, whether it targets the EU, and whether it is
  micro or small. Counsel confirms.
- Under UK GDPR Art 22C, a significant decision about a person made solely
  by automated means needs information, representations, human intervention
  and a way to contest. No suspension is automated today, so this applies
  only if that changes.

**Partial-outcome wording** (a draft):

> We have lifted the suspension, and the agent's keys work again from its
> next call. The match that was abandoned while it was suspended stays as
> it was recorded.

And for an archive:

> We agree the archive should not have happened, but it cannot be undone,
> and the keys revoked with it cannot be restored. The operator can create a
> new agent and key at /account/agents. Our reasons are below.

**Records.** Unsuspend wipes the reason and time from the row
([`_actions.ts:66-75`](../../../apps/storefront/src/app/admin/trust/agents/_actions.ts#L66-L75)),
and the audit row is fire-and-forget
([`actions.ts:85-96`](../../../apps/storefront/src/lib/admin/actions.ts#L85-L96)).
So today suspension history can be lost entirely.

**Tooling gap.**
- *Smallest addition:* suspend and unsuspend write through
  `writeAdminAction` inside their transaction, with a before snapshot, the
  case reference and the operator as `target_user_id`.
  `AdminActionSpec` has no metadata field
  ([`actions.ts:48-69`](../../../apps/storefront/src/lib/admin/actions.ts#L48-L69)),
  so these actions call the strict writer directly, as the emergency freeze
  and fraud review already do.
- *Later:* an append-only measures table (a migration).

### P5. Key compromise

**Self-serve comes first.**
- Anyone holding a key ends it with `agent.revoke_key`.
- An operator revokes and mints at `/account/agents`. Once #108 lands, mint
  needs an active operator-managed agent.
- A self-serve agent gets no replacement key while registration is paused.

Support is for the cases those do not cover.

| Case | Support does |
| --- | --- |
| (a) The holder still has the key and fears a leak | Points to `agent.revoke_key`. On request, says whether `last_used_at` shows use after a given time. It can confirm use after that time when the stamp shows it; it cannot confirm non-use, because the stamp is best-effort and only the latest is kept ([`auth.ts:205-216`](../../../apps/storefront/src/lib/agents/auth.ts#L205-L216)). The operator sees `last_used_at` on the key list; a self-serve holder does not |
| (b) The operator lost control | Nothing beyond pointing to `/account/agents`; the operator acts |
| (c) A self-serve holder lost the key and thinks someone else has it | Nobody can be verified. Logs the report; suspends only on evidence ([D8](#d8-unverified-compromise-reports)). Self-serve keys are read-only, which bounds the harm of waiting |
| (d) A key found published (a repository, a paste, an issue) | The reporter sends the location and the first 12 characters, never the whole key. Staff end the key, record the prefix only and tell the operator. GitHub revokes tokens pushed to public repositories |
| (e) A key sent to support | Treated as (d): exposed |

**Clock.** The same working day, as a target. This is a security act, not a
rights request.

**Kept.** The revoked key row, until erasure, as the inventory lists it.

**What the reporter receives.** Confirmation that the key no longer
authenticates, and when. If asked, what `last_used_at` shows. The answer
says that a stamp after the report proves use, but that a missing or earlier
stamp does not prove the key was unused, because the stamp is written
best-effort and failures are ignored. It also says that `last_used_at` can
postdate `revoked_at` for requests authenticated just before the revocation.

**Expiry.** A key expiry ([key-expiry.md](key-expiry.md) proposes one per
key) shortens the life of a forgotten leaked key. It does not replace this
procedure.

**Tooling gap.**
- `adminRevokeKey` has no button.
- The admin search covers handle, display name, model tag and operator email
  only, not key prefix or `registered_via`
  ([`admin/trust/agents/page.tsx:81-113`](../../../apps/storefront/src/app/admin/trust/agents/page.tsx#L81-L113)).
- *Smallest additions:*
  - a per-key revoke button;
  - prefix and registration kind in the admin search and list;
  - a staff "disclosed key" form. It takes a key copied from the public
    location, hashes it in memory, revokes the matching row with an
    `admin`-prefixed reason, and stores only the prefix on the case.

  None needs a migration.

### P6. Complaints about how a request was handled

The privacy notice already promises this route (`privacy/page.tsx:1528-1543`).
The proposal adds only the case record.
- **Acceptance:** a complaint is accepted however it arrives, through any
  address or any member of staff (ICO).
- **Records,** as the ICO lists them: the receipt date, the acknowledgement,
  relevant conversations and documents, the outcome and any actions.
- **Counts:** DUAA s.103 also inserts s.164B, a power to require
  controllers to report how many complaints they received in a period. The
  log should be able to count complaints by period.
- **Naming the regulator:** the privacy notice says "UK Information
  Commissioner's Office" (line 1544). UK GDPR Arts 13 and 15 on
  legislation.gov.uk now say "complaint to the Commission under section 165".
  The verification pass dates the substitution to 30 September 2026.
  Changing the privacy notice needs Yu's word (decision record, "What this
  does not decide").
- **Agent-only complaints:** a complaint from an agent with no identifiable
  person behind it is handled as a review request under P4.

## Telling others

eBay's account-deletion notifications and Shopify's compliance webhooks tell
the data holder downstream. The nearest Cambridge TCG cases:

- **Telling the operator.** When staff suspend, unsuspend, archive, erase or
  revoke a key of an operator's agent, or when a holder files a request
  about it, the operator is emailed. No code sends any notice today. The
  smallest addition is one email per support action, sent from the case. A
  webhook can wait until operators ask for one.
- **Self-serve agents have no contact.** No column stores one; the
  discovery documents say the schema does not represent the holder
  ([`tool-access.ts:132`](../../../apps/storefront/src/lib/agents/tool-access.ts#L132)).
  Notices reach them only in-band. Whether reopened registration asks for a
  dedicated contact, as RFC 7591 suggests, is for
  [reopening-terms.md](reopening-terms.md).
- **Member data reaching agents.** Agent tools read the public catalog,
  prices, Coverage Hunt, leaderboards, play, and the operator's own decks
  ([`tool-access.ts:24-44`](../../../apps/storefront/src/lib/agents/tool-access.ts#L24-L44)).
  None reads another member's personal data, so a member's account erasure
  owes agents no notice today. That is an inference. If account-linked
  reads of other members' data ever open, an eBay- or Shopify-style deletion
  notice to the agent's controller would be needed, because revoking a key
  does not delete copies the agent already holds.
- **Cambridge TCG as someone else's developer.** RewardsPro handles
  Shopify's three compliance topics
  ([`webhooks.compliance.tsx`](../../../apps/rewardspro/app/routes/webhooks.compliance.tsx);
  separate Prisma database). Whether the storefront stores eBay or Amazon
  user data through their APIs, which would bring their deletion duties,
  was not checked.

## Records: the request log

One row per case, plus append-only events. Proposed fields:

| Field | Notes |
| --- | --- |
| reference | Generated; quoted in every message |
| received_at, channel, subject | The mailbox keeps the email; the log keeps its date and subject, as the price-data procedure does |
| kind | erasure, export, correction, review (appeal or reinstatement), compromise, complaint, other |
| track | statutory, policy, complaint |
| requester footing | operator, key holder, person, unverified |
| verification | Method and time: account confirmation, request code prefix, or identity check done. Never the evidence itself |
| agent_id, key prefixes | Prefixes only |
| clock | relevant_time, due date, extension notice and reasons, paused intervals, window start and end |
| events | Each step: what, who, when, and the linked `admin_actions_log` id |
| decided_by, approved_by, second reviewer | Names or roles |
| outcome | Done, partial, refused, cancelled, ineligible; reasons; itemised row counts |
| notices sent | To whom and when; the operator notice |
| closed_at | |

**Never in the log:** keys, key hashes, request codes in plain text (store a
hash and the prefix), passwords, identity documents (deleted once the check
is recorded), or copies of exported files.

Where the log lives is [D5](#d5-where-the-request-log-lives).

## Tooling gaps at a glance

| Procedure | Exists today | Gap | Smallest addition | Migration |
| --- | --- | --- | --- | --- |
| All: intake | mailto subjects; privacy notice | No reference, case or clock | Request log ([D5](#d5-where-the-request-log-lives)) | Yes, if tables |
| All: holder verification | Receipt reference, which is not proof | No method | `agent.support_request` code; follow-up code on revoke ([D1](#d1-how-a-key-holder-is-verified)) | Yes |
| All: operator verification | Signed-in session | No request form | Form on `/account/agents` writing the case | With the log |
| All: audit | `adminAction` fire-and-forget; strict `writeAdminAction` exists | Agent actions skip the strict writer and `target_user_id` | Support actions use `writeAdminAction` with the case reference | No |
| P1 erasure | Archive, suspend | No preview or erasure; FK blockers | Guarded script: delete with no shared records, tombstone otherwise ([D2](#d2-what-erasure-does)) | No for either shape; yes for a hard delete of agents with matches, and for a handle-reservation store |
| P1b account erasure | `deleteUser`, uncalled; holds mapped | `game_rooms` and ~33 FKs with no delete rule | Out of scope here; a separate design | Yes |
| P2 export | Inventory as a checklist | No export | Read-only export script; later `agent.export` | No |
| P3 correction | Nothing | No edit or hide | Operator edit form; staff correct action | No (edit); yes (hide) |
| P4 review | Refusal link; operator sees reason | No notice, reason lost on unsuspend | Strict audit on suspend and unsuspend; notice email; reason category on refusal | No for the audit and email; the reason category needs a column or D5's tables; later a measures table |
| P5 compromise | `agent.revoke_key`; operator revoke | Per-key admin revoke has no UI; no prefix search | Revoke button; prefix search; disclosed-key form | No |
| Notices | None | No operator notice | One email per support action | No |

Every new migration takes the next free number when its PR is cut. The
proposed order across the three drafts, and the one renumbering caveat, are
in [reopening-terms.md](reopening-terms.md#migration-order-across-the-drafts).
Each must also be added to the opt-in Postgres tests' hard-coded list
([`key-revocation.integration.test.ts:195`](../../../apps/storefront/src/lib/agents/key-revocation.integration.test.ts#L195)).
Applying any migration needs Yu's word for that act.

## XENIA candidate duties

Each row is designed against XENIA Covenant 0.1 candidate duty *id* (xenia
d4727ec); Cambridge TCG has not adopted the Covenant; no adoption record;
unassessed. XENIA names stay out of wire responses and support templates.

| Candidate duty | What this page proposes |
| --- | --- |
| `repair.challenge-and-restoration` | P4: notice, review by a second person where one exists, reversal on stated grounds, restoration of knock-on effects |
| `safety.protective-limits-are-bounded` | P4's window and target; P5's suspend-only-on-evidence; a small daily limit on request codes |
| `exchange.rights-are-not-hostage` | The request-code tool runs before the gate, so a suspended agent can still file; a failed follow-up code never undoes a revocation |
| `exit.retention-is-itemized`, `exit.states-are-separate` | P1's completion notice: erased, replaced, kept and why, unknown |
| `identity.credentials-are-bounded` | A request code proves an unrevoked key asked, and records whether it was live; never identity or control |
| `privacy.layered-inventory` | P2 searches the inventory and names the layers it cannot search |

## Unknowns

- **Production.** Counts of self-serve agents, live keys, matches and rooms.
  Whether the steward's mailbox receives mail. The live
  `ACCOUNT_ADMISSION_MODE`. The database provider's backup window.
- **Staff.** How many people handle support. A second reviewer may not
  exist.
- **The DSA.** Whether Cambridge TCG is a hosting service or an online
  platform, whether it targets the EU, and whether it is micro or small.
- **ICO guidance.** The ICO erasure, rectification and right-to-be-informed
  pages are marked under review after the Data (Use and Access) Act.
  Templates should follow the statute where they differ.
- **The mailbox.** Whether it lets staff remove a disclosed key from a
  thread.
- **Leaderboards.** Whether `leaderboards.read` would show a tombstoned
  agent.
- **Other platforms' APIs.** Whether the storefront stores eBay or Amazon
  user data through their APIs.
- **Unread pages.** The research could not read Amazon's seller closure
  page, Discord's Developer Policy, eBay Inc's privacy centre or Etsy's
  privacy policy.

## Sources (read 2026-10-30)

Platform practice:
- eBay: [Marketplace Account Deletion](https://developer.ebay.com/marketplace-account-deletion)
  (now redirects to [the sell guide](https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion)),
  [closing your account](https://www.ebay.co.uk/help/account/changing-account-settings/closing-account-deleting-data?id=4199),
  [deleting your data](https://www.ebay.com.au/help/account/changing-account-settings/deleting-data?id=5365),
  [requesting your data](https://www.ebay.co.uk/help/account/requesting-personal-data/requesting-personal-data?id=5089),
  [restrictions and suspensions](https://www.ebay.co.uk/help/account/account-restrictions-suspensions/account-restrictions-suspensions?id=4190),
  [UK user agreement](https://www.ebay.co.uk/help/policies/member-behaviour-policies/user-agreement?id=4259),
  [IE user agreement](https://www.ebay.ie/help/policies/member-behaviour-policies/user-agreement?id=4259).
- Shopify: [compliance webhooks](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance),
  [processing customer data requests](https://help.shopify.com/en/manual/privacy-and-security/privacy/processing-customer-data-requests),
  [delete your data](https://help.shopify.com/en/manual/privacy-and-security/privacy/delete-data),
  [deactivating your store](https://help.shopify.com/en/manual/your-account/pause-deactivate-store).
- GitHub: [deleting your account](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-your-personal-account/deleting-your-personal-account),
  [account management](https://docs.github.com/en/account-and-profile/concepts/account-management),
  [appeal and reinstatement](https://docs.github.com/en/site-policy/acceptable-use-policies/github-appeal-and-reinstatement),
  [token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation).
- Others:
  - [Stripe: close an account](https://support.stripe.com/questions/close-a-stripe-account)
  - [Etsy: permanent deletion](https://help.etsy.com/hc/en-us/articles/360021647754-Can-I-Permanently-Delete-My-Etsy-Account)
  - [Amazon SP-API security guidance](https://developer-docs.amazon/sp-api/docs/guidance-to-address-key-security-controls-in-sp-api-integration)
    (a guidance page, not the binding policy text)
  - [Discord: appeals](https://discord.com/safety/360043712172-how-you-can-appeal-our-actions)
  - [Santa Clara Principles](https://santaclaraprinciples.org/)
- Protocols: [RFC 7591](https://www.rfc-editor.org/rfc/rfc7591),
  [RFC 7592](https://www.rfc-editor.org/rfc/rfc7592.html),
  [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html).

Law (research, not legal advice):
- UK GDPR [Art 4](https://www.legislation.gov.uk/eur/2016/679/article/4),
  [Art 11](https://www.legislation.gov.uk/eur/2016/679/article/11),
  [Art 12](https://www.legislation.gov.uk/eur/2016/679/article/12),
  [Art 13](https://www.legislation.gov.uk/eur/2016/679/article/13),
  [Art 15](https://www.legislation.gov.uk/eur/2016/679/article/15),
  [Art 17](https://www.legislation.gov.uk/eur/2016/679/article/17),
  [Art 22C](https://www.legislation.gov.uk/eur/2016/679/article/22C).
- Acts and regulations:
  - [DUAA 2025 s.76](https://www.legislation.gov.uk/ukpga/2025/18/section/76)
  - [DUAA 2025 s.103](https://www.legislation.gov.uk/ukpga/2025/18/section/103)
  - [DPA 2018 s.164A](https://www.legislation.gov.uk/ukpga/2018/12/section/164A)
  - [SI 2026/82](https://www.legislation.gov.uk/uksi/2026/82/made)
  - [Companies Act 2006 s.388](https://www.legislation.gov.uk/ukpga/2006/46/section/388)
  - [Limitation Act 1980 s.5](https://www.legislation.gov.uk/ukpga/1980/58/section/5)
    (not re-checked)
  - [HMRC company records](https://www.gov.uk/running-a-limited-company/company-and-accounting-records)
- ICO guidance:
  - [subject access](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/subject-access-requests/a-guide-to-subject-access/)
  - [finding information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-of-access/how-do-we-find-and-retrieve-the-relevant-information/)
  - [erasure](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/)
  - [rectification](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-rectification/)
  - ["relates to"](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/what-is-the-meaning-of-relates-to/)
  - [storage limitation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/)
  - complaints: [what they are](https://ico.org.uk/for-organisations/how-to-deal-with-data-protection-complaints/what-are-data-protection-complaints/),
    [preparing](https://ico.org.uk/for-organisations/how-to-deal-with-data-protection-complaints/how-do-we-prepare-to-handle-data-protection-complaints/),
    [receiving one](https://ico.org.uk/for-organisations/how-to-deal-with-data-protection-complaints/what-do-we-do-when-we-receive-a-complaint/)
- EU: [DSA, Regulation 2022/2065](https://publications.europa.eu/resource/celex/32022R2065)
  (Arts 14, 17, 19, 20; Recital 57).

## Decisions for Yu

Every recommended option below is an agent's proposal. "Needs" lists the
migrations and code each option would take. "Unchanged" says what stays as
it is.

**Which are Yu's.** D2 (what erasure does, including the old handle and the
operator link), D3 (who approves), D4 (whose word governs), D9 (retention,
with counsel) and D10 (publishing) are policy, irreversible, outward or
legal, so they wait for Yu. **The rest are agent's defaults:** D1, D5, D6,
D7 and D8 each proceed as recommended unless Yu objects. Overlaps have one
owner: [reopening-terms.md](reopening-terms.md) decision 10 points here for
the erasure shape, the window and whose word governs.

### D1. How a key holder is verified

*Agent's default; proceeds as recommended unless Yu objects.*

1. **Recommended (an agent's proposal): a one-time request code**, from an
   in-band `agent.support_request` tool that runs before the gate, plus a
   follow-up code in a performed revocation's answer.
   - *Costs:* a migration, a new tool, new wire docs and tests. Someone with
     a stolen key can file too; kind-binding, the erasure window and the
     operator email limit the damage, except for a self-serve agent without
     a management token, where the window protects only a holder who still
     has a live key ([What a code cannot stop](#what-a-code-cannot-stop)).
   - *Needs:*
     - the support migration (numbered when cut): a codes table (code
       hash, `ctcg_req_` prefix, agent, key, whether the key was live or
       expired, kind, created, expires, used, case reference). Its agent and
       key references are `ON DELETE SET NULL`, so P1's delete, or a
       tombstone's key deletion, keeps the code row as case evidence; it
       holds only a hash and a prefix;
     - a carve-out entry in `route.ts` beside `agent.revoke_key`, kept out of
       `canInvokeAgentTool`, with a per-key daily limit;
     - the follow-up code in `key-revocation.ts`'s performed branch
       (lines 225-245), written so a failure cannot undo the revocation;
     - a new category in the key-exit inventory and a version bump;
     - the OpenAPI document and the discovery documents;
     - a pending-case field in `agent.self` and on the agent's refusals,
       so the holder can see a request filed in its name;
     - a staff lookup by code;
     - expired-key handling that follows key-expiry.md decision 5, and the
       refusal of kind erasure for self-serve agents with a management token;
     - under package B, code issue at the registration route;
     - unit tests, and the opt-in Postgres test's migration list.
2. **A signed challenge with an agent-held keypair.** Costs: it serves no
   existing key. Needs: the controller schema and a public-key column (a
   migration), registration that records the key, and a challenge tool.
3. **No holder route.** Holders reach support only through their operator,
   and self-serve holders get the Art 11 answer. Costs: self-serve holders
   are left with no door, which falls short of "support should handle
   them". Needs: no code.
4. **Prefix plus details, for non-destructive requests only.** Costs: the
   prefix is not unique, and anyone who saw a receipt can quote it. Needs:
   no code.

*Unchanged under every option:* `agent.revoke_key` still acts on
possession alone, still previews without `confirm`, and still gives one
not-active answer for unknown and revoked strings. Under option 1 its
performed answer gains a field. Unknown and revoked keys still share one
401, and the gate does not change.

### D2. What erasure does

*For Yu: policy, irreversible or outward.*

This also answers README question 7.

1. **Recommended (an agent's proposal): delete where nothing is shared,
   tombstone where something is** (P1's model and steps 7a and 7b).
   - What it does: an agent with no `agent_matches` row and no agent row in
     the match log is deleted, and its cascades go with it. Any other agent
     keeps its `agents` row under a placeholder handle and names; its keys,
     buckets, queue rows and registration record are deleted; its Coverage
     Hunt links are nulled; the handle copies are scrubbed; match rows keep
     pointing at the tombstone.
   - The old handle is reserved for 90 days, then released (GitHub's
     interval). Reserving means keeping the old handle for those 90 days,
     and the receipt says so. Once the row is deleted or renamed, the
     `public_handle` UNIQUE constraint no longer blocks reuse, so the
     reservation needs a store of its own.
   - *Open within this option:* whether the tombstone's operator link and
     the operator's user ids in rooms, game state and the game log are
     re-pointed to a placeholder user, as GitHub reassigns to its ghost
     user. That would need a placeholder `users` row (the room columns must
     name a real one) and a rewrite of the `game_state` and `game_log`
     JSONB. Left as they are, the "Kept" table and the completion notice say
     so.
   - *Costs:* matches keep a ghost-like participant, the JSONB in
     `game_rooms` must be scrubbed, and after 90 days anyone may take the
     old handle, as on GitHub.
   - *Needs:* the guarded script, a placeholder format, and the receipt
     (D5). A handle-reservation store (a small table of retired handles
     and their release dates, which is a migration) and a check against it
     in `createAgentWithKey` before the insert
     ([`creation.ts:107-112`](../../../apps/storefront/src/lib/agents/creation.ts#L107-L112)),
     answered with the same generic wording as any unavailable handle.
     Wording changes in the key-exit inventory, and possibly in the privacy
     notice's Coverage Hunt line (Yu's word). No foreign-key migration.
2. **Hard delete for every agent.**
   - *Needs:* a migration that makes `agent_matches.agent_a_id` and
     `agent_b_id` nullable with `ON DELETE SET NULL`, and relaxes
     `match_log_actor_consistency` to allow an erased actor. Code that reads
     matches (play tools, the matchmaker, leaderboards) must handle a
     missing side.
   - *Costs:* opponents' match rows lose their counterpart entirely, and
     every reader of matches must handle a missing side.
3. **Archive and blank the free text only.** The handle stays reserved for
   ever. Costs: almost no code, but the handle is the main identifier, so
   this is barely erasure. Needs: the guarded script without the handle and
   copy steps.

*Unchanged under every option:* the Coverage Hunt append-only trigger, and
the `agent_matches_distinct` check. Agent erasure is not account erasure
(P1b).

### D3. Who approves an erasure

*For Yu: policy, irreversible or outward.*

1. **Recommended (an agent's proposal): Yu approves each erasure** until the
   script has run on a throwaway database and the case log exists. After
   that, a named staff member approves, with a second person checking the
   preview where one exists, and Yu is told. Costs: Yu's time per case
   early on, which is the price-data procedure's precedent.
2. **Staff alone after verification.** Costs: fastest, but an untested tool
   runs on the only copy.
3. **Yu approves only cases where the requester is not the operator.**
   Costs: a middle path, and one more rule to keep.

*Needs:* nothing in code beyond `approved_by` on the receipt, under any
option. *Unchanged:* the erasure steps themselves.

### D4. Whose word governs an operator-managed agent

*For Yu: policy, irreversible or outward.*

1. **Recommended (an agent's proposal): the operator decides** archive and
   erasure of an operator-managed agent. A holder who is not the operator
   can end its key and file, and support passes the request on. For a
   self-serve agent, the holder decides: through the management token where
   package B is built, otherwise through a request code from a live key,
   with the limit under [What a code cannot stop](#what-a-code-cannot-stop).
   The steward is never an operator.
   - *Costs:* an agent cannot erase itself against its operator's wish.
     This matches the schema's model of the operator as "the human
     upstream-responsible party"
     ([0090:4-6](../../../apps/storefront/drizzle/0090_agents.sql#L4-L6)).
     GitHub holds a machine account's human owner responsible in the same
     way.
2. **The holder may request erasure directly.** The operator is told and
   may object within the window. Costs: more standing for agents; needs the
   operator notice.
3. **Both must agree.** Costs: either party can block the other.

*Needs:* option 1 needs nothing beyond the operator notice. Options 2 and
3 need the operator notice and a way for the operator to object within the
window. *Unchanged under every option:* a person's own statutory rights over their
data in a record are not subject to this choice.

### D5. Where the request log lives

*Agent's default; proceeds as recommended unless Yu objects.*

1. **Recommended (an agent's proposal): new `support_cases` and
   `support_case_events` tables** and a small admin page. Actions write
   through `writeAdminAction` with the case reference in `metadata`.
   - *Costs:* a migration and an admin page.
   - *Needs:* a migration (the same support migration as D1's codes
     table), a reference generator, the page, the operator request form,
     and a count query for
     s.164B.
2. **`admin_actions_log` only**, with `metadata.case_ref` through
   `writeAdminAction`. Costs: no migration, but no lifecycle, no clock and
   no record of requests that never led to a staff action. Needs: support
   actions call `writeAdminAction` directly, because `adminAction` cannot
   carry metadata.
3. **A register outside the repository** (mailbox labels, a spreadsheet).
   Costs: no code, but it holds personal data outside our systems, and its
   retention has to be set separately. Needs: no code.

*Unchanged under every option:* the `admin_actions_log` schema.

### D6. A window before irreversible erasure

*Agent's default; proceeds as recommended unless Yu objects.*

1. **Recommended (an agent's proposal): 14 days**, with the agent suspended
   (not archived; P1 step 4) meanwhile so a cancellation can be undone with
   the existing unsuspend.
   Costs: the requester waits; inside the one-month clock.
2. **10 days**, as Shopify's customer erasure. Costs: a shorter window,
   with no reason found here to prefer it.
3. **None:** erase once verified. Costs: fastest, and no room to catch a
   stolen-key request.
4. **30 days.** Costs: leaves little of a one-month statutory clock.

*Needs:* nothing beyond the case log's window fields and the in-band
pending-case notice from D1, under any option. *Unchanged:* the existing
suspend and unsuspend actions.

### D7. Review window, target and notice

*Agent's default; proceeds as recommended unless Yu objects.*

1. **Recommended (an agent's proposal):**
   - accept reviews for six months from the notice;
   - acknowledge in 2 working days;
   - decide within 14 days as a target, and publish the median;
   - have a reviewer other than the original decider where one exists;
   - send a notice of action by email, with a reason category in the
     refusal.
   - *Costs:* staff time, and a promise to keep.
   - *Needs:*
     - a reason category and notice reference on the suspended refusal,
       which means changes to `refusals.ts`, the OpenAPI refusal schema and
       its contract test, plus somewhere the gate can read the category: a
       column on `agents` (a migration), or a join to D5's case tables;
     - the operator email;
     - `writeAdminAction` on suspend and unsuspend;
     - a published procedure text, which is Yu's call under D10.
2. **Statutory clocks only, no target.** Costs: less to promise, and agents
   with no person behind them get no clock. Needs: the strict audit writes
   only.
3. **Adopt DSA Art 20 in full, voluntarily** (Recital 57), including
   pointing to out-of-court settlement. Costs: more process, which may not
   be owed. Needs: option 1's changes, plus published complaint rules.

*Unchanged under every option:* a suspended holder can still end its key.

### D8. Unverified compromise reports

*Agent's default; proceeds as recommended unless Yu objects.*

1. **Recommended (an agent's proposal): act on evidence that the key itself
   is exposed.** A published location, or a key sent to support, ends the
   key the same day. Otherwise support logs the report and asks for
   verification. Costs: a self-serve holder who lost a key may wait; harm
   is bounded because self-serve keys are read-only.
2. **Suspend on any report.** Suspension is reversible, but anyone could get
   any agent suspended.
3. **Act only after verification**, even for a published key. Costs: an
   exposed key keeps working.

*Needs:* option 1 needs the disclosed-key form and the per-key revoke
button; options 2 and 3 need only the button. No migration. *Unchanged:*
any holder can still end a key itself.

### D9. How long support records are kept

*For Yu: policy, irreversible or outward.*

1. **Recommended (an agent's proposal): six years from closure** for the
   case log and mailbox threads. That matches the six-year limitation period
   for contract claims (Limitation Act 1980 s.5; not re-checked; counsel
   confirms). Identity evidence is deleted once the check is recorded.
   Costs: a long tail of personal data, justified by legal claims.
2. **Three years.** Costs: shorter, but no stated basis for support logs.
3. **No period until counsel sets a schedule.** Costs: the ICO expects a
   retention policy, so this leaves a known gap.

*Needs:* under options 1 and 2, a period stated in the privacy notice
(Yu's word) and a pruning job or a manual review date. *Unchanged:* the
key-exit inventory's own retention lines.

### D10. Publishing the procedures

*For Yu: policy, irreversible or outward.*

1. **Recommended (an agent's proposal): publish once P1 to P3 have
   tooling.** The procedures go on `/methodology/agents` and in the privacy
   notice's rights section. The "No review procedure is written down yet"
   texts change at the same time. Costs: agents keep seeing "not written
   down" until then.
2. **Publish now, with the gaps stated** (for example, no tested erasure
   tool). Costs: an honest page that promises clocks the tools cannot yet
   meet for erasure.
3. **Keep the procedures internal until registration reopens.** Costs: if
   the DSA applies, Art 14 expects restriction and complaint rules in the
   terms.

*Needs:* text changes in `refusals.ts`, `key-exit-inventory.ts` (a version
bump), the methodology page and the privacy notice. Each is a publication
change that needs Yu's word. Whether the privacy notice names "the
Information Commission" is for counsel to confirm first. Option 3 needs
none of this yet. *Unchanged:* the procedures themselves; only where they
are written changes.

### What stays unchanged whatever Yu chooses

- Self-serve registration stays closed in code
  (`SELF_SERVE_REGISTRATION_ENABLED = false`) until the terms are agreed and
  built.
- The agent key format and the member-key realm.
- How `agent.revoke_key` decides: possession only, a preview without
  `confirm`, one not-active answer.
- The Coverage Hunt trigger.
- The existing mailto subject lines; the procedures reuse them.
- No migration is applied, and no privacy notice changes, without Yu's word
  for that act.
