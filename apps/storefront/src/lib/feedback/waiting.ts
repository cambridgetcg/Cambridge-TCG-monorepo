/**
 * How many messages the feedback door holds and how many wait for the
 * operator (public_feedback, 0149), for /admin/system/monitor. Counts, and
 * ages in whole hours, worked out in the database on its own clock: no
 * message, reference, reply address, name, id or time of arrival is read out.
 * An expired message is not counted, swept yet or not.
 */

/** A message not answered is counted as going soon this many days before it
 * is deleted. */
export const FEEDBACK_EXPIRING_DAYS = 14;

type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/** One row whatever the table holds: counts of nothing are 0, and an age of
 * nothing is null. */
export const FEEDBACK_WAITING_SQL = `SELECT count(*)::int AS held,
    (count(*) FILTER (WHERE status = 'received'))::int AS unread,
    (count(*) FILTER (WHERE status = 'read'))::int AS unanswered,
    (count(*) FILTER (WHERE status IN ('received', 'read') AND expires_at <= now() + interval '${FEEDBACK_EXPIRING_DAYS} days'))::int AS expiring,
    floor(extract(epoch FROM now() - min(received_at) FILTER (WHERE status = 'received')) / 3600)::int AS oldest_unread_hours,
    floor(extract(epoch FROM now() - min(received_at) FILTER (WHERE status = 'read')) / 3600)::int AS oldest_unanswered_hours
  FROM public_feedback WHERE expires_at > now()`;

export interface FeedbackWaiting {
  /** Not expired, whatever their status. */
  held: number;
  /** Arrived and not yet read. */
  unread: number;
  /** Read, and not answered or closed. */
  unanswered: number;
  /** Of unread and unanswered, deleted within FEEDBACK_EXPIRING_DAYS. */
  expiring: number;
  /** Whole hours since the oldest of each arrived; null when there is none. */
  oldestUnreadHours: number | null;
  oldestUnansweredHours: number | null;
}

/** A count as a driver gives it, a whole number or its digits. Anything else
 * throws, so that nothing uncounted is taken for zero. */
export function whole(value: unknown): number {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) throw new TypeError("not a count");
  return number;
}
/** The age of the oldest of some: null when there are none, and only then. */
const age = (count: number, hours: unknown) => (count === 0 && hours === null ? null : whole(hours));

/** Throws when the database does, or answers with anything but counts: a
 * caller never gets a zero that was not counted. */
export async function readFeedbackWaiting(run: RunQuery): Promise<FeedbackWaiting> {
  const row = (await run(FEEDBACK_WAITING_SQL)).rows[0];
  if (!row) throw new TypeError("no counts");
  const unread = whole(row.unread), unanswered = whole(row.unanswered);
  return {
    held: whole(row.held), unread, unanswered, expiring: whole(row.expiring),
    oldestUnreadHours: age(unread, row.oldest_unread_hours), oldestUnansweredHours: age(unanswered, row.oldest_unanswered_hours),
  };
}

/** "under an hour", "5 hours", "98 hours (4 days)". */
export function ageWords(ageHours: number): string {
  if (ageHours < 1) return "under an hour";
  const inHours = `${ageHours.toLocaleString("en-GB")} hour${ageHours === 1 ? "" : "s"}`;
  return ageHours < 48 ? inHours : `${inHours} (${Math.floor(ageHours / 24).toLocaleString("en-GB")} days)`;
}
