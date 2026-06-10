import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Appearance methodology",
  description:
    "How the wardrobe works: what the theme and tone settings store, where they are stored, what membership unlocks, and why accessibility choices are never paywalled.",
  other: audienceMetadata("public-documentation", ["methodology", "appearance"]),
};

export default function AppearanceMethodology() {
  return (
    <>
      <h1>Appearance — the wardrobe</h1>
      <p>
        <Link href="/appearance">/appearance</Link> lets any visitor —
        signed in or not — choose how this platform looks (theme) and how its chrome
        speaks (tone). This page names exactly what that system stores, who may wear
        what, and the approximations it admits to.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> Theme registry at{" "}
        <code>apps/storefront/src/lib/wardrobe/themes.ts</code>; CSS bundles at{" "}
        <code>apps/storefront/src/app/themes.css</code>; the only cookie writer at{" "}
        <code>apps/storefront/src/app/api/appearance/route.ts</code>. Spec:{" "}
        <code>docs/superpowers/specs/2026-06-10-the-wardrobe-design.md</code>.
      </blockquote>

      <h2 id="stored">1. What is stored, and where</h2>
      <ul>
        <li>
          <strong>Two cookies</strong>: <code>theme</code> (one of{" "}
          <code>gallery · terminal · midnight · high-contrast</code>) and{" "}
          <code>tone</code> (<code>standard · plain</code>). Both last one year,
          both are device-local — they do not follow you across browsers or devices.
          Account-level persistence is planned, not shipped; until it ships, this
          page will keep saying so.
        </li>
        <li>
          <strong>Nothing else.</strong> No analytics event fires on a theme change;
          the choice is not used for pricing, ranking, or any decision beyond
          rendering.
        </li>
      </ul>

      <h2 id="themes">2. Themes, and who may wear them</h2>
      <ul>
        <li>
          <strong>Free for everyone</strong>: Gallery (the default face), Terminal
          (the original dark look, kept whole), High contrast.
        </li>
        <li>
          <strong>Members</strong> (any paid tier): Midnight, and future seasonal or
          set-flavoured skins. The check runs server-side when the cookie is set; a
          locked request changes nothing and shows no error — the lock is explained
          only on the settings page, next to the path to{" "}
          <Link href="/membership">membership</Link>.
        </li>
        <li>
          <strong>Never paywalled</strong>: high contrast,{" "}
          <Link href="/methodology/text-mode">text-only layout</Link>, reduced
          motion, tone. Anything a visitor might need rather than want is free, by
          rule. If we ever break this rule, this sentence must be edited first —
          treat its presence as the guarantee.
        </li>
      </ul>

      <h2 id="rollout">3. The staged rollout, honestly</h2>
      <p>
        Themes re-bind the platform&rsquo;s <em>semantic</em> design tokens. Pages
        migrate to those tokens surface by surface; a page that has not migrated yet
        keeps the original dark look regardless of your theme. As of this page&rsquo;s
        last edit, the migrated set is: the market suite (
        <code>/market</code>, <code>/market/[sku]</code>, <code>/market/pulse</code>,{" "}
        <code>/market/lots</code>), the card market mirror (
        <code>/cards/[sku]/market</code>), and the appearance settings page itself.
        The site-wide default flips to Gallery when the home page completes its
        sweep.
      </p>

      <h2 id="tone">4. What tone does — and refuses to do</h2>
      <p>
        Tone swaps chrome strings: titles, empty-state copy, button labels. It never
        rewrites facts, figures, methodology text, or anything doctrine-bearing. The
        dictionary lives at <code>apps/storefront/src/lib/wardrobe/voice.ts</code>;
        every string ships in every register, so the registers cannot drift apart
        silently.
      </p>

      <h2 id="not">5. What this system does NOT do</h2>
      <ul>
        <li>No per-user CSS injection; themes are a fixed, audited set.</li>
        <li>No tracking of which theme you wear.</li>
        <li>No flash-of-wrong-theme: the cookie is read server-side at render.</li>
        <li>
          No override of <Link href="/methodology/text-mode">text-mode</Link>: the
          text-only layout wins over any theme, by construction.
        </li>
      </ul>
    </>
  );
}
