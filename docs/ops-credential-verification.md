# Credential-dependent verification — CTCG pilot

**Contract:** `credential-verification/v1` · **GitHub checks:** `github-oauth/1`.
GitHub OAuth is the first implemented integration. Stripe and email have existing
verification mechanisms; this document does not claim that they have migrated.

## What a result means

These are different claims, checked separately:

1. The operator selected the right application and credential kinds.
2. The intended environment has credential metadata and a current deployment.
3. The deployed application advertises the provider.
4. The application constructs the expected authorization request.
5. A real provider accepts authorization and returns to the application.
6. Identity evidence and admission are accepted.
7. The browser receives a usable session for the **intended CTCG account**.
8. Logout ends that browser session.

A visible button, HTTP 200, mocked callback, or server sign-in event is not proof
of the whole journey. A GitHub login page is not proof that a callback is
registered or that the client secret is correct. Ordinary `gh` access does not
generally let the verifier inspect GitHub OAuth App registration settings.

Each check records `passed`, `failed`, `blocked`, or `skipped`, separately from
its evidence kind: `mocked`, `live_observed`, `operator_declared`, or
`not_observed`. Missing required evidence makes the requested scope incomplete.
A correctly denied negative scenario does not establish a successful login.
Read the scope and evidence labels, not only the summary status.

Receipts bind observations to a normalized approved origin, environment, check
version, timestamps and available deployment identity. Readiness reuse expires
after 15 minutes and is invalidated earlier by deployment/configuration changes.
A mid-run deployment change makes the result incomplete. Unknown freshness is
unknown, not current. Expiry does not erase the historical observation.

## Credential setup contract

The executable descriptor is `apps/storefront/src/lib/verification/github.ts`.
It owns setup references, credential names, scopes, callback construction,
environments and scenario requirements. Do not put actual credentials in it.

For the GitHub pilot:

- Register an **OAuth App**, not a GitHub App. A downloaded RSA private key is
  not the OAuth client secret used by this login flow.
- `AUTH_GITHUB_ID` is the OAuth App Client ID; `AUTH_GITHUB_SECRET` is its client
  secret. Store runtime credentials in the intended deployment environment,
  never `NEXT_PUBLIC_*`, source, chat, screenshots or test fixtures.
- Scope is only `read:user user:email`; no repository or organization access is
  requested. GitHub tokens are not retained in the CTCG account link.
- Confirm the exact outgoing callback against that same app's **Authorization
  callback URL**, not its homepage URL. Operator confirmation is labelled as a
  declaration until a real provider round trip supplies stronger evidence.
- Adding or changing deployment environment variables requires a deployment
  created after the change. A build still running has not updated the live alias.
- Use separate registrations and dedicated data for local/staging validation.
  A staging-looking hostname does not prove that its database is non-production.

The operator channel (for example an already-authenticated Vercel CLI) is
separate from runtime credentials. The verifier does not obtain new permissions,
log into control planes, retrieve decrypted environment values, or provision apps.

## One command, explicit effects

Run from the monorepo root. `pnpm auth:verify github --help` is the executable
reference for accepted flags. No target defaults to production.

### Preflight

```sh
pnpm auth:verify github --mode preflight --base http://localhost:3001
```

Default probes are GET-only. To inspect the OAuth initiation redirect, explicitly
permit the sign-in POST and its ephemeral cookie/state effects:

```sh
pnpm auth:verify github --mode preflight --base http://localhost:3001 --probe-redirect
```

The redirect probe stops before GitHub authorization. It cannot verify the
registered callback or consent by inspecting the outgoing URL alone.

Production preflight is a separate explicit choice, not a production login:

```sh
pnpm auth:verify github --mode preflight --base https://cambridgetcg.com --allow-production --vercel-metadata
```

`--vercel-metadata` uses existing operator access for bounded metadata checks.
`--operator-declared-github-app` records that an operator reviewed the OAuth App,
credential-pair provenance and registered callback; it is **not introspection or
proof of valid credentials**. Do not set it merely to make the summary green.
Unavailable tools/permissions, missing metadata and unperformed declarations
are reported as blocked/unknown. Never supply client secrets as command arguments.

For JSON without package-runner banners:

```sh
pnpm --silent auth:verify github --mode preflight --base http://localhost:3001 --json
```

Optional `--receipt <new-file>` writes a new sanitized receipt without overwriting
an existing file. Keep private fixtures and local receipts in `.auth-verification/`,
which is ignored by Git. Inspect a receipt before deliberately publishing it as
release evidence. Do not attach provider payloads or browser recordings.

### Human-assisted staging journey

This mode is **not permitted against production**, including production aliases
and direct production deployment URLs. A non-loopback CTCG target needs operator
metadata confirming an approved preview deployment, as well as an explicit
fixture declaration that its data is dedicated to testing. Unknown target/data
posture blocks the journey; it does not justify a bypass flag.

A private fixture identifies the approved origin, scenario, dedicated-test-data
posture and expected CTCG user ID. It contains **no GitHub password, client secret,
MFA material, cookies or browser storage**. The expected user ID remains in memory;
receipts report only whether identity matched. Protect this local file and do not
commit it. Obtain fixture identity from an authorized staging operator, not from
unrelated customer rows. The fixture fields are `origin`, `environment: "staging"`,
`scenario: "positive_login" | "expected_denial"`, `dedicatedTestData: true`, and
`expectedCtcgUserId`; an approved same-origin `protectedSurfacePath` is optional.

The pilot's negative fixture additionally uses
`expectedPublicErrorCode: "access_denied"`. This proves only the observed
same-origin public `AccessDenied` redirect and absent session, not the exact
policy branch. A 200 response with no session is not such a denial. Use correlated
operator events for the branch explanation; do not substitute a matching generic
error message for cause evidence.

```sh
pnpm auth:verify github --mode journey --base https://your-approved-staging.example --fixture .auth-verification/fixture.json --allow-test-account-effects
```

The acknowledgement permits the scenario's possible test-account provider link,
session creation and logout. It is not permission to mutate customers or delete
provider links. A failed attempt can still have test-side effects; the runner
does not silently clean them up or infer zero writes from an absent session.

The runner opens a fresh temporary headed browser and checks an anonymous
baseline. **The human** completes provider login, MFA, CAPTCHA and consent. The
runner does not fill credentials, bypass controls or approve consent. A positive
journey requires the server's coarse Auth.js completion marker, a successful
same-origin callback redirect, and the resulting session in that browser context.
The marker alone is not session proof. The runner compares the intended user ID
privately, then logs out that fixture session and checks an explicitly anonymous
session response. An HTTP failure, malformed response or timeout is **unknown**,
never evidence of an anonymous baseline or successful logout. A mismatched user
ID stops the run without logging out an unexpected account.

Missing fixture, incomplete human action, cancellation and timeout remain explicit
outcomes. Browser contexts close on every exit. No credential-page screenshots,
traces, videos, console/network dumps or storage-state exports are created.
A timed-out exchange requires a new deliberate attempt; no OAuth code is replayed.

### Explain a real failure

A GitHub callback failure may show a **support reference** on either login error
surface. The reference is random correlation data—not proof of identity,
authentication, consent or permission. There is no public diagnostic lookup API.

```sh
pnpm auth:verify github --mode explain --base https://cambridgetcg.com --attempt <support-reference> --allow-production
```

With authorized Vercel access, this reads only the matching pilot events in a
bounded window and converts known codes into next actions. Surrounding raw logs
are not returned. Missing or delayed evidence stays missing; the command does not
retry login, modify settings, weaken admission or manufacture a diagnosis.

The existing public error copy remains generic. Operator diagnostics distinguish
verified-email/proof problems, missing context, first-link session-target
mismatch, admission pause, provider failures and unclassified Auth.js errors.
An unclassified `AccessDenied` is **not** automatically called a session mismatch.

## Feedback implementation and limits

- `src/lib/verification/contract.ts`: closed receipts, aggregation and freshness.
- `src/lib/verification/events.ts`: pure allowlisted attempt schema/parser.
- `src/lib/auth/verification-observer.ts`: request-scoped context and bounded
  diagnostic emission. Concurrent attempts do not share an active reference.
- `src/lib/verification/vercel-adapter.ts`: fixed-project/team metadata and log
  transport, validated against Vercel's raw API/JSONL shapes before matching.
- `scripts/verify-auth-provider.ts`: the local command and bounded private-fixture
  loader; it does not install a service or schedule future runs.

Own diagnostics exclude email addresses, CTCG/GitHub user IDs, OAuth codes/state,
secrets, tokens, cookies, raw request URLs and upstream errors. Metadata has strict
formats. Logging failures must not change authentication decisions. Platform log
retention and access controls remain the operator's responsibility; the new module
does not make the surrounding platform a secret-free recorder by declaration.

Only an actual browser-session comparison can establish the intended session.
An Auth.js completion event is a useful milestone, not `journey_verified`.
Stronger real-world no-write assertions require separately authorized fixture-state
evidence; the mocked callback tests retain their exact zero-write assertions.

## Test and release sequence

1. Run descriptor/receipt, probe, observer, redaction and concurrency tests in
   normal credential-free CI. Fixture/mock results keep their evidence label.
2. Run local browser fixtures covering positive login, expected denial, identity
   mismatch, cancellation, timeout, logout and cleanup.
3. Run storefront typecheck, repository `pnpm verify` and the affected-app build.
4. Separately authorize a real staging fixture and the live journey's persistent
   effects. Missing authorization or fixtures is a blocked check, not a green one.
5. Retain a sanitized, correctly scoped receipt with release evidence.
6. Production deployment remains a separate decision. Existing `deploy-verify`
   route/posture checks do not become OAuth-journey verification.

Do not change admission modes to force a test green. Do not bypass state/PKCE,
verified-email checks or first-link protection. Do not create schedules, secret
provisioners, public diagnostic endpoints, persistent browser profiles or a
cross-project conformance claim as part of this pilot.

Further standards: [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/),
[OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/), and
[OAuth 2.0 Security BCP (RFC 9700)](https://www.rfc-editor.org/rfc/rfc9700.html).
These are references, not a claim of certification.
