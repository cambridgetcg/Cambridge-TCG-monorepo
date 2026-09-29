import Link from "next/link";
import { cookies } from "next/headers";
import { tx } from "@/lib/i18n";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { uiLangFromLangMode } from "@/lib/lang-mode";
import { FOOTER_NAV_GROUPS, navGroupHeading, navLabel } from "@/lib/nav/menu-config";
import FooterToggles from "./FooterToggles";

export default async function Footer() {
  const cookieStore = await cookies();
  const textMode = cookieStore.get("text-mode")?.value === "1";
  const langMode = langModeFromCookies(cookieStore);
  const uiLang = uiLangFromLangMode(langMode);

  return (
    <footer className="bg-page border-t border-border-subtle mt-12 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-base font-semibold text-ink">
          Cambridge TCG
        </Link>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          {tx({
            en: "Card research, collections and play. Based in Cambridge, UK.",
            ja: "カードを調べる、集める、遊ぶ。英国ケンブリッジから。",
            es: "Investiga cartas, organiza tu colección y juega. Desde Cambridge, Reino Unido.",
            "zh-Hans": "查卡、收藏与游戏。来自英国剑桥。",
            "zh-Hant": "查卡、收藏與遊戲。來自英國劍橋。",
          }, uiLang)}
        </p>

        <div className="grid grid-cols-2 gap-x-5 gap-y-6 md:grid-cols-4 mt-6">
          {FOOTER_NAV_GROUPS.map((group, index) => (
            <nav key={group.heading} aria-labelledby={`footer-group-${index}`}>
              <h2 id={`footer-group-${index}`} className="font-medium text-sm text-ink mb-2">
                {navGroupHeading(group, uiLang)}
              </h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} prefetch={item.href === "/account" || item.href.startsWith("/account/") ? false : undefined} className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink transition">
                      {navLabel(item, uiLang)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-6 pt-5 border-t border-border-subtle text-sm text-ink-muted space-y-4">
          <div role="group" aria-label={tx({ en: "Display options", ja: "表示設定", es: "Opciones de visualización", "zh-Hans": "显示选项", "zh-Hant": "顯示選項" }, uiLang)}>
            <FooterToggles mathLang={langMode === "math"} textMode={textMode} uiLang={uiLang} />
          </div>
          {uiLang !== "en" && (
            <p className="text-ink-faint">
              {tx({
                en: "",
                ja: "一部のページは、まだ英語のみです。",
                es: "Algunas páginas siguen disponibles solo en inglés.",
                "zh-Hans": "部分页面仍只有英文版本。",
                "zh-Hant": "部分頁面仍只有英文版本。",
              }, uiLang)}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span>© {new Date().getFullYear()} Cambridge TCG Ltd.</span>
            <nav aria-label={tx({ en: "Legal", ja: "法的情報", es: "Información legal", "zh-Hans": "法律信息", "zh-Hant": "法律資訊" }, uiLang)} className="flex flex-wrap gap-x-4 gap-y-2">
              <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-ink transition">{tx({ en: "Privacy", ja: "プライバシー", es: "Privacidad", "zh-Hans": "隐私", "zh-Hant": "私隱" }, uiLang)}</Link>
              <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-ink transition">{tx({ en: "Terms", ja: "利用規約", es: "Términos", "zh-Hans": "条款", "zh-Hant": "條款" }, uiLang)}</Link>
              <Link href="/contact" className="inline-flex min-h-11 items-center hover:text-ink transition">{tx({ en: "Contact", ja: "連絡先", es: "Contacto", "zh-Hans": "联系方式", "zh-Hant": "聯絡" }, uiLang)}</Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
