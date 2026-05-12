/**
 * <MathLang> — conditional rendering based on the lang-mode cookie.
 *
 * The frontend half of the math-language toggle. A page or primitive
 * that knows both its default form and its math-mirror form passes both
 * via the `default` and `math` props; this component reads the cookie
 * (server-side) and renders the right one.
 *
 * Usage:
 *
 *   <MathLang
 *     default={<span>£12.34</span>}
 *     math={<code>{`{amount:1234,unit:"GBP-cents",ratio:0.73}`}</code>}
 *   />
 *
 * The component is a server component — the cookie read happens on the
 * server, so the rendered HTML is final. No client-side flash.
 *
 * For inline-pair rendering ("£12.34" with the math form revealed beside
 * it under hover/focus for default visitors, OR math-first for math-mode
 * visitors), use <MathPair>.
 *
 * See docs/connections/the-math-language.md (#27).
 */

import * as React from "react";
import { getLangMode } from "@/lib/lang-mode-server";

interface MathLangProps {
  /** What to render when lang-mode is the platform default (English prose). */
  default: React.ReactNode;
  /** What to render when lang-mode=math is active. */
  math: React.ReactNode;
  /** When the math form should remain accessible to screen readers even
   *  in default mode, pass the math here as a hidden sibling — it lives
   *  in the DOM with `aria-hidden="true"` for visual readers and is
   *  read by assistive tech only when the math mode is active. Default
   *  behaviour: math is hidden when default is active. */
  alwaysIncludeMathInDom?: boolean;
}

/**
 * Server component — reads the cookie once and emits the right child.
 * The non-active child is omitted from the DOM by default (saves bytes,
 * avoids ARIA noise).
 */
export async function MathLang({
  default: defaultForm,
  math: mathForm,
  alwaysIncludeMathInDom = false,
}: MathLangProps) {
  const mode = await getLangMode();
  if (mode === "math") {
    return <>{mathForm}</>;
  }
  if (alwaysIncludeMathInDom) {
    return (
      <>
        {defaultForm}
        <span aria-hidden="true" hidden>
          {mathForm}
        </span>
      </>
    );
  }
  return <>{defaultForm}</>;
}
