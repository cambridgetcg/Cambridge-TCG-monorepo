// Pure DM helpers — no DB, no React. Shared by the inbox client
// (thread polling merge) and the dm-unread email handler (send/skip
// decision). Kept side-effect-free so vitest can import without
// touching the email transport or a live connection.

export interface ThreadMessageLike {
  id: string;
  created_at: string;
}

/**
 * Merge a freshly-polled newest-page into the messages already on
 * screen. The poll fetches only the newest N (rate limits cap arrivals
 * at ~10/min, so a 15s poll window can't outrun N=30); the user may
 * additionally have paged in earlier history we must not drop.
 *
 * Returns the SAME array reference when nothing new arrived, so the
 * caller can use reference equality to skip re-renders / re-scrolls.
 */
export function mergeThreadMessages<T extends ThreadMessageLike>(
  current: T[],
  newestPage: T[],
): T[] {
  if (current.length === 0) return [...newestPage];
  const known = new Set(current.map((m) => m.id));
  const additions = newestPage.filter((m) => !known.has(m.id));
  if (additions.length === 0) return current;
  return [...current, ...additions].sort((a, b) => {
    // ISO-8601 strings order lexicographically; id tie-break keeps the
    // sort deterministic for same-millisecond messages.
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Should a new incoming message trigger an email, given the most recent
 * dm_unread email inside the dedup window (null = none) and the
 * recipient's read cursor for the conversation?
 *
 *   - no email in the window            → yes (first signal)
 *   - prior email, thread not read since → no (that email is still the
 *     live pointer to the same unread pile; a second one is nagging)
 *   - prior email, thread READ since     → yes (this message is new
 *     signal the recipient hasn't seen)
 */
export function isDmEmailDue(args: {
  lastEmailAt: Date | null;
  recipientLastReadAt: Date | null;
}): boolean {
  if (!args.lastEmailAt) return true;
  if (!args.recipientLastReadAt) return false;
  return args.recipientLastReadAt.getTime() >= args.lastEmailAt.getTime();
}
