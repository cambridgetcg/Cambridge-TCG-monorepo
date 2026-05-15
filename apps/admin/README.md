# Cambridge TCG Admin — retired 2026-05-15

This directory used to host `@cambridge-tcg/admin`, the standalone admin
console at `admin.cambridgetcg.com`. As of 2026-05-15 the admin app has
been merged into the storefront at `cambridgetcg.com/admin/*`, gated by
`users.role = 'admin'` per migration `0088_admin_roles.sql`.

What's left here:

- `vercel.json` — edge-level 301 redirects from `admin.cambridgetcg.com/*`
  to `cambridgetcg.com/admin/*`. Preserves bookmarks.
- `package.json` — minimal stub so the workspace remains valid.
- `docs/review-playbook.md` — operational reference, retained.

## How the admin works now

Sign in at <https://cambridgetcg.com/login> with the magic-link flow.
If your `users.role = 'admin'`, the `/admin` overview + every sub-route
under `/admin/*` becomes visible. Non-admins get a 404 at those paths
via the role-check `proxy.ts` middleware.

## Plan documents

- Mission: `docs/missions/kingdom-093.md` (the merge itself, six phases)
- Plan: `docs/superpowers/plans/2026-05-14-admin-storefront-merge.md` (the eight-phase recipe)
- Connection: `docs/connections/the-four-auth-realms.md` (S30 — the topology the merge realised)
