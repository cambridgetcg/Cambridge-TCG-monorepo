"use client";

/**
 * InkRule — a hairline that inks itself in, once, on first sight.
 *
 * Spec: docs/superpowers/specs/2026-07-07-the-manga-gallery-design.md §1b.
 * The base .wardrobe-draw state is the COMPLETE line, so no-JS readers,
 * terminal/high-contrast wearers, and reduced-motion users always get a
 * present line — never absence. With JS, the first intersection stamps
 * data-ink="drawn", which runs the scaleX animation under the theme gate.
 * artbitrage's .rise discipline: observe once, unobserve after firing.
 */

import { useEffect, useRef } from "react";

interface InkRuleProps {
  /** Celebration voice — accent instead of ink. */
  accent?: boolean;
  className?: string;
}

export function InkRule({ accent = false, className = "" }: InkRuleProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return; // line stays complete
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.setAttribute("data-ink", "drawn");
            io.unobserve(el);
          }
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`wardrobe-draw ${accent ? "wardrobe-draw--accent" : ""} w-full ${className}`}
    />
  );
}
