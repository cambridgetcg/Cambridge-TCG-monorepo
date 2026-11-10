"use client";

import { useCallback, useState } from "react";

/**
 * Whether a card image failed to load, so the page can show
 * `CardImagePlaceholder` instead of a broken-image icon. Pass `onError`, and
 * `checkComplete` as the callback `ref`, to the `<img>` (or next/image `<Image>`).
 *
 * An image can fail before React hydrates and attaches `onError`, so
 * `checkComplete` also checks an image that has already finished: `complete` with no pixels
 * means it broke. The answer is kept per `src`, so a new source is tried
 * afresh.
 */
export function useImageFailed(src: string | null | undefined) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const onError = useCallback(() => {
    if (src) setFailedSrc(src);
  }, [src]);
  const checkComplete = useCallback(
    (img: HTMLImageElement | null) => {
      if (src && img && img.complete && img.naturalWidth === 0) setFailedSrc(src);
    },
    [src],
  );
  return { failed: Boolean(src) && failedSrc === src, onError, checkComplete };
}
