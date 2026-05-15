"use server";

/**
 * Channel-pricing — server actions.
 *
 * Phase 3 of kingdom-049. The DB `channel_pricing` table on wholesale
 * RDS is authoritative; this Server Action is the canonical write path.
 * Every mutation flows through `adminAction()` which auth-checks,
 * formats results, writes to `admin_actions_log`, and revalidates the
 * page. Preview is computed via the shared pricing package.
 *
 * Validation:
 *   - marginMultiplier in (0, 10]
 *   - flatFee in [0, 100]
 *   - vatMultiplier in [1.00, 1.50]
 *   - retailMultiplier in [0, 10]
 *   - roundTo in (0, 10]
 */

import { adminAction, ActionInputError } from "@/lib/actions";
import { wsQuery } from "@/lib/db";
import { computePriceForChannel } from "@cambridge-tcg/pricing";

export interface UpdateChannelInput {
  channelId: number;
  marginMultiplier: number;
  flatFeeSingles: number;
  flatFeeSealed: number;
  vatMultiplier: number;
  retailMultiplier: number;
  roundTo: number;
  reason?: string;
}

function validateField(name: string, value: number, min: number, max: number, inclusive = true) {
  if (!Number.isFinite(value)) {
    throw new ActionInputError(`${name} must be a finite number.`);
  }
  const okLow = inclusive ? value >= min : value > min;
  const okHigh = inclusive ? value <= max : value < max;
  if (!okLow || !okHigh) {
    const lo = inclusive ? `≥ ${min}` : `> ${min}`;
    const hi = inclusive ? `≤ ${max}` : `< ${max}`;
    throw new ActionInputError(`${name} must be ${lo} and ${hi}; got ${value}.`);
  }
}

export async function updateChannelPricing(input: UpdateChannelInput) {
  return adminAction({
    action: "channel_pricing.update",
    targetKind: "channel_pricing",
    targetId: String(input.channelId),
    reason: input.reason ?? null,
    revalidate: "/commerce/channel-pricing",
    run: async () => {
      validateField("marginMultiplier", input.marginMultiplier, 0, 10, false);
      validateField("flatFeeSingles", input.flatFeeSingles, 0, 100);
      validateField("flatFeeSealed", input.flatFeeSealed, 0, 100);
      validateField("vatMultiplier", input.vatMultiplier, 1.00, 1.50);
      validateField("retailMultiplier", input.retailMultiplier, 0, 10, false);
      validateField("roundTo", input.roundTo, 0, 10, false);

      const before = await wsQuery<{
        channel: string;
        margin_multiplier: string | null;
        flat_fee_singles: string | null;
        flat_fee_sealed: string | null;
        vat_multiplier: string | null;
        retail_multiplier: string | null;
        round_to: string | null;
      }>(
        `SELECT channel,
                margin_multiplier::text, flat_fee_singles::text,
                flat_fee_sealed::text, vat_multiplier::text,
                retail_multiplier::text, round_to::text
           FROM channel_pricing WHERE id = $1`,
        [input.channelId],
      );
      if (before.rows.length === 0) {
        throw new ActionInputError(`Channel ${input.channelId} not found.`);
      }

      const after = await wsQuery<{ channel: string }>(
        `UPDATE channel_pricing
            SET margin_multiplier = $1,
                flat_fee_singles  = $2,
                flat_fee_sealed   = $3,
                vat_multiplier    = $4,
                retail_multiplier = $5,
                round_to          = $6,
                updated_at        = NOW()
          WHERE id = $7
        RETURNING channel`,
        [
          input.marginMultiplier,
          input.flatFeeSingles,
          input.flatFeeSealed,
          input.vatMultiplier,
          input.retailMultiplier,
          input.roundTo,
          input.channelId,
        ],
      );

      return {
        channel: after.rows[0]!.channel,
        before: before.rows[0]!,
      };
    },
  });
}

/**
 * Pure compute — returns the breakdown a hypothetical ¥1000 card would
 * produce under the given config. Used by the editor's "preview before
 * save" panel so operators see the downstream effect of an edit.
 */
export async function previewChannelPrice(input: {
  channel: string;
  marginMultiplier: number;
  flatFeeSingles: number;
  flatFeeSealed: number;
  vatMultiplier: number;
  retailMultiplier: number;
  roundTo: number;
  cardrushJpy?: number;
  gbpJpyRate?: number;
  category?: "singles" | "sealed";
}) {
  const jpy = input.cardrushJpy ?? 1000;
  const rate = input.gbpJpyRate ?? 185;
  const category = input.category ?? "singles";
  return computePriceForChannel(jpy, rate, input.channel, category, {
    marginMultiplier: input.marginMultiplier,
    flatFeeSingles: input.flatFeeSingles,
    flatFeeSealed: input.flatFeeSealed,
    vatMultiplier: input.vatMultiplier,
    retailMultiplier: input.retailMultiplier,
    roundTo: input.roundTo,
  });
}

/**
 * Read the wholesale runtime's channel-pricing load status. Surfaces
 * fallback-to-defaults state to the admin UI banner. Reads through
 * wsQuery to verify DB connectivity; the wholesale-side getLoadStatus()
 * is in-process to that app and not accessible from admin, so we
 * approximate by checking that all 8 expected channels are present.
 */
export async function getLoadStatusSafe(): Promise<{
  source: "db" | "fallback-defaults";
  lastError: { message: string } | null;
}> {
  const EXPECTED = [
    "wholesale", "shopify", "cambridgetcg", "ebay",
    "cardmarket", "tradein-cash", "tradein-credit",
  ];
  try {
    const r = await wsQuery<{ channel: string }>(
      `SELECT channel FROM channel_pricing WHERE active = true`,
    );
    const present = new Set(r.rows.map((x) => x.channel));
    const missing = EXPECTED.filter((c) => !present.has(c));
    if (missing.length > 0) {
      return {
        source: "fallback-defaults",
        lastError: { message: `Missing channels in DB: ${missing.join(", ")}. Run drizzle/0010_seed_channel_pricing.sql.` },
      };
    }
    return { source: "db", lastError: null };
  } catch (err) {
    return {
      source: "fallback-defaults",
      lastError: { message: err instanceof Error ? err.message : String(err) },
    };
  }
}
