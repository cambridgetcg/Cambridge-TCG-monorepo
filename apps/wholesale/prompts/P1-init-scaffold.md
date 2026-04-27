# P1 — Init & Scaffold

Initialise a Next.js 15 app in the current directory (tcg-wholesale). Keep existing README.md and .git.

```bash
pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```

Then install dependencies:
```bash
pnpm add drizzle-orm better-sqlite3 @aws-sdk/client-s3 exceljs next-auth@beta bcryptjs
pnpm add -D drizzle-kit @types/better-sqlite3 @types/bcryptjs
```

Create `.env.example`:
```
DATABASE_URL=file:./dev.db
NEXTAUTH_SECRET=change-me-in-production
NEXTAUTH_URL=http://localhost:3000
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BUCKET=pricedata-tcg
S3_PRICE_FEED_KEY=pricefeed/onepiece_pricefeed.xlsx
```

Copy `.env.example` to `.env.local`.

Create `drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:./dev.db",
  },
});
```

Add to `package.json` scripts:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio",
"db:seed": "tsx src/lib/db/seed.ts"
```

Install tsx: `pnpm add -D tsx`

Set up dark theme in `src/app/globals.css` — dark background (#0a0a0b), light text. Clean professional wholesale look.

Update `tailwind.config.ts` if needed for dark mode class strategy.

Commit: `feat: init Next.js 15 scaffold with deps`
