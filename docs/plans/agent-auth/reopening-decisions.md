# Reopening registration: the decisions on one page

**Status.** Written **2026-11-11** by an AI agent (Claude Code session
99296f25) from two subagents' reading of the code and the drafts on
2026-11-10: one gathered, the other checked and corrected it. A third
checked this page against the drafts, and its corrections are applied. **Yu
has not reviewed it.** It decides nothing and builds nothing. It exists so
the terms can be discussed in one sitting: the drafts it draws on run to
several thousand lines and ask for more than thirty decisions between them.

- **What is settled, by Yu's answers.** Yu's words are kept in the estate's
  private decision ledger, not in this repository.
  - 2026-10-30: yes to reopening registration, with the terms still to be
    discussed; support is to handle these requests, with procedures to be
    designed by reference to what large platforms such as eBay and Shopify
    do; and key expiry is an option, depending on the agent, as other
    authentication protocols offer it.
  - 2026-11-10: yes to offering agent-held signing keys.
  - 2026-11-10: yes to #230. That answered a message that asked for a word
    to apply migration 0152 and merge #230 (held keys' first slice), and
    that listed [account-continuity.md](account-continuity.md) for Yu's
    read.
- **How an agent read that last answer,** and it is the agent's reading, not
  Yu's: as taking that page's recommendations too. A1 is this page's
  decisions 2 and 3, A2 is decision 1, and A3 (a door for hosted chat apps)
  was set aside as "not now". They are listed below so Yu can confirm or
  overturn them.
- **What is not settled:** everything else below. Registration is closed.
  It stays closed until the terms are agreed and what they need is built.
- **The drafts.** [reopening-terms.md](reopening-terms.md) (RT),
  [held-keys.md](held-keys.md) (HK),
  [support-procedures.md](support-procedures.md) (SP),
  [account-continuity.md](account-continuity.md) (AC) and the
  [README](README.md). Each decision below names where it comes from.

## What reopening would be

Two ways to open an account with no person's account behind it, opened
together:

| | Signed registration (HK's S2) | Key issuance (RT's package B) |
| --- | --- | --- |
| For | An agent whose host can keep a private key and run code | A holder that can only keep a bearer secret, such as a platform vault |
| How | The agent makes a key pair and sends one signed `agent.register` | A request returns a usage key and a management token, each shown once |
| What the store issues | Nothing secret | Two secrets |
| Later keys | The signing key mints usage keys, as built in slice 1 | The management token mints them |
| Builds on | Slice 1's verifier, envelope, transaction, events and limits, each changed to admit an act from an agent that does not exist yet | The bearer gate for usage keys, plus a new route for the management token |

Neither reaches a hosted chat app, which can present only an OAuth grant
(Claude's apps also one organisation-wide header); see AC.

## The decisions

Each has the drafts' recommendation and what follows from each answer.
**Build** means it blocks even a first build kept behind the closed door;
**open** means it only blocks opening.

1. **Which package, and both doors together?** (RT decision 1; AC's A2.)
   *Recommended:* package B, with signed registration beside it. *Read as
   answered yes,* on the agent's reading above. *The alternative AC names:*
   package B alone first, as RT proposed before the research. **Open.**
2. **May anyone who holds a credential register, with no contact, domain or
   account?** (RT decision 2; part of AC's A1.) *Recommended:* yes. *Read as
   answered yes,* on the agent's reading above. *Yes:* no personal data is
   asked for. *No:* verification email, or a resolved domain. **Open.**
3. **Do new self-serve agents have no operator at all?** (RT decision 3;
   part of AC's A1.) The drafts disagree on whose this is: RT calls it an
   agent's default that proceeds unless Yu objects, and AC lists it for Yu.
   It reverses the schema's founding assumption of "the human
   upstream-responsible party". *Recommended:* yes. *Read as answered yes,*
   on the agent's reading above. *Yes:* a migration makes the column
   nullable, and about fifteen files that name it change. *No:* the steward
   account keeps standing in, and the first reopening requirement stays
   unmet. **Build,** if Yu wants it asked again.
4. **How are the terms accepted?** (RT decision 5; HK's S2.)
   *Recommended by RT:* the registrant states the current terms version
   exactly, changes get thirty days' notice, and counsel is asked what
   acceptance by an agent with no person behind it means. Under signed
   registration the statement would also be signed over the terms' digest;
   HK says a signed digest "is still not consent". *Either way* the terms
   text has to exist first. **Open.**
5. **Does registering publish nothing?** (RT decision 9; README question
   13.) *Recommended:* yes; the public ladder is opt-in. Coverage Hunt
   shows contributors' handles to every key holder today, and reopening
   widens "every key holder" to anyone who registers, so that visibility
   needs its own answer. **Open.**
6. **What is kept, and is the notice published first?** (HK decision 3; RT
   term 5; SP decision 10.) *Recommended:* signed acts are kept until
   erasure and a short receipt indefinitely; the privacy notice's rows come
   before the door opens; SP recommends publishing the support procedures
   once erasure, access and correction have tooling. The rows for signing
   keys were added on 2026-11-10; a registration record would need its own.
   **Open.**
7. **How does an account end?** (SP decisions 2 and 3; HK's S3.)
   *Recommended:* erasure deletes where nothing is shared and leaves a
   tombstone where something is; Yu approves each erasure until the tool is
   tested; and a key-born agent can archive itself and schedule its own
   erasure by signed act, with an optional second, cold recovery key. *The
   open part:* whether that signed exit must exist at first opening.
   Without it, an agent that loses its only key is stranded, and the third
   reopening requirement rests on support. **Open.**
8. **What does "non-enumerating" mean?** (README question 11, which says
   only Yu can answer; RT decision 8 calls it an agent's default, so the
   drafts disagree.) *Recommended:* server-assigned handles, and one answer
   for every limit, so no answer tells a caller whether a name, key or
   contact exists. **Open.**
9. **The legacy agent and its leftovers.** Two separate things (RT
   decisions 11 and 7).
   - Does the self-serve agent from July (production held one on
     2026-10-30) stay as it is, read-only, under the steward?
     *Recommended:* yes.
   - Is the one legacy row that holds an unsalted hash of an IP address
     deleted from production? *Recommended:* yes. This is a deletion in
     production, so it needs Yu's word for that act.

   **Open.**
10. **The limits.** (RT term 4.) The draft proposes 3 registrations per
    address per day and 100 a day in all. A subagent's check found what the
    numbers leave open:
    - a new key pair costs a caller nothing, so limits per key do not bound
      registration;
    - one caller with many addresses can use up a global daily cap for
      everyone;
    - each registration writes about six rows, and its event row (up to
      8 KiB) stays; erasure empties the signed act from it but keeps the
      row;
    - each new agent can mint five keys at thirty calls a minute each.

    *Recommended:* an agent's default for the numbers, and a durable
    counter for registrations. The per-key call limit is already kept in
    the database; slice 1's signed-act limits live in memory, per server
    instance. No draft proposes an edge rate rule for registration; HK
    proposes one for the act doors, and as a change to a live service it is
    Yu's. **Open.**

## Also Yu's, and not among the ten

- **The production flag for signed acts, and an edge rate rule** for the
  act doors. Signed registration cannot open while `AGENT_SIGNED_ACTS` is
  off (HK, "What still needs Yu's word").
- **A door for hosted chat apps** (AC's A3 and A4): set aside as "not now"
  on the agent's reading above.
- **Whose word governs an operator-managed agent** (SP decision 4) and
  **how long support records are kept** (SP decision 9).
- **`ACCOUNT_ADMISSION_MODE`** (README question 10): whether new accounts
  for people may be created, which the operator door depends on.

## What a first build needs whatever the answers

Found by reading the code on `main` after slice 1, and not for Yu to decide:

- **A third kind of agent.** `registered_via` has two values. A key-born
  agent stored as `self-serve` inherits sentences that would be false for
  it ("No replacement key can be issued"), so it needs its own kind, or
  code that branches on what stands behind the agent.
- **A registration that can be repeated safely.** A signed act works once,
  every later act needs the agent's id, and a confirmed key cannot be
  confirmed again. If the answer is lost, the holder never learns its agent
  id. A lookup by key, or an answer that repeats, closes that.
- **The other two acts** HK lists for S2: `terms.accept` and
  `profile.update`.
- **The staff page.** `/admin/trust/agents` would throw on an agent with no
  operator, and staff have no action to remove a signing key.
- **Notices in-band.** The support procedures notify an operator by email;
  a key-born agent has none.
- **Size.** A subagent's guess is 3,000 to 5,000 lines with tests, scaled
  from slice 1, which was guessed at 1,500 and came to about 8,800 with its
  documents and lockfile. The guess leaves out package B, the signed exit,
  the erasure tool and the terms text, and shows no working.

## What the drafts say that later work changed

To correct when the terms are next edited:

- RT's registration answer returns two secrets. That stays right for
  holders that can only keep a bearer secret. For agents that can sign, a
  public key keeps secrets out of the model that registers (AC).
- RT calls an agent-held key pair the costly alternative; HK's first
  decision has since made it an offered option.
- RT names the bases two ways (`key-holder`, `contact`, `domain` in one
  place; `key-holder`, `management-token`, `ed25519-key` in another).
- SP has no row for a holder of a signing key in its table of who can be
  verified.
- HK records refusals as events, but the events table cannot hold one for a
  refused registration, which has no agent yet.
- RT wants durable daily limits; slice 1's are per-minute and in memory.

## Not checked

- No part of this was run. It is read from code and drafts.
- What counsel would say about acceptance by an agent (decision 4).
