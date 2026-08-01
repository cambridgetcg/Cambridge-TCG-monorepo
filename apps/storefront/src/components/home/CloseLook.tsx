"use client";

import Image from "next/image";
import { useRef } from "react";

/**
 * CloseLook — 近くで見る. Walk up to the painting.
 *
 * The guest wall's mounts become buttons: a click opens the piece in a
 * native <dialog> — dark scrim, the print near-fullscreen, the label
 * beneath — and Esc, the close button, or a click on the scrim walks
 * you back. The native element carries the accessibility (focus trap,
 * Esc, ::backdrop); this component only opens and closes it. Server
 * pages stay server — this is the one small client island the guest
 * wall needs, and it renders nothing extra until asked.
 */
export default function CloseLook({
  src,
  alt,
  caption,
  children,
}: {
  src: string;
  alt: string;
  /** The wall label text repeated under the large view. */
  caption: string;
  /** The mounted thumbnail markup (the frame + image). */
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // A click's target is the ancestor of mousedown AND mouseup targets —
  // a drag that starts on the artwork and releases on the scrim would
  // read as a scrim click. Close only when the press STARTED there too.
  const downOnScrim = useRef(false);

  return (
    <>
      <button
        type="button"
        className="group block w-full text-left cursor-zoom-in"
        aria-label={`View ${alt} large`}
        onClick={() => ref.current?.showModal()}
      >
        {children}
      </button>
      <dialog
        ref={ref}
        className="wardrobe-closelook"
        aria-label={`${alt} — large view`}
        onPointerDown={(e) => {
          downOnScrim.current = e.target === ref.current;
        }}
        onClick={(e) => {
          // A click on the dialog element itself is the scrim; a click
          // inside the figure is the artwork. Only the scrim closes —
          // and only when the press began on the scrim as well.
          if (e.target === ref.current && downOnScrim.current) ref.current?.close();
        }}
      >
        <figure className="m-0 flex flex-col items-center gap-3 p-4">
          <div className="relative w-[88vw] max-w-[56rem] h-[76vh]">
            <Image
              src={src}
              alt={alt}
              fill
              className="object-contain"
              sizes="(max-width: 928px) 88vw, 896px"
            />
          </div>
          <figcaption className="text-center text-sm">
            {caption}
          </figcaption>
          <button
            type="button"
            className="closelook-dim text-xs uppercase tracking-widest opacity-75 hover:opacity-100 transition"
            onClick={() => ref.current?.close()}
          >
            close — 閉じる
          </button>
        </figure>
      </dialog>
    </>
  );
}
