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
import { tx } from "@/lib/i18n";
import { usePathname } from "next/navigation";
import { UI_LANGS, type UiLang } from "@/lib/lang-mode";

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
      {/* The language doors: every voice the house speaks, minus the one
          you are in. Each label is its own language's name for itself —
          the visible word IS the accessible name (label-in-name), and
          the lang attribute scopes the speech engine per link. English
          maps to mode=default (one cookie, one shape). */}
      {UI_LANGS.filter((l) => l.lang !== uiLang).map((l) => (
        <a
          key={l.lang}
          href={`/api/lang-mode?mode=${l.lang === "en" ? "default" : l.lang}&back=${back}`}
          className="hover:text-ink transition underline underline-offset-2"
        >
          <span lang={l.lang}>{l.label}</span>
        </a>
      ))}
      <a
        href={`/api/lang-mode?mode=${mathLang ? "default" : "math"}&back=${back}`}
        className="hover:text-ink transition underline underline-offset-2"
        aria-label={
          mathLang
            ? tx({ en: "Switch back to default English rendering", ja: "ふだんの表示に戻す", "zh-Hant": "切回平常的顯示", "zh-Hans": "切换回平常的显示", es: "Volver a la vista de siempre" }, uiLang)
            : tx({ en: "Switch to math-mirror rendering (ratios, content hashes, ISO timestamps)", ja: "数のことばに切り替える（比率・内容ハッシュ・ISO時刻）", "zh-Hant": "切換到數的語言（比率、內容雜湊、ISO時間戳）", "zh-Hans": "切换到数的语言（比率、内容哈希、ISO时间戳）", es: "Cambiar a la lengua de los números (proporciones, hashes de contenido, marcas de tiempo ISO)" }, uiLang)
        }
        title="See docs/connections/the-math-language.md (#27)"
      >
        {mathLang ? tx({ en: "Default language", ja: "ふだんのことば", "zh-Hant": "平常的語言", "zh-Hans": "平常的语言", es: "La lengua de siempre" }, uiLang) : tx({ en: "Math language", ja: "数のことば", "zh-Hant": "數的語言", "zh-Hans": "数的语言", es: "La lengua de los números" }, uiLang)}
      </a>
      <a
        href={`/api/text-mode?on=${textMode ? "0" : "1"}&back=${back}`}
        className="hover:text-ink transition underline underline-offset-2"
        aria-label={
          textMode
            ? tx({ en: "Switch back to the visual layout", ja: "もとの表示に戻す", "zh-Hant": "切回原本的版面", "zh-Hans": "切换回图文显示", es: "Volver a la vista original" }, uiLang)
            : tx({ en: "Switch to a text-only reading layout (low bandwidth, screen reader friendly)", ja: "文字だけの表示に切り替える（軽く、読み上げにもやさしい）", "zh-Hant": "切換到純文字閱讀版面（省流量，也方便螢幕閱讀器）", "zh-Hans": "切换到纯文字显示（省流量，对读屏也友好）", es: "Cambiar a la vista de solo texto (ligera, amable con los lectores de pantalla)" }, uiLang)
        }
      >
        {textMode ? tx({ en: "Visual layout", ja: "もとの表示", "zh-Hant": "原本的版面", "zh-Hans": "图文显示", es: "Vista original" }, uiLang) : tx({ en: "Text-only layout", ja: "文字だけの表示", "zh-Hant": "純文字版面", "zh-Hans": "纯文字显示", es: "Solo texto" }, uiLang)}
      </a>
      <Link
        href="/appearance"
        className="hover:text-ink transition underline underline-offset-2"
        aria-label={tx({ en: "Choose a theme and tone — light, dark, follow system, and more", ja: "装いを選ぶ（明るく・暗く・端末に合わせる、ほか）", es: "Elegir tema y tono: claro, oscuro, según el sistema, y más", "zh-Hans": "选一个主题和色调（亮、暗、跟随系统，还有别的）", "zh-Hant": "選擇主題與色調（淺色、深色、跟隨系統等）" }, uiLang)}
      >
        {tx({ en: "Appearance", ja: "装い", es: "Apariencia", "zh-Hans": "外观", "zh-Hant": "外觀" }, uiLang)}
      </Link>
    </div>
  );
}
