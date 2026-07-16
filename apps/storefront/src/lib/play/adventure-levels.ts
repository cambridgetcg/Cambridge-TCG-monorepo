// The adventure ladder as data — ten opponents tracing the One Piece
// storyline, mirrored from drizzle/0030_pve_seed.sql so practice battles
// need no database round-trip (and work offline, and in any dev checkout).
//
// Deliberately absent: points, credit, rewards of any kind. Practice
// battles pay nothing — the reward columns stay in the paused DB tables.
//
// aiStarterId names the encoded starter deck the opponent pilots (the
// board says so honestly). Difficulty comes from AI aggression plus the
// deck itself.

export type AdventureDifficulty = "easy" | "medium" | "hard" | "extreme";

export interface AdventureLevel {
  id: number;
  title: string;
  description: string;
  opponentName: string;
  opponentIcon: string;
  difficulty: AdventureDifficulty;
  aiAggression: number;
  aiStarterId: string;
}

export const ADVENTURE_LEVELS: AdventureLevel[] = [
  {
    id: 1,
    title: "East Blue Rookie",
    description:
      "Your first taste of piracy. Alvida's crew blocks your path out of the East Blue. Prove you're more than a cabin boy.",
    opponentName: "Alvida",
    opponentIcon: "🔨",
    difficulty: "easy",
    aiAggression: 0.3,
    aiStarterId: "st-01-red-luffy",
  },
  {
    id: 2,
    title: "Baratie Showdown",
    description:
      "Don Krieg's armada descends on the floating restaurant. Defend the cooks and show what a rookie captain is made of.",
    opponentName: "Don Krieg",
    opponentIcon: "⚔️",
    difficulty: "easy",
    aiAggression: 0.4,
    aiStarterId: "st-19-black-smoker",
  },
  {
    id: 3,
    title: "Arlong Park",
    description:
      "The tyrant of Cocoyasi Village has haunted Nami for years. Break his grip and prove your crew is worth sailing with.",
    opponentName: "Arlong",
    opponentIcon: "🦈",
    difficulty: "easy",
    aiAggression: 0.5,
    aiStarterId: "st-17-blue-doflamingo",
  },
  {
    id: 4,
    title: "Drum Island",
    description:
      "A frozen kingdom ruled by a gluttonous tyrant. Chop through Wapol's shape-shifting antics and reach the castle.",
    opponentName: "Wapol",
    opponentIcon: "👑",
    difficulty: "medium",
    aiAggression: 0.55,
    aiStarterId: "st-16-green-uta",
  },
  {
    id: 5,
    title: "Alabasta Crisis",
    description:
      "The desert king of Baroque Works schemes to seize an entire nation. Dismantle his web of pawns and face him in the ruins.",
    opponentName: "Crocodile",
    opponentIcon: "🐊",
    difficulty: "medium",
    aiAggression: 0.65,
    aiStarterId: "st-18-purple-luffy",
  },
  {
    id: 6,
    title: "Skypiea Thunder",
    description:
      "Four hundred million volts of godhood stand between you and the gold of Shandora. Survive the Ordeals.",
    opponentName: "Enel",
    opponentIcon: "⚡",
    difficulty: "medium",
    aiAggression: 0.7,
    aiStarterId: "st-20-yellow-katakuri",
  },
  {
    id: 7,
    title: "Water 7 Betrayal",
    description:
      "A friend is a CP9 agent, the Puffing Tom is leaving the station, and Robin has been taken. The leopard won't stop you.",
    opponentName: "Rob Lucci",
    opponentIcon: "🐆",
    difficulty: "hard",
    aiAggression: 0.8,
    aiStarterId: "st-19-black-smoker",
  },
  {
    id: 8,
    title: "Thriller Bark",
    description:
      "A ghost ship the size of an island, and a warlord who steals shadows. Reclaim yours before dawn.",
    opponentName: "Gecko Moria",
    opponentIcon: "👻",
    difficulty: "hard",
    aiAggression: 0.8,
    aiStarterId: "st-17-blue-doflamingo",
  },
  {
    id: 9,
    title: "Marineford War",
    description:
      "The summit war. Magma versus rubber on the plaza of the strongest. The world is watching.",
    opponentName: "Akainu",
    opponentIcon: "🌋",
    difficulty: "hard",
    aiAggression: 0.9,
    aiStarterId: "st-15-red-newgate",
  },
  {
    id: 10,
    title: "New World Emperor",
    description:
      "The strongest creature in the world awaits at the summit. There is no harder fight in the seas.",
    opponentName: "Kaido",
    opponentIcon: "🐉",
    difficulty: "extreme",
    aiAggression: 1.0,
    aiStarterId: "st-20-yellow-katakuri",
  },
];

export function getAdventureLevel(id: number): AdventureLevel | null {
  return ADVENTURE_LEVELS.find((l) => l.id === id) ?? null;
}
