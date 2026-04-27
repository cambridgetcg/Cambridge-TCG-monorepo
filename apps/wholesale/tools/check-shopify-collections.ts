#!/usr/bin/env tsx
import { existsSync, readFileSync } from "fs";

async function main() {
  for (const f of [".env.local", ".env"]) {
    if (existsSync(f)) {
      for (const line of readFileSync(f, "utf-8").split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*?)["']?\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      }
    }
  }
  const STORE = process.env.SHOPIFY_STORE!;
  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;

  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  const { access_token } = await res.json() as any;

  const colRes = await fetch(`https://${STORE}/admin/api/2024-10/custom_collections.json?limit=250`, {
    headers: { "X-Shopify-Access-Token": access_token, Accept: "application/json" }
  });
  const colData = await colRes.json() as any;
  console.log("Custom collections:", colData.custom_collections?.length ?? 0);
  colData.custom_collections?.forEach((c: any) => console.log(`  [${c.id}] ${c.title} (handle: ${c.handle})`));

  const smartRes = await fetch(`https://${STORE}/admin/api/2024-10/smart_collections.json?limit=250`, {
    headers: { "X-Shopify-Access-Token": access_token, Accept: "application/json" }
  });
  const smartData = await smartRes.json() as any;
  console.log("\nSmart collections:", smartData.smart_collections?.length ?? 0);
  smartData.smart_collections?.forEach((c: any) => console.log(`  [${c.id}] ${c.title} (rules: ${c.rules?.length})`));
}
main().catch(e => { console.error(e); process.exit(1); });
