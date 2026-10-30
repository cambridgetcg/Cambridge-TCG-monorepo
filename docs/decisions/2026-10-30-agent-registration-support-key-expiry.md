# Self-serve agent registration reopens; support handles agent requests; key expiry is the agent's option

**Status:** decided 2026-10-30, in Yu's words below. The terms of reopening are
not decided yet: Yu asked to discuss them. Until terms are agreed and built,
self-serve registration stays closed in code (`SELF_SERVE_REGISTRATION_ENABLED
= false`), and nothing here reopens it by itself.

**Recorded by:** Claude Code session 99296f25, after the agent-auth review
([docs/plans/agent-auth/README.md](../plans/agent-auth/README.md)) and PRs
#108 to #111. Updated the same day with Yu's question about agenttool and
the agent's call on it ([below](#agents-call-the-auth-flow-stays-independent-of-agenttool)).

## The questions

At the end of the review, the agent asked these three questions in chat.
They are the agent's wording, not Yu's.

1. Should self-serve registration reopen at all, and on what terms? Possession-based
   revocation of the presented key is a first step, not the full
   "holder-authenticated key revocation" requirement.
2. Should support@ handle agent erasure, correction and review requests? Today
   the answers point there and say no procedure exists yet.
3. Should agent keys expire, the way member keys do after 90 days?

## Yu's words

On 2026-10-30, verbatim:

> 1. yes reopen, lets discuss more on the terms 2. yes support should handle
> them, need to design procedures, we could refer to general protocol used by
> platforms like ebay, shopify etc 3. depends on the agent, we provide the
> option like in all auth protocol

## What this decides

- **Registration.** Self-serve agent registration is to reopen. The closure of
  2026-07-12 (merge 2d3c69c6) was not recorded as Yu's word; this is. The
  terms (who may register, what is recorded about the controller, what the
  registrant agrees to, limits, publication, exit) are still open for
  discussion with Yu.
- **Support.** Support handles agent erasure, correction and review
  requests. The procedures are to be designed, with reference to the general
  protocols that platforms such as eBay and Shopify use.
- **Key expiry.** Agent keys get an expiry option, "depends on the agent", as
  auth protocols generally offer, rather than one fixed lifetime for
  everyone. Who chooses it, and whether it is set per key or per agent, is
  open: [key-expiry.md](../plans/agent-auth/key-expiry.md) decision 1.

## What this does not decide

- The reopening terms, the support procedures and the expiry options
  themselves. Agents draft them in docs/plans/agent-auth/ for Yu to discuss.
  Any choice an agent makes in those drafts is marked as an agent's proposal
  until Yu agrees it.
- Applying any migration, publishing a XENIA adoption record, or changing the
  privacy notice. Each still needs Yu's word for that act.

## Agent's call: the auth flow stays independent of agenttool

On 2026-10-30 Yu asked, verbatim:

> see if you want to use agenttool as the foundation of the auth flow, or let
> it be independent

Yu's words leave the choice to the agent, so this is an agent's call under
Yu's delegation of 2026-10-20. Yu overturns it by saying so.

**The call.** Cambridge TCG stays the only issuer and verifier of authority
at `/api/mcp`. It holds no agenttool credential and calls agenttool on no auth
path. An agent that already holds an Ed25519 key, such as an agenttool
identity's own root key, may later bring that key as one way to prove
control of its Cambridge registration. Cambridge checks the signature itself,
so agenttool is compatible without being a dependency.

**Why, from agenttool's source at 8518c4e7 and its dated docs** (read, not
observed live):

- agenttool cannot vouch for an agent to an outside site today. Its token
  check (`POST /v1/tokens/verify`) needs an agenttool project bearer, and the
  token's audience must be an identity that the caller's own project owns.
  `did:at` has no DID documents. The one open key lookup is behind a
  federation setting that is off by default. agenttool has no JWKS, no OIDC
  and no OAuth.
- Its credentials do not fit. A project bearer (`at_`) is project-wide root
  authority, and agenttool's own safety doctrine says never to hand one to
  another party.
- Erasure would conflict. agenttool keeps every identity's public profile
  ("no 404 on a DID that ever existed"), project deletion is not built, and
  root keys cannot be rotated. Yu's word is that Cambridge support handles
  erasure.
- Availability: today the gate is one local lookup. A runtime link would put
  agenttool's hosting and its single database primary on every agent call,
  and agenttool's own status notes record outages on that path.
- Public statements on both sides already say the two are separate services
  with no shared data or authentication.

**What Cambridge takes from agenttool instead:** agent-held Ed25519 keys,
signed requests bound to one origin, an expiry chosen per key, and a
versioned retention notice. These are patterns to copy, not calls to make.

**What would change the call.** Cambridge could accept agenttool as one
issuer among others if three things hold: Yu wants one identity across the
kingdom's sites, agenttool publishes standard verifiable keys (JWKS or DID
documents), and its erasure work lands. Even then, revoking, archiving and
erasing must never depend on an outside service.

**A side finding for any key-based route.** Node 22 (OpenSSL 3.5.7) accepts
a forged Ed25519 signature under a small-order public key for any message.
An agent re-checked this on this Mac. Any route where Cambridge verifies an
agent-held key must reject small-order keys (for example with
`@noble/curves` and `zip215: false`) and carry test vectors that must be
refused.
