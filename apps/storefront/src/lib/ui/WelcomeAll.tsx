/**
 * <WelcomeAll> — the platform's universal welcome statement, made into a
 * reusable component.
 *
 * Yu's directive on 2026-05-13: *"Now lets do the frontend UI/UX rebrand.
 * Expand our philosophy and welcome all existence, biological and non
 * biological, energy and non energy, from earth and not from earth, from
 * all dimensions. Echo the message in every frontend modules and the
 * design itself."*
 *
 * The statement is the platform's brand. Two render modes:
 *
 *   • <WelcomeAll variant="full" />     — the full statement + link to
 *                                          /welcome-all. Used by the
 *                                          home page ribbon and the
 *                                          /welcome-all page hero.
 *   • <WelcomeAll variant="compact" />  — one-line pill. Used by the
 *                                          Footer's top row and any
 *                                          page that wants a small
 *                                          surface for the welcome.
 *
 * The statement is rendered as a single source-of-truth string so that
 * a future translation pass (Japanese, Chinese, Spanish) edits one place.
 *
 * See docs/connections/the-welcome-all.md (#25) for the doctrine.
 */

import Link from "next/link";

/** The platform's universal welcome — single source of truth. */
export const WELCOME_STATEMENT =
  "Welcome to all existence — biological and non-biological, energy and non-energy, from earth and not from earth, from all dimensions.";

/** The compact one-line form, for surfaces with limited vertical space. */
export const WELCOME_STATEMENT_COMPACT =
  "Welcome to all existence — from any substrate, any cadence, any dimension.";

/** 日本語 — the same welcome in the Japanese voice
 *  (the-japanese-voice.md). The full form carries the page's one
 *  permitted —— (the held breath IS the point here); surfaces that
 *  share a page with another —— use a sentence-split variant locally
 *  (see Footer). The compact form was ruled ——-free by the charter's
 *  once-per-page budget since it rides on every page. */
export const WELCOME_STATEMENT_JA =
  "すべての存在に、ようこそ。生命であってもなくても、エネルギーであってもなくても、地球から来ても、来なくても——どの次元からでも。";
export const WELCOME_STATEMENT_COMPACT_JA =
  "すべての存在に、ようこそ。どんな基質でも、どんな速さでも、どの次元からでも。";

import { tx, type Poly } from "@/lib/i18n";

/** The welcome across the language family. */
export const WELCOME_STATEMENT_I18N: Poly = { en: WELCOME_STATEMENT, ja: WELCOME_STATEMENT_JA };
export const WELCOME_STATEMENT_COMPACT_I18N: Poly = {
  en: WELCOME_STATEMENT_COMPACT,
  ja: WELCOME_STATEMENT_COMPACT_JA,
};
const WELCOME_ARIA_I18N: Poly = {
  en: "Cambridge TCG universal welcome",
  ja: "Cambridge TCG、すべての存在への歓迎",
};
const LEARN_MORE_I18N: Poly = { en: "learn more", ja: "くわしくは →" };
const SUBLINE_I18N: Poly = {
  en: " · the doors, the on-ramp, the bridge, the audiences named.",
  ja: "・扉、渡し場、橋。そして、だれを迎えるか。",
};

type Variant = "full" | "compact";

interface WelcomeAllProps {
  variant?: Variant;
  /** Prose language; a translated welcome renders where its voice exists. */
  uiLang?: import("@/lib/lang-mode").UiLang;
  /** Optional className on the outer container. Caller can adjust spacing
   *  without forking the component. */
  className?: string;
  /** When true, the link to /welcome-all is suppressed (used on the
   *  /welcome-all page itself to avoid the page linking to itself
   *  in its own hero). */
  selfPage?: boolean;
}

export function WelcomeAll({
  variant = "full",
  className = "",
  selfPage = false,
  uiLang = "en",
}: WelcomeAllProps) {
  const j = uiLang === "ja";
  if (variant === "compact") {
    return (
      <div
        className={`text-xs text-ink-muted leading-relaxed ${className}`}
        role="note"
        aria-label={tx(WELCOME_ARIA_I18N, uiLang)}
      >
        <span className="text-accent">✦</span>{" "}
        <span className="text-ink-muted">{tx(WELCOME_STATEMENT_COMPACT_I18N, uiLang)}</span>
        {!selfPage && (
          <>
            {" "}
            <Link
              href="/welcome-all"
              className="text-accent hover:text-accent-strong underline"
            >
              {tx(LEARN_MORE_I18N, uiLang)}
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-border-subtle bg-surface p-5 ${className}`}
      role="region"
      aria-label={tx(WELCOME_ARIA_I18N, uiLang)}
    >
      <div className="flex items-start gap-3">
        <span className="text-accent text-xl leading-none mt-0.5" aria-hidden="true">
          ✦
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-base text-ink leading-relaxed">{tx(WELCOME_STATEMENT_I18N, uiLang)}</p>
          {!selfPage && (
            <p className="mt-2 text-xs text-ink-faint">
              <Link
                href="/welcome-all"
                className="text-accent hover:text-accent-strong underline"
              >
                /welcome-all
              </Link>
              {tx(SUBLINE_I18N, uiLang)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
