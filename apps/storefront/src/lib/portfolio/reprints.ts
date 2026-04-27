// Reprint / rotation risk announcements.
//
// Admin-curated feed (no scrape pipeline yet — would be a v2). The
// intent is that a CTCG admin spots a major-publisher reprint or
// rotation announcement (Pokémon set rotation, One Piece reprint
// promo, Magic Standard rotation, Yu-Gi-Oh banlist) and creates an
// announcement scoped by SKU, set, or pattern. The system then:
//
//   1. Finds every portfolio_cards holder of matching SKUs
//   2. Sends one in-app notification per holder (deduped via
//      reprint_notifications_sent so admin edits don't re-spam)
//   3. Logs an admin governance entry for the creation event
//
// The risk-flags aggregator (risk-flags.ts) reads from this table to
// surface live warnings on the holder's portfolio dashboard alongside
// liquidity + concentration warnings.

import { query } from "@/lib/db";
import { notify } from "@/lib/notifications/db";
import { logAdminAction } from "@/lib/admin/governance-log";

export type ReprintSeverity = "low" | "medium" | "high";
export type ReprintStatus = "active" | "realized" | "cancelled";

export interface ReprintAnnouncement {
  id: string;
  sku: string | null;
  set_code: string | null;
  card_match_query: string | null;
  title: string;
  source_url: string | null;
  admin_notes: string | null;
  severity: ReprintSeverity;
  status: ReprintStatus;
  expected_release_date: string | null;
  created_by_admin: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateInput {
  scope:
    | { kind: "sku"; sku: string }
    | { kind: "set"; setCode: string }
    | { kind: "pattern"; query: string };
  title: string;
  severity?: ReprintSeverity;
  expectedReleaseDate?: string | null;  // YYYY-MM-DD
  sourceUrl?: string;
  adminNotes?: string;
  createdByAdmin: string;
}

export async function createReprintAnnouncement(input: CreateInput): Promise<{
  ok: true;
  announcement: ReprintAnnouncement;
  affectedUsers: number;
} | { ok: false; reason: string }> {
  const title = (input.title ?? "").trim();
  if (!title || title.length > 200) {
    return { ok: false, reason: "title required (1-200 chars)." };
  }
  const severity = input.severity ?? "medium";
  if (!["low", "medium", "high"].includes(severity)) {
    return { ok: false, reason: "severity must be low/medium/high." };
  }

  const sku = input.scope.kind === "sku" ? input.scope.sku.trim() : null;
  const setCode = input.scope.kind === "set" ? input.scope.setCode.trim() : null;
  const pattern = input.scope.kind === "pattern" ? input.scope.query.trim() : null;
  if (!sku && !setCode && !pattern) {
    return { ok: false, reason: "scope required (sku, set, or pattern)." };
  }
  // Pattern sanity check — a one-character LIKE would match every
  // card and DOS the notify fan-out.
  if (pattern !== null && pattern.length < 3) {
    return { ok: false, reason: "pattern must be at least 3 characters." };
  }

  const r = await query(
    `INSERT INTO reprint_announcements
       (sku, set_code, card_match_query, title, source_url, admin_notes,
        severity, expected_release_date, created_by_admin)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [sku, setCode, pattern, title, input.sourceUrl?.trim() || null,
     input.adminNotes?.trim() || null, severity,
     input.expectedReleaseDate || null, input.createdByAdmin],
  );
  const announcement = r.rows[0] as ReprintAnnouncement;

  const affected = await notifyAffectedHolders(announcement);

  // Governance log — admins can spot misuse of the feed (e.g. an
  // accidental high-severity announcement spammed N users) by
  // querying the admin_actions_log for action='reprint.created'.
  void logAdminAction({
    actorLabel: input.createdByAdmin,
    targetUserId: null,
    targetKind: "reprint_announcement",
    targetId: announcement.id,
    action: "reprint.created",
    afterValue: {
      scope: input.scope.kind,
      severity,
      affected_users: affected,
      title,
    },
    reason: input.adminNotes ?? null,
  });

  return { ok: true, announcement, affectedUsers: affected };
}

// ── Notify fan-out ──
//
// Idempotent via the reprint_notifications_sent table. Re-running this
// after an admin edit (severity bump, etc) won't double-notify users
// who already heard about it. To re-notify on a severity bump we'd
// add a (announcement_id, user_id, severity) tuple — out of scope.

export async function notifyAffectedHolders(announcement: ReprintAnnouncement): Promise<number> {
  let holders: { user_id: string; sku: string; card_name: string | null; quantity: number }[];

  if (announcement.sku) {
    const r = await query(
      `SELECT user_id, sku, card_name, quantity
         FROM portfolio_cards
        WHERE sku = $1 AND quantity > 0`,
      [announcement.sku],
    );
    holders = r.rows;
  } else if (announcement.set_code) {
    const r = await query(
      `SELECT user_id, sku, card_name, quantity
         FROM portfolio_cards
        WHERE set_code = $1 AND quantity > 0`,
      [announcement.set_code],
    );
    holders = r.rows;
  } else if (announcement.card_match_query) {
    const r = await query(
      `SELECT user_id, sku, card_name, quantity
         FROM portfolio_cards
        WHERE card_name ILIKE $1 AND quantity > 0`,
      [`%${announcement.card_match_query}%`],
    );
    holders = r.rows;
  } else {
    return 0;
  }

  // Group by user — one notification per affected user even if they
  // hold multiple matching SKUs. The notification body lists the
  // first 3 cards, with a "+N more" suffix.
  const byUser = new Map<string, { card_name: string | null; sku: string; quantity: number }[]>();
  for (const h of holders) {
    const arr = byUser.get(h.user_id) ?? [];
    arr.push({ card_name: h.card_name, sku: h.sku, quantity: h.quantity });
    byUser.set(h.user_id, arr);
  }

  let notified = 0;
  const sevLabel = announcement.severity === "high" ? "⚠️ "
                 : announcement.severity === "medium" ? "" : "";
  const dateLabel = announcement.expected_release_date
    ? ` Expected ${announcement.expected_release_date}.`
    : "";

  for (const [userId, cards] of byUser) {
    // Atomic insert of the dedup row — if we've notified this user
    // already, the PRIMARY KEY conflict short-circuits.
    const dedup = await query(
      `INSERT INTO reprint_notifications_sent (announcement_id, user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING
       RETURNING user_id`,
      [announcement.id, userId],
    );
    if (dedup.rows.length === 0) continue;

    const labels = cards.slice(0, 3).map((c) => c.card_name || c.sku);
    const more = cards.length > 3 ? ` +${cards.length - 3} more` : "";
    await notify({
      userId,
      kind: "portfolio.reprint_warning",
      title: `${sevLabel}Reprint risk: ${announcement.title}`,
      body: `Affects your holdings: ${labels.join(", ")}${more}.${dateLabel} Review your position before market reacts.`,
      linkUrl: "/account/portfolio/risk",
      referenceType: "reprint_announcement",
      referenceId: announcement.id,
    }).catch((err) => console.error("[reprint] notify failed:", err));
    notified++;
  }

  return notified;
}

// ── Read-side ──

export async function listActiveReprintAnnouncements(): Promise<ReprintAnnouncement[]> {
  const r = await query(
    `SELECT * FROM reprint_announcements
      WHERE status = 'active'
      ORDER BY severity = 'high' DESC,
               severity = 'medium' DESC,
               COALESCE(expected_release_date, created_at::date + INTERVAL '365 days')`,
  );
  return r.rows as ReprintAnnouncement[];
}

// Returns the active announcements that touch any of the user's
// holdings. Used by the risk-flags aggregator and the holder-facing
// /api/account/portfolio/risk endpoint.
export async function reprintsForHolder(userId: string): Promise<{
  announcement: ReprintAnnouncement;
  affected_skus: string[];
}[]> {
  const r = await query(
    `SELECT ra.*, pc.sku AS holder_sku
       FROM reprint_announcements ra
       JOIN portfolio_cards pc ON pc.user_id = $1 AND pc.quantity > 0
        AND (
              (ra.sku IS NOT NULL AND ra.sku = pc.sku)
           OR (ra.set_code IS NOT NULL AND ra.set_code = pc.set_code)
           OR (ra.card_match_query IS NOT NULL AND pc.card_name ILIKE '%' || ra.card_match_query || '%')
        )
      WHERE ra.status = 'active'
      ORDER BY ra.severity = 'high' DESC,
               ra.severity = 'medium' DESC,
               ra.expected_release_date NULLS LAST`,
    [userId],
  );

  const grouped = new Map<string, { announcement: ReprintAnnouncement; affected_skus: Set<string> }>();
  for (const row of r.rows) {
    const id = row.id as string;
    const existing = grouped.get(id);
    if (existing) {
      existing.affected_skus.add(row.holder_sku);
    } else {
      const { holder_sku, ...announcementCols } = row;
      void holder_sku;
      grouped.set(id, {
        announcement: announcementCols as ReprintAnnouncement,
        affected_skus: new Set([row.holder_sku]),
      });
    }
  }
  return Array.from(grouped.values()).map((g) => ({
    announcement: g.announcement,
    affected_skus: Array.from(g.affected_skus),
  }));
}

// ── Admin updates ──

export async function setReprintStatus(
  id: string,
  status: ReprintStatus,
  adminLabel: string,
  reason?: string,
): Promise<ReprintAnnouncement | null> {
  const before = await query(
    `SELECT status FROM reprint_announcements WHERE id = $1`,
    [id],
  );
  if (before.rows.length === 0) return null;

  const r = await query(
    `UPDATE reprint_announcements
        SET status = $2, updated_at = NOW()
      WHERE id = $1 RETURNING *`,
    [id, status],
  );

  void logAdminAction({
    actorLabel: adminLabel,
    targetUserId: null,
    targetKind: "reprint_announcement",
    targetId: id,
    action: `reprint.${status}`,
    beforeValue: { status: before.rows[0].status },
    afterValue: { status },
    reason: reason ?? null,
  });

  return r.rows[0] as ReprintAnnouncement;
}
