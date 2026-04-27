"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCatalogFilter } from "./CatalogFilterContext";

interface GameTabsProps {
  games: { code: string; name: string; active: boolean }[];
  currentGame: string;
}

export default function GameTabs({ games, currentGame }: GameTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startFilter } = useCatalogFilter();

  function selectGame(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (code) params.set("game", code);
    else params.delete("game");
    params.delete("set");  // reset set when game changes
    params.delete("page");
    startFilter(() => router.push(`/catalog?${params.toString()}`));
  }

  const hasInactive = games.some((g) => !g.active);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => selectGame("")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            !currentGame
              ? "bg-brand-600 text-white"
              : "bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white hover:border-brand-500"
          }`}
        >
          All Games
        </button>
        {games.map((game) => (
          <button
            key={game.code}
            onClick={() => game.active && selectGame(game.code)}
            disabled={!game.active}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              currentGame === game.code
                ? "bg-brand-600 text-white"
                : game.active
                  ? "bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white hover:border-brand-500"
                  : "bg-[#12121a] border border-[#1e1e2e] text-gray-600 cursor-not-allowed opacity-50"
            }`}
          >
            {game.name}
          </button>
        ))}
      </div>
      {hasInactive && (
        <p className="mt-2 text-xs text-gray-500">
          Interested in more card games? Contact your account manager.
        </p>
      )}
    </div>
  );
}
