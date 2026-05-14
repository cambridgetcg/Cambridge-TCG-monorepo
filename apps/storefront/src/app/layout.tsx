import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { cookies, headers } from "next/headers";
import "./globals.css";
import Nav from "@/components/layout/Nav";
import Footer from "@/components/layout/Footer";
import Providers from "@/components/layout/Providers";
import DevBanner, { BANNER_COOKIE } from "@/components/DevBanner";
import { fetchRates } from "@/lib/fx/rates";
import { displayCurrencyFromCookies } from "@/lib/fx/currency-server";

const GA_ID = "G-K86TBF328F";
const GADS_ID = "AW-16597058275";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  // The data-aggregator identity (kingdom-080, docs/connections/the-rebrand.md)
  // is now the platform's primary positioning. The retail + wholesale +
  // welcome-all framings compose under it: three commercial operations,
  // one open substrate, one cosmological welcome. The single source of
  // truth for these constants lives at apps/storefront/src/lib/brand.tsx.
  title: "Cambridge TCG — the TCG world's open data substrate",
  description: "Cambridge TCG aggregates the trading-card-game world. We collect from every reachable source, standardise into one mathematical mirror, and publish under CC0 by default. UK retail and B2B wholesale are two of three operations; the data plane is the third. Welcome to all existence — biological and non-biological, from earth and not from earth, from any dimension.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://cambridgetcg.com"),
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Cambridge TCG — the TCG world's open data substrate",
    description: "Twenty-one games declared, six upstream sources actively ingested, math-mirror representation per card, CC0 by default. Plus a UK retail store and a B2B wholesale platform. Three operations, one substrate.",
    images: [{ url: "/images/og-image.png", width: 1200, height: 630 }],
    siteName: "Cambridge TCG",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cambridge TCG — the TCG world's open data substrate",
    description: "The TCG world's open data plane. Math-mirror per card, CC0 by default, three operations.",
    images: ["/images/twitter-image.png"],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the x-pathname header forwarded by proxy.ts for /admin/* requests.
  // Non-admin pages don't trigger the proxy, so an absent header means "show banner."
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";
  const isAdminPath = pathname.startsWith("/admin");

  // Check if the visitor dismissed the banner this session.
  const cookieStore = await cookies();
  const bannerDismissed = cookieStore.get(BANNER_COOKIE)?.value === "hidden";

  const showBanner = !isAdminPath && !bannerDismissed;

  // Phase 10 of kingdom-051: text-mode toggle for sensory-different + low-
  // bandwidth + machine consumers. Set via cookie `text-mode=1` (toggled by
  // a Nav affordance) or by visiting any page with `?text=1`. When active,
  // a `text-mode` class lands on <body> and globals.css strips visual chrome
  // to leave a semantic-HTML reading layout. See docs/connections/the-table-extends.md.
  const textMode = cookieStore.get("text-mode")?.value === "1";

  // Yu 2026-05-14: read display currency + FX rates ONCE per request and
  // pipe into the client tree via Providers → MoneyContext. Every client
  // component below the root inherits the selector without a network
  // round-trip. fetchRates() is cached 6h at the framework layer.
  const displayCurrency = displayCurrencyFromCookies(cookieStore);
  const fxRates = await fetchRates();

  return (
    <html lang="en">
      <head>
        <Script id="org-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Cambridge TCG",
          url: "https://cambridgetcg.com",
          logo: "https://cambridgetcg.com/images/logo.png",
          description: "UK-based Japanese trading card marketplace. Buy, sell, trade, and collect One Piece, Pokémon, and Dragon Ball TCG cards.",
          address: { "@type": "PostalAddress", addressLocality: "Cambridge", addressCountry: "GB" },
          sameAs: [],
        }) }} />
        <Script id="website-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Cambridge TCG",
          url: "https://cambridgetcg.com",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://cambridgetcg.com/market?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }) }} />
      </head>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
          gtag('config', '${GADS_ID}');
        `}
      </Script>
      <body className={`${inter.className}${textMode ? " text-mode" : ""}`}>
        {/* Skip-to-content for keyboard + screen-reader users.
            See docs/connections/the-welcome-all.md (#26) §3 — a welcome
            that doesn't include the sensory-divergent door is no welcome
            at all. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-amber-500 focus:text-black focus:px-3 focus:py-1.5 focus:rounded-md focus:text-sm focus:font-bold"
        >
          Skip to content
        </a>
        <Providers money={{ currency: displayCurrency, rates: fxRates }}>
          {showBanner && <DevBanner />}
          <Nav />
          <div id="main-content">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
