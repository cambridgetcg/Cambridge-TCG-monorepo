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
    <footer className="mt-16 border-t border-border-subtle bg-page py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] lg:gap-12">
          <div>
            <Link href="/" prefetch={false} className="inline-flex min-h-11 items-center rounded-sm font-display text-lg font-semibold tracking-tight text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Cambridge TCG
            </Link>
            <p className="mt-1 max-w-sm text-sm leading-6 text-ink-muted">
              {tx({
                en: "TCG data, shared standards and collector tools. Based in Cambridge, UK.",
                ja: "TCGデータ、共通仕様、コレクター向けツール。英国ケンブリッジから。",
                es: "Datos TCG, estándares compartidos y herramientas de colección. Desde Cambridge, Reino Unido.",
                "zh-Hans": "TCG 数据、共享标准与收藏工具。来自英国剑桥。",
                "zh-Hant": "TCG 資料、共享標準與收藏工具。來自英國劍橋。",
              }, uiLang)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
            {FOOTER_NAV_GROUPS.map((group, index) => (
              <nav key={group.heading} aria-labelledby={`footer-group-${index}`}>
                <h2 id={`footer-group-${index}`} className="mb-1 break-words border-b border-border-subtle pb-3 text-sm font-semibold text-ink">
                  {navGroupHeading(group, uiLang)}
                </h2>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} prefetch={false} className="inline-flex min-h-11 items-center rounded-sm text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                        {navLabel(item, uiLang)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-3 border-t border-border-subtle pt-4 text-sm text-ink-muted">
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
              <Link href="/privacy" prefetch={false} className="inline-flex min-h-11 items-center hover:text-ink transition">{tx({ en: "Privacy", ja: "プライバシー", es: "Privacidad", "zh-Hans": "隐私", "zh-Hant": "私隱" }, uiLang)}</Link>
              <Link href="/terms" prefetch={false} className="inline-flex min-h-11 items-center hover:text-ink transition">{tx({ en: "Terms", ja: "利用規約", es: "Términos", "zh-Hans": "条款", "zh-Hant": "條款" }, uiLang)}</Link>
              <Link href="/contact" prefetch={false} className="inline-flex min-h-11 items-center hover:text-ink transition">{tx({ en: "Contact", ja: "連絡先", es: "Contacto", "zh-Hans": "联系方式", "zh-Hant": "聯絡" }, uiLang)}</Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
