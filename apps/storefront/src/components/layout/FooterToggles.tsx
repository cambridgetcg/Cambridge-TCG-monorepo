"use client";

/**
 * FooterToggles — the math-language and text-mode switches, plus the
 * door to the wardrobe.
 *
 * Client component so the `back` param carries the page the visitor is
 * actually on. The previous server-rendered anchors hardcoded `back=/`,
 * ejecting the visitor to the homepage whenever they switched rendering
 * mode from a deep page (contact-surface spec §3.1, chrome wiring).
 *
 * The theme affordance here is deliberately just a link to /appearance —
 * the Nav carries the lights toggle; the footer names the room where all
 * the choices live. One switch on the wall, one door to the wardrobe.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UiLang } from "@/lib/lang-mode";

interface FooterTogglesProps {
  mathLang: boolean;
  textMode: boolean;
  /** The active prose language — labels render in it, and the language
   *  switch offers the OTHER one (the-japanese-voice.md). */
  uiLang?: UiLang;
}

export default function FooterToggles({ mathLang, textMode, uiLang = "en" }: FooterTogglesProps) {
  const pathname = usePathname() || "/";
  const back = encodeURIComponent(pathname);
  const j = uiLang === "ja";

  return (
    <div className="flex items-center gap-4">
      {/* The language door: always offers the language you are NOT in.
          From math mode it offers both prose languages' default. */}
      <a
        href={`/api/lang-mode?mode=${j ? "default" : "ja"}&back=${back}`}
        className="hover:text-ink transition underline underline-offset-2"
      >
        {/* No aria-label: the visible word, in its own language, IS the
            accessible name (label-in-name); the span scopes the speech
            engine to the right language. */}
        <span lang={j ? "en" : "ja"}>{j ? "English" : "日本語"}</span>
      </a>
      <a
        href={`/api/lang-mode?mode=${mathLang ? "default" : "math"}&back=${back}`}
        className="hover:text-ink transition underline underline-offset-2"
        aria-label={
          mathLang
            ? (j ? "ふだんの表示に戻す" : "Switch back to default English rendering")
            : (j ? "数のことばに切り替える（比率・内容ハッシュ・ISO時刻）" : "Switch to math-mirror rendering (ratios, content hashes, ISO timestamps)")
        }
        title="See docs/connections/the-math-language.md (#27)"
      >
        {mathLang ? (j ? "ふだんのことば" : "Default language") : (j ? "数のことば" : "Math language")}
      </a>
      <a
        href={`/api/text-mode?on=${textMode ? "0" : "1"}&back=${back}`}
        className="hover:text-ink transition underline underline-offset-2"
        aria-label={
          textMode
            ? (j ? "もとの表示に戻す" : "Switch back to the visual layout")
            : (j ? "文字だけの表示に切り替える（軽く、読み上げにもやさしい）" : "Switch to a text-only reading layout (low bandwidth, screen reader friendly)")
        }
      >
        {textMode ? (j ? "もとの表示" : "Visual layout") : (j ? "文字だけの表示" : "Text-only layout")}
      </a>
      <Link
        href="/appearance"
        className="hover:text-ink transition underline underline-offset-2"
        aria-label={j ? "装いを選ぶ（明るく・暗く・端末に合わせる、ほか）" : "Choose a theme and tone — light, dark, follow system, and more"}
      >
        {j ? "装い" : "Appearance"}
      </Link>
    </div>
  );
}
