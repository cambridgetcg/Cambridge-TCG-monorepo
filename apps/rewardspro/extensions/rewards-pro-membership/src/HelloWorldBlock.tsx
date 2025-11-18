import { useEffect, useState } from 'react';
import {
  reactExtension,
  Banner,
  BlockStack,
  Text,
  useTranslate,
  useI18n,
  useLanguage,
  InlineStack,
  Badge,
  Spinner,
  Divider,
  View,
  useExtension,
} from '@shopify/ui-extensions-react/customer-account';
import { useSessionToken } from './hooks/useSessionToken';
import { useApiClient } from './hooks/useApiClient';
import { useAuthenticatedCustomer } from './hooks/useAuthenticatedCustomer';

export default reactExtension(
  'customer-account.profile.block.render',
  () => <HelloWorldBlock />
);

interface TierInfo {
  name: string;
  cashbackPercent: number;
  minSpend: number;
}

interface TransactionInfo {
  id: number;
  type: string;
  amount: number;
  date: string;
  description: string;
}

interface LoyaltyData {
  success: boolean;
  enrolled: boolean;
  balance: number;
  tier: TierInfo | null;
  nextTier: TierInfo | null;
  progressToNextTier: number;
  amountToNextTier: number;
  totalEarned: number;
  stats: {
    orderCount: number;
    totalSpent: number;
    netSpent: number;
    averageCashbackPerOrder: number;
    lastOrderDate: string | null;
  };
  allTiers: TierInfo[];
  recentTransactions: TransactionInfo[];
  currency: string;
  message?: string;
  canEnroll?: boolean;
  isPreview?: boolean;
}

function HelloWorldBlock() {
  const translate = useTranslate();
  const i18n = useI18n();
  const language = useLanguage();

  // Detect if we're in the theme editor
  const { editor } = useExtension();
  const isInEditor = editor?.type === 'checkout';

  // Authenticated customer (simpler, direct access)
  const {
    customer,
    customerId: authCustomerId,
    isAuthenticated: authIsAuthenticated,
    purchasingCompany,
    isB2BCustomer,
    companyLocationId,
  } = useAuthenticatedCustomer();

  // Session token management (for API calls)
  const {
    sessionToken,
    customerId: tokenCustomerId,
    isAuthenticated: tokenIsAuthenticated,
    isLoading: tokenLoading,
    decodedToken
  } = useSessionToken();

  // Extract shop domain from decoded token for absolute URL construction
  const shopDomain = decodedToken?.claims?.dest; // e.g., "store.myshopify.com"

  console.log('[HelloWorldBlock] Shop domain extraction:', {
    hasDecodedToken: !!decodedToken,
    hasClaims: !!decodedToken?.claims,
    shopDomain: shopDomain,
    dest: decodedToken?.claims?.dest
  });

  // API client - needs shop domain for absolute URLs
  const apiClient = useApiClient({
    shopDomain: shopDomain,
    enableDebugLogs: true,
  });

  // Loyalty data state
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use authenticated customer ID as primary source
  const customerId = authCustomerId || tokenCustomerId;
  const isAuthenticated = authIsAuthenticated || tokenIsAuthenticated;

  console.log('[HelloWorldBlock] Component state:', {
    authCustomerId,
    tokenCustomerId,
    customerId,
    isAuthenticated,
    authIsAuthenticated,
    tokenIsAuthenticated,
    hasSessionToken: !!sessionToken,
  });

  // Fetch loyalty data when customer is authenticated
  useEffect(() => {
    async function fetchLoyaltyData() {
      console.log('[HelloWorldBlock] fetchLoyaltyData called', {
        isAuthenticated,
        hasSessionToken: !!sessionToken,
        isInEditor,
        willFetch: isAuthenticated && !!sessionToken
      });

      // If in editor mode, always show mock data
      if (isInEditor) {
        console.log('[HelloWorldBlock] Editor mode detected, setting mock data');
        setLoyaltyData({
          success: true,
          enrolled: true,
          balance: 50.00,
          tier: {
            name: 'Gold Member',
            cashbackPercent: 5,
            minSpend: 500
          },
          nextTier: {
            name: 'Platinum Member',
            cashbackPercent: 10,
            minSpend: 1000
          },
          progressToNextTier: 65,
          amountToNextTier: 350,
          totalEarned: 125.50,
          stats: {
            orderCount: 12,
            totalSpent: 650.00,
            netSpent: 650.00,
            averageCashbackPerOrder: 10.46,
            lastOrderDate: new Date().toISOString()
          },
          allTiers: [
            { name: 'Bronze Member', cashbackPercent: 2, minSpend: 0 },
            { name: 'Silver Member', cashbackPercent: 3, minSpend: 250 },
            { name: 'Gold Member', cashbackPercent: 5, minSpend: 500 },
            { name: 'Platinum Member', cashbackPercent: 10, minSpend: 1000 }
          ],
          recentTransactions: [],
          currency: 'USD',
          message: 'Editor Preview - This is sample membership data'
        });
        return;
      }

      if (!isAuthenticated || !sessionToken) {
        console.log('[HelloWorldBlock] Skipping fetch - not authenticated or no session token');
        return;
      }

      try {
        console.log('[HelloWorldBlock] Starting loyalty data fetch...');
        setDataLoading(true);
        setError(null);

        // Call the main loyalty endpoint (baseUrl already includes /api/customer-account/loyalty)
        console.log('[HelloWorldBlock] Calling API client...');
        const response = await apiClient.get<LoyaltyData>(
          sessionToken,
          '' // Empty string because baseUrl already has the full path
        );

        console.log('[HelloWorldBlock] API response received:', {
          success: response.success,
          hasData: !!response.data,
          error: response.error,
          isPreview: response.data?.isPreview,
        });

        if (response.success && response.data) {
          console.log('[HelloWorldBlock] Setting loyalty data:', {
            enrolled: response.data.enrolled,
            balance: response.data.balance,
            tierName: response.data.tier?.name,
            isPreview: response.data.isPreview,
          });
          setLoyaltyData(response.data);
        } else if (response.data?.isPreview) {
          // Preview mode - show mock data instead of error
          console.log('[HelloWorldBlock] Preview mode detected, setting mock data');
          setLoyaltyData({
            success: true,
            enrolled: true,
            balance: 50.00,
            tier: {
              name: 'Gold Member',
              cashbackPercent: 5,
              minSpend: 500
            },
            nextTier: {
              name: 'Platinum Member',
              cashbackPercent: 10,
              minSpend: 1000
            },
            progressToNextTier: 65,
            amountToNextTier: 350,
            totalEarned: 125.50,
            stats: {
              orderCount: 12,
              totalSpent: 650.00,
              netSpent: 650.00,
              averageCashbackPerOrder: 10.46,
              lastOrderDate: new Date().toISOString()
            },
            allTiers: [
              { name: 'Bronze Member', cashbackPercent: 2, minSpend: 0 },
              { name: 'Silver Member', cashbackPercent: 3, minSpend: 250 },
              { name: 'Gold Member', cashbackPercent: 5, minSpend: 500 },
              { name: 'Platinum Member', cashbackPercent: 10, minSpend: 1000 }
            ],
            recentTransactions: [],
            currency: 'USD',
            message: 'Preview - Sign in to view your actual membership data'
          });
        } else {
          const errorMsg = response.error || 'Failed to fetch loyalty data';
          console.error('[HelloWorldBlock] API error:', errorMsg);
          setError(errorMsg);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('[HelloWorldBlock] Exception during fetch:', errorMessage, err);

        // Don't show errors in preview/unauthenticated mode - just log them
        // The placeholder will be shown by the !isAuthenticated check
        if (isAuthenticated) {
          setError(errorMessage);
        }
      } finally {
        console.log('[HelloWorldBlock] Fetch complete, setting loading to false');
        setDataLoading(false);
      }
    }

    fetchLoyaltyData();
  }, [isAuthenticated, sessionToken, apiClient, isInEditor]);

  // Placeholder for unauthenticated state (useful in theme editor / testing)
  if (!isAuthenticated) {
    return (
      <View
        border="base"
        cornerRadius="base"
        padding="base"
        background="subdued"
      >
        <BlockStack spacing="base">
          <Text size="medium" emphasis="bold">Membership Preview</Text>
          <Text appearance="subdued">
            Sign in to view your membership tier and store credit balance.
          </Text>
          <Divider />
          <BlockStack spacing="tight">
            <Text size="small" appearance="subdued">Example tier: Gold Member</Text>
            <Text size="small" appearance="subdued">Example balance: $50.00</Text>
          </BlockStack>
        </BlockStack>
      </View>
    );
  }

  // Loading state
  if (tokenLoading) {
    return (
      <BlockStack spacing="base">
        <InlineStack spacing="tight" blockAlignment="center">
          <Spinner size="small" />
          <Text>Loading...</Text>
        </InlineStack>
      </BlockStack>
    );
  }

  // Loading state
  if (dataLoading) {
    return (
      <BlockStack spacing="base">
        <InlineStack spacing="tight" blockAlignment="center">
          <Spinner size="small" />
          <Text>Loading membership...</Text>
        </InlineStack>
      </BlockStack>
    );
  }

  // Error state
  if (error) {
    return (
      <Banner tone="critical" title="Error">
        {error}
      </Banner>
    );
  }

  // Not enrolled state
  if (loyaltyData && !loyaltyData.enrolled) {
    return (
      <Banner tone="info" title="Join our Membership Program">
        {loyaltyData.message || "You're not enrolled yet. Start earning rewards today!"}
      </Banner>
    );
  }

  // Enrolled state - show membership card
  if (!loyaltyData) {
    return null;
  }

  return (
    <BlockStack spacing="base">
      {/* Membership Header */}
      <Text size="large" emphasis="bold">Membership</Text>

      {/* Membership Tier Card */}
      {loyaltyData.tier && (
        <View
          border="base"
          cornerRadius="base"
          padding="base"
          background="base"
        >
          <BlockStack spacing="base">
            <BlockStack spacing="tight">
              <Text appearance="subdued">Current tier</Text>
              <InlineStack spacing="tight" blockAlignment="center">
                <Text size="large" emphasis="bold">{loyaltyData.tier.name}</Text>
                <Badge tone="success">{loyaltyData.tier.cashbackPercent}% cashback</Badge>
              </InlineStack>
            </BlockStack>

            {/* Next Tier Progress */}
            {loyaltyData.nextTier && (
              <BlockStack spacing="tight">
                <Divider />
                <Text size="medium" emphasis="bold">
                  Next: {loyaltyData.nextTier.name}
                </Text>
                <Text size="small" appearance="subdued">
                  Spend {loyaltyData.currency} {loyaltyData.amountToNextTier.toFixed(2)} more to unlock {loyaltyData.nextTier.cashbackPercent}% cashback
                </Text>
                <Text size="small" appearance="subdued">
                  {loyaltyData.progressToNextTier.toFixed(0)}% complete
                </Text>
              </BlockStack>
            )}

            {/* Stats */}
            <BlockStack spacing="tight">
              <Divider />
              <InlineStack spacing="base">
                <BlockStack spacing="extraTight">
                  <Text size="small" appearance="subdued">Total spent</Text>
                  <Text emphasis="bold">{loyaltyData.currency} {loyaltyData.stats.totalSpent.toFixed(2)}</Text>
                </BlockStack>
                <BlockStack spacing="extraTight">
                  <Text size="small" appearance="subdued">Orders</Text>
                  <Text emphasis="bold">{loyaltyData.stats.orderCount}</Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </BlockStack>
        </View>
      )}

      {/* Store Credit Balance Card */}
      <View
        border="base"
        cornerRadius="base"
        padding="base"
        background="base"
      >
        <BlockStack spacing="tight">
          <Text appearance="subdued">Available store credit</Text>
          <Text size="extraLarge" emphasis="bold">
            {loyaltyData.currency} {loyaltyData.balance.toFixed(2)}
          </Text>
          {loyaltyData.totalEarned > 0 && (
            <Text size="small" appearance="subdued">
              Total earned: {loyaltyData.currency} {loyaltyData.totalEarned.toFixed(2)}
            </Text>
          )}
        </BlockStack>
      </View>
    </BlockStack>
  );
}
