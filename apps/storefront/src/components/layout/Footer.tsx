import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-neutral-950 border-t border-neutral-800 py-12 px-4 mt-24">
      <div className="max-w-7xl mx-auto grid gap-8 grid-cols-2 md:grid-cols-5">
        {/* Brand */}
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <Image src="/images/icon.png" alt="Cambridge TCG" width={28} height={28} className="w-7 h-7" />
            <p className="text-lg font-black text-white">Cambridge <span className="text-emerald-400">TCG</span></p>
          </div>
          <p className="text-xs text-neutral-500 mt-2 max-w-xs">Japanese trading card specialists. Buy, sell, trade, and collect. Based in Cambridge, UK.</p>
        </div>

        {/* Shop */}
        <div className="flex flex-col gap-1.5 text-sm text-neutral-400">
          <p className="text-white font-medium mb-1">Shop</p>
          <Link href="/catalog" className="hover:text-white transition">Catalog</Link>
          <Link href="/market" className="hover:text-white transition">P2P Market</Link>
          <Link href="/auctions" className="hover:text-white transition">Auctions</Link>
          <Link href="/prices/one-piece" className="hover:text-white transition">Price Guide</Link>
        </div>

        {/* Sell */}
        <div className="flex flex-col gap-1.5 text-sm text-neutral-400">
          <p className="text-white font-medium mb-1">Sell</p>
          <Link href="/trade-in" className="hover:text-white transition">Trade In</Link>
          <Link href="/trade-in/custom-quote" className="hover:text-white transition">Custom Quote</Link>
          <Link href="/trade-in/bundle" className="hover:text-white transition">Sell a Bundle</Link>
          <Link href="/trade-in/bulk" className="hover:text-white transition">Bulk Cards</Link>
        </div>

        {/* Play & Earn */}
        <div className="flex flex-col gap-1.5 text-sm text-neutral-400">
          <p className="text-white font-medium mb-1">Play & Earn</p>
          <Link href="/deck-builder" className="hover:text-white transition">Deck Builder</Link>
          <Link href="/guides/how-to-play" className="hover:text-white transition">How to Play</Link>
          <Link href="/rewards" className="hover:text-white transition">Rewards</Link>
          <Link href="/membership" className="hover:text-white transition">Membership</Link>
        </div>

        {/* Community */}
        <div className="flex flex-col gap-1.5 text-sm text-neutral-400">
          <p className="text-white font-medium mb-1">Community</p>
          <Link href="/community" className="hover:text-white transition">Feed</Link>
          <Link href="/og" className="hover:text-white transition">OG Status</Link>
          <Link href="/about" className="hover:text-white transition">About Us</Link>
          <a href="https://wholesaletcgdirect.com" className="hover:text-white transition">Wholesale</a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-neutral-800 text-xs text-neutral-600">
        © {new Date().getFullYear()} Cambridge TCG Ltd. All rights reserved.
      </div>
    </footer>
  );
}
