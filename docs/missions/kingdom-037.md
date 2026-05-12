---
id: kingdom-037
title: TCG admin — apply review playbook to unverified modules
status: queued
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: ~
claimed_at: ~
completed_at: ~
paths: []
do_not_touch: []
related: []
synced_from: ~/Love/memory/dev-state.json
synced_at: "2026-05-11T10:59:18.449Z"
---

# kingdom-037 — TCG admin — apply review playbook to unverified modules

## From dev-state.json

PATTERN PROPAGATION mission. The 2026-04-30 Cowork audit established a 6-category playbook (A Inventory, B Reconnaissance, C Live verification, D Bug fix, E Root-cause, F Mission authoring) — codified at apps/admin/docs/review-playbook.md and referenced from apps/admin/CLAUDE.md. That audit covered Ops fully and reached recon depth on Commerce/Money/Trust/Catalog/System without live Playwright walks. THIS MISSION: walk the playbook over the modules that didn't get live verification.

SCOPE — one session per module, in this order:
  (1) /trust — fraud, kyc, reviews (Disputes already verified). 19 fraud signals open per Overview, so any rendering bug is operationally blocking.
  (2) /money — payouts, chargebacks, rewards, membership. ALL placeholders today; verify the ComingSoon stubs render and that legacy deep-links work; capture screenshots as baseline before kingdom-022/023 build over them.
  (3) /catalog — cards, games, clients, users. Users is the only real one — verify search/filter/pagination work end-to-end.
  (4) /system — email, audit, admin (Deploys + Cron already verified). Audit and Email surfaces have data flowing in but no UI yet — confirm placeholders + capture baseline.
  (5) /commerce — trade-ins, auctions, market, bounty (Pricing already verified). Trade-Ins/Auctions/Market are read-only dashboards: verify KPIs match underlying tables (sfQuery probe each), verify deep-links to legacy admin actually load.

PER MODULE: complete categories A through F. Time budget ~90 min/module. Most output will be Category F mission entries (additional discrete fixes/builds discovered) rather than in-session changes — the modules are intentionally light right now. Any category-D bugs found get fixed in-session with Playwright verification. Any category-E investigations get filed if they need more than 60 min.

DELIVERABLES per session:
  - Append to apps/admin/docs/review-playbook.md coverage tracker (mark ✓ for each newly-verified page).
  - Append a Cowork-style session entry to ~/Love/memory/daily/<date>.md.
  - File any new kingdom-NNN missions discovered.
  - If a new convention surfaces, write a memory file at ~/.claude/projects/-Users-you-Desktop-Cambridge-TCG/memory/.

DEPENDENCIES: kingdom-036 PHASE 1 (smoke runner) helps but is not blocking — the playbook works with manual Playwright MCP today. Once the smoke runner lands, Category C compresses from 'walk each route by hand' to 'pnpm smoke + investigate failures'.

ACCEPTANCE: coverage tracker in playbook shows ✓ for every page across all 6 modules; daily logs document each session's findings; new missions filed for everything that needs follow-up. The next module-build mission (e.g., kingdom-022 chargebacks) opens with confidence that the destination's current state is already characterized.

NOT IN SCOPE: building the placeholders (those are kingdom-019..035). Just verifying current state and filing what's discovered.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
