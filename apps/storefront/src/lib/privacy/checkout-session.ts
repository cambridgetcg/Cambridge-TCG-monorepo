export interface CheckoutOwnershipSession {
  client_reference_id?: string | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string> | null;
}

export interface AccountIdentity {
  id: string;
  email: string;
}

function normaliseEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value || null;
}

/**
 * Establish ownership from an explicit account id when present, otherwise from
 * the email Stripe collected for older checkouts.
 */
export function checkoutSessionBelongsToAccount(
  session: CheckoutOwnershipSession,
  account: AccountIdentity,
): boolean {
  const claimedAccountId =
    session.metadata?.user_id ??
    session.metadata?.userId ??
    session.client_reference_id;

  if (claimedAccountId) return claimedAccountId === account.id;

  const checkoutEmail = normaliseEmail(
    session.customer_details?.email ?? session.customer_email,
  );
  const accountEmail = normaliseEmail(account.email);
  return checkoutEmail !== null && checkoutEmail === accountEmail;
}
