import "server-only";
import type { TrailRecord } from "@/lib/rooms/types";

/** Optional paths through reviewed pages. No completion tracking or reward promise. */
export const TRAILS = [
  {
    id: "identify-a-card",
    title: "I found a card. What is it?",
    description: "Move from the object in your hand to a record you can check, then decide what to keep.",
    language: "en",
    editorialState: "published",
    stops: [
      { pageId: "learn.read-card", why: "Find the printed code and separate identity from language, printing and condition." },
      { pageId: "cards.search", why: "Use those details to find a record and inspect whether it matches the card in front of you." },
      { pageId: "sources.variants", why: "Check edition and treatment differences before assuming that two results describe the same printing." },
      { pageId: "collection.portfolio", why: "If you want to keep a record, sign in and describe your own copy rather than changing the shared card identity." },
    ],
  },
  {
    id: "first-game",
    title: "From one card to a first game",
    description: "Let a small explanation become something you can try at the table.",
    language: "en",
    editorialState: "published",
    stops: [
      { pageId: "learn.read-card", why: "Begin with the information carried by one card before learning a whole deck." },
      { pageId: "play.tutorial", why: "Place the card in a turn: see where cards sit and what a player can do." },
      { pageId: "play.practice", why: "Try those decisions in browser practice, with local progress kept separate from server results." },
      { pageId: "play.starters", why: "After trying a turn, look at how a starter deck brings individual cards into a plan." },
    ],
  },
  {
    id: "different-copies",
    title: "Why do two copies look different?",
    description: "Keep printing, physical wear and source observations as separate questions.",
    language: "en",
    editorialState: "published",
    stops: [
      { pageId: "cards.search", why: "Find the available records first so you can compare the identifiers and printing information." },
      { pageId: "sources.variants", why: "Learn which labels describe an edition or treatment rather than wear on a physical copy." },
      { pageId: "learn.condition", why: "Now inspect the copy's edges, surface and corners without treating condition as a new variant." },
      { pageId: "collection.portfolio", why: "Record the copy you own with the distinctions you have checked; source values may still be unknown." },
    ],
  },
] as const satisfies readonly TrailRecord[];
