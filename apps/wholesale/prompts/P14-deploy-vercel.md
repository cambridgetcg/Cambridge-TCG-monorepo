# P14 — Deploy to Vercel

Get the app live so the client can access it remotely.

## Task

### 1. Database migration: SQLite → PostgreSQL (Neon)
The app uses libsql/SQLite locally. For Vercel deployment, switch to Neon PostgreSQL (free tier).

- Create a Neon project at https://neon.tech
- Get the connection string
- Update Drizzle config to support both:
  ```ts
  // drizzle.config.ts
  const isPostgres = process.env.DATABASE_URL?.startsWith("postgres");
  export default defineConfig({
    schema: "./src/lib/db/schema.ts",
    dialect: isPostgres ? "postgresql" : "sqlite",
    dbCredentials: { url: process.env.DATABASE_URL! },
  });
  ```
- Update schema.ts: use `pgTable` for production, keep `sqliteTable` for local dev
  - OR: just switch fully to postgres with `drizzle-orm/neon-http` and use Neon for both local and prod
- Run migrations on Neon: `pnpm db:push`
- Seed production DB with admin user (NOT test client — real client will be created by admin)

### 2. Environment variables on Vercel
```
DATABASE_URL=postgres://...@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
NEXTAUTH_SECRET=<generate a real secret>
NEXTAUTH_URL=https://your-domain.vercel.app
AWS_ACCESS_KEY_ID=<from ~/.aws>
AWS_SECRET_ACCESS_KEY=<from ~/.aws>
AWS_REGION=us-east-1
S3_BUCKET=pricedata-tcg
S3_PRICE_FEED_KEY=pricefeed/onepiece_pricefeed.xlsx
RESEND_API_KEY=<if P12 is done>
NOTIFICATION_FROM=orders@cambridgetcg.com
```

### 3. Deploy
```bash
pnpm add -g vercel
vercel link  # link to cambridgetcg org/project
vercel env pull  # or set vars via dashboard
vercel deploy --prod
```

### 4. Custom domain (optional)
If you have a domain: `wholesale.cambridgetcg.com` or similar.
Add it via Vercel dashboard → Settings → Domains.

### 5. Post-deploy checks
- [ ] Login works (admin + client)
- [ ] Catalog loads with prices
- [ ] S3 sync works from admin panel
- [ ] Order submission works
- [ ] Admin order management works
- [ ] HTTPS working

### 6. Security hardening
- Change admin password immediately after first login
- Set NEXTAUTH_SECRET to a proper random value: `openssl rand -base64 32`
- Consider adding rate limiting to login endpoint
- Ensure /api/sync and /api/admin/* are properly auth-gated

Commit: `feat: Vercel deployment with Neon PostgreSQL`
