import Link from "next/link";
import Image from "next/image";
import type { SetItem, PriceItem } from "@/lib/wholesale/client";

interface SetWithThumb extends SetItem {
  thumb: PriceItem | null;
}

export default function SetGrid({
  sets,
  gameSlug,
}: {
  sets: SetWithThumb[];
  gameSlug: string;
}) {
  if (!sets.length) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 py-16">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-white">Latest Sets</h2>
        <Link
          href={`/catalog?game=${gameSlug}`}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition"
        >
          View all sets →
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {sets.map((set, i) => (
          <Link
            key={set.code}
            href={`/catalog?game=${gameSlug}&set=${set.code}`}
            className="group relative rounded-xl overflow-hidden bg-neutral-900 hover:ring-2 ring-emerald-500 transition-all"
          >
            {/* Background thumbnail */}
            <div className="relative aspect-[4/3]">
              {set.thumb?.image_url ? (
                <Image
                  src={set.thumb.image_url}
                  alt={set.name}
                  fill
                  className="object-cover opacity-40 group-hover:opacity-60 transition-opacity duration-300 group-hover:scale-105"
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
              ) : (
                <div className="w-full h-full bg-neutral-800" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent" />

              {/* NEW badge for first set */}
              {i === 0 && (
                <span className="absolute top-3 right-3 px-2 py-0.5 bg-emerald-500 text-black text-xs font-bold rounded-full uppercase">
                  New
                </span>
              )}

              {/* Content */}
              <div className="absolute inset-0 flex flex-col justify-end p-4">
                <span className="text-xs font-mono bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded w-fit mb-2">
                  {set.code}
                </span>
                <h3 className="text-sm font-bold text-white leading-tight line-clamp-2">
                  {set.name}
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  {set.card_count} cards
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
