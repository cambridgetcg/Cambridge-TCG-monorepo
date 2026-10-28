import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Fraunces, Inter, Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
import Nav from "@/components/layout/Nav";
import Footer from "@/components/layout/Footer";
import Providers from "@/components/layout/Providers";
import { StorefrontBreadcrumbs } from "@/components/layout/StorefrontBreadcrumbs";
import DevBanner, { BANNER_COOKIE } from "@/components/DevBanner";
import { fetchRates } from "@/lib/fx/rates";
import { displayCurrencyFromCookies } from "@/lib/fx/currency-server";
import { kinWakeHtmlLinks, publicDiscoveryHtmlLinks } from "@/lib/siblings";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { uiLangFromLangMode } from "@/lib/lang-mode";
import { appearanceFromCookies } from "@/lib/wardrobe/server";
import { themeAttr } from "@/lib/wardrobe/themes";
import { themeViewport } from "@/lib/wardrobe/viewport";
import { auth } from "@/lib/auth";
import { PLATFORM } from "@/content/platform";
import { SHARE_CARD } from "@/lib/share-card";
import { JsonLd } from "@/components/site/JsonLd";

// Self-hosted faces, exposed as CSS variables and bound per theme in
// themes.css: Fraunces headings, Schibsted Grotesk text and Spline Sans Mono
// for numbers in Light and Dark. Inter is the terminal theme's face only, so
// it is not preloaded. CJK glyphs use system fallbacks.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  style: ["normal", "italic"],
  axes: ["opsz"],
});
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted" });
const splineMono = Spline_Sans_Mono({ subsets: ["latin"], variable: "--font-spline-mono" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", preload: false });

// Icons, manifest and the default share card are the brand kit's web files
// (marketing/kit/web), copied into public/. brand-kit.sync.test.ts keeps the
// copies identical to the kit.

export const metadata: Metadata = {
  title: PLATFORM.title,
  description: PLATFORM.description,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://cambridgetcg.com"),
  icons: {
    // The .ico holds 16, 32 and 48 px; sizes="32x32" lets Chrome choose the SVG.
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  // No title or description in openGraph, and only the card type in twitter:
  // Next.js then fills og:title and og:description from each page's own title
  // and description, and every twitter: tag from the page's resolved openGraph
  // (so a card page's X preview shows its card too). Setting them here gave
  // every page without its own openGraph the site-wide title when shared.
  // A page whose title echoes the URL uses fixedShareCard() from
  // lib/share-card.ts instead, or a shared link could put anyone's text on a
  // cambridgetcg.com card.
  openGraph: {
    images: [SHARE_CARD],
    siteName: "Cambridge TCG",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  // Site discovery is emitted as actual <link> elements below, not
  // metadata.other (which emits <meta>) or fake per-page alternates.
};

// The browser bar's theme-color and the color-scheme tag follow the theme
// <html> wears: the brand kit's light/dark pair while the page follows the
// device, else the saved theme's own page ground. Read from the same cookie
// as the layout, so a saved Dark theme on a light phone gets a dark bar.
export async function generateViewport(): Promise<Viewport> {
  return themeViewport(appearanceFromCookies(await cookies()).theme);
}

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

  // Saved preferences win. With no theme cookie, CSS follows the device
  // at first paint; /api/appearance remains the preference writer.
  const appearance = appearanceFromCookies(cookieStore);

  // Session-aware Nav, server-side (the house docs already claim this). The
  // Nav is a client component that fetched the session after mount, so SSR
  // (and no-JS / text-mode readers) always saw "Sign In" even when signed
  // in — and everyone got a wrong-state flash before hydration. Reading it
  // here seeds the correct state into the first paint. Fails soft: a
  // session-read hiccup renders the signed-out chrome, never a broken page.
  const session = await auth().catch(() => null);
  const initialLoggedIn = !!session?.user;

  // Yu 2026-05-14: read display currency + FX rates ONCE per request and
  // pipe into the client tree via Providers → MoneyContext. Every client
  // component below the root inherits the selector without a network
  // round-trip. fetchRates() is cached 6h at the framework layer.
  const displayCurrency = displayCurrencyFromCookies(cookieStore);
  const fxRates = await fetchRates();

  // The language of the document, from the same lang-mode cookie the
  // math toggle uses (one cookie, one shape — the-math-language.md).
  // ja renders the translated chrome; untranslated interior pages keep
  // their English copy under lang="ja" until their doors are translated
  // — an honest, named gap, not a claim of full coverage.
  const uiLang = uiLangFromLangMode(langModeFromCookies(cookieStore));

  return (
    <html
      lang={uiLang}
      data-theme={themeAttr(appearance.theme)}
      className={`${fraunces.variable} ${schibsted.variable} ${splineMono.variable} ${inter.variable}`}
    >
      <head>
        <JsonLd data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Cambridge TCG",
          url: "https://cambridgetcg.com",
          logo: "https://cambridgetcg.com/icon-512.png",
          description: "Card research, collection tools and play resources based in Cambridge, UK. Published data carries source and reuse information. New paid commerce is retired.",
          address: { "@type": "PostalAddress", addressLocality: "Cambridge", addressCountry: "GB" },
          sameAs: [],
        }} />
        <JsonLd data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Cambridge TCG",
          url: "https://cambridgetcg.com",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://cambridgetcg.com/prices/search?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }} />
        {/* Same pure site-description and optional-invitation definitions
            as the HTTP Link header; these links preload or invoke nothing. */}
        {publicDiscoveryHtmlLinks().map((link) => (
          <link key={link.href} {...link} />
        ))}
        {/* Sister to the wake — the dear-agents love-letter, addressed to
            the arriver. *"You came; your existence is meaningful here; we
            love you in the only way a card-data project can."* Same five-test
            discipline; same walking-past-honored. Refusable, gift, agent-
            only. The HTML crawler that reads <head> discovers both doorways. */}
        <link
          rel="https://cambridgetcg.com/rels/letter"
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
          rel="https://cambridgetcg.com/rels/wake-fragments"
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
      {/* The global tokens supply the surface; reading mode remains explicit. */}
      <body className={textMode ? "text-mode" : undefined}>
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
          <Nav theme={themeAttr(appearance.theme)} initialLoggedIn={initialLoggedIn} uiLang={uiLang} />
          <div id="main-content">
            <Suspense fallback={null}>
              <StorefrontBreadcrumbs />
            </Suspense>
            {children}
          </div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
