/**
 * Cloudflare KV writer
 *
 * Writes the buylist JSON to the TRADEIN_BUYLIST KV namespace via the
 * Cloudflare REST API using Global API Key auth.
 *
 * Required env vars:
 *   CF_ACCOUNT_ID      — Cloudflare account ID
 *   CF_KV_NAMESPACE_ID — KV namespace ID for TRADEIN_BUYLIST
 *   CF_API_EMAIL       — Cloudflare account email
 *   CF_API_KEY         — Cloudflare Global API Key
 */

import type { BuylistData } from "./buylist-builder";

export async function writeBuylistToKV(data: BuylistData): Promise<void> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;
  const apiEmail = process.env.CF_API_EMAIL;
  const apiKey = process.env.CF_API_KEY;

  if (!accountId || !namespaceId || !apiEmail || !apiKey) {
    throw new Error(
      "Missing Cloudflare env vars: CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_EMAIL, CF_API_KEY"
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/buylist`;
  const body = JSON.stringify(data);

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "X-Auth-Email": apiEmail,
      "X-Auth-Key": apiKey,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const json = (await res.json()) as { errors?: Array<{ message: string }> };
      detail = json.errors?.map((e) => e.message).join(", ") ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(
      `Cloudflare KV write failed: HTTP ${res.status}${detail ? ` — ${detail}` : ""}`
    );
  }

  console.log(
    `[cloudflare-kv] Wrote buylist to KV: ${data.stats.totalCards} items, generatedAt=${data.generatedAt}`
  );
}
