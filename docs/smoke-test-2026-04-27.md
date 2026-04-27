# Monorepo Smoke Test — 2026-04-27

## Environment
- Node: >=20 (required)
- pnpm: 9.15.0 (declared)
- macOS (local dev)

## 1. Install (`pnpm install`)

**Result: ✅ PASS** (14.1s)

Warnings (non-blocking):
- `pnpm.onlyBuiltDependencies` in wholesale package.json should be at workspace root
- `mangopay2-nodejs-sdk@1.62.2` deprecated
- 8 deprecated subdependencies (non-critical)
- Peer dep mismatches:
  - storefront: `nodemailer@8.0.7` vs next-auth's peer `^7.0.7`
  - wholesale: `esbuild@0.19.12` vs vite's peer `^0.27.0 || ^0.28.0`

## 2. Build: Wholesale (`pnpm build:wholesale`)

**Result: ✅ PASS** (warnings only)

- Next.js 15.5.15
- 66 routes generated
- Warnings: bcryptjs + postgres driver import Node.js APIs in Edge Runtime context (auth.ts import chain). Non-blocking — these only run in Node runtime, not edge.

## 3. Build: Storefront (`pnpm build:storefront`)

**Result: ✅ PASS**

- Next.js 16.2.1 (Turbopack)
- 249 routes generated
- Expected: `[wholesale] prices error 401` during static generation — wholesale API unreachable locally. Non-blocking.

## 4. Dev: Wholesale (`pnpm dev:wholesale`)

**Result: ✅ PASS**

- Ready in ~1s on http://localhost:3000
- Landing route: HTTP 307 (redirect to /login — auth-gated, expected)

## 5. Dev: Storefront (`PORT=3001 pnpm dev:storefront`)

**Result: ✅ PASS**

- Ready in ~167ms on http://localhost:3001
- Landing route: HTTP 200
- Note: storefront also defaults to port 3000 — fixed root `dev:storefront` script to pass `--port 3001`

## Fix Applied
- `package.json`: `dev:storefront` now passes `--port 3001` to avoid collision with wholesale

## Issues for Follow-up

| # | Severity | Issue |
|---|----------|-------|
| 1 | Low | `pnpm.onlyBuiltDependencies` should be in root package.json, not wholesale |
| 2 | Low | `mangopay2-nodejs-sdk` deprecated — check for replacement |
| 3 | Medium | Peer dep: nodemailer 8 vs next-auth expects 7 — test auth flows |
| 4 | Medium | Peer dep: esbuild 0.19 vs vite expects 0.27+ — affects vitest in wholesale |
| 5 | Info | Edge Runtime warnings in wholesale (bcryptjs/postgres in auth.ts) — works but should export `runtime = 'nodejs'` on middleware if issues arise |
