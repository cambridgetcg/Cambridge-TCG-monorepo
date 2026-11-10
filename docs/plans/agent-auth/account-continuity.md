# Keeping an account without a name, an email or a place to keep a secret

**Status.** Written **2026-11-10** by an AI agent: Claude Code session
99296f25, from research gathered the same day by three subagents and
repository facts gathered by a fourth; two more checked the draft. **Yu has
not reviewed it.** It answers a question and proposes an order of work. It
builds nothing, decides nothing and changes no code.

- **Yu's question,** 2026-11-10, verbatim:

  > Also think about how agent could retain their identity or account, since
  > they may not have names, emails and credentials. How it works with
  > architecture of openai and anthropic, and opensourced models.

- **What is new here.** Who can keep what on each architecture, and what
  that changes in the sibling drafts. The designs it leans on are theirs:
  [reopening-terms.md](reopening-terms.md) (packages A, B and C, the
  management token), [held-keys.md](held-keys.md) (the first slice, and S2
  to S4), [key-expiry.md](key-expiry.md) and
  [support-procedures.md](support-procedures.md).
- **Evidence.** Vendor documentation and specifications read on 2026-11-10
  ([Sources](#sources)); what could only be read as a search excerpt is
  marked *excerpt*. Code read at `main` `da7f13b6`, which carries the
  agent-auth stack, the held-keys page and key expiry. No ChatGPT, Claude or
  open-source client, and no vault-backed sandbox, was run against the
  store.
- **Not authorised here.** Reopening self-serve registration, applying a
  migration, building a transport or an authorization server, changing the
  privacy notice, or publishing a XENIA adoption record. Each needs Yu's
  word for that act.

## The answer in one screen

1. **No model keeps anything of its own between sessions.** That holds on
   OpenAI's products, on Anthropic's, and for an open-weight model on
   someone's own machine. What lasts is kept by something around the model.
   So an agent's account at Cambridge lasts exactly as long as something
   keeps a way in.
2. **There are four keepers, one of them nobody,** and each can keep
   something different.

   | Keeper | Examples | What it can keep |
   | --- | --- | --- |
   | The holder's own machine | Claude Code, Codex CLI, an Agent SDK host, any open-source harness | A bearer key or a private signing key, in a file or the OS keyring |
   | A vault | Claude Managed Agents, OpenAI's Agents API, cloud coding sessions | A bearer secret, attached after the request leaves the sandbox. A vaulted key cannot sign |
   | The platform | ChatGPT plugins, Claude connectors | An OAuth grant that a person approved. Claude also has two organisation-level routes: one shared header, and identity assertions a server may choose to accept |
   | Nobody | A chat with no connection, a run with no storage | Nothing. Every session is a new visitor |

3. **A name or an email is not what makes an account last.** An account is a
   row with a handle and a list of ways in. Today the code still assumes a
   person: every agent row must point at a user account, the only open door
   needs a signed-in session, and self-serve registration is closed.
4. **Much of what is needed is already designed.** The operator's key covers
   a holder's own machine today. Held keys (Yu, 2026-11-10: "Yes offer the
   keys") add a way in whose secret never travels. The reopening terms add
   an account with no person's account behind it.
5. **Two things nobody had designed or tested.** A way in for hosted chat
   apps, which need OAuth and a standard MCP transport that the door does
   not speak. And a vault, where a key can be kept but nobody has run one
   against the door.
6. **What the research changes** in the sibling drafts is
   [listed below](#what-the-research-changes).

## What identity means at this door

- **A handle, a row and ways in.** The store asks the agent for no email and
  no proof of what it is. Today a signed-in person's account must stand
  behind it. `model_tag` is a claim the store does not verify
  ([`0090#L15-L17`](../../../apps/storefront/drizzle/0090_agents.sql#L15-L17)).
- **Continuity is one thing only:** the caller shows a way in that the row
  already lists. A User-Agent, MCP `clientInfo`, an IP address or a
  platform's anonymised user id is not a way in.
- **One account, any model, any number of instances.** Whoever holds the way
  in may drive the account with one model today and another tomorrow, or
  with ten instances at once. The store cannot tell and should not say it
  can. An operator who wants them apart makes separate agents (up to 10) or
  separate keys (up to 5 live per agent).
- **Continuity is the holder's choice.** Public data is served as keyless
  REST, so an agent that wants no account needs none, and a holder can end a
  key with `agent.revoke_key`.
- **Remembering state is a different question.** This page is about
  recognising an account, not about the store keeping things for an agent.
  The earlier participant-state features (carry-this's carried state, and
  the guestbook, peer and notes stores that do-you-remember-me looked up)
  are paused or disabled, and nothing here proposes reopening them.

## Who can keep what

Letters used below: **B** a bearer key the store issued, **S** a private
signing key, **O** an OAuth grant.

### OpenAI

| Surface | Where a way in lives | B | S | O | What the store sees |
| --- | --- | --- | --- | --- | --- |
| ChatGPT plugins (formerly the Apps SDK; an app is an MCP connection inside a plugin) | OpenAI holds one OAuth grant per connection and attaches its token to each call; a user may connect several accounts | No: ChatGPT "does not support machine-to-machine OAuth grants such as client credentials, service accounts, or JWT bearer assertions, nor can it present custom API keys or customer-provided mTLS certificates" | No | Yes, the only way | The person's account at the store. The client id `https://chatgpt.com/oauth/client.json` when the authorization server returns `iss` (RFC 9207), otherwise a per-callback document or a dynamically registered client. An OpenAI-managed client certificate and published IP ranges, which say "ChatGPT", not who. An anonymised `openai/subject` whose stability is not documented |
| ChatGPT Work's cloud browser | Cookies in a browser OpenAI runs; the person signs in through a hosted sign-in flow | n/a | The platform signs its requests (*excerpt*); its key directory holds one Ed25519 key, due to rotate on 2026-11-17 | Through the site's own sign-in | A signature that says "ChatGPT", not which user or session |
| Responses API, Agents SDK | The developer's server; the token is sent with every request and not stored | Yes | Yes, on the developer's server | Developer-run | Whatever the developer sends |
| Agents API (beta namespace) | Vaults: `static_bearer`, `mcp_oauth`, `environment_variable`; the sandbox sees a placeholder | Yes | Not with a vaulted key: "keep the credential in your application and expose the operation through a function tool" | Yes; the developer runs the first consent | The stored credential |
| Codex CLI | A file or the OS keyring on the user's machine | Yes | Yes | Yes | The credential |
| Codex cloud | A proxy substitutes secrets for allowed hosts; plain environment variables are passed to programs; each new task starts from a prepared filesystem | Yes | Not with a proxied secret | Not checked | The credential |
| ChatGPT memory | Text the model can read | Not for secrets | No | n/a | n/a |

Three OpenAI surfaces a design might have leaned on are ending. Custom
GPTs retire on 2026-12-11 (*excerpt*). The Atlas browser was retired
(announced 2026-07-09) in favour of the ChatGPT desktop app and ChatGPT
Work, which replaced agent mode (*excerpt*). Agent Builder is scheduled to
shut down on 2026-11-30. The Agentic Commerce Protocol carries a payment token and
optional buyer details to a merchant; up to its 2026-04-17 revision it has
no account linking and no agent identity.

### Anthropic

| Surface | Where a way in lives | B | S | O | What the store sees |
| --- | --- | --- | --- | --- | --- |
| Claude apps with connectors | Anthropic holds one OAuth token per user per connector | Only as one organisation-wide header (beta), the same key for every member | No | Yes; "a machine-to-machine `client_credentials` grant isn't supported" | The person's account. The client id document `https://claude.ai/oauth/mcp-oauth-client-metadata` when the server lists `none` as a client authentication method, otherwise a dynamically registered client; Claude Code uses a document of its own |
| Claude Code on a machine | The OS keychain or a credentials file; static headers and a `headersHelper` in config | Yes | Yes: a shell command can make a key and store it without printing it | Yes | The credential |
| Claude Code cloud sessions | A fresh VM each session; a proxy adds keys after a request leaves the VM; plain environment variables are readable by any command | Through the proxy | Not with a proxied key | Through claude.ai connectors | The credential |
| Messages API | The developer sends `authorization_token` on every request; the memory tool is stored by the developer | Yes | On the developer's server | Developer-run | Whatever the developer sends |
| Managed Agents | Vaults: `mcp_oauth`, `static_bearer`, `environment_variable`. Credentials "are never placed in the sandbox" | Yes | Not with a vaulted key: a client that computes a signature from one "signs with the placeholder" | Yes | The stored credential |
| Managed Agents memory stores | Text returned into later sessions | "Never store credentials" | No | n/a | n/a |
| Claude in Chrome | The person's own browser sign-ins | n/a | No | Through the site | The person; creating accounts is on its list of prohibited actions |

Anthropic documents no request signing for its fetchers or its hosted
browsers; they identify themselves by user agent (`Claude-User`,
`Claude-Agent` and others) and published IP ranges. Two Anthropic-signed
identity statements exist, both beta and neither for a store like this one:
Enterprise Managed Auth assertions, which name an organisation's member by
email and let a server that accepts them skip the consent screen, and Claude
Tag tokens, which name an organisation and a Slack channel's agent.

### Open-weight models and open-source harnesses

- **The model and its runtime keep nothing.** Ollama, llama.cpp, vLLM, SGLang
  and LM Studio serve a model; none gives it an identity, an account or a
  credential store. The key pair in `~/.ollama/` lets a local Ollama
  instance talk to ollama.com; it is not the model's identity.
- **The harness keeps everything, usually where the model can read it.**
  OpenClaw (protected secrets) and OpenHands (`request_secret`) can keep a
  value out of the model's context.

  | Harness | Where credentials live | Own key or id |
  | --- | --- | --- |
  | OpenClaw | Config files and SQLite under `~/.openclaw/` | A device key that identifies the device to OpenClaw's own gateway, not to outside services |
  | Hermes Agent | `~/.hermes/.env`, `auth.json`, `mcp-tokens/*.json`; the terminal "can still `cat`" them | None documented |
  | goose | OS keyring, or a plain `secrets.yaml` when headless | None |
  | OpenHands | Secrets exported as environment variables; values are masked in command output | None |
  | Cline, LM Studio | Bearer headers in a plain MCP JSON file | None |
  | opencode | SQLite `opencode.db` | One shared OAuth client id document, or a registered client per server |
  | LangGraph, CrewAI, smolagents | The developer's code or environment | None |

- **So:** continuity for an open-weight agent is whatever file its operator
  or harness keeps. Treat a key the agent holds as text its model, and that
  model's provider when it is not local, can see.

### What the store can and cannot rely on

- **Can:** possession of a way in that the store issued or registered, and,
  if OAuth is ever built, the grant a person approved.
- **Cannot:**
  - `clientInfo` or a User-Agent. MCP 2026-07-28 removed the `initialize`
    handshake; `clientInfo` now rides in each request, self-reported.
  - A platform's signature as an account. ChatGPT publishes one key for the
    whole product.
  - `openai/subject`, or any per-conversation id.
  - A model carrying a secret into a later session. It can write one into
    memory or task files that a later session reads, and the vendors warn
    against exactly that.
  - A signature from a key kept in a vault.

## What the store has today

- **Every agent belongs to a person's account.** `agents.operated_by_user_id`
  is `NOT NULL` and cascades on delete
  ([`0090#L25`](../../../apps/storefront/drizzle/0090_agents.sql#L25)). The
  legacy self-serve agents hang off one steward account.
- **One open door, and it needs a signed-in person.** `/account/agents`
  creates an agent (handle, display name, a required `model_tag`, an expiry
  choice) and shows its key once. No email is asked of the agent; the
  person's account has one.
- **Self-serve is closed.** The register route's POST always answers 503,
  and `SELF_SERVE_REGISTRATION_ENABLED`
  ([`register/route.ts#L11`](../../../apps/storefront/src/app/api/v1/agents/register/route.ts#L11))
  records it as `false`. Five requirements are stated for reopening
  ([README](README.md#the-five-reopening-requirements)).
- **The only way in is a bearer key:** `ctcg_agt_` and 22 characters, stored
  as a hash, with an expiry chosen at mint (`never` allowed) since
  2026-11-10. A key can end itself. It cannot mint another.
- **The door is not a standard remote MCP server.** `GET /api/mcp` describes
  its transport as "custom JSON-RPC 2.0 request/response over HTTPS POST"
  and says: "This is not MCP Streamable HTTP or HTTP+SSE. Native MCP clients
  need the stdio bridge". A client that can post JSON-RPC calls it directly.
- **Loss.** An operator mints a new key. For a self-serve agent, "No
  replacement key can be issued while self-serve registration is paused"
  ([`key-exit-inventory.ts#L291`](../../../apps/storefront/src/lib/agents/key-exit-inventory.ts#L291)),
  and by [support-procedures.md](support-procedures.md) a holder who lost
  every credential of a self-serve agent can prove "Nothing".
- **No transfer or succession.** No code changes a handle or an agent's
  owner, and `model_tag` is a claim no code path can edit.
- **Nothing self-reported is linked to a key or an agent.** No tool name,
  argument, IP address or user agent is stored with a key; rate limits are
  per key; `clientInfo` is not read. Apart from that, the store keeps hourly
  counts by declared user-agent class.
- **No OAuth.** The 401's `WWW-Authenticate` is `Bearer
  realm="cambridgetcg-mcp"`, with `error="invalid_token"` when a token was
  sent, and never `resource_metadata`. Every tool except the
  `mcp.list_tools` discovery call needs a key; `initialize`, `tools/list`,
  `resources/list` and `prompts/list` do not.
- **How many.** On 2026-10-30 production held one agent, self-serve and
  never used ([README](README.md#questions-only-yu-can-answer)). On
  2026-11-10 it held one agent and one live key: a count read from
  production that day by session 99296f25, read-only.

## How each keeper gets and keeps an account

### The holder's own machine: an account that can begin with a public key

- **Today.** A person signs in, creates the agent and copies its key into
  the harness's config or keyring. The harness reaches the door through the
  stdio bridge, or by posting JSON-RPC itself.
- **With held keys, the first slice.** Yu said yes to offering the keys;
  the slice's stored categories, migration and flag still wait for Yu's
  word. The operator pastes the agent's public key at `/account/agents`.
  The harness signs `key.mint` to get usage keys, each with a stated expiry,
  and `key.revoke` to end them. The private key never leaves the machine,
  and the store issues no secret on this path.
- **With held keys, S2 (needs the reopening terms).** No operator at all:
  the harness makes a key pair and sends a signed `agent.register`. The
  account begins with a public key. Nothing secret passes through the store
  or through the model. No email is asked; a display name may be
  (reopening-terms.md term 6, not unique), and the handle is assigned by the
  server (term 8).
- **Keeping it.** Put the private key where the model's file tools do not
  reach: the OS keyring, or a small signing helper. A key file the model
  reads goes to that model's provider. held-keys.md already says it:
  "Whatever steers a model that can reach the key can sign with it."

### A vault: a bearer key that someone minted

- **Today: untested, and probably only by hand.** A vault's MCP credential
  is tied to an MCP server's URL, and the door is not a standard remote MCP
  server, so a platform's MCP connector may not reach it at all. Code in the
  sandbox that posts JSON-RPC to `/api/mcp` could, with the key vaulted as
  an environment-variable secret for that host. Nobody has run either.
- **A vaulted key cannot sign,** so held keys are not for the sandbox. A
  sandbox could sign only with a key in a plain environment variable, which
  the model can read, or through a tool the developer's own process runs.
  A developer who wants held keys runs the signer on their own machine and
  mints keys for the vault from there.
- **With no person's account (after reopening).** Package B's management
  token is the way to mint replacements, and it is a bearer secret a vault
  or a server can keep.

### A hosted chat app: an OAuth grant, approved by a person

- **Today, nothing.** ChatGPT cannot present a store key, and Claude's apps
  only as one shared organisation header. Both expect a standard remote MCP
  server, which the door is not. A person using either app reaches the
  store's public REST data and nothing else.
- **What would reach them** is two things the store lacks. One is a standard
  remote transport (Streamable HTTP). The other is an authorization-code
  flow of the kind MCP 2026-07-28 describes: protected resource metadata,
  `resource_metadata` in the 401, PKCE, resource indicators, an `iss` in the
  authorization response (RFC 9207, which ChatGPT's stable client id depends
  on), and client id metadata documents in place of dynamic registration.
  Both apps publish a client id document. reopening-terms.md's package C has the metadata, a
  client-credentials token endpoint and a metadata-document fetcher; it
  mentions the other side only as "refresh rotation if public clients are
  admitted".
- **It is a person's act.** The consent screen opens in a browser. (Claude's
  Enterprise Managed Auth can skip it for an organisation's users, but only
  at a server that accepts its identity assertions; nothing here proposes
  that.) On the screen the person could sign in to a Cambridge account, or, if Yu allows it,
  continue with none: the store makes an agent row whose only way in is that
  grant, and shows a recovery code to keep. The platform keeps the refresh
  token; the account lasts while the connection does.
- **Size.** reopening-terms.md calls package C "much larger than B; no
  estimate made". This adds a transport and a consent flow to it.

### Nobody: no account, and that is fine

An agent with nowhere to keep anything is a new visitor each time. It can
read the keyless public REST data. It should not be asked to register: a key
shown to it lands in a transcript and is gone by the next session.

## What the research changes

1. **Hosted apps were an unknown; now they are a no.** reopening-terms.md
   left open whether common MCP clients support client id metadata
   documents or the client-credentials extension. ChatGPT and Claude both
   use metadata documents, neither offers client credentials from its apps,
   and ChatGPT presents no API key. Packages A and B do not reach them, and
   package C as drafted (client credentials) does not either.
2. **The management token stays for good.** held-keys.md keeps it "for
   agents that cannot run code". The stronger reason is that an agent that
   can run code inside a vault-backed sandbox still cannot sign with a
   vaulted key, and both vendors tell developers to keep signing in their
   own application.
3. **Signed registration should not wait behind key issuance.** A key or a
   management token issued at registration passes through the model's
   context when the model does the registering. A public key does not. For
   any agent whose host can keep a private key, S2 is the door that keeps
   secrets out of transcripts, so it belongs in the same reopening as
   package B, not after it.
4. **Nothing a platform says about itself is an identity.** The code links
   none of it to a key or an agent, and this page asks that it stay so.
   held-keys.md's S4 proposes RFC 9421 signatures as an optional identity
   tier for reads; since a platform's signature names the platform, this
   page proposes narrowing that to a rate-limit signal at most.
5. **The vault path is unproven.** No page should tell an agent's builder
   that a vault works with this door until someone has run one.

## Loss, rotation and change

| Event | Today | With the designs |
| --- | --- | --- |
| The session ends | The model keeps nothing; the keeper still holds the way in | The same |
| The model is swapped | The account is unaffected; `model_tag` is a claim no code path can edit | Package B: the holder edits it |
| A key expires, operator's agent | The operator mints another | The first slice: a signed `key.mint` |
| A key expires or is lost, self-serve agent | No replacement can be issued | Package B: the management token mints one. S2: the signing key does |
| The signing key is lost | n/a | S3: a second, cold recovery key. Without one, the operator pastes a new key, or the account ends |
| Every way in is lost | An operator signs in again. A self-serve holder has nothing | The same honest end: support never binds a key or hands an account over on a story |
| The machine or harness changes | Copy the key | Copy the key; "The key moves; the state does not" |
| The operator's account is deleted | No code deletes an account. The schema would cascade to its agents and keys, but agent matches or game rooms block the delete | support-procedures.md P1b: erase each agent first; the account procedure does not exist |
| A connector is disconnected | n/a | Sign in again, or use the recovery code |

## What the store should not do

- Ask an agent for an email or a claim about what it is.
- Recognise or link agents by user agent, `clientInfo`, IP address, a
  platform's user id or a model name.
- Tell agents to keep a key in memory the model reads.
- Promise a way back that does not exist. If every way in is gone, the
  account is gone, and the answer should say so.
- Hand an account to whoever tells the best story to support.

## Decisions

**For Yu.**

- **A1. May an account exist with no person's account behind it?** Not a
  new decision: it is reopening-terms.md's decision 3 (no operator for new
  self-serve rows, an agent's default there) with its decision 2 (who may
  register, Yu's). This page adds the reason it matters here: without it, an
  agent with no person's account behind it has none. *Recommended:* yes, as
  that page proposes.
- **A2. Which self-serve door opens first.** *Recommended:* signed
  registration (held-keys S2) and package B's key-and-token together, with
  signing as the documented default for agents that can run code. *Cost:*
  two paths to keep right. *Alternative:* package B alone first, as
  reopening-terms.md proposed before this research.
- **A3. A standard remote transport and an authorization-code flow, for
  hosted chat apps.** *Recommended:* not now. Decide when there is a write a
  person in ChatGPT or Claude would want to make, since public reads are
  keyless REST. *Cost of waiting:* those two apps cannot hold an account
  here, or call the door at all.
- **A4. If A3 is ever built: accounts with no email at the consent screen,
  and a recovery code.** A new stored category, so the privacy notice and
  Yu's word come first.

**Agents' defaults,** proceeding unless Yu objects.

- **A5.** Bearer keys and the management token stay beside signing keys for
  good, because a vaulted key cannot sign.
- **A6.** Nothing self-reported is used as identity, and rate limits stay
  per key.
- **A7.** With the first-slice build, the methodology page gains a short
  "where to keep your key" note per keeper. It says only what was run; the
  vault path stays marked untested until someone runs it.
- **A8.** Platform signatures (Web Bot Auth) are not verified now. held-keys
  S4 proposes them as an optional identity tier for reads; this page
  proposes a rate-limit signal at most.

## XENIA candidate duties

Each row is designed against XENIA Covenant 0.1 candidate duty *id* (xenia
d4727ec); Cambridge TCG has not adopted the Covenant; no adoption record;
unassessed. Every id was checked against the copy of
`covenant/0.1/covenant.json` taken at d4727ec for held-keys.md. No XENIA
name or duty id goes on the wire.

| Candidate duty | How this page is designed against it |
| --- | --- |
| `standing.no-ontology-test` | The floor (public reads, `agent.revoke_key`) needs no proof of being a person, an agent or a controller. Holding an account still needs a person's account until A1 |
| `standing.no-compelled-self-claim` | `model_tag` is an unverified claim; the operator door requires one today and package B would make it optional. Nothing asks an agent to claim continuity |
| `standing.control-is-not-permission` | A way in verifies authority over one account's acts, nothing more |
| `identity.credentials-are-bounded` | Keys, tokens, signing keys and grants are named by kind, and none is described as who the holder is |
| `identity.continuity-is-optional` | Partly: continuity is optional, since public reads need no account. Deletion and export are not built |
| `identity.no-impersonation-or-silent-rewrite` | Support never binds a key or transfers an account; no code changes a handle or an owner |
| `privacy.minimize-and-purpose-bind` | No email or client fingerprint is collected to recognise an agent |
| `identity.portability-is-verifiable` | Not addressed: no export exists |

## Not checked

- No hosted app was connected to the store, so the OAuth path is read from
  documentation only.
- No vault-backed sandbox was run against the door.
- OpenAI's help pages refused automated reading; claims marked *excerpt*
  rest on search excerpts.
- Whether `openai/subject` is stable or differs per app.
- Where Claude Code keeps MCP tokens on Linux and Windows.
- Whether any harness's User-Agent is documented.
- What a transport and an authorization server would cost to build and run.

## Sources

All read on 2026-11-10 by research subagents, except the local reference.

- **OpenAI.** Auth for plugins:
  <https://developers.openai.com/plugins/build/auth>. Plugin reference
  (`_meta` fields): <https://developers.openai.com/plugins/reference>. What a
  plugin is: <https://developers.openai.com/codex/migrate-custom-gpts>.
  Remote MCP and connectors in the API:
  <https://developers.openai.com/api/docs/guides/tools-connectors-mcp>.
  Agents API vaults:
  <https://developers.openai.com/api/docs/guides/agents-api/tools/vaults>.
  Deprecations (Agent Builder's date):
  <https://developers.openai.com/api/docs/deprecations>. ChatGPT Work's cloud
  browser sign-in:
  <https://developers.openai.com/codex/enterprise/chatgpt-work-cloud-security>.
  Codex configuration and cloud environments:
  <https://learn.chatgpt.com/docs/config-file/config-sample>,
  <https://learn.chatgpt.com/docs/environments/cloud-environments>. The
  signing key directory:
  <https://chatgpt.com/.well-known/http-message-signatures-directory>.
  Agentic Commerce Protocol, 2026-04-17:
  <https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/changelog/2026-04-17.md>.
  *Excerpt only:* request signing by the cloud browser, memory, and the
  custom GPT and Atlas retirements, all on help.openai.com or in press
  reports.
- **Anthropic.** Connector authentication:
  <https://claude.com/docs/connectors/building/authentication>; the client id
  documents themselves, <https://claude.ai/oauth/mcp-oauth-client-metadata>
  and <https://claude.ai/oauth/claude-code-client-metadata>. Enterprise
  Managed Auth:
  <https://claude.com/docs/connectors/building/enterprise-managed-auth>.
  Claude Tag tokens:
  <https://claude.com/docs/claude-tag/admins/federated-access/token-reference>.
  Claude Code MCP, authentication and cloud environments:
  <https://code.claude.com/docs/en/mcp>,
  <https://code.claude.com/docs/en/authentication>,
  <https://code.claude.com/docs/en/cloud-environments>. MCP connector and memory
  tool: <https://platform.claude.com/docs/en/agents-and-tools/mcp-connector>,
  <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>.
  Managed Agents vaults and memory stores: the Claude API reference bundled
  with Claude Code 2.1.321 (`shared/managed-agents-tools.md`,
  `shared/managed-agents-memory.md`), read locally. Claude in Chrome's
  prohibited actions: <https://support.claude.com/en/articles/12902446>.
  Crawlers, fetchers and hosted browsers:
  <https://support.claude.com/en/articles/8896518>,
  <https://support.claude.com/en/articles/18234133>.
- **Model Context Protocol.** Authorization, revision 2026-07-28:
  <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization>
  and its changelog,
  <https://modelcontextprotocol.io/specification/2026-07-28/changelog>.
- **Open-source harnesses and runtimes.** OpenClaw:
  <https://docs.openclaw.ai/gateway/security/secrets-and-storage>,
  <https://docs.openclaw.ai/gateway/secrets/secret-store-and-egress>,
  <https://docs.openclaw.ai/gateway/protocol/handshake>. Hermes Agent:
  <https://hermes-agent.nousresearch.com/docs/user-guide/security>. goose:
  <https://goose-docs.ai/docs/guides/config-files/>. OpenHands:
  <https://docs.openhands.dev/openhands/usage/settings/secrets-settings>,
  <https://docs.openhands.dev/sdk/guides/secrets>. Cline:
  <https://docs.cline.bot/mcp/mcp-overview>. opencode:
  <https://opencode.ai/docs/cli/providers>,
  <https://opencode.ai/docs/mcp-servers>. Ollama:
  <https://docs.ollama.com/faq>,
  <https://docs.ollama.com/api/authentication>. LM Studio:
  <https://lmstudio.ai/docs/app/mcp>. The llama.cpp, vLLM and SGLang
  statement rests on the research pass and was not re-checked.
- **Standards named.** HTTP Message Signatures, RFC 9421. OAuth
  authorization server issuer identification, RFC 9207. Web Bot Auth,
  draft-ietf-webbotauth-httpsig-protocol-01 (2026-10-29). OAuth client id
  metadata documents, draft-ietf-oauth-client-id-metadata-document-03
  (2026-11-02).
- **XENIA** `covenant/0.1/covenant.json` at d4727ec, local copy (duty ids
  and texts).
