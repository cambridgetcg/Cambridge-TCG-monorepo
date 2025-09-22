/**
 * Customer Subscription Portal
 * 
 * Main component for managing subscriptions in customer account.
 * Uses Shopify's Customer Account UI Extensions framework.
 */

import React, { useState, useEffect } from 'react';
import {
  reactExtension,
  Card,
  BlockStack,
  InlineGrid,
  Text,
  Button,
  Badge,
  Banner,
  Modal,
  ChoiceList,
  Spinner,
  useApi,
  useAuthenticatedAccount,
  useAppMetafields,
  useTranslate,
} from '@shopify/ui-extensions-react/customer-account';

// Register the extension
export default reactExtension(
  'customer-account.page.render',
  () => <SubscriptionPortal />
);

function SubscriptionPortal() {
  const api = useApi();
  const account = useAuthenticatedAccount();
  const translate = useTranslate();
  
  // State management
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Get customer ID
  const customerId = account?.customer?.id;
  const customerEmail = account?.customer?.email;

  // Fetch subscriptions on mount
  useEffect(() => {
    if (customerId) {
      fetchSubscriptions();
    }
  }, [customerId]);

  /**
   * Fetch customer's subscriptions from our backend
   */
  async function fetchSubscriptions() {
    try {
      setLoading(true);
      setError(null);

      // Call our app backend to get subscriptions
      // Using the mapped internal customer ID
      const response = await fetch('/apps/rewardspro/api/customer-subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopifyCustomerId: customerId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subscriptions');
      }

      const data = await response.json();
      setSubscriptions(data.subscriptions || []);
    } catch (err) {
      console.error('Error fetching subscriptions:', err);
      setError('Unable to load subscriptions. Please try again later.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handle subscription pause
   */
  async function handlePause(subscriptionId) {
    try {
      setActionLoading(true);
      
      const response = await fetch('/apps/rewardspro/api/subscription-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'pause',
          subscriptionId,
          customerId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to pause subscription');
      }

      // Refresh subscriptions
      await fetchSubscriptions();
      
      // Show success message
      api.toast.show('Subscription paused successfully');
    } catch (err) {
      console.error('Error pausing subscription:', err);
      api.toast.show('Failed to pause subscription', { error: true });
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * Handle subscription resume
   */
  async function handleResume(subscriptionId) {
    try {
      setActionLoading(true);
      
      const response = await fetch('/apps/rewardspro/api/subscription-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'resume',
          subscriptionId,
          customerId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to resume subscription');
      }

      await fetchSubscriptions();
      api.toast.show('Subscription resumed successfully');
    } catch (err) {
      console.error('Error resuming subscription:', err);
      api.toast.show('Failed to resume subscription', { error: true });
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * Handle subscription cancellation
   */
  async function handleCancel() {
    if (!selectedSubscription || !cancelReason) {
      api.toast.show('Please select a cancellation reason', { error: true });
      return;
    }

    try {
      setActionLoading(true);
      
      const response = await fetch('/apps/rewardspro/api/subscription-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'cancel',
          subscriptionId: selectedSubscription.id,
          customerId,
          reason: cancelReason,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel subscription');
      }

      await fetchSubscriptions();
      setShowCancelModal(false);
      setSelectedSubscription(null);
      setCancelReason('');
      
      api.toast.show('Subscription cancelled successfully');
    } catch (err) {
      console.error('Error cancelling subscription:', err);
      api.toast.show('Failed to cancel subscription', { error: true });
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * Handle skip next delivery
   */
  async function handleSkip(subscriptionId) {
    try {
      setActionLoading(true);
      
      const response = await fetch('/apps/rewardspro/api/subscription-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'skip',
          subscriptionId,
          customerId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to skip delivery');
      }

      await fetchSubscriptions();
      api.toast.show('Next delivery skipped');
    } catch (err) {
      console.error('Error skipping delivery:', err);
      api.toast.show('Failed to skip delivery', { error: true });
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * Format date for display
   */
  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  }

  /**
   * Format currency
   */
  function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }

  /**
   * Get status badge tone
   */
  function getStatusTone(status) {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'PAUSED':
        return 'warning';
      case 'CANCELLED':
      case 'FAILED':
        return 'critical';
      default:
        return 'info';
    }
  }

  // Loading state
  if (loading) {
    return (
      <BlockStack spacing="base">
        <Text variant="headingMd">My Subscriptions</Text>
        <Card>
          <BlockStack spacing="base" alignment="center">
            <Spinner size="large" />
            <Text>Loading your subscriptions...</Text>
          </BlockStack>
        </Card>
      </BlockStack>
    );
  }

  // Error state
  if (error) {
    return (
      <BlockStack spacing="base">
        <Text variant="headingMd">My Subscriptions</Text>
        <Banner tone="critical">
          <Text>{error}</Text>
        </Banner>
        <Button onClick={fetchSubscriptions}>Try Again</Button>
      </BlockStack>
    );
  }

  // Empty state
  if (subscriptions.length === 0) {
    return (
      <BlockStack spacing="base">
        <Text variant="headingMd">My Subscriptions</Text>
        <Card>
          <BlockStack spacing="base" alignment="center">
            <Text>You don't have any active subscriptions.</Text>
            <Button url="/collections/subscriptions" variant="primary">
              Browse Subscription Plans
            </Button>
          </BlockStack>
        </Card>
      </BlockStack>
    );
  }

  // Subscription list
  return (
    <BlockStack spacing="base">
      <Text variant="headingMd">My Subscriptions</Text>
      
      {subscriptions.map((subscription) => (
        <Card key={subscription.id}>
          <BlockStack spacing="base">
            {/* Header with title and status */}
            <InlineGrid columns={['auto', 'fill']} spacing="base">
              <BlockStack spacing="extraTight">
                <Text variant="headingSm">{subscription.planName}</Text>
                <Text variant="bodySm" tone="subdued">
                  {subscription.tierName || 'Standard Subscription'}
                </Text>
              </BlockStack>
              <Badge tone={getStatusTone(subscription.status)}>
                {subscription.status}
              </Badge>
            </InlineGrid>

            {/* Subscription details */}
            <BlockStack spacing="extraTight">
              <InlineGrid columns={2} spacing="base">
                <Text variant="bodySm" tone="subdued">Amount:</Text>
                <Text variant="bodySm">
                  {formatCurrency(subscription.amount, subscription.currency)}
                </Text>
              </InlineGrid>
              
              <InlineGrid columns={2} spacing="base">
                <Text variant="bodySm" tone="subdued">Frequency:</Text>
                <Text variant="bodySm">
                  Every {subscription.billingIntervalCount} {subscription.billingInterval.toLowerCase()}
                </Text>
              </InlineGrid>
              
              {subscription.nextBillingDate && subscription.status === 'ACTIVE' && (
                <InlineGrid columns={2} spacing="base">
                  <Text variant="bodySm" tone="subdued">Next Billing:</Text>
                  <Text variant="bodySm">
                    {formatDate(subscription.nextBillingDate)}
                  </Text>
                </InlineGrid>
              )}

              {subscription.pausedAt && subscription.status === 'PAUSED' && (
                <InlineGrid columns={2} spacing="base">
                  <Text variant="bodySm" tone="subdued">Paused Since:</Text>
                  <Text variant="bodySm">
                    {formatDate(subscription.pausedAt)}
                  </Text>
                </InlineGrid>
              )}
            </BlockStack>

            {/* Failed payment warning */}
            {subscription.lastPaymentStatus === 'FAILED' && (
              <Banner tone="critical">
                <Text variant="bodySm">
                  Last payment failed. Please update your payment method.
                </Text>
              </Banner>
            )}

            {/* Action buttons */}
            {subscription.status === 'ACTIVE' && (
              <InlineGrid columns={3} spacing="base">
                <Button
                  onClick={() => handlePause(subscription.id)}
                  loading={actionLoading}
                  variant="secondary"
                >
                  Pause
                </Button>
                <Button
                  onClick={() => handleSkip(subscription.id)}
                  loading={actionLoading}
                  variant="secondary"
                >
                  Skip Next
                </Button>
                <Button
                  onClick={() => {
                    setSelectedSubscription(subscription);
                    setShowCancelModal(true);
                  }}
                  variant="secondary"
                  tone="critical"
                >
                  Cancel
                </Button>
              </InlineGrid>
            )}

            {subscription.status === 'PAUSED' && (
              <InlineGrid columns={2} spacing="base">
                <Button
                  onClick={() => handleResume(subscription.id)}
                  loading={actionLoading}
                  variant="primary"
                >
                  Resume
                </Button>
                <Button
                  onClick={() => {
                    setSelectedSubscription(subscription);
                    setShowCancelModal(true);
                  }}
                  variant="secondary"
                  tone="critical"
                >
                  Cancel
                </Button>
              </InlineGrid>
            )}

            {/* View details link */}
            <Button
              url={`/account/subscriptions/${subscription.id}`}
              variant="plain"
            >
              View Details & Billing History →
            </Button>
          </BlockStack>
        </Card>
      ))}

      {/* Cancellation Modal */}
      {showCancelModal && (
        <Modal
          open={showCancelModal}
          onClose={() => {
            setShowCancelModal(false);
            setCancelReason('');
          }}
          title="Cancel Subscription"
        >
          <BlockStack spacing="base">
            <Text>
              We're sorry to see you go. Would you consider pausing your subscription instead?
            </Text>
            
            <InlineGrid columns={2} spacing="base">
              <Button
                onClick={() => {
                  setShowCancelModal(false);
                  handlePause(selectedSubscription.id);
                }}
                variant="primary"
              >
                Pause Instead
              </Button>
              <Button
                onClick={() => setCancelReason('continue')}
                variant="secondary"
              >
                Continue Cancelling
              </Button>
            </InlineGrid>

            {cancelReason === 'continue' && (
              <>
                <Text variant="headingSm">Why are you cancelling?</Text>
                <ChoiceList
                  name="cancelReason"
                  value={[cancelReason]}
                  onChange={(value) => setCancelReason(value[0])}
                  choices={[
                    { label: 'Too expensive', value: 'too_expensive' },
                    { label: 'Not using it enough', value: 'not_using' },
                    { label: 'Found an alternative', value: 'alternative' },
                    { label: 'Just taking a break', value: 'break' },
                    { label: 'Other reason', value: 'other' },
                  ]}
                />
                
                {cancelReason && cancelReason !== 'continue' && (
                  <BlockStack spacing="base">
                    <Banner tone="warning">
                      <Text variant="bodySm">
                        Your subscription will be cancelled at the end of the current billing period.
                        You will continue to receive benefits until then.
                      </Text>
                    </Banner>
                    
                    <InlineGrid columns={2} spacing="base">
                      <Button
                        onClick={handleCancel}
                        loading={actionLoading}
                        tone="critical"
                      >
                        Confirm Cancellation
                      </Button>
                      <Button
                        onClick={() => {
                          setShowCancelModal(false);
                          setCancelReason('');
                        }}
                        variant="secondary"
                      >
                        Keep Subscription
                      </Button>
                    </InlineGrid>
                  </BlockStack>
                )}
              </>
            )}
          </BlockStack>
        </Modal>
      )}
    </BlockStack>
  );
}