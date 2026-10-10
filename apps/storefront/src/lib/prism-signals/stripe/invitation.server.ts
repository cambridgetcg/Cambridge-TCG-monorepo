import "server-only";
import { query as storefrontQuery } from "@/lib/db";
import type { ProductFlowRuntimeQueryV1 } from "@/lib/product-flow-runtime/postgres.server";

export const PRISM_STRIPE_INVITATION_SCOPE =
  "stripe_all_sandbox_v1" as const;

interface PrismStripeInvitationDependencies {
  readonly query?: ProductFlowRuntimeQueryV1;
}

function canonicalTimestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new Error(
      "PRISM Stripe invitation evaluation requires a canonical UTC timestamp.",
    );
  }
  return value;
}

/**
 * Beta interest is consent, not admission. This read answers only whether an
 * operator-issued invitation covers the exact test product/scope at one time.
 */
export async function hasActivePrismStripeSandboxInvitation(
  input: Readonly<{ userId: string; evaluatedAt: string }>,
  dependencies: PrismStripeInvitationDependencies = {},
): Promise<boolean> {
  const evaluatedAt = canonicalTimestamp(input.evaluatedAt);
  const query = dependencies.query ?? storefrontQuery;
  const result = await query(
    `SELECT EXISTS (
       SELECT 1
         FROM product_flow_prism_stripe_invitations
        WHERE environment = $1
          AND product_id = $2
          AND user_id = $3
          AND scope = $4
          AND status = $5
          AND invited_at <= $6::TIMESTAMPTZ
          AND expires_at > $6::TIMESTAMPTZ
     ) AS invited`,
    [
      "test",
      "prism-signals",
      input.userId,
      PRISM_STRIPE_INVITATION_SCOPE,
      "active",
      evaluatedAt,
    ],
  );
  const invited = (result.rows[0] as { invited?: unknown } | undefined)
    ?.invited;
  if (typeof invited !== "boolean") {
    throw new Error("PRISM Stripe invitation storage returned invalid state.");
  }
  return invited;
}
