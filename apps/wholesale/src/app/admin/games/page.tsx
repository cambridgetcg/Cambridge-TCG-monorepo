"use client";

import { useState, useEffect, useCallback, Fragment } from "react";

interface GameRow {
  id: number;
  code: string;
  name: string;
  slug: string;
  active: boolean | null;
  sortOrder: number | null;
  setCount: number;
}

interface SetRow {
  id: number;
  gameId: number;
  code: string;
  name: string;
  releaseDate: string | null;
  sortOrder: number | null;
  active: boolean | null;
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [expandedGame, setExpandedGame] = useState<number | null>(null);
  const [gameSets, setGameSets] = useState<Record<number, SetRow[]>>({});
  const [showAddSet, setShowAddSet] = useState<number | null>(null);
  const [newSet, setNewSet] = useState({ code: "", name: "", releaseDate: "" });
  const [loading, setLoading] = useState(true);

  const fetchGames = useCallback(async () => {
    const res = await fetch("/api/admin/games");
    const data = await res.json();
    setGames(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  async function toggleExpand(gameId: number) {
    if (expandedGame === gameId) {
      setExpandedGame(null);
      return;
    }
    setExpandedGame(gameId);
    if (!gameSets[gameId]) {
      const res = await fetch(`/api/admin/sets?gameId=${gameId}`);
      const data = await res.json();
      setGameSets(prev => ({ ...prev, [gameId]: data }));
    }
  }

  async function toggleActive(game: GameRow) {
    await fetch(`/api/admin/games/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !(game.active ?? true) }),
    });
    fetchGames();
  }

  async function addSet(gameId: number) {
    if (!newSet.code || !newSet.name) return;
    await fetch("/api/admin/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, ...newSet, releaseDate: newSet.releaseDate || null }),
    });
    // Refresh sets for this game
    const res = await fetch(`/api/admin/sets?gameId=${gameId}`);
    const data = await res.json();
    setGameSets(prev => ({ ...prev, [gameId]: data }));
    setNewSet({ code: "", name: "", releaseDate: "" });
    setShowAddSet(null);
    // Refresh games to update set count
    fetchGames();
  }

  async function toggleSetActive(set: SetRow) {
    await fetch(`/api/admin/sets/${set.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !(set.active ?? true) }),
    });
    const res = await fetch(`/api/admin/sets?gameId=${set.gameId}`);
    const data = await res.json();
    setGameSets(prev => ({ ...prev, [set.gameId]: data }));
  }

  if (loading) return <div className="text-gray-400">Loading games...</div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Games &amp; Sets</h1>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#1e1e2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#12121a]">
            <tr className="text-left text-gray-400">
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium text-center">Sets</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
              <th className="px-4 py-3 font-medium text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {games.map(game => {
              const isActive = game.active ?? true;
              return (
                <Fragment key={game.id}>
                  <tr
                    className="hover:bg-[#12121a] cursor-pointer"
                    onClick={() => toggleExpand(game.id)}
                  >
                    <td className="px-4 py-3 text-gray-500">
                      {expandedGame === game.id ? "\u25BC" : "\u25B6"}
                    </td>
                    <td className="px-4 py-3 font-medium">{game.name}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{game.code}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{game.slug}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full bg-brand-600/20 px-2 py-0.5 text-xs font-medium text-brand-400">
                        {game.setCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          isActive
                            ? "bg-green-900/30 text-green-400"
                            : "bg-red-900/30 text-red-400"
                        }`}
                      >
                        {isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => toggleActive(game)}
                        className={`rounded px-3 py-1 text-xs font-medium transition ${
                          isActive
                            ? "border border-red-800 bg-red-900/20 text-red-400 hover:bg-red-900/40"
                            : "border border-green-800 bg-green-900/20 text-green-400 hover:bg-green-900/40"
                        }`}
                      >
                        {isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                  {expandedGame === game.id && (
                    <tr>
                      <td colSpan={7} className="bg-[#0e0e16] px-8 py-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                            Sets for {game.name}
                          </h4>
                          <button
                            onClick={() =>
                              setShowAddSet(showAddSet === game.id ? null : game.id)
                            }
                            className="rounded bg-brand-600 px-3 py-1 text-xs font-medium hover:bg-brand-700 transition"
                          >
                            {showAddSet === game.id ? "Cancel" : "Add Set"}
                          </button>
                        </div>

                        {showAddSet === game.id && (
                          <div className="mb-4 rounded-lg border border-[#1e1e2e] bg-[#12121a] p-3">
                            <div className="flex flex-wrap gap-3 items-end">
                              <div>
                                <label className="mb-1 block text-[10px] text-gray-500 uppercase tracking-wide">
                                  Code
                                </label>
                                <input
                                  value={newSet.code}
                                  onChange={e =>
                                    setNewSet(prev => ({ ...prev, code: e.target.value }))
                                  }
                                  placeholder="e.g. SV08"
                                  className="rounded border border-[#1e1e2e] bg-gray-800 px-3 py-1.5 text-xs outline-none focus:border-brand-500 w-28"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-[10px] text-gray-500 uppercase tracking-wide">
                                  Name
                                </label>
                                <input
                                  value={newSet.name}
                                  onChange={e =>
                                    setNewSet(prev => ({ ...prev, name: e.target.value }))
                                  }
                                  placeholder="e.g. Surging Sparks"
                                  className="rounded border border-[#1e1e2e] bg-gray-800 px-3 py-1.5 text-xs outline-none focus:border-brand-500 w-48"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-[10px] text-gray-500 uppercase tracking-wide">
                                  Release Date
                                </label>
                                <input
                                  type="date"
                                  value={newSet.releaseDate}
                                  onChange={e =>
                                    setNewSet(prev => ({
                                      ...prev,
                                      releaseDate: e.target.value,
                                    }))
                                  }
                                  className="rounded border border-[#1e1e2e] bg-gray-800 px-3 py-1.5 text-xs outline-none focus:border-brand-500 w-36"
                                />
                              </div>
                              <button
                                onClick={() => addSet(game.id)}
                                className="rounded bg-brand-600 px-4 py-1.5 text-xs font-medium hover:bg-brand-700 transition"
                              >
                                Create
                              </button>
                            </div>
                          </div>
                        )}

                        {gameSets[game.id] ? (
                          gameSets[game.id].length > 0 ? (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="py-1.5 text-left font-medium">Code</th>
                                  <th className="py-1.5 text-left font-medium">Name</th>
                                  <th className="py-1.5 text-left font-medium">Release Date</th>
                                  <th className="py-1.5 text-center font-medium">Status</th>
                                  <th className="py-1.5 text-center font-medium">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {gameSets[game.id].map(set => {
                                  const setActive = set.active ?? true;
                                  return (
                                    <tr
                                      key={set.id}
                                      className="border-t border-[#1e1e2e]"
                                    >
                                      <td className="py-1.5 font-mono text-gray-300">
                                        {set.code}
                                      </td>
                                      <td className="py-1.5 text-gray-300">{set.name}</td>
                                      <td className="py-1.5 text-gray-400">
                                        {set.releaseDate || "\u2014"}
                                      </td>
                                      <td className="py-1.5 text-center">
                                        <span
                                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                            setActive
                                              ? "bg-green-900/30 text-green-400"
                                              : "bg-red-900/30 text-red-400"
                                          }`}
                                        >
                                          {setActive ? "Active" : "Inactive"}
                                        </span>
                                      </td>
                                      <td className="py-1.5 text-center">
                                        <button
                                          onClick={() => toggleSetActive(set)}
                                          className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                                            setActive
                                              ? "border border-red-800 bg-red-900/20 text-red-400 hover:bg-red-900/40"
                                              : "border border-green-800 bg-green-900/20 text-green-400 hover:bg-green-900/40"
                                          }`}
                                        >
                                          {setActive ? "Deactivate" : "Activate"}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-xs text-gray-500">No sets yet</p>
                          )
                        ) : (
                          <p className="text-xs text-gray-500">Loading...</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {games.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No games found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
