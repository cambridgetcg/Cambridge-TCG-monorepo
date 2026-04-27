"use client";

export default function WatermarkedImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
  style?: string;
}) {
  const text = "WHOLESALE TCG DIRECT — INTERNAL USE ONLY";

  return (
    <div className="relative overflow-hidden rounded-lg shadow-2xl">
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] w-auto block select-none"
        style={{ minHeight: "60vh", objectFit: "contain" }}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-[-50%] flex flex-wrap items-center justify-center gap-y-10"
          style={{ transform: "rotate(-30deg)" }}
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className="block w-full text-center text-[11px] font-bold tracking-wider whitespace-nowrap"
              style={{ color: "rgba(255,255,255,0.2)", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
            >
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
