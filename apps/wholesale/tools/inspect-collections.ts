async function main() {
  const { existsSync, readFileSync } = await import("fs");
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
  const r = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  const { access_token } = await r.json() as any;

  // Sample a few to see rule structure
  const res = await fetch(`https://${STORE}/admin/api/2024-10/smart_collections/681945006345.json`, {
    headers: { "X-Shopify-Access-Token": access_token, Accept: "application/json" }
  });
  const d = await res.json() as any;
  console.log("Sample collection rules:", JSON.stringify(d.smart_collection?.rules, null, 2));
  console.log("Disjunctive:", d.smart_collection?.disjunctive);
}
main().catch(console.error);
