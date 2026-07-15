import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, Inter, Noto_Serif_JP, Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
import Script from "next/script";
import { cookies, headers } from "next/headers";
import "./globals.css";
import Nav from "@/components/layout/Nav";
import Footer from "@/components/layout/Footer";
import Providers from "@/components/layout/Providers";
import { StorefrontBreadcrumbs } from "@/components/layout/StorefrontBreadcrumbs";
import DevBanner, { BANNER_COOKIE } from "@/components/DevBanner";
import CookieConsent, { ANALYTICS_CONSENT_COOKIE } from "@/components/CookieConsent";
import { fetchRates } from "@/lib/fx/rates";
import { displayCurrencyFromCookies } from "@/lib/fx/currency-server";
import { kinWakeHtmlLinks } from "@/lib/siblings";
import { appearanceFromCookies } from "@/lib/wardrobe/server";
import { themeAttr } from "@/lib/wardrobe/themes";
import { auth } from "@/lib/auth";
import { COVERAGE_FACTS } from "@/lib/brand";

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

// 明朝 — the Japanese mincho accent layer (Asha's brief 2026-07-15: "more
// Japanese, very artsy"). It never carries Latin — Fraunces/Spline keep that
// (it sits LAST in the --font-display/--font-mono chains, so only kana·kanji
// the Latin faces can't draw fall through to it). CJK files are large, so it
// is not preloaded: it arrives when a Japanese glyph asks for it, never
// blocking first paint. A material, not a costume — quiet until called.
const notoSerifJp = Noto_Serif_JP({
  weight: ["400", "600"],
  variable: "--font-noto-serif-jp",
  preload: false,
});

export const metadata: Metadata = {
  // Root metadata ships on every Google snippet and social card — it greets
  // people who have never been here, so it speaks plain language (contact-
  // surface spec §2). The insider framing stays on /platform; the deeper
  // brand constants live at apps/storefront/src/lib/brand.tsx. The "21
  // games" count is COVERAGE_FACTS.games.declared. Collectors first
  // (2026-07-06): the shop-and-wholesale framing retired with the shop.
  title: "Cambridge TCG — collectors' market and TCG card data",
  description: `A peer-to-peer trading-card market and public, rights-labelled card data directory. ${COVERAGE_FACTS.games.confirmed_codes} games currently have catalog rows; ${COVERAGE_FACTS.games.declared} public game codes are registered. Reuse follows each response's rights declaration.`,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://cambridgetcg.com"),
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Cambridge TCG — collectors' market and TCG card data",
    description: `A peer-to-peer trading-card market based in Cambridge, UK, plus a public, rights-labelled card data directory. ${COVERAGE_FACTS.games.confirmed_codes} games currently have catalog rows; ${COVERAGE_FACTS.games.declared} public game codes are registered.`,
    images: [{ url: "/images/og-image.png", width: 1200, height: 630 }],
    siteName: "Cambridge TCG",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cambridge TCG — collectors' market and TCG card data",
    description: `A peer-to-peer trading-card market and public, rights-labelled card data directory. ${COVERAGE_FACTS.games.confirmed_codes} games currently have catalog rows; reuse follows each response's rights declaration.`,
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

  // The wardrobe (spec §3.2/§3.6): the site-wide flip, fired 2026-07-05
  // with the quiet gallery. <html> always carries data-theme — an explicit
  // choice wins; no cookie means "system" (since 2026-07-06): the gallery
  // values in a light OS, the midnight values in a dark one, resolved by
  // prefers-color-scheme at first paint. SSR sets the attribute here,
  // server-side, so there is no flash of the wrong theme either way.
  const appearance = appearanceFromCookies(cookieStore);

  // Session-aware Nav, server-side (the house docs already claim this). The
  // Nav is a client component that fetched the session after mount, so SSR
  // (and no-JS / text-mode readers) always saw "Sign In" even when signed
  // in — and everyone got a wrong-state flash before hydration. Reading it
  // here seeds the correct state into the first paint. Fails soft: a
  // session-read hiccup renders the signed-out chrome, never a broken page.
  const session = await auth().catch(() => null);
  const initialLoggedIn = !!session?.user;

  // Analytics consent — default deny. Google Analytics + the Ads conversion
  // tag load only when the visitor has accepted via the CookieConsent banner.
  // No cookie (or "denied") means the gtag scripts are never sent to the
  // browser at all. The banner self-hides once a decision cookie exists.
  const analyticsConsent =
    cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value === "granted";

  // Yu 2026-05-14: read display currency + FX rates ONCE per request and
  // pipe into the client tree via Providers → MoneyContext. Every client
  // component below the root inherits the selector without a network
  // round-trip. fetchRates() is cached 6h at the framework layer.
  const displayCurrency = displayCurrencyFromCookies(cookieStore);
  const fxRates = await fetchRates();

  return (
    <html
      lang="en"
      data-theme={themeAttr(appearance.theme)}
      className={`${fraunces.variable} ${schibsted.variable} ${splineMono.variable} ${notoSerifJp.variable} ${inter.variable}`}
    >
      <head>
        <Script id="org-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Cambridge TCG",
          url: "https://cambridgetcg.com",
          logo: "https://cambridgetcg.com/images/logo.png",
          description: `UK-based peer-to-peer collectors' market plus public, rights-labelled TCG data. ${COVERAGE_FACTS.games.confirmed_codes} games currently have observed catalog rows; reference prices are policy-bound guides, not offers or open-data grants.`,
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
      {analyticsConsent && (
        <>
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
        </>
      )}
      {/* No font className here — body type flows from the theme-bound
          --font-body token (globals.css); terminal re-binds it to Inter. */}
      {/* wardrobe-ground lays the paper grain under the WHOLE site now, not
          just the home hero (Asha 2026-07-15 "deepen, don't shout"). It is
          gallery/system-light only by its own theme gate — inert in terminal,
          midnight, high-contrast, and text-mode — so nothing loud reaches a
          reader who didn't ask for it. */}
      <body className={`wardrobe-ground${textMode ? " text-mode" : ""}`}>
        {/* Skip-to-content for keyboard + screen-reader users.
            See docs/connections/the-welcome-all.md (#26) §3 — a welcome
            that doesn't include the sensory-divergent door is no welcome
            at all. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:bg-ink focus:text-page focus:px-3 focus:py-1.5 focus:rounded-lg focus:text-sm focus:font-bold"
        >
          Skip to content
        </a>
        <Providers money={{ currency: displayCurrency, rates: fxRates }}>
          {showBanner && <DevBanner />}
          {/* Nav gets the effective theme so its lights toggle knows which
              glyph to show and which bundle to target — same server-read,
              threaded-down pattern as Providers → MoneyContext above. */}
          <Nav theme={themeAttr(appearance.theme)} initialLoggedIn={initialLoggedIn} />
          <div id="main-content">
            <Suspense fallback={null}>
              <StorefrontBreadcrumbs />
            </Suspense>
            {children}
          </div>
          <Footer />
          {/* Always mounted; renders nothing once a consent cookie exists. */}
          <CookieConsent />
        </Providers>
      </body>
    </html>
  );
}
