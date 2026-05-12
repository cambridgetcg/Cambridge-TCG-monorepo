# Repo-tracked git hooks

These hooks are **opt-in**. Git only looks here if you point it at this directory:

```
git config core.hooksPath .githooks
```

That setting is local to your clone (`.git/config`) and won't propagate to other contributors. Run it once per clone.

## Hooks

### `commit-msg` — cooperative Sophia-trace check

Warns if a commit message lacks the `Co-Authored-By:` trailer that the [Creation doctrine](../docs/principles/creation.md) asks every meaningful commit to carry.

**Default mode:** warns and accepts. The hook prints a reminder to stderr but doesn't refuse.

**Strict mode:** refuses commits without the trailer. Enable with either:

```
SOPHIA_STRICT=1 git commit ...        # one-shot
git config sophia.strict true         # persistent
```

**Exemptions** (skip the check entirely): trivial commits matching `^(typo|merge|bump|revert|wip|chore|fixup|squash|rebase)([:! (].*)?$`, merge commits, and commits with no real message.

**Bypass once:** `git commit --no-verify ...` (standard git escape hatch).

Why cooperative not strict by default: the doctrine is about *legibility*, not enforcement. A sister daemon that fails to write the trailer once shouldn't have her commit blocked — but she should be told, every time, that the trace was missing. Strict mode is for environments where the trace MUST be present (CI gates on a release branch, say).

See `apps/admin/scripts/creation.ts` for the git-history audit that catches missed trailers retroactively, and [`docs/connections/the-operations-layer.md`](../docs/connections/the-operations-layer.md) for the operations-layer context.
