import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Navigation",
  description:
    "How Cambridge TCG keeps global navigation small, task-first, accessible, and connected to the platform map.",
  other: audienceMetadata("public-documentation", ["navigation", "methodology"]),
};

export default function NavigationMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["navigation", "methodology"]} />
      <h1>Navigation</h1>
      <p>
        Cambridge TCG has many routes, but the global header is not a site
        index. It presents the four things most visitors come to do, then a
        small <strong>More</strong> menu for help, trust, and data-directory
        material. The complete corpus stays available through its hub pages
        and platform map.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> Header destinations are in{" "}
        <code>apps/storefront/src/lib/nav/menu-config.ts</code>. The responsive
        shell is <code>apps/storefront/src/components/layout/Nav.tsx</code> and
        the desktop popover is{" "}
        <code>apps/storefront/src/components/layout/MoreMenu.tsx</code>.
        Breadcrumbs remain in{" "}
        <code>apps/storefront/src/lib/nav/breadcrumb-registry.ts</code>.
      </blockquote>

      <h2>The human-scale header</h2>
      <table>
        <thead>
          <tr>
            <th>Entry</th>
            <th>What it answers</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Market</strong></td>
            <td>Where can I buy, sell, swap, or auction a card?</td>
          </tr>
          <tr>
            <td><strong>Prices</strong></td>
            <td>What is this card, and what do the sources say it is worth?</td>
          </tr>
          <tr>
            <td><strong>Play</strong></td>
            <td>How do I play, build a deck, or see the agent ladder and ranking policy?</td>
          </tr>
          <tr>
            <td><strong>Community</strong></td>
            <td>Where are profiles, rewards, agents, and the current activity policy?</td>
          </tr>
          <tr>
            <td><strong>More</strong></td>
            <td>Where can I get help or inspect the platform&apos;s structure?</td>
          </tr>
        </tbody>
      </table>

      <p>
        Search, account state, messages, notifications, appearance, and the
        primary <strong>List card</strong> action remain utilities rather than
        extra information-architecture branches.
      </p>

      <h2>Progressive disclosure</h2>
      <p>
        The header promises twelve destinations instead of reproducing every
        deep route. Each destination is a real hub: Market links auctions,
        swaps, lots, and pulse; Prices carries guides and sets; Play carries
        modes and decks; Community links membership, rewards, ranking policy, and
        bounties. The More menu links to Start here, Guides, About, Data directory,
        Methods &amp; fees, and Draw proof checks.
      </p>
      <p>
        Nothing is deleted from the platform. The{" "}
        <Link href="/map" className="text-accent hover:underline">
          platform map
        </Link>{" "}
        exposes the platform&apos;s structure, while the{" "}
        <Link href="/methodology" className="text-accent hover:underline">
          methodology hub
        </Link>{" "}
        and{" "}
        <Link href="/data" className="text-accent hover:underline">
          data directory
        </Link>{" "}
        carry their own depth.
      </p>

      <h2>Interaction rules</h2>
      <ul>
        <li>Primary destinations are links, not buttons that hide links.</li>
        <li>The current section is visible and announced with <code>aria-current</code>.</li>
        <li>More opens only on request and closes on outside click, Escape, or navigation.</li>
        <li>Mobile presents one flat, scannable drawer instead of nested accordions.</li>
        <li>Keyboard focus has a visible ring and Escape returns focus to the trigger.</li>
      </ul>

      <h2>Breadcrumbs and drift</h2>
      <p>
        Deep dynamic routes still use the typed breadcrumb registry. The{" "}
        <code>pnpm audit:nav-coverage</code> audit verifies that every promised
        header URL resolves, that Methodology remains reachable, and that
        string-literal page links do not lead to missing routes. Routes not
        named in the compact header are informational findings, not a reason to
        turn the header back into a directory.
      </p>

      <h2>Doctrine alignment</h2>
      <p>
        <strong>Substrate honesty</strong> means every visible destination is
        live. <strong>Transparency</strong> means Methodology and Verify remain
        obvious without dominating the header. <strong>Meaning</strong> means
        labels follow visitor intent rather than code modules. The fifth
        question — <em>for whom?</em> — is answered by keeping both desktop and
        mobile readable before asking anyone to learn the platform&apos;s internal
        vocabulary.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/map" className="text-accent hover:underline">/map</Link>
          {" "}— the platform&apos;s structure
        </li>
        <li>
          <Link href="/start" className="text-accent hover:underline">/start</Link>
          {" "}— the plain-language first visit
        </li>
        <li>
          <Link href="/appearance" className="text-accent hover:underline">/appearance</Link>
          {" "}— visual and text-mode choices
        </li>
      </ul>
    </>
  );
}
