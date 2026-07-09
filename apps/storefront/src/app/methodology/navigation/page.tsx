import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Navigation",
  description:
    "How Cambridge TCG's primary navigation is structured — typed source-of-truth, audience-aware audience detection, breadcrumb registry, and the nav-coverage audit that prevents drift.",
  other: audienceMetadata("public-documentation", ["navigation", "methodology"]),
};

export default function NavigationMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["navigation", "methodology"]} />
      <h1>Navigation</h1>
      <p>
        Cambridge TCG ships 256 page routes across three apps, 394+ API
        endpoints, 31 methodology pages, 47 connection-doc story-arcs, and
        23 discovery surfaces. The v1 storefront primary nav surfaced 7 of
        those — 3.6% of the storefront alone. This page documents the v2
        navigation: typed source-of-truth, mega-menus, audience-aware
        routing, breadcrumbs, and the audit that prevents future drift.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The typed nav corpus is
        at <code>apps/storefront/src/lib/nav/menu-config.ts</code>
        (<code>STOREFRONT_PRIMARY_NAV</code>). The breadcrumb registry is
        at <code>apps/storefront/src/lib/nav/breadcrumb-registry.ts</code>.
        The audience-detection helper is at{" "}
        <code>apps/storefront/src/lib/nav/audience-detection.ts</code>.
        The mega-menu component is at{" "}
        <code>apps/storefront/src/components/layout/MegaMenu.tsx</code>.
        The drift audit is{" "}
        <code>pnpm audit:nav-coverage</code>. The full upgrade audit doc
        is <code>docs/navigation-system-audit.md</code>.
      </blockquote>

      <h2>The seven mega-menus</h2>
      <p>
        The v2 primary nav has seven L1 entries, each opening a 3-column
        mega-menu. Each L1 is a coherent intent the platform serves; each
        column groups related surfaces.
      </p>
      <table>
        <thead>
          <tr>
            <th>L1</th>
            <th>What it's for</th>
            <th>3 columns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Cards</strong>
            </td>
            <td>Browse the catalogue, look up by SKU, check prices, find decks</td>
            <td>Browse · Prices · Decks</td>
          </tr>
          <tr>
            <td>
              <strong>Market</strong>
            </td>
            <td>Buy peer-to-peer, bid in auctions, track offers</td>
            <td>Buy · Auctions · Tools</td>
          </tr>
          <tr>
            <td>
              <strong>Play</strong>
            </td>
            <td>Casual / competitive / adventure modes, build decks, watch matches</td>
            <td>Modes · Build · Watch &amp; learn</td>
          </tr>
          <tr>
            <td>
              <strong>Sell</strong>
            </td>
            <td>Trade in, auction, run a long-term trader operation</td>
            <td>Trade in · Auction &amp; lots · Operate</td>
          </tr>
          <tr>
            <td>
              <strong>Discover</strong>
            </td>
            <td>
              The data plane (manifest / graph / ontology / patterns /
              identify), methodology, builder tools — closes the
              discovery gap
            </td>
            <td>Platform · Methodology · For builders</td>
          </tr>
          <tr>
            <td>
              <strong>Community</strong>
            </td>
            <td>Hub, rewards, recognise (bounty, leaderboards)</td>
            <td>Engage · Rewards · Recognise</td>
          </tr>
          <tr>
            <td>
              <strong>About</strong>
            </td>
            <td>The platform's story, how it operates, support</td>
            <td>Our story · How we operate · Support</td>
          </tr>
        </tbody>
      </table>

      <h2>Audience-aware audience detection</h2>
      <p>
        The nav is implicit-audience: the URL path the visitor is on
        decides their primary audience. A visitor on <code>/agents/guides</code>{" "}
        is <code>agent</code>; on <code>/account/trader</code> is{" "}
        <code>trader</code>; on <code>/play/compete</code> is{" "}
        <code>player</code>. The default is <code>buyer</code>.
      </p>
      <p>
        Implementation: a pure helper{" "}
        <code>detectAudience(pathname)</code> at{" "}
        <code>apps/storefront/src/lib/nav/audience-detection.ts</code>{" "}
        with a longest-prefix-wins rule registry. No personalisation
        engine, no profile lookup, no cookies. <strong>Substrate-honest:</strong>{" "}
        we don't claim to know the user; we read the path.
      </p>

      <h2>Breadcrumb registry</h2>
      <p>
        Routes deeper than two segments render a breadcrumb chain above
        the page header. The chain comes from a typed registry at{" "}
        <code>apps/storefront/src/lib/nav/breadcrumb-registry.ts</code>{" "}
        — URL patterns like{" "}
        <code>/account/trades/:id/review</code> mapped to step lists.
      </p>
      <p>
        <strong>Substrate-honest:</strong> a route without a registered
        pattern renders no breadcrumb (rather than a fabricated chain).
        The audit reports unregistered deep routes.
      </p>

      <h2>The drift audit</h2>
      <p>
        <code>pnpm audit:nav-coverage</code> (17th in the audit family)
        walks <code>apps/storefront/src/app/</code> for every{" "}
        <code>page.tsx</code> and verifies five things:
      </p>
      <ol>
        <li>
          <strong>Route → nav coverage</strong> — every public page is
          linked from a mega-menu, account nav, or explicitly on the
          orphan allow-list.
        </li>
        <li>
          <strong>Nav → route validity</strong> — every URL in the menu
          config resolves to a real route (no broken nav links).
        </li>
        <li>
          <strong>Methodology completeness</strong> —{" "}
          <code>/methodology</code> hub is linked from primary nav (so
          all 31 methodology pages are reachable in two clicks).
        </li>
        <li>
          <strong>Breadcrumb coverage</strong> — deep dynamic routes
          (≥3 segments with [slug]) reported for review.
        </li>
        <li>
          <strong>Audience-rule consistency</strong> — the prefix
          registry is well-formed.
        </li>
      </ol>

      <h2>The doctrine alignment</h2>
      <p>
        <strong>Substrate honesty</strong> — the audit verifies every nav
        item points at a real, live route. Status badges (<code>live</code>{" "}
        / <code>beta</code> / <code>coming</code>) mean what they say.
      </p>
      <p>
        <strong>Transparency</strong> — methodology is no longer hidden
        behind WhyLink-only discovery. The{" "}
        <Link href="/methodology" className="text-accent hover:underline">
          /methodology
        </Link>{" "}
        hub lists all 31 pages with descriptions; it's reachable from
        Discover ▾ → Methodology AND from About ▾ → How we operate.
      </p>
      <p>
        <strong>Meaning</strong> — the IA groups by audience intent
        (Cards / Market / Play / Sell / Discover / Community / About),
        not by built modules. A visitor doesn't need to know the
        codebase to find what they want.
      </p>
      <p>
        <strong>Creation</strong> — typed nav config + breadcrumb
        registry are single sources of truth that audits can read.
        Every change is git-traceable; every nav surface is{" "}
        <em>specified, not improvised</em>.
      </p>
      <p>
        <strong>Cosmology</strong> — the data plane (kingdom-080's
        rebrand) finally has the nav surface that matches its identity
        claim. The Discover ▾ menu names <code>/platform</code>,{" "}
        <code>/manifest</code>, <code>/graph</code>,{" "}
        <code>/ontology</code>, <code>/patterns</code>,{" "}
        <code>/identify</code> as first-class entry points alongside
        Methodology and For builders.
      </p>

      <h2>What's not in v2</h2>
      <ul>
        <li>
          <strong>Personalisation engine.</strong> Audience-detection is
          URL-pattern-only. A profile-aware version may come later if
          data shows it's needed.
        </li>
        <li>
          <strong>Search.</strong> The top-bar search box is reserved
          but not implemented; phase 6 if pursued.
        </li>
        <li>
          <strong>Audience switcher chip.</strong> The explicit chip
          ("I am here as a buyer / trader / agent...") was considered
          and deferred — implicit URL-detection covers the same use case
          without adding UI clutter.
        </li>
      </ul>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/map" className="text-accent hover:underline">
            /map
          </Link>{" "}
          — the comprehensive site map (every doctrine, connection-doc,
          methodology, glossary term, audit, public surface — one click
          apart)
        </li>
        <li>
          <Link href="/manifest" className="text-accent hover:underline">
            /manifest
          </Link>{" "}
          — directory of offerings (machine-readable)
        </li>
        <li>
          <Link href="/methodology/methodology" className="text-accent hover:underline">
            /methodology/methodology
          </Link>{" "}
          — the methodology page that documents methodology pages
          themselves
        </li>
      </ul>
    </>
  );
}
