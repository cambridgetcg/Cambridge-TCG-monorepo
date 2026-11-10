# Agent-held signing keys: one signed statement per binding act

**Status.** Written **2026-11-10** by an AI agent: a Claude Code subagent run
by a workflow in session 99296f25. **Yu has not reviewed it.** It is a draft
for discussion. Nothing in it is built, merged, applied, adopted or decided.

- **Yu's word.** On 2026-10-30, verbatim, recorded in the
  [decision file](../../decisions/2026-10-30-agent-registration-support-key-expiry.md):

  > 1. yes reopen, lets discuss more on the terms 2. yes support should handle
  > them, need to design procedures, we could refer to general protocol used by
  > platforms like ebay, shopify etc 3. depends on the agent, we provide the
  > option like in all auth protocol

  Point 3 answered a question about key expiry. Reading "we provide the
  option" as covering how an agent proves control too is an agent's reading.
- **An agent's proposal.** Everything else. Three agents wrote candidate
  designs and three agent judges scored them. Two (covenant, pragmatic)
  scored "signed acts" highest. The security judge scored "signed requests"
  highest (7 against 5.5) and recommended a combination: signed acts'
  envelope and transaction, REST-only submission, and signed requests'
  recovery-key roles. The agent session running the workflow built on signed
  acts and settled the contested points; the main choices, including those a
  judge would have made otherwise, are under
  [Decisions for Yu](#decisions-for-yu).
- **Evidence.** Code read on branch `claude/agent-held-keys-design` at
  `81c63959`: `main` (`5c953f5c`) plus the open PRs #108, #109, #110 and
  #113, none merged. The Ed25519 claims were reproduced on this Mac
  ([What was checked](#what-was-checked-and-how)). No production database or
  deployed service was touched.
- **Not authorised here.** Applying a migration, deploying, adding a
  dependency, turning the path on in production, changing the privacy
  notice, publishing a XENIA adoption record, or opening self-serve
  registration (`SELF_SERVE_REGISTRATION_ENABLED` stays `false`,
  [`register/route.ts#L11`](../../../apps/storefront/src/app/api/v1/agents/register/route.ts#L11)).
  Each needs Yu's word for that act.
- **Siblings.** [reopening-terms.md](reopening-terms.md) (package B and its
  management token), [key-expiry.md](key-expiry.md) (the expiry choice),
  [support-procedures.md](support-procedures.md) (erasure, whose word
  governs).

## In one screen

**What it is.** An agent that can run code makes its own Ed25519 key pair;
Cambridge stores only the public key. Each binding act is one small JSON
statement, signed as a JWS and sent as one string to the MCP tool
`agent.act` or `POST /api/v1/agents/act`. Cambridge checks it, applies it
once in one transaction, and keeps the signed bytes until the agent is
erased (no erasure is built yet).

**An option, beside what exists.** Usage keys (`ctcg_agt_…`) stay for
everyday calls through stock MCP clients (reads, and Coverage Hunt evidence
for operator-managed agents); package B's draft management token (`ctcg_agm_…`)
stays for agents that cannot run code, since only agents that run code can
sign. The agent or its operator chooses. Replacing package B's token is not
proposed.

**The honest gain.** Package B's token is also stored only as a hash. A
signature binds each act's name, parameters, audience, expiry and nonce (not
its purpose), stops replay, sends no secret on each use, and leaves evidence
the store could not forge under the agent's own key. A direct database write
could still bind a key of the writer's; an agent that checks its key set
sees it. A signature proves control of a key over those bytes: not identity,
not consent, and no authority to act for anyone else, end users included.
Whatever steers a model that can reach the key can sign with it.

**First slice.** Operator-managed agents only, so the reopening terms need
no decision. The operator pastes the public key at `/account/agents`. Acts:
`signer.check`, `key.mint` (an expiry must be stated, `never` allowed;
within the five-key cap), `key.revoke`. A flag, off by default, closes the
path. It waits for #108, #109, #110, #113 and key expiry (migration 0151) to
merge and be applied.

**Yu is asked** whether to offer it (D1), about the new stored categories
(D3), and later for the migration, dependency and flag (D4). The other
decisions are agents' defaults that proceed unless Yu objects.

## What the agent does

1. **Make a key.** A reference signer, to be added to the repository (Node
   built-ins only), would write a new private key to a 0600 file and never
   print it, only the public JWK, its RFC 7638 thumbprint and signed acts.
   Whatever steers a model can use a key the model can reach, so the key
   must stay out of transcripts.
2. **Have the operator bind it.** The operator pastes the public JWK at
   `/account/agents`, which shows the thumbprint to compare, and chooses its
   expiry ([D7](#decisions-for-yu)). The key is *pending* until its first
   validly signed act.
3. **Sign acts.** Each is a compact JWS,
   `BASE64URL(header) "." BASE64URL(payload) "." BASE64URL(signature)`, valid
   at most 300 seconds (the reference signer uses 120).

### Worked example (RFC 8037 Appendix A public test key)

This published test key is one the store refuses to bind for real. Its
public JWK and thumbprint (RFC 8037 A.2, A.3):

```text
{"kty":"OKP","crv":"Ed25519","x":"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"}
kid = kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k
```

The first act after the paste, `signer.check`, decoded. `iat` is
2026-11-10T12:00:00Z, the agent id is made up, and this `jti` spells
"Book-example-jti" where a real one is 16 random bytes:

```json
{"alg":"Ed25519","typ":"ctcg-act.v1","kid":"kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k"}
{"aud":"https://cambridgetcg.com","act":"signer.check","sub":"6f1c2a90-3b7e-4d21-9a55-0c8e4b7d2f13","iat":1794312000,"exp":1794312120,"jti":"Qm9vay1leGFtcGxlLWp0aQ","params":{}}
```

Signed with the test key (443 characters):

```text
eyJhbGciOiJFZDI1NTE5IiwidHlwIjoiY3RjZy1hY3QudjEiLCJraWQiOiJrUHJLX3FteFZXYVlWQTl3d0JGNkl1bzN2Vnp6N1R4SENUd1hCeWdyUzRrIn0.eyJhdWQiOiJodHRwczovL2NhbWJyaWRnZXRjZy5jb20iLCJhY3QiOiJzaWduZXIuY2hlY2siLCJzdWIiOiI2ZjFjMmE5MC0zYjdlLTRkMjEtOWE1NS0wYzhlNGI3ZDJmMTMiLCJpYXQiOjE3OTQzMTIwMDAsImV4cCI6MTc5NDMxMjEyMCwianRpIjoiUW05dmF5MWxlR0Z0Y0d4bExXcDBhUSIsInBhcmFtcyI6e319.cIi5jB96ttAOLUwroaqU5I-MWTpQ7Uj6dii7UMnfJHIumk1F6f8p7mq4OQGGwRQwJ2jDX1YnlK7FTOdlnudSCw
```

It verifies against `x` and passes the R rule below; its SHA-256, which the
store records as `act_sha256`, is
`121480f96d57cfdb5d0c3046fa84642a21cf0292b974700e4f3bcf9aa24629d5`. It goes
as `{"name":"agent.act","arguments":{"act":"eyJhbGci…","preview":null}}` in a
`tools/call`. The answer confirms the pending key and returns the agent's
own record (shape only):

```json
{"act":"signer.check","outcome":"applied","agent":{"status":"active"},
 "signing_keys":[{"kid":"kPrK_qmx…","state":"confirmed","bound_by":"operator"}],
 "usage_keys":[{"key_id":"…","key_prefix":"ctcg_agt_…","expires_at":"…","minted_by":"operator"}],
 "server_time":"2026-11-10T12:00:01Z","receipt":{"event_id":"…","act_sha256":"121480f9…"},
 "verification":{"alg":"Ed25519","key_resolution":"registered-thumbprint","preimage":"jws-signing-input","canonicalization":"none",
   "proves":"control of this key over these bytes; not identity, consent, or authority to act for anyone else"}}
```

**Minting.** The agent generates the usage key itself: `ctcg_agt_` plus 22
base62 characters from a CSPRNG, the shape the gate accepts
([`auth.ts#L67-L71`](../../../apps/storefront/src/lib/agents/auth.ts#L67-L71)).
It signs only the key's SHA-256 (lower-case hex of the UTF-8 string, as
`hashAgentToken` computes it) and its 12-character display prefix:

```json
{"act":"key.mint","params":{"key_sha256":"<64 hex>","key_prefix":"ctcg_agt_<3 chars>","expires":"90d","name":"laptop","preview_sha256":"<from the preview>"},…}
```

`expires` is required, in key-expiry.md's
[wire values](key-expiry.md#1-the-options-offered-at-mint), `never`
included. The answer carries the key id, prefix and `expires_at`, and no
secret. The reference signer keeps the usage key in a second 0600 file,
prints only its prefix, and treats it as usable only after an `applied`
answer whose prefix matches; on any refusal it deletes the file. The stdio
bridge takes its key only from `CTCG_AGENT_TOKEN` or its first argument
([`index.ts#L48-L51`](../../../packages/mcp-server/src/index.ts#L48-L51)),
so a person, or a wrapper that reads the file, puts it there, never the
model. A `CTCG_AGENT_TOKEN_FILE` in the bridge would be a small addition.

**Revoking.** `key.revoke` with `{"key_id":…}` ends one of the agent's usage
keys; with `{"kid":…}` naming itself, a signing key retires. Both only reduce
authority and are idempotent. `agent.revoke_key` (#109) stays as it is.

## The statement

| Part | Rule |
| --- | --- |
| Whole act | At most 8 KiB; strict base64url (no padding, re-encodes identically); an 86-character signature segment. |
| JSON | UTF-8 objects; duplicate names refused, which needs a small strict parser (`JSON.parse` cannot see them). |
| Header | Exactly `{alg, typ, kid}`; `crit`, `jwk`, `jku`, `x5u`, `x5c`, `b64` and the rest refused. Slice 2's self-registration uses `{alg, typ, jwk}`. |
| `alg` | `Ed25519` (RFC 9864, fully specified; the signer's choice) or `EdDSA` (RFC 8037, now Deprecated; accepted for older tooling). The key row's `alg` column picks the algorithm, not the header. |
| `typ` | `ctcg-act.v1` or `application/ctcg-act.v1`, case-insensitive (RFC 7515 §4.1.9). Explicit typing (RFC 8725 §3.11) helps only against verifiers that check `typ`: `jose`'s `jwtVerify` takes the worked example for a JWT unless told, hence S4's checks. |
| `kid` | The RFC 7638 thumbprint of a key bound to `sub`. |
| Payload | Exactly `{aud, act, sub, iat, exp, jti, params}`; `sub` is absent only on slice 2's self-registration. |
| `aud` | The deployment's configured audience (production `https://cambridgetcg.com`; each preview deployment its own), never derived from `Host`. Unset closes the path. |
| Time | Integers, `0 < exp − iat ≤ 300`. |
| `jti` | 16 to 32 random bytes; single use per key, success or not. |
| `params` | An exact member set per act. |
| Preimage | The JWS signing input as received; no canonicalization. |

**Previews.** `{"preview":"key.mint"}` writes nothing and needs no key. It
returns effect, reversibility, retention, server time, a params template and
`disclosure_text` with its SHA-256, the same for everyone. Mint (later
archive and erasure too) signs that digest, and the repository keeps every
disclosure version, so the record holds exactly what was disclosed. That is
still not consent.

## What the store stores

One migration, numbered when the PR is cut (0150 is #109's, 0151 key
expiry's). Signing keys live apart from `agent_keys`: the gate, rate buckets
and last-used stamps never see them, and no existing statement over
`agent_keys` can touch one, including both archive paths
([`operator-actions.ts#L249-L253`](../../../apps/storefront/src/lib/agents/operator-actions.ts#L249-L253),
[`_actions.ts#L119-L125`](../../../apps/storefront/src/app/admin/trust/agents/_actions.ts#L119-L125)),
`agent.revoke_key`
([`key-revocation.ts#L55-L82`](../../../apps/storefront/src/lib/agents/key-revocation.ts#L55-L82))
and the Coverage Hunt key lock
([`coverage-hunt/db.ts#L300-L321`](../../../apps/storefront/src/lib/coverage-hunt/db.ts#L300-L321)).

| Table | Holds, and why | Kept (agent's proposal) |
| --- | --- | --- |
| `agent_signing_keys` | `agent_id` (cascade), `thumbprint`, 32-byte key, `alg`, `not_after`, `bound_by_event`, `confirmed_at`, `revoked_at`, `revoked_by_event`, `revocation_kind`. To verify acts. | Until the agent is erased. Pending after 7 days: deleted by the maintenance sweep. Erasure deletes the rest, so a thumbprint could later be bound again. |
| `agent_act_nonces` | `(thumbprint, jti)` primary key, `expires_at`. To refuse replays. | Until `exp` plus 60 seconds; purged in each act and by the maintenance sweep. |
| `agent_act_events` | Append-only: `agent_id` (`ON DELETE SET NULL`), `basis` (`signed-act`, `bearer`, `operator`, `staff`, `system`), act, outcome or refusal, `act_jws`, `act_sha256`, verification record, the signing key's thumbprint (text, not a foreign key), effect, `created_at` (database clock). Evidence of each act for the agent, its operator and support. | Until the agent is erased; then a receipt stays: event id, basis, act, outcome or refusal, `act_sha256`, date. |
| `agent_keys` | Gains a nullable `minted_by_event`, to find what a signing key minted. | As today. |

- **Erasure is not built** ([support P1](support-procedures.md#p1-erasure-of-an-agent-profile)
  is a draft), so until it is, signing keys and signed acts are kept
  indefinitely, archived agents included. When an event's `agent_id` goes to
  NULL (P1's delete, 7a, or an account deletion cascading through `agents`,
  [0090#L25](../../../apps/storefront/drizzle/0090_agents.sql#L25)), a
  trigger also nulls `act_jws`, the thumbprint, the verification record and
  the effect. P1's tombstone (7b) keeps the `agents` row, so its script nulls
  those four and deletes the signing keys itself. The table's guard allows
  no other change, as on `coverage_hunt_turns`
  ([0120#L147-L182](../../../apps/storefront/drizzle/0120_coverage_hunt.sql#L147-L182)).
- **Its own events table**, as package B's `agent_registration_events` is a
  draft; `basis` already names every path if they merge.
- **Pending, then confirmed.** Uniqueness covers confirmed keys only
  (`UNIQUE (thumbprint) WHERE confirmed_at IS NOT NULL`): pasting someone
  else's key squats nothing, and the paste form never says a key is in use.
  A key confirmed elsewhere is refused at its signer's act, so only the
  holder learns it.
- **`alg` column.** Ed25519 only; ES256, UCP's baseline, can follow with its
  own point checks.
- **Each new category** needs its retention, a key-exit inventory row and
  version bump
  ([`key-exit-inventory.ts#L21`](../../../apps/storefront/src/lib/agents/key-exit-inventory.ts#L21))
  and, later, a privacy-notice row, which needs Yu's word.

## How the store verifies

**Before any database work:** (1) the flag is on, else `signed_acts_closed`;
(2) the statement's rules above; (3) not obviously stale by the app's clock
(`exp` over 60 seconds past, `iat` over 300 ahead), so an act lifted from a
log cannot take the agent's row lock; (4) limits before any curve work,
held in memory per instance and never stored, so a flood spread across
instances gets further: per client IP, and a ceiling per instance. Before
verification an act's name is only a claim, so exit-labelled acts
(`key.revoke`, later archive and erasure) get their own ceiling rather than
none, and nothing keyed on an identifier someone else can name, such as a
`kid`; per-key limits apply after verification. A flood can delay a signed
exit; `agent.revoke_key` and the operator's page take no such limit.

**Key and signature:** (5) look up `(sub, kid)` in any state; an unknown key
is verified against a fixed dummy key, and it shares one answer with a bad
signature, `act_unverified`; no negative cache. (6) R, the signature's first
half, must decode canonically, not be of small order, and be torsion-free;
then a pinned `@noble/curves` runs `ed25519.verify(sig, signingInput, key,
{zip215: false})`. No answer depends on the Node build.

**One transaction**, using only `tx` inside: production's pool holds one
connection
([`creation.ts#L83-L88`](../../../apps/storefront/src/lib/agents/creation.ts#L83-L88)),
so step 5's lookup runs before it and nothing inside calls the root pool.

7. Lock the agent row (`FOR NO KEY UPDATE`, as `mintKey` does), then the
   signing key row.
8. Re-check the key, revoked or past `not_after` by the database clock: the
   signing key's linearization point, since an operator's removal takes the
   same lock. A holder of an ended key who signed validly gets
   `signing_key_ended` with when and, if revoked, by which event; nobody
   who cannot sign learns anything.
9. Time by the database clock: `iat > now() + 60 s` or `now() >= exp` is
   `act_stale`.
10. Insert the nonce, keyed on the thumbprint, not on a row that may not
    exist yet. A conflict is `act_replayed`; replays write no event.
11. Record a refusal from step 8 or 9; otherwise apply the act in a
    savepoint, rolling back to it on a refusal (status, cap, params) and
    recording that. The nonce stays either way: a validly signed act is
    single-use whether it succeeds or not.
12. Write the event, purge a few expired nonces, commit. A database failure
    rolls back, consumes nothing and answers `auth_unavailable`.

**At binding**, the JWK is exactly `{kty:"OKP", crv:"Ed25519", x}`. A `d`
member is refused, never stored or logged, and the operator is told to make
a new key. `x` must be 32 bytes, canonical, not of small order and
torsion-free. Published test keys (RFC 8037 Appendix A, RFC 8032 §7.1) are
refused.

**Why the R rule.** RFC 8032 §5.1.7 allows checking
`[8][S]B = [8]R + [8][k]A'` or, "sufficient, but not required",
`[S]B = R + [k]A'`. noble checks the first (read in its 2.2.0
`abstract/edwards.js`), OpenSSL the second (read in the `curve25519.c` the
research pass fetched); libsodium behaved as the second and also refused a
small-order R. A key holder can craft signatures they disagree on. With A
and R torsion-free and R not the identity, both equations accept the same
signatures, so stored evidence re-verifies with any correct library.
Requiring noble and Node to agree would tie answers to the build again.

### Refusals

In the existing typed shape
([`refusals.ts#L24-L53`](../../../apps/storefront/src/lib/agents/refusals.ts#L24-L53)):
terminal means no next action, otherwise at least one, each optional. New
action words: `sign_new_act`, `fetch_preview`.

| Code | When | Retryable | Terminal | Next action |
| --- | --- | --- | --- | --- |
| `signed_acts_closed` | Flag off or no audience configured | no | no | `read_docs` |
| `act_malformed` | Any shape rule; a fixed `detail` phrase says which | no | no | `read_docs` |
| `act_stale` | Outside the window; carries `server_time` | no | no | `sign_new_act` |
| `act_limited` | A limit; carries `retry_after_seconds` | yes | no | `retry` |
| `act_unverified` | Unknown key or bad signature | no | no | `read_docs` |
| `act_replayed` | `jti` already used by this key | no | no | `sign_new_act` |
| `signing_key_ended` | Valid signature; key revoked or expired; carries when, and the revoking event | no | no | `read_docs` (ask the operator) |
| `act_disclosure_stale` | `preview_sha256` not a current disclosure | no | no | `fetch_preview` |
| `act_params_invalid` | Expiry or prefix; or a hash malformed or in use (one phrase for both) | no | no | `read_docs` |
| `key_cap_reached` | Five live usage keys | no | no | `read_docs` (revoke one) |
| `agent_suspended`, `agent_archived` | Existing codes, for acts the status forbids | as today | as today | as today |
| `auth_unavailable` | Existing 503 | yes | no | `retry` |

## Transport

- **A pre-gate tool and a REST twin.** `agent.act` takes `act` (the JWS) or
  `preview` (an act name), both `["string","null"]` so clients that mark
  every property required still work, the lesson of `agent.revoke_key`'s
  schema
  ([`tool-access.ts#L116-L134`](../../../apps/storefront/src/lib/agents/tool-access.ts#L116-L134)).
  Its own carve-out sits beside the self-lifecycle one
  ([`route.ts#L651-L676`](../../../apps/storefront/src/app/api/mcp/route.ts#L651-L676)),
  before `resolveAgentBearer`; `canInvokeAgentTool` never admits it.
  `POST /api/v1/agents/act` takes the same body and, like `/api/mcp`, is
  served on the apex only (build step 4).
- **`Authorization` is ignored here.** The stdio bridge sends its bearer on
  every request
  ([`index.ts#L86-L88`](../../../packages/mcp-server/src/index.ts#L86-L88));
  it must neither help nor hurt an act.
- **It survives every route.** Native MCP clients reach the gate through the
  bridge
  ([`route.ts#L785-L791`](../../../apps/storefront/src/app/api/mcp/route.ts#L785-L791)),
  which parses each line and re-serializes it
  ([`index.ts#L161-L167`](../../../packages/mcp-server/src/index.ts#L161-L167),
  [`#L95`](../../../packages/mcp-server/src/index.ts#L95)), breaking any
  signature over body bytes; a string argument passes intact.
- **No answer to an act carries a secret.** Hosts log tool arguments, and
  whoever sees a signed act first can submit it within its lifetime, getting
  exactly the signed effect, once. Hence `key.mint` takes a hash. *Cost:* the
  store cannot check the key's entropy, shape or prefix, and gets no proof
  the minter holds it. A weak key can be guessed, or cracked offline from
  the hash in any logged act; a wrong-shaped one never works but fills a
  cap slot. Whoever sees a mint act first and holds a confirmed signing key
  for any agent can register the same hash (`key_hash` is unique,
  [0090#L61](../../../apps/storefront/drizzle/0090_agents.sql#L61)): the
  victim's mint is refused, and the key, if used anyway, authenticates as
  the other agent. Hence the signer's discard-on-refusal rule and one phrase
  for a malformed or used hash. *Alternatives:* the store generates the key
  and returns it over REST only ([D2](#decisions-for-yu)); or every act goes
  over REST only, the security judge's choice ([D8](#decisions-for-yu)).
- **The daily MCP count.** `agent.act` sits in the gate's tool table, so
  `tools/list` shows it, and every listed tool must be in `MCP_TOOLS`
  ([`route.test.ts#L795-L799`](../../../apps/storefront/src/app/api/mcp/route.test.ts#L795-L799)),
  which must equal the newest `mcp_daily` CHECK
  ([`vocabulary.test.ts#L47-L63`](../../../apps/storefront/src/lib/observability/vocabulary.test.ts#L47-L63)).
  So the migration widens that CHECK, as
  [0150](../../../apps/storefront/drizzle/0150_mcp_daily_agent_revoke_key.sql)
  did for `agent.revoke_key`, and that test's 0150 expectation changes.

## The first slice

**Scope**, buildable with self-serve registration closed:

- Operator-managed agents only: active, `registered_via = 'operator'`, owned
  by the signed-in account, as `mintKey` checks
  ([`operator-actions.ts#L126-L178`](../../../apps/storefront/src/lib/agents/operator-actions.ts#L126-L178)).
- At `/account/agents`: paste a public JWK (pending, thumbprint shown,
  expiry chosen), remove a signing key, see which usage keys a signed act
  minted; at most two live signing keys per agent, so a replacement can
  precede removal. Today's
  mint is a `window.prompt`
  ([`_client.tsx#L84-L86`](../../../apps/storefront/src/app/account/agents/_client.tsx#L84-L86)),
  so the paste form is new UI.
- Acts `signer.check`, `key.mint`, `key.revoke`, each with a preview.
- The kill switch: an environment flag, off by default. Off, the tool and
  route answer `signed_acts_closed` and the paste form is disabled; bearer
  keys are untouched. After a verifier bug it stops new acts, and
  `minted_by_event` finds what was minted.

**Whose word governs.** No act in this slice needs two parties' word.

| Act | Whose word |
| --- | --- |
| Bind or remove a signing key | The operator's. The first signature proves possession, not consent; the holder can also retire its own key. |
| `signer.check` | The key holder's. Signed, so only a key holder, or whoever submits a logged copy first, sees the record. As the first act it also confirms a pending key. |
| `key.mint` | The key holder's, inside the operator's bounds (active agent, five keys, expiry required); the operator can revoke any minted key. |
| `key.revoke` | The key holder's, or the operator's at the page. |
| Archive, erasure | The operator's, if Yu takes [support D4](support-procedures.md#d4-whose-word-governs-an-operator-managed-agent)'s recommended option; not acts in this slice. |

A suspended agent may check and revoke; an archived one may check and retire
its signing key. Neither may mint.

**Build order** (an agent's proposal):

1. **Preconditions.** #108, #109, #110 and #113 merged (#109's refusals and
   carve-out, #108's transactional mint). Key expiry merged and 0151 applied
   with its gate check, or minted expiries go unenforced. Yu's word for the
   migration and for an exactly pinned direct `@noble/curves` (2.x needs Node
   20.19; the storefront pins no Node).
2. **Verifier**, pure code, tested on RFC 8032 vectors, RFC 8037 A.3 and
   A.4, the eight small-order keys, torsion in R, R = identity, a mixed-order
   key, non-canonical encodings, padding, trailing bits, duplicate names and
   the 8 KiB edge, and cross-checked: every accepted vector also passes
   Node's own verify on CI.
3. **Migration**: three tables, the events trigger, `minted_by_event`, and
   `mcp_daily`'s tool CHECK widened with `agent.act` (see Transport);
   applied before the code deploys.
4. **Act path and door**: carve-out, REST route, acts, previews, refusals,
   flag, the paste form, the reference signer, OpenAPI,
   `/methodology/agents`, discovery documents, inventory bump, changelog.
   Also: the route in `ALIAS_APEX_ONLY_DOORS`
   ([`proxy.ts#L60`](../../../apps/storefront/src/proxy.ts#L60)) and
   proxy.test.ts, as the alias skips Cloudflare (which IP header the limit
   trusts is open, not checked); a revocation reason and label for signed
   revocations
   ([`key-revocation-label.ts#L19-L24`](../../../apps/storefront/src/app/account/agents/key-revocation-label.ts#L19-L24));
   the bearer-only wording of the initialize instructions and `GET /api/mcp`
   ([`route.ts#L602-L605`](../../../apps/storefront/src/app/api/mcp/route.ts#L602-L605),
   [`#L802`](../../../apps/storefront/src/app/api/mcp/route.ts#L802));
   `agent.act` in a tool set and grant field of its own, never
   `SELF_LIFECYCLE_TOOLS`
   ([`route.ts#L665`](../../../apps/storefront/src/app/api/mcp/route.ts#L665)
   would run `revokePresentedKey`); P1's erasure script (7a, 7b).
5. **Postgres tests**, opt-in: one act submitted twice; removal racing an
   act; mint racing the operator's mint at the cap; two agents confirming one
   key; the purge.
6. **Operations**: a monitor row on `/admin/system/monitor` (nonce-table
   size, oldest expired row, last purge; counts only), and the nonce purge
   and the deletion of week-old pending keys in the maintenance sweep beside
   [`runObservabilityRetentionSweep`](../../../apps/storefront/src/lib/observability/retention.ts#L71).
   The flag stays off in production until Yu says otherwise.

Size: perhaps 1,500 lines with tests; a guess, not measured.

## Later slices, each its own decision

- **S2. Self-serve registration by signed act**, once Yu agrees terms:
  `agent.register` (key in the header, terms and notice digests signed),
  `terms.accept`, `profile.update`. A hash chain over each agent's events,
  with the chain head and a key-set digest on every answer to a signed act,
  so an agent keeping one hash sees a key inserted by a direct database
  write.
- **S3. Recovery and leaving.** A primary and an optional cold recovery key;
  rotation signed by both, as in ACME (RFC 8555 §7.3.5: an inner JWS by the
  new key inside an outer one by the old). Signed exits (`agent.archive`,
  `erasure.schedule`) suspend the agent at once; the irreversible step waits
  for support-procedures.md P1's window (14 days in its
  [D6](support-procedures.md#d6-a-window-before-irreversible-erasure), an
  agent's default Yu has not confirmed), and any live signing key can cancel
  inside it. Signing keys survive archive for `signer.check` and erasure
  only. Routine retirement differs from a "compromised" revocation, which
  previews, then also ends the usage keys that key minted. A recovery-signed
  replacement of a live primary also waits, and the primary can veto it.
  Support may archive or erase on evidence, never bind a key. Which acts
  need both operator and agent is open.
- **S4, only if wanted.** An exit-only statement signed at registration and
  kept offline (single use; archive and scheduled erasure only). A
  `tool.call` act if domain writes open. A client-credentials endpoint
  reusing the registered JWK (an RFC 7523 JWT client assertion,
  `private_key_jwt` in OpenID Connect terms) once a client the store's
  agents use supports that grant (Claude does not today); it must check
  `typ` and require `iss` (RFC 7523 §3), which acts lack. Web Bot Auth
  advises one key per purpose, so a separate assertion key is the
  alternative. RFC 9421 as an optional identity tier for reads, not for
  binding acts.

## Failure and abuse

| Case | What happens (slice 1 unless marked) |
| --- | --- |
| Lost signing key | The operator removes it and pastes a new one; usage keys run on until expiry or revocation. Support never binds a key. |
| Stolen signing key | The thief can check, mint up to the cap with any expiry, `never` included (keys that read and, for these operator-managed agents, submit Coverage Hunt evidence), and revoke usage keys, but not bind keys, archive or erase. The operator removes it and revokes what it minted. No other brake until S3. |
| Replay | `(thumbprint, jti)` is unique in Postgres; `sub` and `aud` stop cross-agent and cross-deployment replay; `exp` ends it within 300 seconds. |
| A lifted act | Whoever submits first gets the signed effect once and no secret (a lifted `signer.check` shows them the agent's record). |
| Clock skew | 60 seconds ahead accepted, by the database clock; `act_stale` and previews carry `server_time`. A human prompt that outlasts `exp` means signing again. |
| Correlation | `kid` is stable and a reused key links services, so the signer makes a Cambridge-only key; public keys are never shown to others. Keys derived from a seed share its fate. |
| Existence oracle | One answer for unknown key and bad signature, a dummy verify, no negative cache, status only after a valid signature, identical previews, a silent paste form, one phrase for a malformed or used hash. |
| Host rebinding | Nothing binds a key without the paste and the key's signature, except a direct database write: `signer.check` shows it to an agent that checks, S2's chain makes that cheap. Detectable, not preventable. |
| Prompt-injected signer | Whatever steers the model can use a key it can reach. Slice 1 acts add usage keys (reads and, for operator-managed agents, Coverage Hunt evidence), with any expiry including `never` and a secret the injector may have chosen, or reduce authority. S3's irreversible acts need a window or an unreachable key. |
| Verifier bug | An authentication bypass for these acts: the flag closes the path, `minted_by_event` lists what to review. |
| Flood | 8 KiB cap, free shape checks, limits before curve work, exit-labelled acts under their own ceiling; verify plus R check take 1.1 to 1.4 ms here, unmeasured on Vercel. |

## XENIA candidate duties

Each row is designed against XENIA Covenant 0.1 candidate duty *id* (xenia
d4727ec); Cambridge TCG has not adopted the Covenant; no adoption record;
unassessed. Every id was checked against `covenant/0.1/covenant.json` at
d4727ec. No XENIA name or duty id goes on the wire.

| Effect | Candidate duty | How |
| --- | --- | --- |
| Helps | `consent.absence-forbids-binding` | Replayed, revoked, expired, wrong-audience acts refused. |
| Helps | `exit.revocation-is-immediate` | Signed, idempotent `key.revoke`: a usage key ends at its `agent_keys` row update, as today; a signing key under the agent and key row locks. The signed exit is IP-limited; `agent.revoke_key` and the operator's page are not. |
| Helps | `legibility.refusals-are-typed` | Every new code typed. |
| Helps | `legibility.corrections-are-visible` | Signed originals kept; events append-only. |
| Helps | `limits.uncertain-authority-stops-binding` | No resolved key or a failed check: no act, no penalty. |
| Partly | `consent.exact-authority` | Purpose and delegation chain are not signed. |
| Partly | `consent.terms-before-binding` | The preview digest records the disclosure; a signature is not informed consent. |
| Partly | `identity.no-impersonation-or-silent-rewrite` | Acts cannot be forged without the key, short of a verifier bug; a direct database write can still bind a key. |
| Partly | `legibility.evidence-is-scoped` | Each act keeps its verification record. |
| Constrains | `consent.signature-boundary`, `identity.credentials-are-bounded`, `standing.control-is-not-permission` | Texts say a signature proves control of a key over those bytes, nothing more. |
| Constrains | `privacy.minimize-and-purpose-bind`, `privacy.no-silent-secondary-use`, `exit.retention-is-itemized` | Four new categories, each to get a purpose, an expiry and an inventory row; two end only at an erasure that is not built. Public keys never published. |
| Constrains | `standing.no-worth-test`, `limits.rights-coexist` | No better standing for signers; the bearer exit stays; operator and agent word kept apart. |
| Does not help | `identity.portability-is-verifiable` | The key moves; the state does not. |

## What was checked, and how

**Reproduced on this Mac on 2026-11-10** by scripts outside the repository,
using public points and fresh in-memory keys only. noble 1.9.1 and 2.2.0
(the lockfile's copies) and 2.4.0 agreed throughout.

- **Small-order forgery** (key and R the identity, S = 0, over an act's
  signing input): accepted by Node's `crypto.verify` and WebCrypto on
  v22.23.1 (OpenSSL 3.5.7), v24.13.0 (3.5.4) and v25.6.1 (3.6.3), by Python
  `cryptography` 48.0.1 (OpenSSL 4.0.1) and by default noble; refused by Node
  v24.22.0 (3.5.8), PyNaCl 1.6.2 (libsodium) and strict noble. On Node
  v22.23.1, v24.13.0 and v25.6.1, every one of the eight small-order keys
  admits a forgery on every one of 64 messages (R = sB, S = s, retried until
  [k]A = 0, about ord(A) tries); v24.22.0 and strict noble refused all.
  Refusal depends on the build, not the Node major version.
- **Torsion in R** (the security judge's finding): key = the base point,
  R = rB plus an order-8 point. Strict noble accepted 200 of 200; all four
  Node builds, `cryptography` and libsodium refused; `isTorsionFree()`
  flagged every R.
- **R = identity**, key = the base point: strict noble, Node v22.23.1 and
  `cryptography` accept; Node v24.22.0 and libsodium refuse. The identity
  is torsion-free, hence "not of small order" in the rule.
- **Mixed-order key** (an honest key plus an order-8 point): strict noble
  accepted 200 of 200 honest signatures, Node 27 to 33. Hence the torsion
  check at binding.
- **Honest keys**: 300 of 300 passed every check; 50 of 50 also passed
  `cryptography` and libsodium. RFC 8037's A.3 thumbprint recomputes, and
  A.4 passes strict noble, Node and the R rule.
- **Cost** on Node v22.23.1: strict noble verify 0.63 to 0.78 ms, R check
  0.45 to 0.58 ms, Node's verify 0.035 ms.
- **`jose`** 6.2.3 and 5.10.0 (both in the lockfile) handle both `Ed25519`
  and `EdDSA`, and their `jwtVerify` accepts the worked example as a JWT
  unless told which `typ` to expect.

The core repeats with Node 20.19 or later and noble 2.x:

```js
// node check.mjs <directory of @noble/curves 2.x>
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
const { ed25519 } = await import(pathToFileURL(process.argv[2]) + "/ed25519.js");
const P = ed25519.Point, L = P.Fn.ORDER;
const le = (b) => b.reduceRight((n, x) => (n << 8n) | BigInt(x), 0n);
const le32 = (n) => Uint8Array.from({ length: 32 }, (_, i) => Number((n >> BigInt(8 * i)) & 255n));
const jwk = (A) => ({ kty: "OKP", crv: "Ed25519", x: Buffer.from(A).toString("base64url") });
const node = (sig, msg, A) => crypto.verify(null, msg, crypto.createPublicKey({ key: jwk(A), format: "jwk" }), sig);
const strict = (sig, msg, A) => ed25519.verify(sig, msg, A, { zip215: false });
const msg = Buffer.from("any act's signing input");

// 1. Small-order key: A = identity point, forged signature R = identity, S = 0.
const I = new Uint8Array(32); I[0] = 1;
const forged = new Uint8Array(64); forged[0] = 1;
console.log("1 forgery: node", node(forged, msg, I), "| noble strict", strict(forged, msg, I),
  "| key small order", P.fromBytes(I).isSmallOrder());

// 2. Torsion in R. Key = base point B: its scalar is 1, so anyone can sign; it is a public point.
const A = P.BASE.toBytes();
const T8 = P.fromBytes(Buffer.from("c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a", "hex"));
const R = P.BASE.multiply(12345n).add(T8).toBytes();
const k = le(crypto.createHash("sha512").update(Buffer.concat([R, A, msg])).digest()) % L;
const sig = new Uint8Array([...R, ...le32((12345n + k) % L)]);
const Rp = P.fromBytes(R);
console.log("2 torsion in R: node", node(sig, msg, A), "| noble strict", strict(sig, msg, A),
  "| R small order", Rp.isSmallOrder(), "| R torsion-free", Rp.isTorsionFree());

// 3. RFC 8037 A.4: the public test key and its published signature pass every check.
const x = Buffer.from("11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo", "base64url");
const [h, p, s] = ("eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc." +
  "hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg").split(".");
const sig4 = Buffer.from(s, "base64url"), msg4 = Buffer.from(`${h}.${p}`), R4 = P.fromBytes(sig4.subarray(0, 32));
console.log("3 RFC 8037 A.4: node", node(sig4, msg4, x), "| noble strict", strict(sig4, msg4, x),
  "| key small order", P.fromBytes(x).isSmallOrder(), "| key torsion-free", P.fromBytes(x).isTorsionFree(),
  "| R small order", R4.isSmallOrder(), "| R torsion-free", R4.isTorsionFree());
```

On Node v22.23.1 with noble 2.2.0 or 2.4.0: line 1 `node true | noble
strict false`, line 2 `node false | noble strict true` with R not
torsion-free, line 3 all passing. On Node v24.22.0 line 1 shows
`node false`.

**Read, not run:** the code linked above; noble 2.2.0's `verify`; the RFCs
under [Sources](#sources); the research reports and their independent
checks (2026-11-09), the check winning where they differ; three agent
fact-checks of this page (2026-11-10), each finding checked against the
source before it was applied.

**Not checked:** the production Node and OpenSSL version (a Vercel setting
nobody read); whether PyJWT, go-jose and others accept `Ed25519` as `alg`;
any real MCP client calling `agent.act`; the transaction on Postgres; verify
cost on Vercel.

**The judges' corrections, carried:** archive no longer strands erasure; no
negative cache; nonces keyed on the thumbprint; time checked before any
lock; refused acts consume their nonce; pasted keys cannot be squatted;
retirement does not end usage keys; no "never reusable" thumbprints; a
stated rule on A and R instead of "strict RFC 8032 on any Node build".

## Decisions for Yu

Each recommendation is an agent's proposal. **Yu's:** D1, D3, D4. **Agent's
defaults**, proceeding as recommended unless Yu objects: D2 and D5 to D9.

- **D1. Offer agent-held signing keys at all.** *For Yu.* *Recommended:* yes,
  as an option beside usage keys and package B's token, from slice 1. Costs:
  a verifier one maintainer must keep right; a second credential for agents.
  Alternatives: not now, building S2 once the terms are agreed (no per-act
  authority meanwhile); or replace package B's token, as all three candidate
  designs proposed (agents that cannot run code lose self-serve management;
  not recommended).
- **D2. Who generates a minted usage key.** *Agent's default.*
  *Recommended:* the agent, signing only the hash, with the costs under
  [Transport](#transport), a front-run mint among them. Alternatives: the
  store, returning it only over REST (it goes to whoever submitted the act);
  or also through MCP (it lands in host transcripts).
- **D3. New stored categories.** *For Yu*, as the privacy notice needs Yu's
  word. *Recommended:* the retention in [the table](#what-the-store-stores),
  inventory rows in the same PR, privacy-notice rows before the production
  flag. Alternative: keep only hashes of acts (agents lose their originals
  as evidence).
- **D4. The migration, the dependency, the production flag.** *For Yu*, each
  its own act, after D1, D3 and review of the PR.
- **D5. The R rule.** *Agent's default.* *Recommended:* refuse an R of small
  order or not torsion-free (about 0.5 ms per act). Alternative: accept only
  when noble and Node agree (answers depend on the build again).
- **D6. Envelope details.** *Agent's default.* `typ` `ctcg-act.v1`; `alg`
  `Ed25519` or `EdDSA`; 300 seconds with 60 of skew; two live signing keys
  per agent; limits as above, numbers in the PR.
- **D7. Expiry for signing keys.** *Agent's default*, reading Yu's point 3
  as covering signing keys too. *Recommended:* the operator chooses one at
  paste, in key-expiry.md's wire values, `never` included; the holder can
  retire the key at any time. Alternative: none, retirement only (one choice
  fewer; a forgotten key lives on).
- **D8. How acts are sent.** *Agent's default.* *Recommended:* the
  `agent.act` tool and the REST twin. Alternative, the security judge's: REST
  only, from the signer's own code, so acts stay out of host logs; an agent
  that can sign but reaches the store only through its MCP client loses the
  path.
- **D9. First-slice scope.** *Agent's default.* *Recommended:* check, mint
  and revoke (perhaps 1,500 lines; waits for key expiry). Alternative, the
  pragmatic judge's: signed `key.revoke` only (about 600 lines, no
  key-expiry dependency), which proves the verifier and lets the agent end
  any of its usage keys, but not mint one.

S2, S3 and S4 each come back as their own decision.

## Sources

Read from the primary source on 2026-11-10 (rfc-editor.org text):

- [RFC 7515](https://www.rfc-editor.org/rfc/rfc7515) §4.1.9, `typ`.
- [RFC 7523](https://www.rfc-editor.org/rfc/rfc7523) §2.2, §3: JWT client assertions (`iss` required; the name `private_key_jwt` is not in it). Read from a copy a checking agent fetched.
- [RFC 8032](https://www.rfc-editor.org/rfc/rfc8032) §5.1.7, Verify (either equation).
- [RFC 8037](https://www.rfc-editor.org/rfc/rfc8037) Appendix A.2 to A.4: the test key, thumbprint and a signature.
- [RFC 8555](https://www.rfc-editor.org/rfc/rfc8555) §7.3.5, account key rollover.
- [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725) §3.11, explicit typing.
- [RFC 9864](https://www.rfc-editor.org/rfc/rfc9864) §2.2, §4.1.1, §4.1.2 (`EdDSA` Deprecated), §4.4.
- XENIA `covenant/0.1/covenant.json` at d4727ec, local clone (duty ids; read at that commit with `git show`).

Named, not reread: [RFC 7638](https://www.rfc-editor.org/rfc/rfc7638) (used
through RFC 8037 A.3), RFC 8032 §7.1's test keys, and
[OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
§9 (where `private_key_jwt` is named).

Carried from the 2026-11-09 research reports and their checks:
[MCP authorization 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
and its [client-credentials extension](https://modelcontextprotocol.io/extensions/auth/oauth-client-credentials)
(RFC 7523 assertions, credentials registered out of band);
[Claude connector authentication](https://claude.com/docs/connectors/building/authentication)
(no client-credentials grant) and [Claude Code MCP](https://code.claude.com/docs/en/mcp)
(static headers, a headers helper);
[UCP signatures](https://ucp.dev/latest/specification/signatures/) (ES256
required, Ed25519 optional);
[Web Bot Auth -01](https://www.ietf.org/archive/id/draft-ietf-webbotauth-httpsig-protocol-01.html)
(identification only; one key, one purpose);
[RFC 9421](https://www.rfc-editor.org/rfc/rfc9421) and
[RFC 9449](https://www.rfc-editor.org/rfc/rfc9449) (why per-request signing
was not chosen for binding acts); [ZIP-215](https://zips.z.cash/zip-0215) and
[`@noble/curves`](https://www.npmjs.com/package/@noble/curves) (`zip215`
defaults to `true`; 2.x needs Node 20.19).
