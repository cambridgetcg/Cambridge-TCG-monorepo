"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function GameTabsClient({
  games,
  currentGame,
}: {
  games: { code: string; name: string; active: boolean }[];
  currentGame: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectGame(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (code) params.set("game", code);
    else params.delete("game");
    params.delete("set");
    params.delete("page");
    router.push(`/admin/stock-levels?${params.toString()}`);
  }

  return (
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
  );
}
