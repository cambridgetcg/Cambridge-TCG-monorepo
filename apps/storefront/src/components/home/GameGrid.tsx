import Link from "next/link";
import Image from "next/image";
import type { GameItem } from "@/lib/wholesale/client";

// Map game slugs to their anime-style background images
const gameImages: Record<string, string> = {
  pokemon: "/banners/game-pokemon-anime.jpg",
  "one-piece": "/banners/game-onepiece-anime.jpg",
  dragonball: "/banners/game-dragonball-anime.jpg",
  "dragon-ball": "/banners/game-dragonball-anime.jpg",
};

const fallbackImage = "/banners/game-general-anime.jpg";

export default function GameGrid({ games }: { games: GameItem[] }) {
  return (
    <section className="max-w-7xl mx-auto px-4 py-16">
      <h2 className="text-2xl font-bold mb-8 text-white">Shop by Game</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {games.map((g) => (
          <Link
            key={g.code}
            href={`/catalog?game=${g.slug}`}
            className="group relative aspect-square rounded-2xl overflow-hidden bg-neutral-900 hover:ring-2 ring-emerald-500 transition-all"
          >
            <Image
              src={gameImages[g.slug] || fallbackImage}
              alt={g.name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-110"
              sizes="(max-width: 768px) 50vw, 25vw"
            />
            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute inset-0 flex items-end justify-center pb-6">
              <span className="text-white font-bold text-lg drop-shadow-lg tracking-wide">
                {g.name}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
