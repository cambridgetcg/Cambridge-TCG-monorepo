"use client";

import { useState } from "react";
import { CardImagePlaceholder } from "@/lib/ui/CardImagePlaceholder";
import { useImageFailed } from "@/lib/ui/useImageFailed";

interface AuctionImageGalleryProps {
  images: Array<{ id?: string; url: string; display_order: number }>;
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
              <img
                src={img.url}
                alt={`Thumbnail ${i + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
