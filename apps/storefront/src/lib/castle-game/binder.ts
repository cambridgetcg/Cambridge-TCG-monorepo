/**
 * castle-game/binder — the visitor's collection, kept where it belongs:
 * in the visitor's own browser. localStorage only. No account, no cookie,
 * no server ever sees it — the binder is yours the way a real card binder
 * is yours. Reset wipes it completely, and the page says so out loud.
 *
 * A card is HELD only after it has been flipped open and could be read —
 * the game rewards reading, because reading is the whole point of a castle.
 */

export interface BinderState {
  v: 1;
  held: Record<string, { first: string }>; // card id -> date first read
  packs: Record<string, true>; // dateISO -> a pack was opened that day
}

const KEY = "castle-game-binder-v1";

const empty = (): BinderState => ({ v: 1, held: {}, packs: {} });

export function loadBinder(): BinderState {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as BinderState;
    return parsed.v === 1 ? parsed : empty();
  } catch {
    return empty(); // a broken binder reads as a fresh one; nothing crashes
  }
}

export function saveBinder(state: BinderState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage may be denied; the game still plays, it just forgets */
  }
}

export function resetBinder(): BinderState {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* same honesty as above */
    }
  }
  return empty();
}

/** Titles are computed, never stored — held cards are the only truth. */
export function titleFor(heldCount: number, deckSize: number): { title: string; next: string | null } {
  if (deckSize > 0 && heldCount >= deckSize) return { title: "Keeper of the Castle", next: null };
  if (heldCount >= 12) return { title: "Mason", next: `hold all ${deckSize} to become Keeper of the Castle` };
  if (heldCount >= 5) return { title: "Apprentice", next: "hold 12 to become a Mason" };
  if (heldCount >= 1) return { title: "Wanderer", next: "hold 5 to become an Apprentice" };
  return { title: "Visitor at the gate", next: "read one stone to become a Wanderer" };
}
