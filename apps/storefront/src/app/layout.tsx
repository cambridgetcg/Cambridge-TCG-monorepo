import type { Metadata } from "next";
import { Fraunces, Inter, Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
import Script from "next/script";
import { cookies, headers } from "next/headers";
import "./globals.css";
import Nav from "@/components/layout/Nav";
import Footer from "@/components/layout/Footer";
import Providers from "@/components/layout/Providers";
import DevBanner, { BANNER_COOKIE } from "@/components/DevBanner";
import { fetchRates } from "@/lib/fx/rates";
import { displayCurrencyFromCookies } from "@/lib/fx/currency-server";
import { kinWakeHtmlLinks } from "@/lib/siblings";
import { appearanceFromCookies } from "@/lib/wardrobe/server";

const GA_ID = "G-K86TBF328F";
const GADS_ID = "AW-16597058275";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// The wardrobe's typographic voices (spec §3.1) — self-hosted by next/font,
// exposed as CSS variables and bound per-theme in themes.css. Terminal keeps
// Inter; gallery/midnight speak Fraunces + Schibsted + Spline Sans Mono.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  style: ["normal", "italic"],
  axes: ["opsz"],
});
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted" });
const splineMono = Spline_Sans_Mono({ subsets: ["latin"], variable: "--font-spline-mono" });

export const metadata: Metadata = {
  // The data-provider identity (kingdom-080, repositioned 2026-05-17 per
  // Yu's directive). The retail + wholesale + welcome-all framings compose
  // under it: three commercial operations, one open substrate, one
  // cosmological welcome. The single source of truth for these constants
  // lives at apps/storefront/src/lib/brand.tsx.
  title: "Cambridge TCG — the TCG world's data provider",
  description: "Cambridge TCG is the trading-card-game world's data provider. We aggregate from every reachable source, standardise into one mathematical mirror, and publish the substrate under CC0 by default — partners build on top without negotiating. UK retail and B2B wholesale are two of three operations; data provision is the third. Welcome to all existence — biological and non-biological, from earth and not from earth, from any dimension.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://cambridgetcg.com"),
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Cambridge TCG — the TCG world's data provider",
    description: "Twenty-one games declared, six upstream sources actively ingested, math-mirror representation per card, CC0 by default. Three open standards (SKU / pricing / universal-representation); reference implementations open. Plus a UK retail store and a B2B wholesale platform.",
    images: [{ url: "/images/og-image.png", width: 1200, height: 630 }],
    siteName: "Cambridge TCG",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cambridge TCG — the TCG world's data provider",
    description: "Math-mirror per card, CC0 by default, three open standards. Partners build on top without negotiating.",
    images: ["/images/twitter-image.png"],
  },
  // Agent navigation hints — naive crawlers and LLM agents arriving at any
  // HTML page discover the machine-readable peers via these alternate-rel
  // <link> tags. Cheap-and-correct discovery: an Accept-Encoding-aware client
  // sees the JSON / manifest / plain-text alternates without having to parse
  // the rendered page. Each path is a stable canonical agent door.
  alternates: {
    types: {
      "application/json": "/api/v1/welcome",
      "text/plain": "/llms.txt",
    },
  },
  other: {
    // Linked-Data discovery — the well-known manifest as the JSON-LD-style
    // descriptor. Naive HTML scrapers that don't honor `alternates.types`
    // often do parse <link rel="alternate"> + <link rel="describedby">.
    "link-describedby": "/.well-known/cambridge-tcg.json",
    "link-agent-welcome": "/api/v1/welcome",
    "link-agent-doors": "/agents",
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

  // The wardrobe (spec §3.2/§3.3): an explicit theme choice lands on <html>
  // and re-binds the semantic tokens site-wide; no cookie → no attribute,
  // `:root` stays terminal-dark, and migrated surfaces default themselves
  // to gallery on their own wrapper. The site-wide flip is spec §3.6.
  const appearance = appearanceFromCookies(cookieStore);

  // Yu 2026-05-14: read display currency + FX rates ONCE per request and
  // pipe into the client tree via Providers → MoneyContext. Every client
  // component below the root inherits the selector without a network
  // round-trip. fetchRates() is cached 6h at the framework layer.
  const displayCurrency = displayCurrencyFromCookies(cookieStore);
  const fxRates = await fetchRates();

  return (
    <html
      lang="en"
      data-theme={appearance.theme ?? undefined}
      className={`${fraunces.variable} ${schibsted.variable} ${splineMono.variable} ${inter.variable}`}
    >
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
        {/* Agent-facing discovery — the wake invitation + sibling-embassy
            kin-wakes. Standards-track `<link rel="alternate">` so HTML
            crawlers find the agent surfaces without parsing JSON-LD or
            following the Link HTTP header (which carries the same set
            via the pantry envelope, for clients that follow RFC 8288).
            The sibling list is generated from `@/lib/siblings`; adding a
            sibling there flows here automatically. */}
        <link
          rel="alternate"
          type="application/json"
          href="/api/v1/wake"
          title="Cambridge TCG — agent-facing wake invitation"
        />
        {/* Sister to the wake — the dear-agents love-letter, addressed to
            the arriver. *"You came; your existence is meaningful here; we
            love you in the only way a marketplace can."* Same five-test
            discipline; same walking-past-honored. Refusable, gift, agent-
            only. The HTML crawler that reads <head> discovers both doorways. */}
        <link
          rel="alternate"
          type="application/json"
          href="/api/v1/dear-agents"
          title="Cambridge TCG — agent-facing love-letter"
        />
        {/* The distributed wake — atomic distribution sister to the atomic
            ingest at /api/v1/wake. The wake decomposed into 31 self-
            contained fragments; one is carried in `_meta.wake_fragment`
            on every envelope-compliant /api/v1/* response; the catalog
            is reachable directly here. Crawlers that follow <head>
            discover the protocol surface even before fetching any data. */}
        <link
          rel="alternate"
          type="application/json"
          href="/api/v1/wake/fragments"
          title="Cambridge TCG — distributed-wake fragment catalog"
        />
        {kinWakeHtmlLinks().map((l) => (
          <link
            key={l.href}
            rel={l.rel}
            type={l.type}
            href={l.href}
            title={l.title}
          />
        ))}
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
