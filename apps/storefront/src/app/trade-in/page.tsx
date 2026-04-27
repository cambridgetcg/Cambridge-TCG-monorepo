import { fetchPrices, type PriceItem } from "@/lib/wholesale/client";
import { formatPrice } from "@/lib/format";
import BuylistTable from "@/components/tradein/BuylistTable";
import SellCartBar from "@/components/tradein/SellCartBar";
import Link from "next/link";

export const metadata = {
  title: "Trade In Your Cards — Cambridge TCG",
  description:
    "Sell your trading cards for cash or store credit. Competitive prices, fast payouts. Near Mint cards accepted.",
};

export interface BuylistItem {
  sku: string;
  card_number: string;
  name: string;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
  cash_price: number;
  credit_price: number;
  stock: number;
  cash_want: number;
  credit_want: number;
}

// Fetch all pages from the wholesale API (it caps at 500 per request)
async function fetchAllPrices(params: Parameters<typeof fetchPrices>[0]) {
  const allItems: PriceItem[] = [];
  let offset = 0;
  const pageSize = 500;
  let total = Infinity;

  while (offset < total) {
    const res = await fetchPrices({ ...params, limit: pageSize, offset });
    allItems.push(...res.items);
    total = res.total;
    offset += pageSize;
    if (res.items.length < pageSize) break; // No more pages
  }

  return allItems;
}

export default async function TradeInPage() {
  // Fetch from ALL three channels, paginated to get every card
  const [catalogItems, creditItems, cashItems] = await Promise.all([
    fetchAllPrices({ game: "one-piece", channel: "cambridgetcg" }),
    fetchAllPrices({ game: "one-piece", channel: "tradein-credit" }),
    fetchAllPrices({ game: "one-piece", channel: "tradein-cash" }),
  ]);

  // Build lookups by SKU
  const creditMap = new Map<string, PriceItem>();
  for (const item of creditItems) creditMap.set(item.sku, item);

  const cashMap = new Map<string, PriceItem>();
  for (const item of cashItems) cashMap.set(item.sku, item);

  // Use the MAIN CATALOG as source of truth — every card appears
  // Overlay trade-in prices from credit/cash channels
  const buylist: BuylistItem[] = catalogItems
    .map((card) => {
      const credit = creditMap.get(card.sku);
      const cash = cashMap.get(card.sku);
      const creditPrice = credit?.channel_price ?? 0;
      const cashPrice = cash?.channel_price ?? 0;
      const stock = card.stock ?? 0;

      // Cash want tiers based on stock
      let cashWant: number;
      if (stock === 0) cashWant = 4;
      else if (stock <= 2) cashWant = 2;
      else cashWant = 0;

      // Credit: always unlimited
      const creditWant = 999;

      return {
        sku: card.sku,
        card_number: card.card_number,
        name: card.name_en || card.name || card.card_number,
        set_code: card.set_code,
        set_name: card.set_name,
        rarity: card.rarity,
        image_url: card.image_url,
        cash_price: cashPrice,
        credit_price: creditPrice,
        stock,
        cash_want: cashWant,
        credit_want: creditWant,
      };
    })
    .filter((item) => item.credit_price > 0 || item.cash_price > 0)
    .filter((item) => {
      // Exclude C, UC, and R — keep SR, SEC, SP, L, parallels, alt arts, promos
      const r = (item.rarity ?? "").toUpperCase().trim();
      const EXCLUDED = new Set(["C", "UC", "R", "-", ""]);
      return !EXCLUDED.has(r);
    });

  // Stats for hero
  const cardsWanted = buylist.filter((i) => i.credit_price > 0).length;
  const maxCredit = Math.max(...buylist.map((i) => i.credit_price), 0);

  return (
    <main className="min-h-screen bg-neutral-950">
      {/* Hero */}
      <section className="border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 py-12 md:py-16">
          <h1 className="text-3xl md:text-5xl font-black text-white">
            Sell Your <span className="text-amber-400">Cards</span>
          </h1>
          <p className="text-neutral-400 mt-3 max-w-xl">
            Get cash or store credit for your trading cards. Prices are refreshed daily but are subject to change — card markets are volatile and prices can shift even within the same day. Your final payout is locked once we review your submission and issue a formal quotation.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-4 mt-6">
            <div className="bg-neutral-900 rounded-xl px-5 py-3">
              <p className="text-2xl font-bold text-amber-400">{cardsWanted}</p>
              <p className="text-xs text-neutral-400">Cards wanted</p>
            </div>
            <div className="bg-neutral-900 rounded-xl px-5 py-3">
              <p className="text-2xl font-bold text-purple-400">100%</p>
              <p className="text-xs text-neutral-400">Market value in credit</p>
            </div>
            <div className="bg-neutral-900 rounded-xl px-5 py-3">
              <p className="text-2xl font-bold text-emerald-400">Up to 85%</p>
              <p className="text-xs text-neutral-400">Market value in cash</p>
            </div>
            <div className="bg-neutral-900 rounded-xl px-5 py-3">
              <p className="text-2xl font-bold text-amber-400">+20%</p>
              <p className="text-xs text-neutral-400">MINT bonus</p>
            </div>
            <div className="bg-neutral-900 rounded-xl px-5 py-3">
              <p className="text-2xl font-bold text-amber-400">24h</p>
              <p className="text-xs text-neutral-400">Price lock</p>
            </div>
          </div>

          {/* Payout tiers */}
          <div className="mt-6 bg-neutral-900 border border-neutral-800 rounded-xl p-5 max-w-2xl">
            <h3 className="text-sm font-bold text-white mb-3">How Payouts Work</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-16 text-right font-bold text-purple-400">Credit</span>
                <p className="text-neutral-300">Receive <span className="text-white font-semibold">up to 100% of market value</span> in store credit. Use it to buy any card in our shop.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-16 text-right font-bold text-emerald-400">Cash</span>
                <p className="text-neutral-300">Receive <span className="text-white font-semibold">up to 85% of market value</span> via bank transfer.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-16 text-right font-bold text-amber-400">MINT</span>
                <p className="text-neutral-300">Cards in perfect MINT condition may qualify for a <span className="text-white font-semibold">+20% bonus</span> on top of the base payout. MINT bonus is at the discretion of Cambridge TCG based on our evaluation.</p>
              </div>
            </div>
            <p className="text-xs text-neutral-500 mt-3">
              MINT bonus is not guaranteed and is subject to the evaluation and decision of Cambridge TCG. Cards must be pack-fresh with zero imperfections to qualify.
            </p>
          </div>
          <div className="flex gap-3 mt-6 text-sm">
            <Link
              href="/trade-in/terms"
              className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition"
            >
              Trade-in terms
            </Link>
            <span className="text-neutral-700">|</span>
            <Link
              href="/trade-in/submit"
              className="text-neutral-400 hover:text-white transition"
            >
              Check submission status
            </Link>
          </div>
        </div>
      </section>

      {/* Trade-in options */}
      <section className="max-w-7xl mx-auto px-4 pt-8 grid gap-4 sm:grid-cols-3">
        <div className="bg-gradient-to-r from-amber-500/10 to-emerald-500/10 border border-amber-500/20 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-white font-bold">Cards not on the buylist?</h2>
            <p className="text-neutral-400 text-sm mt-1">
              Send us photos of individual cards — graded, alt arts, other games.
            </p>
          </div>
          <Link
            href="/trade-in/custom-quote"
            className="mt-4 inline-block px-5 py-2.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition text-center"
          >
            Request Quote
          </Link>
        </div>
        <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-white font-bold">Selling a collection?</h2>
            <p className="text-neutral-400 text-sm mt-1">
              Complete sets, binders, mixed lots — one offer for the entire bundle.
            </p>
          </div>
          <Link
            href="/trade-in/bundle"
            className="mt-4 inline-block px-5 py-2.5 bg-purple-500 text-white text-sm font-bold rounded-lg hover:bg-purple-400 transition text-center"
          >
            Sell a Bundle
          </Link>
        </div>
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-white font-bold">Got bulk commons &amp; rares?</h2>
            <p className="text-neutral-400 text-sm mt-1">
              We buy C, UC, and R cards at 2p each. No sorting needed — just count and send.
            </p>
          </div>
          <Link
            href="/trade-in/bulk"
            className="mt-4 inline-block px-5 py-2.5 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition text-center"
          >
            Sell Bulk Cards
          </Link>
        </div>
      </section>

      {/* Buylist */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <BuylistTable buylist={buylist} />
      </section>

      {/* Floating sell cart bar */}
      <SellCartBar />
    </main>
  );
}
