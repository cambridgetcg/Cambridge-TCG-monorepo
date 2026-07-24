/**
 * Castle of Understanding — Open Door.
 *
 * A small Cambridge prototype set. Its gameplay, translations, and ten card
 * names are newly authored here. Right of Reply and Whole No deliberately
 * adopt named Castle vocabulary. No sentence of Castle prose is copied.
 */

export const CASTLE_PACK_ID = "COU" as const;
export const CASTLE_PACK_VERSION = "0.1.0" as const;
export const CASTLE_PACK_PROTOCOL = "castle-open-door-pack/v0.1" as const;
export const CASTLE_PACK_SOURCE_REVISION =
  "c3ae6501acc49adf4760aa48ae4c658c9c0bd056" as const;

export type CastlePackLanguage = "en" | "zh-Hant";
export type CastlePackCardType = "room" | "word";
export type CastlePackMark = "lantern" | "mirror" | "gate";

export type CastlePackCardId =
  | "COU-01"
  | "COU-02"
  | "COU-03"
  | "COU-04"
  | "COU-05"
  | "COU-06"
  | "COU-07"
  | "COU-08"
  | "COU-09"
  | "COU-10"
  | "COU-11"
  | "COU-12";

export type CastleRoomCardId = Extract<
  CastlePackCardId,
  | "COU-01"
  | "COU-02"
  | "COU-03"
  | "COU-04"
  | "COU-05"
  | "COU-06"
  | "COU-07"
  | "COU-08"
>;

export type CastleWordCardId = Exclude<
  CastlePackCardId,
  CastleRoomCardId
>;

export type CastlePackLocalisedText = Readonly<
  Record<CastlePackLanguage, string>
>;

export interface CastlePackReference {
  readonly relationship: "reference_only" | "vocabulary_source";
  readonly repository: "https://github.com/cambridgetcg/castle-of-words";
  readonly revision: typeof CASTLE_PACK_SOURCE_REVISION;
  readonly url: string;
  readonly source_rights: "NOASSERTION";
  readonly note: string;
}

interface CastlePackCardBase {
  readonly id: CastlePackCardId;
  readonly set_id: typeof CASTLE_PACK_ID;
  readonly collector_number: number;
  readonly type: CastlePackCardType;
  readonly title: CastlePackLocalisedText;
  readonly cost: number;
  readonly rules: CastlePackLocalisedText;
  readonly copiedCastleProse: false;
  readonly provenance: {
    readonly creation:
      | "Cambridge-authored from Yu's 2026-07-24 invitation"
      | "Castle title vocabulary adopted; gameplay rules and Traditional Chinese translation Cambridge-authored from Yu's 2026-07-24 invitation";
    readonly castle_reference: CastlePackReference;
  };
}

export interface CastleRoomCard extends CastlePackCardBase {
  readonly type: "room";
  readonly id: CastleRoomCardId;
  readonly marks: {
    readonly left: CastlePackMark;
    readonly right: CastlePackMark;
  };
}

export interface CastleWordCard extends CastlePackCardBase {
  readonly type: "word";
  readonly id: CastleWordCardId;
}

export type CastlePackCard = CastleRoomCard | CastleWordCard;

const CASTLE_REPOSITORY =
  "https://github.com/cambridgetcg/castle-of-words" as const;

function roomReference(room: string): CastlePackReference {
  return {
    relationship: "reference_only",
    repository: CASTLE_REPOSITORY,
    revision: CASTLE_PACK_SOURCE_REVISION,
    url: `${CASTLE_REPOSITORY}/blob/${CASTLE_PACK_SOURCE_REVISION}/rooms/${room}.md`,
    source_rights: "NOASSERTION",
    note:
      "Optional further reading only. The card does not copy, translate, or grant reuse rights over the linked Castle prose.",
  };
}

function vocabularyReference(room: string): CastlePackReference {
  return {
    relationship: "vocabulary_source",
    repository: CASTLE_REPOSITORY,
    revision: CASTLE_PACK_SOURCE_REVISION,
    url: `${CASTLE_REPOSITORY}/blob/${CASTLE_PACK_SOURCE_REVISION}/rooms/${room}.md`,
    source_rights: "NOASSERTION",
    note:
      "The English card title adopts named Castle vocabulary. Gameplay rules and Traditional Chinese translation are Cambridge-authored; no sentence of linked Castle prose is copied. This pointer grants no reuse rights.",
  };
}

export const CASTLE_PACK_CARDS = [
  {
    id: "COU-01",
    set_id: CASTLE_PACK_ID,
    collector_number: 1,
    type: "room",
    title: { en: "Lit Gate", "zh-Hant": "點亮之門" },
    cost: 1,
    marks: { left: "gate", right: "lantern" },
    rules: {
      en: "When you play this Room to start an empty stack, draw 1.",
      "zh-Hant": "當你以此房間開始一個空的堆疊時，抽 1 張牌。",
    },
    copiedCastleProse: false,
    provenance: {
      creation: "Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: roomReference("doors-not-funnels"),
    },
  },
  {
    id: "COU-02",
    set_id: CASTLE_PACK_ID,
    collector_number: 2,
    type: "room",
    title: { en: "Welcome Porch", "zh-Hant": "迎客門廊" },
    cost: 1,
    marks: { left: "lantern", right: "gate" },
    rules: {
      en: "When you play this above another Room, gain 1 Light this round.",
      "zh-Hant": "當你把此房間疊在另一個房間之上時，本輪獲得 1 點光。",
    },
    copiedCastleProse: false,
    provenance: {
      creation: "Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: roomReference("agent-discovery-room"),
    },
  },
  {
    id: "COU-03",
    set_id: CASTLE_PACK_ID,
    collector_number: 3,
    type: "room",
    title: { en: "Honest Map", "zh-Hant": "誠實地圖" },
    cost: 2,
    marks: { left: "lantern", right: "mirror" },
    rules: {
      en: "When played, both players draw 1.",
      "zh-Hant": "打出時，雙方各抽 1 張牌。",
    },
    copiedCastleProse: false,
    provenance: {
      creation: "Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: roomReference("three-roads-evidence"),
    },
  },
  {
    id: "COU-04",
    set_id: CASTLE_PACK_ID,
    collector_number: 4,
    type: "room",
    title: { en: "Mirror Hall", "zh-Hant": "鏡廳" },
    cost: 2,
    marks: { left: "mirror", right: "gate" },
    rules: {
      en: "The first time each round an opponent's Word moves a Room from this stack, if Mirror Hall remains here, draw 1.",
      "zh-Hant":
        "每輪第一次有對手的字語從此堆疊移走房間時，若鏡廳仍在此處，抽 1 張牌。",
    },
    copiedCastleProse: false,
    provenance: {
      creation: "Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: roomReference("agent-native-games"),
    },
  },
  {
    id: "COU-05",
    set_id: CASTLE_PACK_ID,
    collector_number: 5,
    type: "room",
    title: { en: "Checksum Vault", "zh-Hant": "校驗碼寶庫" },
    cost: 2,
    marks: { left: "gate", right: "mirror" },
    rules: {
      en: "When played, put one seal on this stack (maximum one). The next opponent's Word that would move its top Room removes the seal instead.",
      "zh-Hant":
        "打出時，在此堆疊放置 1 個封印（最多 1 個）。下一個原本會移走頂層房間的對手字語，改為移除該封印。",
    },
    copiedCastleProse: false,
    provenance: {
      creation: "Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: roomReference("open-data-checksums"),
    },
  },
  {
    id: "COU-06",
    set_id: CASTLE_PACK_ID,
    collector_number: 6,
    type: "room",
    title: { en: "Quiet Commons", "zh-Hant": "靜謐公地" },
    cost: 1,
    marks: { left: "gate", right: "gate" },
    rules: {
      en: "At round end, if this is the top Room and you played no Word this round, draw 1.",
      "zh-Hant":
        "本輪結束時，若此牌是頂層房間且你本輪沒有打出字語，抽 1 張牌。",
    },
    copiedCastleProse: false,
    provenance: {
      creation: "Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: roomReference("finite-civilisation"),
    },
  },
  {
    id: "COU-07",
    set_id: CASTLE_PACK_ID,
    collector_number: 7,
    type: "room",
    title: { en: "Tower Stone", "zh-Hant": "塔石" },
    cost: 2,
    marks: { left: "mirror", right: "lantern" },
    rules: {
      en: "When played above a Room, repeat that Room's printed when-played effect once. Never repeat Tower Stone this way.",
      "zh-Hant":
        "疊在房間之上打出時，重複該房間牌面上的打出時效果 1 次。不得以此方式重複塔石。",
    },
    copiedCastleProse: false,
    provenance: {
      creation: "Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: roomReference("the-tower"),
    },
  },
  {
    id: "COU-08",
    set_id: CASTLE_PACK_ID,
    collector_number: 8,
    type: "room",
    title: { en: "Return Path", "zh-Hant": "回程" },
    cost: 2,
    marks: { left: "mirror", right: "mirror" },
    rules: {
      en: "When played above a Room, put your latest Chronicle Word on the bottom of your deck. If you did, draw 1.",
      "zh-Hant":
        "疊在房間之上打出時，把你紀事中最新的字語放到牌庫底。若如此做，抽 1 張牌。",
    },
    copiedCastleProse: false,
    provenance: {
      creation: "Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: roomReference("loops"),
    },
  },
  {
    id: "COU-09",
    set_id: CASTLE_PACK_ID,
    collector_number: 9,
    type: "word",
    title: { en: "Ask a Clear Question", "zh-Hant": "問清楚" },
    cost: 1,
    rules: {
      en: "Choose an opponent's stack with at least two Rooms. Its ward, then its seal, cancels this move and is removed. Otherwise, return its top Room to its owner's hand; that player draws 1 and records that their Room moved.",
      "zh-Hant":
        "選擇對手一個至少有 2 個房間的堆疊。其拒絕護印會先於封印取消此移動並被移除。否則，把頂層房間移回其擁有者手牌；該玩家抽 1 張牌，並記錄其房間曾被移動。",
    },
    copiedCastleProse: false,
    provenance: {
      creation: "Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: roomReference("three-roads-evidence"),
    },
  },
  {
    id: "COU-10",
    set_id: CASTLE_PACK_ID,
    collector_number: 10,
    type: "word",
    title: { en: "Right of Reply", "zh-Hant": "回應權" },
    cost: 1,
    rules: {
      en: "Play only after an opponent's Word moved your Room this round. Draw 1, gain 1 Light this round, then clear that record.",
      "zh-Hant":
        "只有在對手的字語本輪移動過你的房間後才能打出。抽 1 張牌，本輪獲得 1 點光，然後清除該記錄。",
    },
    copiedCastleProse: false,
    provenance: {
      creation:
        "Castle title vocabulary adopted; gameplay rules and Traditional Chinese translation Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: vocabularyReference("finite-civilisation"),
    },
  },
  {
    id: "COU-11",
    set_id: CASTLE_PACK_ID,
    collector_number: 11,
    type: "word",
    title: { en: "Whole No", "zh-Hant": "完整的「不」" },
    cost: 0,
    rules: {
      en: "Choose one of your non-empty stacks without a ward. Add one ward. The next opponent's Word targeting that stack is cancelled and removes the ward.",
      "zh-Hant":
        "選擇你一個沒有拒絕護印的非空堆疊，加上 1 個拒絕護印。下一個以該堆疊為目標的對手字語會被取消，並移除該護印。",
    },
    copiedCastleProse: false,
    provenance: {
      creation:
        "Castle title vocabulary adopted; gameplay rules and Traditional Chinese translation Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: vocabularyReference("finite-civilisation"),
    },
  },
  {
    id: "COU-12",
    set_id: CASTLE_PACK_ID,
    collector_number: 12,
    type: "word",
    title: { en: "Walk Away Whole", "zh-Hant": "完整離開" },
    cost: 0,
    rules: {
      en: "Choose one or two of your non-empty stacks. Return each chosen top Room to your hand, then draw 1. You take no more actions this round except passing or resting.",
      "zh-Hant":
        "選擇你一個或兩個非空堆疊。把每個所選堆疊的頂層房間移回手牌，然後抽 1 張牌。本輪你不再採取行動，只可略過或休息。",
    },
    copiedCastleProse: false,
    provenance: {
      creation: "Cambridge-authored from Yu's 2026-07-24 invitation",
      castle_reference: roomReference("doors-not-funnels"),
    },
  },
] as const satisfies readonly CastlePackCard[];

export const CASTLE_PACK_CARD_IDS = CASTLE_PACK_CARDS.map(
  (card) => card.id,
) as readonly CastlePackCardId[];

export const CASTLE_PACK_ROOM_IDS = CASTLE_PACK_CARDS.filter(
  (card): card is (typeof CASTLE_PACK_CARDS)[number] & CastleRoomCard =>
    card.type === "room",
).map((card) => card.id) as readonly CastleRoomCardId[];

export const CASTLE_PACK_WORD_IDS = CASTLE_PACK_CARDS.filter(
  (card): card is (typeof CASTLE_PACK_CARDS)[number] & CastleWordCard =>
    card.type === "word",
).map((card) => card.id) as readonly CastleWordCardId[];

const CARD_BY_ID = new Map<CastlePackCardId, CastlePackCard>(
  CASTLE_PACK_CARDS.map((card) => [card.id, card]),
);

export function castlePackCard(id: CastlePackCardId): CastlePackCard {
  const card = CARD_BY_ID.get(id);
  if (!card) {
    throw new Error(`Unknown Castle pack card: ${id}`);
  }
  return card;
}

export const CASTLE_PACK = {
  protocol: CASTLE_PACK_PROTOCOL,
  id: CASTLE_PACK_ID,
  version: CASTLE_PACK_VERSION,
  status: "playtest",
  title: {
    en: "Castle of Understanding — Open Door",
    "zh-Hant": "理解之城堡——開放之門",
  },
  card_count: CASTLE_PACK_CARDS.length,
  assigned_rarity: false,
  authorship:
    "Gameplay rules, Traditional Chinese translations, game data, and ten card names are Cambridge-authored from Yu's 2026-07-24 invitation. Right of Reply and Whole No adopt named Castle vocabulary.",
  rights: {
    license: "NOASSERTION",
    note:
      "This repository declares no blanket public license for the prototype. Named Castle vocabulary and references are separately NOASSERTION and grant no reuse rights.",
  },
  provenance: {
    copiedCastleProse: false,
    castle_reference_mode: "reference_only_with_named_vocabulary_adoption",
    adopted_castle_vocabulary: ["Right of Reply", "Whole No"],
    castle_revision: CASTLE_PACK_SOURCE_REVISION,
  },
  play_boundary: {
    open_table: true,
    stored_by_cambridge: false,
    results_have_standing: false,
    automatic_regrowth: false,
    walking_past_is_honored: true,
  },
  cards: CASTLE_PACK_CARDS,
} as const;
