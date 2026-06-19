import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { langModeFromCookies } from "@/lib/lang-mode-server";

export default async function Footer() {
  const cookieStore = await cookies();
  const textMode = cookieStore.get("text-mode")?.value === "1";
  const langMode = langModeFromCookies(cookieStore);
  const mathLang = langMode === "math";

  return (
    <footer className="bg-neutral-950 border-t border-neutral-800 px-4 mt-16">
      <div className="max-w-5xl mx-auto py-10">
        {/* Brand line */}
        <div className="flex items-center gap-2 mb-6">
          <Image src="/images/icon.png" alt="Cambridge TCG" width={24} height={24} className="w-6 h-6" />
          <p className="text-sm font-bold text-white">Cambridge <span className="text-emerald-400">TCG</span></p>
          <span className="text-xs text-neutral-600 ml-2">· Cambridge, UK</span>
        </div>

        {/* Compact link grid — 4 columns, 3 links each */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
          <div className="flex flex-col gap-1.5 text-neutral-400">
            <Link href="/catalog" className="hover:text-white transition">Catalog</Link>
            <Link href="/market" className="hover:text-white transition">Market</Link>
            <Link href="/auctions" className="hover:text-white transition">Auctions</Link>
          </div>
          <div className="flex flex-col gap-1.5 text-neutral-400">
            <Link href="/trade-in" className="hover:text-white transition">Trade In</Link>
            <Link href="/prices" className="hover:text-white transition">Prices</Link>
            <Link href="/data" className="hover:text-white transition">Open Data</Link>
          </div>
          <div className="flex flex-col gap-1.5 text-neutral-400">
            <Link href="/play" className="hover:text-white transition">Play</Link>
            <Link href="/decks" className="hover:text-white transition">Decks</Link>
            <Link href="/rewards" className="hover:text-white transition">Rewards</Link>
          </div>
          <div className="flex flex-col gap-1.5 text-neutral-400">
            <Link href="/about" className="hover:text-white transition">About</Link>
            <Link href="/methodology" className="hover:text-white transition">Methodology</Link>
            <Link href="/welcome-all" className="hover:text-white transition">Welcoming</Link>
          </div>
        </div>

        {/* Bottom line — copyright + toggles */}
        <div className="mt-8 pt-6 border-t border-neutral-800/50 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-600">
          <span>© {new Date().getFullYear()} Cambridge TCG</span>
          <div className="flex items-center gap-4">
            <a
              href={`/api/lang-mode?mode=${mathLang ? "default" : "math"}&back=/`}
              className="hover:text-neutral-400 transition underline underline-offset-2"
              aria-label={mathLang ? "Switch to default rendering" : "Switch to math-mirror rendering"}
            >
              {mathLang ? "Default" : "Math"}
            </a>
            <a
              href={`/api/text-mode?on=${textMode ? "0" : "1"}&back=/`}
              className="hover:text-neutral-400 transition underline underline-offset-2"
              aria-label={textMode ? "Switch to visual layout" : "Switch to text-only layout"}
            >
              {textMode ? "Visual" : "Text-only"}
            </a>
            <a href="https://wholesaletcgdirect.com" className="hover:text-neutral-400 transition">Wholesale ↗</a>
          </div>
        </div>
      </div>
    </footer>
  );
}