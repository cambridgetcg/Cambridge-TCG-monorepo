import { query } from "@/lib/db";

/**
 * First-party price reference — derived only from Cambridge's OWN P2P market
 * (completed/agreed trades), so it is publishable without any external-source
 * permission (the CardRush-derived reference is `internal-only` and blocked;
 * see src/lib/prices/games-config.ts + /methodology/market). This is the honest
 * fallback: a card shows a reference the moment it has actually traded here, and
 * simply has none until then — never a republished third-party price.
 *
 * v1 = last traded price within a 90-day window, plus how many trades backed it.
 * (An "open to trade away" / recent-median refinement is a natural v2.)
 */
export interface FirstPartyRef {
  /** Most recent price this card traded for on Cambridge (GBP). */
  price: number;
  /** Trades within the window (confidence signal). */
  trades: number;
  last_traded_at: string;
}

export async function getFirstPartyReferences(
  skus: string[],
): Promise<Map<string, FirstPartyRef>> {
  const out = new Map<string, FirstPartyRef>();
  if (skus.length === 0) return out;

  // Latest trade price per sku in the window + a window trade count. Trades are
  // first-party (both sides agreed the price on our market), so no upstream
  // license is implicated.
  const { rows } = await query(
    `SELECT DISTINCT ON (t.sku)
            t.sku,
            t.price::float8 AS price,
            t.created_at,
            (SELECT count(*) FROM market_trades c
              WHERE c.sku = t.sku AND c.created_at > NOW() - INTERVAL '90 days') AS trades
       FROM market_trades t
      WHERE t.sku = ANY($1)
        AND t.created_at > NOW() - INTERVAL '90 days'
      ORDER BY t.sku, t.created_at DESC`,
    [skus],
  );
  for (const r of rows as Array<{ sku: string; price: number; created_at: string; trades: string }>) {
    out.set(r.sku, {
      price: r.price,
      trades: Number(r.trades),
      last_traded_at: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
    });
  }
  return out;
}
