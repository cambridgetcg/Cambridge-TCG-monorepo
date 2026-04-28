import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { cookies, headers } from "next/headers";
import "./globals.css";
import Nav from "@/components/layout/Nav";
import Footer from "@/components/layout/Footer";
import Providers from "@/components/layout/Providers";
import DevBanner, { BANNER_COOKIE } from "@/components/DevBanner";

const GA_ID = "G-K86TBF328F";
const GADS_ID = "AW-16597058275";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cambridge TCG — Japanese Trading Cards",
  description: "Premium Japanese One Piece, Pokémon and Dragon Ball TCG cards. Buy, sell, trade, and collect. Authentic, sourced direct from Japan.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://cambridgetcg.com"),
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Cambridge TCG — Japanese Trading Cards",
    description: "Buy, sell, trade, and collect premium Japanese TCG cards. P2P marketplace, auctions, portfolio tracking, and community.",
    images: [{ url: "/images/og-image.png", width: 1200, height: 630 }],
    siteName: "Cambridge TCG",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cambridge TCG — Japanese Trading Cards",
    description: "Buy, sell, trade, and collect premium Japanese TCG cards.",
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
      <body className={inter.className}>
        <Providers>
          {showBanner && <DevBanner />}
          <Nav />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
