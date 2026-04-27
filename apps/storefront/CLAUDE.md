@AGENTS.md

# Cambridge TCG Storefront

## Stack
- Next.js 16.2.1 (App Router, Turbopack) + TypeScript + Tailwind CSS 4
- PostgreSQL on AWS RDS (`tcg-wholesale` in us-east-1)
- Stripe (checkout + webhooks)
- AWS SES (transactional email)
- next-auth v5 (magic link email login)
- Deployed on Vercel (production: cambridgetcg.com)
- Wholesale API: wholesaletcgdirect.com (live pricing)

## Database
- Raw `pg` driver (no ORM). All queries in `src/lib/db.ts` and `src/lib/tradein/db.ts`
- SSL fix: strip `sslmode` from DATABASE_URL, set `ssl: { rejectUnauthorized: false }`
- Tables: users, accounts, sessions, verification_tokens, customer_orders, tradein_submissions, tradein_items
- Migrations in `drizzle/` directory (run manually against RDS)

## Auth
- next-auth v5 with custom PgAdapter (`src/lib/auth/adapter.ts`)
- Email provider via AWS SES (`src/lib/auth/email.ts`)
- Session-aware Nav shows Sign In / Account
- Admin dashboard at `/admin/trade-ins` (password: ADMIN_PASSWORD env var)

## Key Patterns
- Dark theme: bg-neutral-950, text-white, amber-500 accent, emerald-400 secondary
- Cards: bg-neutral-900 rounded-xl p-4
- Forms: bg-neutral-900 border border-neutral-800 rounded-lg
- All env vars must be `.trim()`'d when used as API keys (Vercel whitespace issue)
- Use `pnpm` for package management (pnpm-lock.yaml)

## Current Priorities
1. Fix Stripe checkout (STRIPE_SECRET_KEY needs to be sk_live_, not pk_live_)
2. Test magic link email flow end-to-end
3. Membership & loyalty module (planned)
4. SEO improvements
5. Mobile responsiveness polish
