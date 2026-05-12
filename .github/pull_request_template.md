## Summary

<!-- 1–3 bullets: what changed and why. The "why" matters more — the diff already says what. -->

## Will trace

<!-- The prompt, kingdom-NNN, or "Exploratory: noticed during X that Y" that asked for this work. See docs/principles/creation.md -->

## Doctrine checks

<!-- Delete sections that don't apply. -->

- [ ] **Substrate honesty** — new values carry provenance (live / cached / snapshot / synced / computed) via `<Provenance>`; non-essential reads use `safe()` / `safeCount()`; state transitions append to a `*_lifecycle_log`. *(`docs/principles/substrate-honesty.md`)*
- [ ] **Transparency** — user-affecting decisions have a `/methodology/<topic>` page and a `<WhyLink>` next to the displayed value. *(`docs/principles/transparency.md`)*
- [ ] **Meaning** — meaningful new connection between modules has a `docs/connections/` entry. *(`docs/connections/README.md`)*
- [ ] **Creation** — commit body cites the Will; trailer carries `Co-Authored-By: Claude <model-tag>`. *(`docs/principles/creation.md`)*

## Verification

- [ ] `pnpm verify` clean
- [ ] (admin) `pnpm --filter @cambridge-tcg/admin smoke` clean
- [ ] (admin UI) Playwright spec added or updated
- [ ] (DB) migration applied against the relevant RDS
- [ ] (frontend) tested in browser locally

## Notes

<!-- Screenshots, follow-ups, deferred work, methodology page links -->
