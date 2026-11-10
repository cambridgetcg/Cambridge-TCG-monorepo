"use client";

import { useState } from "react";
import { CardImagePlaceholder } from "@/lib/ui/CardImagePlaceholder";
import { useImageFailed } from "@/lib/ui/useImageFailed";

interface AuctionImageGalleryProps {
  images: Array<{ id?: string; url: string; display_order: number }>;
}

/** A thumbnail in its fixed 64 px square; the compact placeholder if it does not load. */
function GalleryThumb({ url, index }: { url: string; index: number }) {
  const { failed, onError, checkComplete } = useImageFailed(url);
  if (failed) {
    return (
      <span className="flex h-full items-center justify-center p-1">
        <CardImagePlaceholder compact label="Image did not load" className="h-full w-auto" />
      </span>
    );
  }
  return (
    <img
      ref={checkComplete}
      onError={onError}
      src={url}
      alt={`Thumbnail ${index + 1}`}
      className="w-full h-full object-cover"
    />
  );
}

export default function AuctionImageGallery({ images }: AuctionImageGalleryProps) {
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);
  const [activeIndex, setActiveIndex] = useState(0);
  const { failed, onError, checkComplete } = useImageFailed(sorted[activeIndex]?.url);

  if (sorted.length === 0) {
    return (
      <div className="aspect-square bg-surface-subtle rounded-lg flex items-center justify-center p-6">
        <CardImagePlaceholder className="h-full w-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="aspect-square bg-surface-subtle rounded-lg overflow-hidden">
        {failed ? (
          <div className="flex h-full items-center justify-center p-6">
            <CardImagePlaceholder label="Image did not load" className="h-full w-auto" />
          </div>
        ) : (
          <img
            ref={checkComplete}
            onError={onError}
            src={sorted[activeIndex].url}
            alt={`Image ${activeIndex + 1}`}
            className="w-full h-full object-contain"
          />
        )}
      </div>

      {/* Thumbnail strip */}
      {sorted.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sorted.map((img, i) => (
            <button
              key={img.id ?? `${img.url}:${img.display_order}`}
              onClick={() => setActiveIndex(i)}
              className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 transition ${
                i === activeIndex
                  ? "border-accent"
                  : "border-transparent hover:border-border-strong"
              }`}
            >
              <GalleryThumb url={img.url} index={i} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
