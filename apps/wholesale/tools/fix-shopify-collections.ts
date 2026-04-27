#!/usr/bin/env tsx
/**
 * Fix Shopify collections:
 * 1. Delete duplicate older collections (keep newer 681xxx series)
 * 2. Create missing starter deck collections
 */
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
  const DRY = process.argv.includes("--dry-run");

  const r = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  const { access_token } = await r.json() as any;

  function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

  async function shopify<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://${STORE}/admin/api/2024-10/${path}`, {
      method,
      headers: { "X-Shopify-Access-Token": access_token, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && res.status !== 204) {
      const t = await res.text().catch(() => "");
      throw new Error(`${method} ${path} → ${res.status}: ${t.slice(0, 200)}`);
    }
    if (res.status === 204) return {} as T;
    return res.json() as T;
  }

  // ── 1. Delete duplicate older collections ─────────────────────────────────
  const toDelete = [
    510882152713, // OP01 old
    510887624969, // OP02 old
    510895325449, // OP03 old
    510895423753, // OP04 old
    510895522057, // OP05 old
    510895587593, // OP06 old
    510895751433, // OP07 old
    510895915273, // OP08 old
    516265279753, // OP09 old
    668283207945, // OP10 old
    668283142409, // OP11 old
    678172590345, // OP12 old
    678370803977, // OP13 old
    510921408777, // EB01 old
    669991600393, // OP02 trade-in
    678158696713, // ST13 old (The Three Brothers)
  ];

  console.log(`\n── Deleting ${toDelete.length} duplicate/stale collections ──`);
  for (const id of toDelete) {
    if (DRY) { console.log(`  [DRY] DELETE collection ${id}`); continue; }
    try {
      await shopify("DELETE", `smart_collections/${id}.json`);
      console.log(`  ✅ Deleted ${id}`);
    } catch (e: any) {
      console.log(`  ⚠️  ${id}: ${e.message}`);
    }
    await sleep(550);
  }

  // ── 2. Create missing starter deck collections ────────────────────────────
  const toCreate = [
    { title: "ST21 Starter Deck EX: Gear 5",     prefix: "ST21",    sort: "alpha-asc" },
    { title: "ST22 Starter Deck: Ace & Newgate",  prefix: "ST22",    sort: "alpha-asc" },
    { title: "ST15-20 Starter Decks (2024)",       prefix: "ST",      sort: "alpha-asc" }, // catches ST15–ST20
    { title: "ST23-28 Starter Decks (2025)",       prefix: "ST23",    sort: "alpha-asc" },
  ];

  console.log(`\n── Creating ${toCreate.length} missing collections ──`);
  for (const col of toCreate) {
    if (DRY) { console.log(`  [DRY] CREATE "${col.title}" (title starts_with "${col.prefix}")`); continue; }
    try {
      const body = {
        smart_collection: {
          title: col.title,
          sort_order: col.sort,
          disjunctive: false,
          rules: [{ column: "title", relation: "starts_with", condition: col.prefix }],
          published: true,
        }
      };
      const res = await shopify<any>("POST", "smart_collections.json", body);
      console.log(`  ✅ Created "${col.title}" → id ${res.smart_collection?.id}`);
    } catch (e: any) {
      console.log(`  ❌ "${col.title}": ${e.message}`);
    }
    await sleep(550);
  }

  console.log("\n── Done ──");
}

main().catch(e => { console.error(e); process.exit(1); });
