"use client";

import { useState } from "react";
import type { AuctionImage } from "@/lib/auction/types";

interface AuctionImageGalleryProps {
  images: AuctionImage[];
}

export default function AuctionImageGallery({ images }: AuctionImageGalleryProps) {
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);
  const [activeIndex, setActiveIndex] = useState(0);

  if (sorted.length === 0) {
    return (
      <div className="aspect-square bg-neutral-800 rounded-xl flex items-center justify-center text-neutral-600">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="aspect-square bg-neutral-800 rounded-xl overflow-hidden">
        <img
          src={sorted[activeIndex].url}
          alt={`Image ${activeIndex + 1}`}
          className="w-full h-full object-contain"
        />
      </div>

      {/* Thumbnail strip */}
      {sorted.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sorted.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActiveIndex(i)}
              className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 transition ${
                i === activeIndex
                  ? "border-amber-500"
                  : "border-transparent hover:border-neutral-600"
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
