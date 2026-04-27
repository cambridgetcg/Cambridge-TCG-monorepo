"use client";

import Link from "next/link";
import type { SetItem } from "@/lib/wholesale/client";

interface SetGroup {
  label: string;
  sets: SetItem[];
}

function classifySet(code: string): string {
  const upper = code.toUpperCase();
  if (upper === "SEALED") return "Sealed Products";
  if (upper === "PROMO" || upper.startsWith("P-")) return "Promo & Special";
  if (upper.startsWith("ST")) return "Starter Decks";
  if (upper.startsWith("EB")) return "Extra Boosters";
  // OP*, PRB*, and anything else → Booster Packs
  if (upper.startsWith("OP") || upper.startsWith("PRB")) return "Booster Packs";
  return "Other";
}

const GROUP_ORDER = [
  "Booster Packs",
  "Extra Boosters",
  "Starter Decks",
  "Promo & Special",
  "Sealed Products",
  "Other",
];

function groupSets(sets: SetItem[]): SetGroup[] {
  const map: Record<string, SetItem[]> = {};
  for (const s of sets) {
    const label = classifySet(s.code);
    if (!map[label]) map[label] = [];
    map[label].push(s);
  }
  return GROUP_ORDER.filter((l) => map[l]?.length).map((label) => ({
    label,
    sets: map[label],
  }));
}

export default function SetSidebar({
  sets,
  currentGame,
  currentSet,
}: {
  sets: SetItem[];
  currentGame?: string;
  currentSet?: string;
}) {
  const groups = groupSets(sets);

  if (!sets.length) return null;

  return (
    <aside className="w-full lg:w-56 shrink-0">
      <nav className="flex flex-col gap-4">
        {/* All cards link */}
        <Link
          href={currentGame ? `/catalog?game=${currentGame}` : "/catalog"}
          className={`text-sm px-3 py-1.5 rounded-lg transition ${
            !currentSet
              ? "bg-emerald-500/15 text-emerald-400 font-medium"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          All Cards
        </Link>

        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-3 mb-1">
              {group.label}
            </p>
            <ul className="flex flex-col">
              {group.sets.map((s) => {
                const active = currentSet === s.code;
                const href = currentGame
                  ? `/catalog?game=${currentGame}&set=${s.code}`
                  : `/catalog?set=${s.code}`;
                return (
                  <li key={s.code}>
                    <Link
                      href={href}
                      className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition ${
                        active
                          ? "bg-emerald-500/15 text-emerald-400 font-medium"
                          : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
                      }`}
                    >
                      <span className="font-mono text-xs text-neutral-500 w-12 shrink-0">
                        {s.code}
                      </span>
                      <span className="truncate">{s.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
