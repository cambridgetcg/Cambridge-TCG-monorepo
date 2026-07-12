import { query, transaction } from "@/lib/db";
import { toPublicCollectorPassport } from "./public";
import {
  toPortablePassportHoldings,
  type PortablePassportHolding,
  type PortablePassportSourceRow,
} from "./export";
import {
  COLLECTOR_PASSPORT_LABEL_MAX,
  COLLECTOR_PASSPORT_MAX_PUBLISHED,
  COLLECTOR_PASSPORT_NOTICE_VERSION,
  COLLECTOR_PASSPORT_STORY_MAX,
  type OwnerPassport,
  type OwnerPassportItem,
  type PassportMutationResult,
  type PublishedPassportRow,
  type PublicCollectorPassport,
} from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  return label && label.length <= COLLECTOR_PASSPORT_LABEL_MAX ? label : null;
}

function normalizeStory(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const story = value.trim();
  if (!story) return null;
  return story.length <= COLLECTOR_PASSPORT_STORY_MAX ? story : undefined;
}

export async function getOwnerPassport(userId: string): Promise<OwnerPassport> {
  const [profile, items] = await Promise.all([
    query(`SELECT is_public FROM users WHERE id = $1`, [userId]),
    query(
      `SELECT s.id AS showcase_id, s.portfolio_card_id, s.display_order,
              s.caption, s.public_label, s.public_story, s.passport_public,
              s.passport_published_at, s.passport_notice_version,
              p.card_name, p.set_name, p.image_url
         FROM showcase_cards s
         JOIN portfolio_cards p
           ON p.id = s.portfolio_card_id AND p.user_id = s.user_id
        WHERE s.user_id = $1
        ORDER BY s.display_order ASC, s.created_at ASC`,
      [userId],
    ),
  ]);

  const ownerItems: OwnerPassportItem[] = items.rows.map((row) => ({
    showcase_id: row.showcase_id,
    portfolio_card_id: row.portfolio_card_id,
    display_order: Number(row.display_order),
    caption: row.caption ?? null,
    public_label: row.public_label ?? null,
    public_story: row.public_story ?? null,
    passport_public: row.passport_public === true,
    passport_current:
      row.passport_public === true &&
      row.passport_notice_version === COLLECTOR_PASSPORT_NOTICE_VERSION,
    passport_published_at: row.passport_published_at ?? null,
    passport_notice_version: row.passport_notice_version ?? null,
    private_card: {
      card_name: row.card_name ?? null,
      set_name: row.set_name ?? null,
      image_url: row.image_url ?? null,
    },
  }));

  return {
    profile_public: profile.rows[0]?.is_public === true,
    notice_version: COLLECTOR_PASSPORT_NOTICE_VERSION,
    max_published: COLLECTOR_PASSPORT_MAX_PUBLISHED,
    published_count: ownerItems.filter(
      (item) =>
        item.passport_current,
    ).length,
    items: ownerItems,
  };
}

export async function publishPassportItem(input: {
  userId: string;
  portfolioCardId: string;
  publicLabel: unknown;
  publicStory: unknown;
  noticeVersion: unknown;
}): Promise<PassportMutationResult<OwnerPassportItem>> {
  if (!UUID_RE.test(input.portfolioCardId)) {
    return { ok: false, status: 404, code: "not_found", reason: "Passport item not found." };
  }
  const label = normalizeLabel(input.publicLabel);
  const story = normalizeStory(input.publicStory);
  if (!label) {
    return {
      ok: false,
      status: 400,
      code: "invalid_label",
      reason: `Public label must be 1-${COLLECTOR_PASSPORT_LABEL_MAX} characters.`,
    };
  }
  if (story === undefined) {
    return {
      ok: false,
      status: 400,
      code: "invalid_story",
      reason: `Public story must be ${COLLECTOR_PASSPORT_STORY_MAX} characters or fewer.`,
    };
  }
  if (input.noticeVersion !== COLLECTOR_PASSPORT_NOTICE_VERSION) {
    return {
      ok: false,
      status: 409,
      code: "stale_notice",
      reason: "Review the current Collector Passport publication notice.",
    };
  }

  return transaction(async (tx) => {
    const owner = await tx(
      `SELECT u.id, u.is_public,
              COALESCE(tp.is_suspended, FALSE) AS is_suspended
         FROM users u
         LEFT JOIN trust_profiles tp ON tp.user_id = u.id
        WHERE u.id = $1
        FOR UPDATE OF u`,
      [input.userId],
    );
    if (!owner.rows[0]) {
      return { ok: false, status: 404, code: "not_found", reason: "Passport item not found." };
    }
    if (!owner.rows[0].is_public) {
      return {
        ok: false,
        status: 409,
        code: "public_profile_required",
        reason: "Make your profile public before publishing Passport items.",
      };
    }
    if (owner.rows[0].is_suspended) {
      return {
        ok: false,
        status: 403,
        code: "account_suspended",
        reason: "Passport publication is unavailable while the account is suspended.",
      };
    }

    const selected = await tx(
      `SELECT s.id, s.portfolio_card_id, s.display_order, s.caption,
              s.public_label, s.public_story, s.passport_public,
              s.passport_published_at, s.passport_notice_version,
              s.public_id, p.card_name, p.set_name, p.image_url
         FROM showcase_cards s
         JOIN portfolio_cards p
           ON p.id = s.portfolio_card_id AND p.user_id = s.user_id
        WHERE s.user_id = $1 AND s.portfolio_card_id = $2
        FOR UPDATE OF s`,
      [input.userId, input.portfolioCardId],
    );
    const item = selected.rows[0];
    if (!item) {
      return { ok: false, status: 404, code: "not_found", reason: "Passport item not found." };
    }

    const alreadyCurrent =
      item.passport_public === true &&
      item.passport_notice_version === COLLECTOR_PASSPORT_NOTICE_VERSION;
    if (!alreadyCurrent) {
      const count = await tx(
        `SELECT COUNT(*)::int AS n
           FROM showcase_cards
          WHERE user_id = $1
            AND passport_public = TRUE
            AND portfolio_card_id <> $2
            AND passport_notice_version = $3`,
        [input.userId, input.portfolioCardId, COLLECTOR_PASSPORT_NOTICE_VERSION],
      );
      if (Number(count.rows[0]?.n ?? 0) >= COLLECTOR_PASSPORT_MAX_PUBLISHED) {
        return {
          ok: false,
          status: 409,
          code: "passport_full",
          reason: `Publish up to ${COLLECTOR_PASSPORT_MAX_PUBLISHED} Passport items. Withdraw one first.`,
        };
      }
    }

    const updated = await tx(
      `UPDATE showcase_cards
          SET public_label = $3,
              public_story = $4,
              passport_public = TRUE,
              passport_published_at = CASE
                WHEN passport_public = TRUE AND passport_notice_version = $5
                  THEN passport_published_at
                ELSE NOW()
              END,
              passport_notice_version = $5,
              public_id = CASE
                WHEN passport_public = TRUE AND passport_notice_version = $5
                  THEN public_id
                ELSE gen_random_uuid()
              END,
              updated_at = NOW()
        WHERE user_id = $1 AND portfolio_card_id = $2
        RETURNING id, portfolio_card_id, display_order, caption,
                  public_label, public_story, passport_public,
                  passport_published_at, passport_notice_version, public_id`,
      [
        input.userId,
        input.portfolioCardId,
        label,
        story,
        COLLECTOR_PASSPORT_NOTICE_VERSION,
      ],
    );
    const row = updated.rows[0];

    if (!alreadyCurrent) {
      await tx(
        `INSERT INTO collector_passport_publication_log
           (showcase_card_id, public_id, actor_user_id, action, notice_version)
         VALUES ($1, $2, $3, 'published', $4)`,
        [row.id, row.public_id, input.userId, COLLECTOR_PASSPORT_NOTICE_VERSION],
      );
    }

    return {
      ok: true,
      value: {
        showcase_id: row.id,
        portfolio_card_id: row.portfolio_card_id,
        display_order: Number(row.display_order),
        caption: row.caption ?? null,
        public_label: row.public_label,
        public_story: row.public_story ?? null,
        passport_public: true,
        passport_current: true,
        passport_published_at: row.passport_published_at,
        passport_notice_version: row.passport_notice_version,
        private_card: {
          card_name: item.card_name ?? null,
          set_name: item.set_name ?? null,
          image_url: item.image_url ?? null,
        },
      },
    };
  });
}

export async function withdrawPassportItem(input: {
  userId: string;
  portfolioCardId: string;
}): Promise<PassportMutationResult<OwnerPassportItem>> {
  if (!UUID_RE.test(input.portfolioCardId)) {
    return { ok: false, status: 404, code: "not_found", reason: "Passport item not found." };
  }
  return transaction(async (tx) => {
    await tx(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [input.userId]);
    const selected = await tx(
      `SELECT s.id, s.portfolio_card_id, s.display_order, s.caption,
              s.public_label, s.public_story, s.passport_public,
              s.passport_published_at, s.passport_notice_version,
              s.public_id, p.card_name, p.set_name, p.image_url
         FROM showcase_cards s
         JOIN portfolio_cards p
           ON p.id = s.portfolio_card_id AND p.user_id = s.user_id
        WHERE s.user_id = $1 AND s.portfolio_card_id = $2
        FOR UPDATE OF s`,
      [input.userId, input.portfolioCardId],
    );
    const item = selected.rows[0];
    if (!item) {
      return { ok: false, status: 404, code: "not_found", reason: "Passport item not found." };
    }

    if (item.passport_public) {
      await tx(
        `INSERT INTO collector_passport_publication_log
           (showcase_card_id, public_id, actor_user_id, action, notice_version)
         VALUES ($1, $2, $3, 'withdrawn', $4)`,
        [
          item.id,
          item.public_id,
          input.userId,
          item.passport_notice_version ?? COLLECTOR_PASSPORT_NOTICE_VERSION,
        ],
      );
      await tx(
        `UPDATE showcase_cards
            SET passport_public = FALSE,
                passport_published_at = NULL,
                passport_notice_version = NULL,
                updated_at = NOW()
          WHERE id = $1 AND user_id = $2`,
        [item.id, input.userId],
      );
    }

    return {
      ok: true,
      value: {
        showcase_id: item.id,
        portfolio_card_id: item.portfolio_card_id,
        display_order: Number(item.display_order),
        caption: item.caption ?? null,
        public_label: item.public_label ?? null,
        public_story: item.public_story ?? null,
        passport_public: false,
        passport_current: false,
        passport_published_at: null,
        passport_notice_version: null,
        private_card: {
          card_name: item.card_name ?? null,
          set_name: item.set_name ?? null,
          image_url: item.image_url ?? null,
        },
      },
    };
  });
}

export async function reorderPassportDrafts(input: {
  userId: string;
  portfolioCardIds: unknown;
}): Promise<PassportMutationResult<{ reordered: true }>> {
  if (
    !Array.isArray(input.portfolioCardIds) ||
    input.portfolioCardIds.length > 100 ||
    input.portfolioCardIds.some((id) => typeof id !== "string" || !UUID_RE.test(id)) ||
    new Set(input.portfolioCardIds).size !== input.portfolioCardIds.length
  ) {
    return {
      ok: false,
      status: 400,
      code: "invalid_order",
      reason: "Order must contain each Passport draft exactly once.",
    };
  }
  const ids = input.portfolioCardIds as string[];

  return transaction(async (tx) => {
    await tx(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [input.userId]);
    const current = await tx(
      `SELECT portfolio_card_id
         FROM showcase_cards
        WHERE user_id = $1
        ORDER BY display_order ASC, created_at ASC
        FOR UPDATE`,
      [input.userId],
    );
    const currentIds = current.rows.map((row) => String(row.portfolio_card_id));
    if (
      currentIds.length !== ids.length ||
      currentIds.some((id) => !ids.includes(id))
    ) {
      return {
        ok: false,
        status: 409,
        code: "order_changed",
        reason: "Passport drafts changed. Refresh before reordering.",
      };
    }

    if (ids.length > 0) {
      await tx(
        `WITH desired AS (
           SELECT portfolio_card_id, ordinality - 1 AS display_order
             FROM unnest($2::uuid[]) WITH ORDINALITY AS item(portfolio_card_id, ordinality)
         )
         UPDATE showcase_cards AS showcase
            SET display_order = desired.display_order,
                updated_at = NOW()
           FROM desired
          WHERE showcase.user_id = $1
            AND showcase.portfolio_card_id = desired.portfolio_card_id`,
        [input.userId, ids],
      );
    }
    return { ok: true, value: { reordered: true } };
  });
}

/**
 * Owner portability projection. Catalog-resolved display fields deliberately
 * stay out: this archive carries only the Cambridge SKU plus holding facts and
 * text recorded for this account.
 */
export async function getPortablePassportHoldings(
  userId: string,
): Promise<PortablePassportHolding[]> {
  const result = await query(
    `SELECT p.sku, p.condition, p.quantity,
            p.acquisition_price::text, p.acquired_at::text, p.notes,
            p.created_at, p.updated_at,
            s.public_label, s.public_story, s.passport_public
       FROM portfolio_cards p
       LEFT JOIN showcase_cards s
         ON s.portfolio_card_id = p.id AND s.user_id = p.user_id
      WHERE p.user_id = $1
      ORDER BY p.created_at ASC, p.sku ASC, p.condition ASC`,
    [userId],
  );
  return toPortablePassportHoldings(result.rows as PortablePassportSourceRow[]);
}

export async function getPublishedPassport(
  username: string,
): Promise<PublicCollectorPassport | null> {
  const result = await query(
    `SELECT u.username, s.public_id::text, s.public_label, s.public_story,
            s.display_order, s.passport_published_at::text, s.updated_at::text
       FROM users u
       JOIN showcase_cards s ON s.user_id = u.id
       LEFT JOIN trust_profiles tp ON tp.user_id = u.id
      WHERE u.username = $1
        AND u.is_public = TRUE
        AND COALESCE(tp.is_suspended, FALSE) = FALSE
        AND s.passport_public = TRUE
        AND s.passport_notice_version = $2
        AND s.passport_published_at IS NOT NULL
      ORDER BY s.display_order ASC, s.passport_published_at ASC
      LIMIT $3`,
    [username, COLLECTOR_PASSPORT_NOTICE_VERSION, COLLECTOR_PASSPORT_MAX_PUBLISHED],
  );
  return toPublicCollectorPassport(result.rows as PublishedPassportRow[]);
}
