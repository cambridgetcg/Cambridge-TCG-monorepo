"use client";

/**
 * LeanIn — the museum's "stand closer" affordance.
 *
 * A trading card is a small piece of art; in a gallery you may lean in until
 * your eye is inches from the surface. This lets a visitor do that: tap the
 * work to open it large, frame stripped, the art the only subject; tap again
 * to step in closer (and pan by scrolling); Escape or click-out to step back.
 *
 * Sits as a transparent trigger over the framed image (which is rendered
 * behind it with next/image `fill`). Semantic tokens only; respects
 * reduced-motion (no transitions when the visitor asked for none).
 */

import { useCallback, useEffect, useRef, useState } from "react";

export default function LeanIn({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const [closeUp, setCloseUp] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setCloseUp(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  return (
    <>
      {/* Transparent trigger laid over the framed art (art is z-0 behind). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Look closely at ${alt}`}
        className="group absolute inset-0 z-10 flex items-end justify-end p-2 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="pointer-events-none rounded-full border border-border-subtle bg-page/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
          &#10530; lean in
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} — up close`}
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-page/95 p-4 sm:p-8"
        >
          <button
            ref={closeBtn}
            type="button"
            onClick={close}
            aria-label="Step back"
            className="absolute top-4 right-4 z-10 rounded-full border border-border-subtle bg-surface px-3 py-1.5 font-mono text-xs uppercase tracking-[0.15em] text-ink-muted hover:text-ink transition-colors motion-reduce:transition-none"
          >
            Close &#10005;
          </button>

          <div
            className={`max-h-full ${closeUp ? "overflow-auto cursor-zoom-out" : "overflow-hidden cursor-zoom-in"}`}
            onClick={(e) => {
              e.stopPropagation();
              setCloseUp((v) => !v);
            }}
          >
            {/* Plain img: the actual art at full size, framed only by the mat.
                next/image's fill is for the page thumbnail; here we want the
                real pixels to lean into. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className={`mx-auto rounded-lg shadow-mat transition-[width,max-height] duration-200 motion-reduce:transition-none ${
                closeUp ? "w-[min(1400px,180vw)] max-w-none" : "max-h-[86vh] w-auto"
              }`}
            />
          </div>

          <p className="pointer-events-none absolute bottom-4 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-ink-faint">
            click the art to {closeUp ? "step back" : "look closer"} &middot; esc to close
          </p>
        </div>
      )}
    </>
  );
}
