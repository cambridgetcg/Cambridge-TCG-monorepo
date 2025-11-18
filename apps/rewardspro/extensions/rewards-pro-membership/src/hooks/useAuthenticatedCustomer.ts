import { useAuthenticatedAccountCustomer, useAuthenticatedAccountPurchasingCompany } from '@shopify/ui-extensions-react/customer-account';
import type { Customer, PurchasingCompany } from '../types/session';

/**
 * Hook to access authenticated customer information
 *
 * This hook provides access to the authenticated customer's ID and company information.
 * It's simpler than using session tokens and doesn't require decoding JWTs.
 *
 * Note: Requires access to protected customer data scope
 */
export function useAuthenticatedCustomer() {
  const customer = useAuthenticatedAccountCustomer();
  const purchasingCompany = useAuthenticatedAccountPurchasingCompany();

  console.log('[useAuthenticatedCustomer] Customer data:', {
    customerId: customer?.id,
    email: customer?.email,
    firstName: customer?.firstName,
    lastName: customer?.lastName,
  });

  console.log('[useAuthenticatedCustomer] Purchasing company data:', {
    companyId: purchasingCompany?.company?.id,
    locationId: purchasingCompany?.location?.id,
    isB2B: !!purchasingCompany?.company?.id,
  });

  // Extract customer ID from GID format
  // Format: gid://shopify/Customer/123 -> 123
  const extractCustomerId = (gid: string | undefined): string | null => {
    if (!gid) return null;
    const match = gid.match(/gid:\/\/shopify\/Customer\/(\d+)/);
    return match ? match[1] : null;
  };

  const customerId = extractCustomerId(customer?.id);
  const isAuthenticated = !!customer?.id;

  console.log('[useAuthenticatedCustomer] Extracted customer ID:', customerId);
  console.log('[useAuthenticatedCustomer] Is authenticated:', isAuthenticated);

  return {
    /** Full customer object with GID */
    customer: customer as Customer | undefined,
    /** Extracted numeric customer ID (e.g., "123") */
    customerId,
    /** Boolean indicating if customer is authenticated */
    isAuthenticated,
    /** Company information for B2B customers */
    purchasingCompany: purchasingCompany as PurchasingCompany | undefined,
    /** Boolean indicating if customer is a B2B customer */
    isB2BCustomer: !!purchasingCompany?.company?.id,
    /** Company location ID if available */
    companyLocationId: purchasingCompany?.location?.id,
  };
}
