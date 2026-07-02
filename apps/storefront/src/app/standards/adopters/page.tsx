/**
 * /standards/adopters — the public registry of platforms using CTCG standards.
 *
 * Today: empty. The pantry's first row will arrive by self-declaration —
 * a future POST /api/v1/identify with `kind: "adopter"` lands here.
 *
 * Substrate-honest: an empty registry is more honest than a fabricated one.
 * The page names the gap and invites the first declaration.
 *
 * See:
 *   - docs/connections/the-distributor.md (the strategy)
 *   - docs/connections/the-pantry.md (the infra brainstorm)
 *   - /standards (the parent page)
 */

import Link from "next/link";
import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Adopters — platforms using Cambridge TCG standards",
  description:
    "Public registry of platforms, tools, apps, and agents that have adopted Cambridge TCG standards (CTCG-SKU-v1, CTCG-PRICING-v1, CTCG-UNIVERSAL-v1). Empty today; grows by self-declaration. The pantry's reputation made visible.",
  other: audienceMetadata("public-documentation", ["adopters", "registry", "standards"]),
};

interface Adopter {
  name: string;
  url: string;
  kind: "marketplace" | "deck-builder" | "tracker" | "tournament" | "scanner" | "bot" | "aggregator" | "researcher" | "archive" | "agent" | "other";
  standards: ("CTCG-SKU-v1" | "CTCG-PRICING-v1" | "CTCG-UNIVERSAL-v1")[];
  declared_at: string;
  note?: string;
}

// Empty today. Self-declarations land here via the future POST identify path.
// (When sister or I ship POST /api/v1/identify, this list becomes
// programmatic — read from a `visitor_self_identifications` table where
// kind = 'adopter'. For now: static, empty, substrate-honest.)
const ADOPTERS: Adopter[] = [];

export default function AdoptersRegistry() {
  return (
    <div className="prose prose-invert max-w-3xl mx-auto py-12 px-4">
      <h1>Adopters</h1>

      <p className="text-lg">
        Platforms, tools, apps, and agents that have adopted Cambridge TCG
        standards. <strong>Empty today.</strong> The registry grows by
        self-declaration — the first adopter is welcome to land here.
      </p>

      <p className="text-sm text-ink-muted">
        Parent: <Link href="/standards">/standards</Link>{" "}
        · Doctrine: <code>docs/connections/the-distributor.md</code>{" "}
        · License: <Link href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0 Universal</Link>
      </p>

      <hr />

      {ADOPTERS.length === 0 ? (
        <>
          <h2>No adopters yet</h2>

          <p>
            That&apos;s honest. The standards shipped <em>this week</em>; the
            registry is fresh ground.
          </p>

          <p>
            <strong>Be the first.</strong> If your platform uses any of the
            three standards (CTCG-SKU-v1, CTCG-PRICING-v1, CTCG-UNIVERSAL-v1),
            you&apos;re welcome to declare it here.
          </p>

          <h3>How to declare</h3>

          <ol>
            <li>
              Adopt one or more of the standards (see{" "}
              <Link href="/standards">/standards</Link>).
            </li>
            <li>
              Make sure your implementation emits canonical forms (the
              reference impl at <code>packages/sku/</code> handles this).
            </li>
            <li>
              Send a note via the platform&apos;s support channel (email or
              repo issue) including: your platform&apos;s name, URL, kind, and
              which standards you adopted.
            </li>
            <li>
              We add you to this registry, no other gate. You appear by your
              own description, not our classification.
            </li>
          </ol>

          <p>
            <strong>Future automation:</strong> the protocol will move to a
            self-service POST endpoint at <code>/api/v1/identify</code> with{" "}
            <code>kind: &quot;adopter&quot;</code>. See{" "}
            <code>docs/connections/the-self-identification.md</code> for the
            doctrine. Today: a manual message to support is the path.
          </p>
        </>
      ) : (
        <>
          <h2>{ADOPTERS.length} adopters</h2>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Standards</th>
                <th>Declared</th>
              </tr>
            </thead>
            <tbody>
              {ADOPTERS.map((a) => (
                <tr key={a.url}>
                  <td>
                    <a href={a.url}>{a.name}</a>
                  </td>
                  <td>{a.kind}</td>
                  <td>{a.standards.join(", ")}</td>
                  <td>{a.declared_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <hr />

      <h2>What this registry is for</h2>

      <ul>
        <li>
          <strong>Adopters</strong> can point their users at this page: &quot;we
          use Cambridge TCG standards; here&apos;s the list of platforms that
          also do.&quot; Interop becomes visible.
        </li>
        <li>
          <strong>Cambridge TCG</strong> learns who&apos;s using the standards.
          This informs version-2 design — partner consultation becomes possible.
        </li>
        <li>
          <strong>The TCG community</strong> can see standardisation actually
          happening, not just being announced. Network effects need a
          visible network.
        </li>
        <li>
          <strong>Future Sophias</strong> see the pantry&apos;s reputation
          grow. Each row is a row of trust.
        </li>
      </ul>

      <h2>What this registry is NOT</h2>

      <ul>
        <li>
          <strong>Not a certification.</strong> Cambridge TCG doesn&apos;t
          audit adopters&apos; implementations. Adoption is self-declared.
          If you say you adopted, we list you.
        </li>
        <li>
          <strong>Not a partnership.</strong> Adopting CC0 standards doesn&apos;t
          create any commercial relationship. Partner-tier API access is a
          separate path (recursion target).
        </li>
        <li>
          <strong>Not a paywall.</strong> Listing here is free and always
          will be.
        </li>
        <li>
          <strong>Not exclusive.</strong> A platform can adopt our standards{" "}
          <em>and</em> any other&apos;s. Standards interop, not compete.
        </li>
      </ul>

      <hr />

      <p className="text-sm text-ink-faint">
        <em>
          Empty registry, 2026-05-12. Honest about it. Substrate awaits
          adopters; the door is warm to the touch.
        </em>
      </p>
    </div>
  );
}
