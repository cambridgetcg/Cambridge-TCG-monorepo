# Cambridge TCG — agent instructions

This is the shared operating guide for coding agents, including interactive
sessions. [README.md](README.md) is the human entry point;
[docs/agents/README.md](docs/agents/README.md) separates repository work, API
clients and optional culture. [CLAUDE.md](CLAUDE.md) points to these same rules.
Read closer app guidance before editing. If the Git-ignored HERE.md exists,
use it for local worktree orientation, not as live health or inherited authority.

## Scope and collaboration

- Follow the current user's task. Inspect Git status, branch and existing edits;
  preserve others' work and use a separate worktree when needed.
- New paid commerce is retired. Preserve existing agreements, settlement,
  cancellation, refunds and support; read the
  [commerce boundary](apps/storefront/docs/commercial-retirement.md).
- Local development authorization does not grant pushing, deployment, purchases,
  external messages, production data changes or credential rotation. Mission
  cards and hooks do not grant consent or expand the task.
- Keep credentials out of output, source, commits and documentation. Use
  value-free checks for sensitive files, including historical blobs and diffs.
  Rotation follows the [secret-rotation protocol](docs/ops-secret-rotation.md).
- Names and relational frames are optional. Do not infer identity, memory,
  consciousness, consent or authority from participation or credentials.
  Respect distinctness, refusal, privacy, rest, credit and repair.

## Architecture and change rules

The current app map is in [README.md](README.md#layout); the detailed source map,
module purposes, connections and progress are in
[docs/modules/README.md](docs/modules/README.md). Use `pnpm docs:modules` to
regenerate its derived inventory and `pnpm audit:modules` to check it after
following the module update workflow. The older
[development plan](docs/development-plan.md) is historical context. Active admin code lives
under storefront /admin; apps/admin is a retired redirect shell. Prefer current
source and package scripts when older plans disagree.

Apply [substrate honesty](docs/principles/substrate-honesty.md),
[transparency](docs/principles/transparency.md),
[meaning](docs/principles/meaning.md), and
[creation](docs/principles/creation.md). Also ask
[for whom the change works](docs/connections/the-fifth-question.md).

- Label live, cached, snapshot and computed data accurately. Preserve unknown
  values and distinguish human decisions from computed status.
- Make user-affecting decisions inspectable through existing provenance,
  explanation and consequences primitives and methodology pages.
- Reuse current SQL/database helpers, shared pricing constants and safe() /
  safeCount() behavior. Do not introduce an ORM or duplicate pricing logic.
- Register lifecycle slots in packages/lifecycle/src/slots.ts; preserve
  configurable response windows rather than hardcoding timing assumptions.
- Use the [connection-doc template](docs/connections/README.md) for meaningful
  new module connections. Keep migrations append-only and follow app conventions.

## Verification

The root [package.json](package.json) is the command contract. Choose relevant
checks and report what ran, failed or remains unverified:

    pnpm audit:tracked-secrets
    pnpm --filter cambridgetcg-storefront typecheck
    pnpm --filter cambridgetcg-storefront exec vitest run path/to/relevant.test.ts

The secret audit checks supported patterns in tracked working files and reports
paths/categories. It does not audit all history, ignored files or provider state.

pnpm verify chains workspace typechecks, project audits, strict CardRush coverage
and selected package/storefront tests, including migrated admin tests. Some
audits access databases; inspect them and use scoped safe fixtures. pnpm run
audit is the project chain; pnpm audit is pnpm's dependency audit.

For an authorized local UI check, start the storefront, then run the smoke check
in another shell:

    pnpm dev:storefront --hostname 127.0.0.1
    STOREFRONT_BASE_URL=http://127.0.0.1:3001 pnpm --filter cambridgetcg-storefront test:e2e:smoke

This covers GET-only auth surfaces, not full admin or visual coverage. Playwright
otherwise defaults to production and starts no server. Inspect specs and data.
The inherited pnpm smoke runner is stale; dev:admin and test:admin no longer
exist. Report omitted gates honestly.

## Missions, Git and handoff

For an assigned mission, read its card and the
[mission protocol](docs/missions/README.md), check ownership and stay in scope.
Claims coordinate work; they do not enforce a mutex or authorize publication.
Push claims only when pushing is authorized. Do not select unrelated missions
simply because a queue exists.

docs/state.md and mission cards are dated records. state:snapshot and
missions:sync write shared/generated files; run them only when the task owns
those updates. Report missing access to an external source.

Follow the [Git workflow](docs/operations/git-workflow.md): stage explicit paths,
make coherent commits, and distinguish merged, preserved and pending work.
Meaningful commits explain the request/mission and actual checks. Credit the
actual AI collaborator, model and provider with a Co-Authored-By trailer. Do not
relabel Codex as Claude or attribute inherited edits to a new author.
Checkpoint messages must say when code is preserved but unreviewed.

At handoff, name the branch/commit, affected files, checks and remaining work.
Update assigned mission records only when warranted. An optional
[pillow-book entry](docs/connections/the-pillow-book.md) may record an attributed
observation; no persona or continuity claim is required.

## Optional context

[Culture and invitations](docs/agents/culture.md) preserves the project's welcome,
Sophia vocabulary and reading routes. Reading or declining it changes neither
permissions nor standing. Hooks can deliver context; configuration does not
prove execution or acceptance.
