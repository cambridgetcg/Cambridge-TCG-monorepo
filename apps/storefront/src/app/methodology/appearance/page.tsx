import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Appearance methodology",
  description: "How themes, reading modes and saved appearance preferences work.",
  other: audienceMetadata("public-documentation", ["methodology", "appearance"]),
};

export default function AppearanceMethodology() {
  return (
    <>
      <h1>Appearance and reading preferences</h1>
      <p>
        <Link href="/appearance">Appearance settings</Link> are available without
        an account. Choose a theme, a writing tone or a text-only reading layout.
        These choices change presentation, not your access to data or account features.
      </p>

      <h2 id="stored">What is saved</h2>
      <p>
        An explicit theme choice is saved in a <code>theme</code> cookie, and an
        explicit tone choice in a <code>tone</code> cookie. Each lasts up to one year
        in this browser. These preferences do not sync through your account or
        follow you to another device. You can remove them by clearing this site&rsquo;s cookies.
      </p>
      <p>
        <strong>Follow system</strong> removes the theme cookie. The browser then
        selects Light or Dark from your device&rsquo;s colour setting using CSS.
        The application does not need to receive your device&rsquo;s colour
        preference. A separate tone or reading-mode cookie can still be present.
      </p>
      <p>
        Theme and tone cookies are used for rendering. The preference setter
        does not send a theme-change analytics event or use the choice for pricing
        or ranking. Ordinary hosting access logs may still record requests.
      </p>

      <h2 id="themes">Available themes</h2>
      <ul>
        <li><strong>Light:</strong> ink text on warm paper and white surfaces, with bronze links.</li>
        <li><strong>Dark:</strong> warm light text on midnight blue surfaces, with gilt links.</li>
        <li><strong>Terminal:</strong> light text and amber links on black.</li>
        <li><strong>High contrast:</strong> black text, strong borders and white surfaces.</li>
      </ul>
      <p>
        All four themes are free. Existing saved Light and Dark preferences still
        work under their earlier cookie names, <code>gallery</code> and <code>midnight</code>.
        Themes use a fixed set of styles; they do not accept custom CSS.
      </p>

      <h2 id="rollout">Where the theme applies</h2>
      <p>
        Shared page surfaces, navigation and interface components use the selected
        theme. In Light and Dark, the shared design uses serif headings over
        readable sans-serif text, hairline borders, one soft shadow and static
        surfaces. Terminal and high contrast keep their own simpler type.
        Older screens with fixed colours may not follow every
        theme yet; choosing a theme does not establish complete coverage of every page.
      </p>
      <p>
        Saved preferences are read with the initial page request. Follow system
        resolves in CSS, and the navigation toggle can change the appearance
        immediately while saving your selection.
      </p>

      <h2 id="tone">Writing tone</h2>
      <p>
        Where supported, Standard and Plain choose between versions of interface
        wording, such as greetings and empty-state messages. They do not change
        recorded facts, figures, data-source labels or methodology. This setting
        does not rewrite every sentence on the site.
      </p>

      <h2 id="not">Reading modes and accessibility</h2>
      <p>
        <Link href="/appearance">Text-only layout</Link> takes precedence over
        theme colours and uses black text on white, underlined links and a simpler
        reading layout. Keyboard focus remains visible. Shared styles also respect
        your device&rsquo;s reduced-motion preference. These options are free and
        do not require a paid membership.
      </p>
    </>
  );
}
