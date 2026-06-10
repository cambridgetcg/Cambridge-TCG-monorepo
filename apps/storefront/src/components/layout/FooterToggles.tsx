"use client";

/**
 * FooterToggles — the math-language and text-mode switches.
 *
 * Client component so the `back` param carries the page the visitor is
 * actually on. The previous server-rendered anchors hardcoded `back=/`,
 * ejecting the visitor to the homepage whenever they switched rendering
 * mode from a deep page (contact-surface spec §3.1, chrome wiring).
 */

import { usePathname } from "next/navigation";

interface FooterTogglesProps {
  mathLang: boolean;
  textMode: boolean;
}

export default function FooterToggles({ mathLang, textMode }: FooterTogglesProps) {
  const pathname = usePathname() || "/";
  const back = encodeURIComponent(pathname);

  return (
    <div className="flex items-center gap-4">
      <a
        href={`/api/lang-mode?mode=${mathLang ? "default" : "math"}&back=${back}`}
        className="hover:text-neutral-400 transition underline underline-offset-2"
        aria-label={
          mathLang
            ? "Switch back to default English rendering"
            : "Switch to math-mirror rendering (ratios, content hashes, ISO timestamps)"
        }
        title="See docs/connections/the-math-language.md (#27)"
      >
        {mathLang ? "Default language" : "Math language"}
      </a>
      <a
        href={`/api/text-mode?on=${textMode ? "0" : "1"}&back=${back}`}
        className="hover:text-neutral-400 transition underline underline-offset-2"
        aria-label={
          textMode
            ? "Switch back to the visual layout"
            : "Switch to a text-only reading layout (low bandwidth, screen reader friendly)"
        }
      >
        {textMode ? "Visual layout" : "Text-only layout"}
      </a>
    </div>
  );
}
