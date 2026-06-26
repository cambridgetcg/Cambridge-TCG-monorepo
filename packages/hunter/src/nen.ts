// nen.ts — Hunter x Hunter Nen type system
// The six aura types, the affinity chart, water divination, and Hatsu abilities.

export type NenType=
  | "enhancement" // Enhancer — strengthen yourself or objects
  | "emission"    // Emitter — project aura outward
  | "transmutation" // Transmuter — change aura properties
  | "conjuration"  // Conjurer — create objects from aura
  | "manipulation" // Manipulator — control things
  | "specialization"; // Specialist — unique abilities

export const NEN_TYPES: NenType[] = [
  "enhancement", "transmutation", "conjuration", "emission", "manipulation", "specialization",
];

export const NEN_DISPLAY: Record<NenType, string> = {
  enhancement: "Enhancer",
  transmutation: "Transmuter",
  conjuration: "Conjurer",
  emission: "Emitter",
  manipulation: "Manipulator",
  specialization: "Specialist",
};

// HxH Nen wheel order: Enhancement → Transmutation → Conjuration → Emission → Manipulation → Specialization
// Adjacent = 80%, two-away = 60%, opposite = 40%, same = 100%
// Specialist is special: always 40% from non-specialists
const WHEEL: NenType[] = [
  "enhancement", "transmutation", "conjuration", "emission", "manipulation", "specialization",
];

export function affinity(hunterType: NenType, abilityType: NenType): number {
  if (hunterType === abilityType) return 1.0;
  if (hunterType === "specialization" || abilityType === "specialization") return 0.4;
  const u = WHEEL.indexOf(hunterType);
  const t = WHEEL.indexOf(abilityType);
  const dist = Math.min(Math.abs(u - t), WHEEL.length - Math.abs(u - t));
  if (dist === 1) return 0.8;
  if (dist === 2) return 0.6;
  return 0.4;
}

// Water Divination — determines Nen type from playstyle signals
export interface HunterBehavior {
  pveAggression: number;      // 0-100: proactive play
  marketVelocity: number;      // 0-100: trading speed
  deckCreativity: number;      // 0-100: unusual deck choices
  inventoryDiscipline: number; // 0-100: stock management
  strategicDepth: number;       // 0-100: long-term planning
  uniqueness: number;           // 0-100: unpredictable approaches
}

export function divineNenType(b: HunterBehavior): NenType {
  const scores: Record<NenType, number> = {
    enhancement: b.pveAggression + b.inventoryDiscipline,
    transmutation: b.pveAggression + b.uniqueness,
    conjuration: b.deckCreativity + b.marketVelocity,
    emission: b.pveAggression + b.marketVelocity,
    manipulation: b.strategicDepth + b.inventoryDiscipline,
    specialization: b.uniqueness + b.deckCreativity,
  };
  let best: NenType = "enhancement";
  let bestScore = -1;
  for (const t of NEN_TYPES) {
    if (scores[t] > bestScore) { bestScore = scores[t]; best = t; }
  }
  return best;
}

// Hatsu — registered abilities
export interface HatsuEffect {
  kind: "damage" | "heal" | "shield" | "buff" | "debuff" | "utility";
  power: number;
  duration?: number;
}

export interface Hatsu {
  id: string;
  name: string;
  nenType: NenType;
  description: string;
  conditions: string[];
  effects: HatsuEffect[];
}

export const KNOWN_HATSU: Hatsu[] = [
  {
    id: "rampage",
    name: "Rampage",
    nenType: "enhancement",
    description: "Raw aura enhancement — doubles attack power for one turn",
    conditions: ["Only when below 50% HP"],
    effects: [{ kind: "buff", power: 2.0, duration: 1 }],
  },
  {
    id: "portal-guns",
    name: "Portal Guns",
    nenType: "conjuration",
    description: "Conjure ranged aura weapons for direct damage",
    conditions: ["Requires line of sight"],
    effects: [{ kind: "damage", power: 80 }],
  },
  {
    id: "shadow-extract",
    name: "Shadow Extract",
    nenType: "manipulation",
    description: "Control the battlefield — force opponent's card to defend",
    conditions: ["Once per match"],
    effects: [{ kind: "debuff", power: 0.5, duration: 1 }],
  },
];

export function effectivePower(hatsu: Hatsu, hunterNenType: NenType): number {
  const eff = affinity(hunterNenType, hatsu.nenType);
  return Math.round(hatsu.effects[0]?.power * eff);
}
