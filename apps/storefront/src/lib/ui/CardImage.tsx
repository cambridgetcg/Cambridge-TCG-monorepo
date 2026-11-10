"use client";

import type { ImgHTMLAttributes } from "react";
import { CardImagePlaceholder } from "./CardImagePlaceholder";
import { useImageFailed } from "./useImageFailed";

/** A card's `<img>` for a server page: if it does not load, the "no image"
 *  placeholder stands in, sized by `placeholderClassName`. */
export function CardImage({
  src,
  alt,
  placeholderClassName = "w-full",
  ...img
}: ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string; placeholderClassName?: string }) {
  const { failed, onError, checkComplete } = useImageFailed(src);
  if (failed) {
    return <CardImagePlaceholder label="Image did not load" className={placeholderClassName} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={checkComplete} onError={onError} src={src} alt={alt} {...img} />;
}
