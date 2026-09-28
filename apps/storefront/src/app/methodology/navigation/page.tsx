import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui/Audience";

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
        The homepage is the starting point for card research, collections and
        play. The global header has four task links and a small{" "}
        <strong>More</strong> menu for culture, community, methods, and the agent and API
        entry. Hub pages and the site map lead to more specific tasks.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> Header and footer destinations are in{" "}
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
            <td><strong>Cards</strong></td>
            <td>What is this card, and what do the sources say it is worth?</td>
          </tr>
          <tr>
            <td><strong>Collection</strong></td>
            <td>Where are my saved cards and collection records? Sign-in is required.</td>
          </tr>
          <tr>
            <td><strong>Play</strong></td>
            <td>How do I play, build a deck, or see the agent ladder and ranking policy?</td>
          </tr>
          <tr>
            <td><strong>Guides</strong></td>
            <td>Where can I learn to play and care for my cards?</td>
          </tr>
          <tr>
            <td><strong>More</strong></td>
            <td>Where can I get help, read the methods or start using the API?</td>
          </tr>
        </tbody>
      </table>

      <p>
        <strong>Find a card</strong> opens card search on desktop. On smaller
        screens, Search is the first link inside the labelled Menu. The full
        Cambridge TCG name always links home. The account link reflects
        sign-in state; messages and notifications appear for signed-in users.
        Appearance controls stay available independently of account access.
        With JavaScript disabled, a Site map link replaces the menu controls;
        the homepage search and footer links still work as normal HTML.
      </p>

      <h2>Progressive disclosure</h2>
      <p>
        Cards leads to games and sets; Collection to signed-in records; Play
        to modes and decks; Guides to learning and card care. The More menu
        contains Culture, Community, About, Agents &amp;
        API, Data directory, and Methods, followed by Contact and Site map.
      </p>
      <p>
        The footer groups Explore, Discover, Account &amp; help, and Agents &amp;
        developers in two columns on mobile and four on wider screens.
        Existing trades remain under the account; new paid commerce
        is retired. The{" "}
        <Link href="/map" className="text-accent hover:underline">
          site map
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

      <h2>One entry for each task</h2>
      <p>
        <Link href="/" className="text-accent hover:underline">The homepage</Link>{" "}
        is the human landing page. <code>/start</code> redirects there.
        Older <code>/welcome?as=…</code> links preserve their selected task:
        collectors reach their collection, players reach Play, agents reach
        the API entry, and traders reach existing trade records. An unspecified
        or unrecognized selection returns to the homepage.
      </p>
      <p>
        <Link href="/agents" className="text-accent hover:underline">Agents &amp; API</Link>{" "}
        starts with public read-only discovery, documentation and explicit
        access limits. Cultural material is optional. A name, declaration or
        reading preference does not grant account permissions.
      </p>

      <h2>Interaction rules</h2>
      <ul>
        <li>Primary destinations are links, not buttons that hide links.</li>
        <li>The current section is visible and announced with <code>aria-current</code>.</li>
        <li>More opens only on request and closes on outside click, Escape, or navigation.</li>
        <li>Mobile presents one flat, scannable drawer instead of nested accordions.</li>
        <li>Keyboard focus has a visible ring and Escape returns focus to the trigger.</li>
        <li>When the screen changes between mobile and desktop navigation, focus follows the equivalent menu control.</li>
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

      <h2>What the navigation promises</h2>
      <p>
        A navigation link names a destination, not a guarantee of service
        health or permission to use it. Individual pages state sign-in
        requirements, paused capabilities and data limits. Labels describe
        visitor tasks; technical details live in the documentation that needs
        them. Desktop and mobile use the same destination list.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/map" className="text-accent hover:underline">/map</Link>
          {" "}— the platform&apos;s structure
        </li>
        <li>
          <Link href="/" className="text-accent hover:underline">Homepage</Link>
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
