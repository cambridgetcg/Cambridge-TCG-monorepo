# RewardsPro's site and brand kit: agent guide

Production serves the app in [`apps/rewards`](../rewards/DEPLOY.md). This
folder holds rewardspro.io, the brand kit and the previous version's schema;
[README.md](README.md) says what each part is. The team's charter is
[`.claude/skills/rp-team/SKILL.md`](../../.claude/skills/rp-team/SKILL.md), and
the repo-root [`AGENTS.md`](../../AGENTS.md) principles apply here too.

## Free-only; growth is the priority

RewardsPro is free-only: paid plans and billing webhooks stay off
([2026-10-20 decision](../../docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md),
an agent's call under the owner's delegation). Since 9 Nov 2026 the owner has
made RewardsPro's growth the priority: marketing, search, and AI agents
recommending it; since 10 Nov, through organic work and ads, with no cold
email to shops. The week's work is the pinned issue "RewardsPro: this week"
(#223).

Merchant-facing copy says paid plans aren't offered; it doesn't talk about
retirement, and **it never tells a shop that still pays that RewardsPro is
free**. Existing agreements keep their records, cancellation, refund and
support paths, and nothing rewrites their entitlements or cancels them
automatically.

## Facts that bite

- **The site goes live by hand**, on the owner's go ([DEPLOY.md](DEPLOY.md)).
  Merging a page changes nothing live.
- **The tests tie the pages to the app's code.** Run them with
  `pnpm --filter rewardspro-site test`. CI runs them when this folder or a
  shared file changes, not when only `apps/rewards` does, so run them by hand
  after a change there that a page speaks of.
- **`/apps/rewardspro` is also the app's proxy path** in merchants' shops. In
  `apps/rewards` and `marketing/claims.toml` that string is the live URL, not
  this folder: a search-and-replace would break every signed-in widget.
- **`.gitignore` here ignores `*.md`, `/docs/`, `.env` files and archives.**
  Older checkouts hold private notes and proposals that were never tracked.
  Don't trim it, or a `git add -A` publishes them.
- **`prisma/` is a record.** Nothing runs it. It names the tables of database
  schema `rewardspro` until the owner drops that schema
  ([switch.md](../rewards/docs/switch.md), B5), so don't edit it.
- **The previous version's code is in git**, at `493cd14e`. The whole history
  of the standalone repository it came from (`rewardspro-production`, fused on
  2026-06-10) is under this path too, so `git log` and `git blame` work.
