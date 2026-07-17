// Printed card stats for every card referenced by the encoded starter
// decks — the data that makes practice battles rules-real (costs paid,
// power compared) with no database round-trip.
//
// Provenance: researched 2026-07-16 from the official Bandai EN cardlist
// (en.onepiece-cardgame.com/cardlist/) cross-checked per card against
// onepiece.limitlesstcg.com — one research agent per deck plus an
// independent adversarial spot-check; the single discrepancy found
// (P-030 Jinbe counter) was corrected from two agreeing sources.
// Stats are PRINTED values only — no effects, no rulings. A card absent
// from this map degrades honestly: the engine treats its stats as
// unknown, never as zero. Some characters genuinely have no counter
// (e.g. ST01-004 Sanji); those are printed nulls, not gaps.

export interface PrintedCardStats {
  name: string;
  category: "leader" | "character" | "event" | "stage";
  /** DON!! cost. Leaders have none. */
  cost: number | null;
  /** Printed power. Events/stages have none. */
  power: number | null;
  /** Counter value; null when the card has no counter. */
  counter: number | null;
  color: "red" | "green" | "blue" | "purple" | "black" | "yellow";
  /** Leader life — leaders only. */
  life?: number;
}

// Keyed by official card number. 107 cards across ST-01 and ST-15..ST-20.
export const CARD_STATS: Record<string, PrintedCardStats> = {
  "OP01-060": { name: "Donquixote Doflamingo", category: "leader", cost: null, power: 5000, counter: null, color: "blue", life: 5 },
  "OP01-073": { name: "Donquixote Doflamingo", category: "character", cost: 3, power: 4000, counter: 1000, color: "blue" },
  "OP01-086": { name: "Overheat", category: "event", cost: 2, power: null, counter: null, color: "blue" },
  "OP02-001": { name: "Edward.Newgate", category: "leader", cost: null, power: 6000, counter: null, color: "red", life: 6 },
  "OP02-008": { name: "Jozu", category: "character", cost: 4, power: 4000, counter: 2000, color: "red" },
  "OP02-018": { name: "Marco", category: "character", cost: 4, power: 5000, counter: 1000, color: "red" },
  "OP02-019": { name: "Rakuyo", category: "character", cost: 3, power: 4000, counter: 1000, color: "red" },
  "OP02-023": { name: "You May Be a Fool...but I Still Love You", category: "event", cost: 1, power: null, counter: null, color: "red" },
  "OP02-054": { name: "Gecko Moria", category: "character", cost: 4, power: 6000, counter: 1000, color: "blue" },
  "OP02-057": { name: "Bartholomew Kuma", category: "character", cost: 3, power: 3000, counter: 1000, color: "blue" },
  "OP02-093": { name: "Smoker", category: "leader", cost: null, power: 5000, counter: null, color: "black", life: 5 },
  "OP02-098": { name: "Koby", category: "character", cost: 3, power: 4000, counter: 1000, color: "black" },
  "OP02-106": { name: "Tsuru", category: "character", cost: 1, power: 0, counter: 2000, color: "black" },
  "OP02-108": { name: "Donquixote Rosinante", category: "character", cost: 2, power: 2000, counter: 1000, color: "black" },
  "OP02-109": { name: "Jaguar.D.Saul", category: "character", cost: 4, power: 6000, counter: 1000, color: "black" },
  "OP02-113": { name: "Helmeppo", category: "character", cost: 3, power: 3000, counter: 1000, color: "black" },
  "OP02-116": { name: "Yamakaji", category: "character", cost: 3, power: 5000, counter: 1000, color: "black" },
  "OP02-117": { name: "Ice Age", category: "event", cost: 1, power: null, counter: null, color: "black" },
  "OP03-003": { name: "Izo", category: "character", cost: 1, power: 2000, counter: 1000, color: "red" },
  "OP03-006": { name: "Speed Jil", category: "character", cost: 4, power: 6000, counter: 1000, color: "red" },
  "OP03-007": { name: "Namule", category: "character", cost: 3, power: 5000, counter: 1000, color: "red" },
  "OP03-009": { name: "Haruta", category: "character", cost: 2, power: 3000, counter: 1000, color: "red" },
  "OP03-010": { name: "Fossa", category: "character", cost: 2, power: 2000, counter: 1000, color: "red" },
  "OP03-079": { name: "Vergo", category: "character", cost: 5, power: 5000, counter: 2000, color: "black" },
  "OP03-089": { name: "Brannew", category: "character", cost: 2, power: 3000, counter: 1000, color: "black" },
  "OP03-099": { name: "Charlotte Katakuri", category: "leader", cost: null, power: 5000, counter: null, color: "yellow", life: 5 },
  "OP03-106": { name: "Charlotte Opera", category: "character", cost: 4, power: 6000, counter: 1000, color: "yellow" },
  "OP03-107": { name: "Charlotte Galette", category: "character", cost: 2, power: 2000, counter: 1000, color: "yellow" },
  "OP03-110": { name: "Charlotte Smoothie", category: "character", cost: 4, power: 5000, counter: 1000, color: "yellow" },
  "OP03-112": { name: "Charlotte Pudding", category: "character", cost: 1, power: 2000, counter: 1000, color: "yellow" },
  "OP03-115": { name: "Streusen", category: "character", cost: 1, power: 1000, counter: 2000, color: "yellow" },
  "OP03-118": { name: "Ikoku Sovereignty", category: "event", cost: 2, power: null, counter: null, color: "yellow" },
  "OP03-121": { name: "Thunder Bolt", category: "event", cost: 2, power: null, counter: null, color: "yellow" },
  "OP05-060": { name: "Monkey.D.Luffy", category: "leader", cost: null, power: 5000, counter: null, color: "purple", life: 5 },
  "OP05-061": { name: "Uso-Hachi", category: "character", cost: 3, power: 4000, counter: 2000, color: "purple" },
  "OP05-063": { name: "O-Robi", category: "character", cost: 4, power: 5000, counter: 1000, color: "purple" },
  "OP05-066": { name: "Jinbe", category: "character", cost: 5, power: 6000, counter: 1000, color: "purple" },
  "OP05-067": { name: "Zoro-Juurou", category: "character", cost: 3, power: 4000, counter: 1000, color: "purple" },
  "OP05-068": { name: "Chopa-Emon", category: "character", cost: 2, power: 3000, counter: 1000, color: "purple" },
  "OP05-070": { name: "Fra-Nosuke", category: "character", cost: 5, power: 4000, counter: 2000, color: "purple" },
  "OP05-072": { name: "Hone-Kichi", category: "character", cost: 4, power: 6000, counter: null, color: "purple" },
  "OP05-076": { name: "When You're at Sea You Fight against Pirates!!", category: "event", cost: 1, power: null, counter: null, color: "purple" },
  "P-029": { name: "Bartolomeo", category: "character", cost: 2, power: 3000, counter: 1000, color: "green" },
  "P-030": { name: "Jinbe", category: "character", cost: 4, power: 5000, counter: 1000, color: "blue" },
  "P-041": { name: "Monkey.D.Luffy", category: "character", cost: 10, power: 12000, counter: 1000, color: "purple" },
  "P-057": { name: "Fleeting Lullaby", category: "event", cost: 3, power: null, counter: null, color: "green" },
  "P-058": { name: "Where the Wind Blows", category: "event", cost: 2, power: null, counter: null, color: "green" },
  "P-059": { name: "The World's Continuation", category: "event", cost: 2, power: null, counter: null, color: "green" },
  "P-060": { name: "Tot Musica", category: "event", cost: 2, power: null, counter: null, color: "green" },
  "P-061": { name: "Monkey.D.Luffy", category: "character", cost: 8, power: 10000, counter: 1000, color: "green" },
  "ST01-001": { name: "Monkey.D.Luffy", category: "leader", cost: null, power: 5000, counter: null, color: "red", life: 5 },
  "ST01-002": { name: "Usopp", category: "character", cost: 2, power: 2000, counter: 1000, color: "red" },
  "ST01-003": { name: "Karoo", category: "character", cost: 1, power: 3000, counter: 1000, color: "red" },
  "ST01-004": { name: "Sanji", category: "character", cost: 2, power: 4000, counter: null, color: "red" },
  "ST01-005": { name: "Jinbe", category: "character", cost: 3, power: 5000, counter: null, color: "red" },
  "ST01-006": { name: "Tony Tony.Chopper", category: "character", cost: 1, power: 1000, counter: null, color: "red" },
  "ST01-007": { name: "Nami", category: "character", cost: 1, power: 1000, counter: 1000, color: "red" },
  "ST01-008": { name: "Nico Robin", category: "character", cost: 3, power: 5000, counter: 1000, color: "red" },
  "ST01-009": { name: "Nefeltari Vivi", category: "character", cost: 2, power: 4000, counter: 1000, color: "red" },
  "ST01-010": { name: "Franky", category: "character", cost: 4, power: 6000, counter: 1000, color: "red" },
  "ST01-011": { name: "Brook", category: "character", cost: 2, power: 3000, counter: 2000, color: "red" },
  "ST01-012": { name: "Monkey.D.Luffy", category: "character", cost: 5, power: 6000, counter: null, color: "red" },
  "ST01-013": { name: "Roronoa Zoro", category: "character", cost: 3, power: 5000, counter: null, color: "red" },
  "ST01-014": { name: "Guard Point", category: "event", cost: 1, power: null, counter: null, color: "red" },
  "ST01-015": { name: "Gum-Gum Jet Pistol", category: "event", cost: 4, power: null, counter: null, color: "red" },
  "ST01-016": { name: "Diable Jambe", category: "event", cost: 1, power: null, counter: null, color: "red" },
  "ST01-017": { name: "Thousand Sunny", category: "stage", cost: 2, power: null, counter: null, color: "red" },
  "ST03-002": { name: "Edward.Weevil", category: "character", cost: 3, power: 5000, counter: 1000, color: "blue" },
  "ST03-004": { name: "Gecko Moria", category: "character", cost: 4, power: 5000, counter: 1000, color: "blue" },
  "ST03-005": { name: "Dracule Mihawk", category: "character", cost: 4, power: 5000, counter: 2000, color: "blue" },
  "ST03-008": { name: "Trafalgar Law", category: "character", cost: 1, power: 1000, counter: null, color: "blue" },
  "ST07-005": { name: "Charlotte Daifuku", category: "character", cost: 4, power: 5000, counter: 1000, color: "yellow" },
  "ST07-014": { name: "Pekoms", category: "character", cost: 3, power: 5000, counter: 1000, color: "yellow" },
  "ST11-001": { name: "Uta", category: "leader", cost: null, power: 5000, counter: null, color: "green", life: 5 },
  "ST11-003": { name: "Backlight", category: "event", cost: 2, power: null, counter: null, color: "green" },
  "ST11-004": { name: "New Genesis", category: "event", cost: 1, power: null, counter: null, color: "green" },
  "ST11-005": { name: "I'm invincible", category: "event", cost: 3, power: null, counter: null, color: "green" },
  "ST15-001": { name: "Atmos", category: "character", cost: 4, power: 5000, counter: 1000, color: "red" },
  "ST15-002": { name: "Edward.Newgate", category: "character", cost: 7, power: 8000, counter: null, color: "red" },
  "ST15-003": { name: "Kingdew", category: "character", cost: 3, power: 4000, counter: 1000, color: "red" },
  "ST15-004": { name: "Thatch", category: "character", cost: 1, power: 2000, counter: 2000, color: "red" },
  "ST15-005": { name: "Portgas.D.Ace", category: "character", cost: 5, power: 6000, counter: 1000, color: "red" },
  "ST16-001": { name: "Uta", category: "character", cost: 4, power: 6000, counter: null, color: "green" },
  "ST16-002": { name: "Gordon", category: "character", cost: 2, power: 0, counter: 1000, color: "green" },
  "ST16-003": { name: "Charlotte Katakuri", category: "character", cost: 3, power: 4000, counter: 1000, color: "green" },
  "ST16-004": { name: "Shanks", category: "character", cost: 9, power: 11000, counter: null, color: "green" },
  "ST16-005": { name: "Monkey.D.Luffy", category: "character", cost: 2, power: 3000, counter: 2000, color: "green" },
  "ST17-001": { name: "Crocodile", category: "character", cost: 4, power: 5000, counter: 1000, color: "blue" },
  "ST17-002": { name: "Trafalgar Law", category: "character", cost: 4, power: 5000, counter: 1000, color: "blue" },
  "ST17-003": { name: "Buggy", category: "character", cost: 1, power: 2000, counter: 2000, color: "blue" },
  "ST17-004": { name: "Boa Hancock", category: "character", cost: 4, power: 6000, counter: null, color: "blue" },
  "ST17-005": { name: "Marshall.D.Teach", category: "character", cost: 2, power: 3000, counter: 1000, color: "blue" },
  "ST18-001": { name: "Uso-Hachi", category: "character", cost: 3, power: 3000, counter: 2000, color: "purple" },
  "ST18-002": { name: "O-Nami", category: "character", cost: 4, power: 2000, counter: 1000, color: "purple" },
  "ST18-003": { name: "San-Gorou", category: "character", cost: 5, power: 6000, counter: 1000, color: "purple" },
  "ST18-004": { name: "Zoro-Juurou", category: "character", cost: 4, power: 6000, counter: null, color: "purple" },
  "ST18-005": { name: "Luffy-Tarou", category: "character", cost: 7, power: 8000, counter: null, color: "purple" },
  "ST19-001": { name: "Smoker", category: "character", cost: 6, power: 8000, counter: null, color: "black" },
  "ST19-002": { name: "Sengoku", category: "character", cost: 1, power: 1000, counter: 1000, color: "black" },
  "ST19-003": { name: "Tashigi", category: "character", cost: 5, power: 6000, counter: 1000, color: "black" },
  "ST19-004": { name: "Hina", category: "character", cost: 4, power: 6000, counter: null, color: "black" },
  "ST19-005": { name: "Monkey.D.Garp", category: "character", cost: 3, power: 4000, counter: 1000, color: "black" },
  "ST20-001": { name: "Charlotte Katakuri", category: "character", cost: 5, power: 6000, counter: 1000, color: "yellow" },
  "ST20-002": { name: "Charlotte Cracker", category: "character", cost: 4, power: 5000, counter: 1000, color: "yellow" },
  "ST20-003": { name: "Charlotte Brulee", category: "character", cost: 3, power: 3000, counter: 2000, color: "yellow" },
  "ST20-004": { name: "Charlotte Pudding", category: "character", cost: 3, power: 2000, counter: 1000, color: "yellow" },
  "ST20-005": { name: "Charlotte Linlin", category: "character", cost: 6, power: 7000, counter: null, color: "yellow" },
};

export function statsFor(cardNumber: string): PrintedCardStats | null {
  return CARD_STATS[cardNumber] ?? null;
}
