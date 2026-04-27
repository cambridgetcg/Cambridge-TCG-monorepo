"use client";

import { useState } from "react";
import WatermarkedImage from "@/components/catalog/WatermarkedImage";

export default function CardThumbnail({
  src,
  alt,
  className = "h-10 w-auto",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${className} rounded cursor-pointer hover:opacity-80 transition select-none`}
        loading="lazy"
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
      />
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <WatermarkedImage src={src} alt={alt} style="diagonal-repeat" />
          </div>
        </div>
      )}
    </>
  );
}
