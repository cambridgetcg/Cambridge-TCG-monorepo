/**
 * Klaviyo Marketing Dashboard
 *
 * Displayed when merchants have selected Klaviyo as their marketing platform.
 * Shows:
 * - Connection status and sync health
 * - Event tracking dashboard
 * - Recent events sent to Klaviyo
 * - Quick actions and help content
 */

import { useState } from "react";
import {
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Button,
  Badge,
  Icon,
  Box,
  Divider,
  Banner,
  Collapsible,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ClockIcon,
  RefreshIcon,
  ExternalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EmailIcon,
  PersonIcon,
  CartIcon,
  StarIcon,
  AlertTriangleIcon,
  GiftCardIcon,
} from "@shopify/polaris-icons";

// ============================================
// TYPES
// ============================================

export interface KlaviyoSyncStatus {
  isConnected: boolean;
  connectionMethod: "oauth" | "api_key" | null;
  lastSyncAt: string | null;
  profilesSynced: number;
  eventsSentToday: number;
  syncStatus: "idle" | "syncing" | "error";
  syncError: string | null;
}

export interface EventToggle {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  eventCount: number;
}

export interface RecentEvent {
  id: string;
  eventType: string;
  customerEmail: string;
  timestamp: string;
  status: "sent" | "failed";
}

export interface KlaviyoMarketingDashboardProps {
  syncStatus: KlaviyoSyncStatus;
  eventToggles: EventToggle[];
  recentEvents: RecentEvent[];
  onSyncNow: () => void;
  onToggleEvent: (eventId: string, enabled: boolean) => void;
  onOpenKlaviyo: () => void;
  onManageSettings: () => void;
  isSyncing?: boolean;
}

// ============================================
// HELPER COMPONENTS
// ============================================

function ConnectionStatusCard({
  syncStatus,
  onSyncNow,
  onOpenKlaviyo,
  isSyncing,
}: {
  syncStatus: KlaviyoSyncStatus;
  onSyncNow: () => void;
  onOpenKlaviyo: () => void;
  isSyncing?: boolean;
}) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hour${Math.floor(diffMins / 60) > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: syncStatus.isConnected ? "#22c55e" : "#ef4444",
              }}
            />
            <Text as="h2" variant="headingMd">
              Connection Status
            </Text>
          </InlineStack>
          <InlineStack gap="200">
            <Button
              icon={RefreshIcon}
              onClick={onSyncNow}
              loading={isSyncing}
              disabled={!syncStatus.isConnected}
            >
              Sync Now
            </Button>
            <Button
              icon={ExternalIcon}
              onClick={onOpenKlaviyo}
              variant="primary"
            >
              Open Klaviyo
            </Button>
          </InlineStack>
        </InlineStack>

        <Divider />

        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">
              Status
            </Text>
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={syncStatus.isConnected ? "success" : "critical"}>
                {syncStatus.isConnected ? "Connected" : "Disconnected"}
              </Badge>
              {syncStatus.connectionMethod && (
                <Text as="span" variant="bodySm" tone="subdued">
                  via {syncStatus.connectionMethod === "oauth" ? "OAuth" : "API Key"}
                </Text>
              )}
            </InlineStack>
          </BlockStack>

          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">
              Last Sync
            </Text>
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {formatDate(syncStatus.lastSyncAt)}
            </Text>
          </BlockStack>

          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">
              Profiles Synced
            </Text>
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {syncStatus.profilesSynced.toLocaleString()}
            </Text>
          </BlockStack>

          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">
              Events Today
            </Text>
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {syncStatus.eventsSentToday.toLocaleString()}
            </Text>
          </BlockStack>
        </InlineGrid>

        {syncStatus.syncError && (
          <Banner tone="critical">
            <Text as="p" variant="bodySm">
              {syncStatus.syncError}
            </Text>
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
}

function EventTrackingCard({
  eventToggles,
  onToggleEvent,
}: {
  eventToggles: EventToggle[];
  onToggleEvent: (eventId: string, enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const enabledCount = eventToggles.filter((e) => e.enabled).length;

  // Group events by category
  const eventCategories = {
    customer: eventToggles.filter((e) =>
      ["customer_enrolled", "tier_upgraded", "tier_downgraded", "vip_achieved"].includes(e.id)
    ),
    transaction: eventToggles.filter((e) =>
      ["order_placed", "cashback_earned", "cashback_redeemed", "points_adjusted"].includes(e.id)
    ),
    lifecycle: eventToggles.filter((e) =>
      ["points_expiring", "win_back", "birthday", "anniversary"].includes(e.id)
    ),
  };

  const getEventIcon = (eventId: string) => {
    if (eventId.includes("customer") || eventId.includes("tier") || eventId.includes("vip")) {
      return PersonIcon;
    }
    if (eventId.includes("order") || eventId.includes("cashback") || eventId.includes("points")) {
      return CartIcon;
    }
    if (eventId.includes("birthday") || eventId.includes("anniversary")) {
      return GiftCardIcon;
    }
    return EmailIcon;
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h2" variant="headingMd">
              Event Tracking
            </Text>
            <Badge tone="info">
              {`${enabledCount} of ${eventToggles.length} enabled`}
            </Badge>
          </InlineStack>
          <Button
            icon={expanded ? ChevronUpIcon : ChevronDownIcon}
            onClick={() => setExpanded(!expanded)}
            variant="plain"
          >
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </InlineStack>

        <Collapsible open={expanded} id="event-toggles">
          <BlockStack gap="400">
            {/* Customer Events */}
            {eventCategories.customer.length > 0 && (
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm" tone="subdued">
                  Customer Events
                </Text>
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="200">
                  {eventCategories.customer.map((event) => (
                    <EventToggleItem
                      key={event.id}
                      event={event}
                      icon={getEventIcon(event.id)}
                      onToggle={onToggleEvent}
                    />
                  ))}
                </InlineGrid>
              </BlockStack>
            )}

            {/* Transaction Events */}
            {eventCategories.transaction.length > 0 && (
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm" tone="subdued">
                  Transaction Events
                </Text>
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="200">
                  {eventCategories.transaction.map((event) => (
                    <EventToggleItem
                      key={event.id}
                      event={event}
                      icon={getEventIcon(event.id)}
                      onToggle={onToggleEvent}
                    />
                  ))}
                </InlineGrid>
              </BlockStack>
            )}

            {/* Lifecycle Events */}
            {eventCategories.lifecycle.length > 0 && (
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm" tone="subdued">
                  Lifecycle Events
                </Text>
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="200">
                  {eventCategories.lifecycle.map((event) => (
                    <EventToggleItem
                      key={event.id}
                      event={event}
                      icon={getEventIcon(event.id)}
                      onToggle={onToggleEvent}
                    />
                  ))}
                </InlineGrid>
              </BlockStack>
            )}
          </BlockStack>
        </Collapsible>
      </BlockStack>
    </Card>
  );
}

function EventToggleItem({
  event,
  icon,
  onToggle,
}: {
  event: EventToggle;
  icon: typeof EmailIcon;
  onToggle: (eventId: string, enabled: boolean) => void;
}) {
  return (
    <Box
      padding="300"
      background={event.enabled ? "bg-surface-success" : "bg-surface-secondary"}
      borderRadius="200"
    >
      <InlineStack align="space-between" blockAlign="center">
        <InlineStack gap="300" blockAlign="center">
          <Icon source={icon} tone={event.enabled ? "success" : "subdued"} />
          <BlockStack gap="050">
            <Text as="span" variant="bodyMd" fontWeight="medium">
              {event.name}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {event.eventCount.toLocaleString()} sent
            </Text>
          </BlockStack>
        </InlineStack>
        <Button
          size="slim"
          onClick={() => onToggle(event.id, !event.enabled)}
          tone={event.enabled ? undefined : "success"}
        >
          {event.enabled ? "Disable" : "Enable"}
        </Button>
      </InlineStack>
    </Box>
  );
}

function RecentEventsCard({ recentEvents }: { recentEvents: RecentEvent[] }) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getEventLabel = (eventType: string) => {
    const labels: Record<string, string> = {
      customer_enrolled: "Customer Enrolled",
      tier_upgraded: "Tier Upgraded",
      tier_downgraded: "Tier Downgraded",
      order_placed: "Order Placed",
      cashback_earned: "Cashback Earned",
      cashback_redeemed: "Cashback Redeemed",
      points_expiring: "Points Expiring",
      win_back: "Win-Back Trigger",
      birthday: "Birthday",
      anniversary: "Anniversary",
    };
    return labels[eventType] || eventType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Recent Events
        </Text>

        {recentEvents.length === 0 ? (
          <Box padding="400" background="bg-surface-secondary" borderRadius="200">
            <BlockStack gap="200" inlineAlign="center">
              <Icon source={ClockIcon} tone="subdued" />
              <Text as="p" tone="subdued" alignment="center">
                No events sent yet. Events will appear here as they're triggered.
              </Text>
            </BlockStack>
          </Box>
        ) : (
          <BlockStack gap="200">
            {recentEvents.slice(0, 10).map((event) => (
              <Box
                key={event.id}
                padding="200"
                background="bg-surface-secondary"
                borderRadius="100"
              >
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <Icon
                      source={event.status === "sent" ? CheckCircleIcon : AlertTriangleIcon}
                      tone={event.status === "sent" ? "success" : "critical"}
                    />
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        {getEventLabel(event.eventType)}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {event.customerEmail.replace(/(.{3}).*(@.*)/, "$1***$2")}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {formatTime(event.timestamp)}
                  </Text>
                </InlineStack>
              </Box>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

function HelpCard() {
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Setting Up Klaviyo Flows
        </Text>

        <BlockStack gap="300">
          <BlockStack gap="100">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              1. Create a new Flow in Klaviyo
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              Go to Klaviyo → Flows → Create Flow → Start from Scratch
            </Text>
          </BlockStack>

          <BlockStack gap="100">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              2. Choose "Metric" as the trigger
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              Select a metric trigger to respond to RewardsPro events
            </Text>
          </BlockStack>

          <BlockStack gap="100">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              3. Search for "RewardsPro" events
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              All RewardsPro events are prefixed with "RewardsPro" (e.g., "RewardsPro Tier Upgraded")
            </Text>
          </BlockStack>

          <BlockStack gap="100">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              4. Design your email sequence
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              Use event properties and profile data to personalize your emails
            </Text>
          </BlockStack>
        </BlockStack>

        <Divider />

        <InlineStack gap="200">
          <Button url="https://docs.rewardspro.io/klaviyo" external>
            View Documentation
          </Button>
          <Button
            url="https://www.klaviyo.com/flows"
            external
            variant="plain"
          >
            Klaviyo Flows Guide
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function KlaviyoMarketingDashboard({
  syncStatus,
  eventToggles,
  recentEvents,
  onSyncNow,
  onToggleEvent,
  onOpenKlaviyo,
  onManageSettings,
  isSyncing,
}: KlaviyoMarketingDashboardProps) {
  return (
    <BlockStack gap="400">
      {/* Connection Status */}
      <ConnectionStatusCard
        syncStatus={syncStatus}
        onSyncNow={onSyncNow}
        onOpenKlaviyo={onOpenKlaviyo}
        isSyncing={isSyncing}
      />

      {/* Main Content Grid */}
      <InlineGrid columns={{ xs: 1, lg: "2fr 1fr" }} gap="400">
        {/* Left Column */}
        <BlockStack gap="400">
          <EventTrackingCard
            eventToggles={eventToggles}
            onToggleEvent={onToggleEvent}
          />
          <RecentEventsCard recentEvents={recentEvents} />
        </BlockStack>

        {/* Right Column */}
        <BlockStack gap="400">
          <HelpCard />

          {/* Quick Actions */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Quick Actions
              </Text>
              <BlockStack gap="200">
                <Button
                  fullWidth
                  textAlign="left"
                  icon={ExternalIcon}
                  onClick={onOpenKlaviyo}
                >
                  Create Flow in Klaviyo
                </Button>
                <Button
                  fullWidth
                  textAlign="left"
                  icon={PersonIcon}
                  url="https://www.klaviyo.com/profiles"
                  external
                >
                  View Synced Profiles
                </Button>
                <Button
                  fullWidth
                  textAlign="left"
                  icon={StarIcon}
                  url="https://www.klaviyo.com/lists-segments"
                  external
                >
                  Manage Segments
                </Button>
                <Divider />
                <Button
                  fullWidth
                  textAlign="left"
                  onClick={onManageSettings}
                  tone="critical"
                >
                  Switch to In-House Marketing
                </Button>
              </BlockStack>
            </BlockStack>
          </Card>
        </BlockStack>
      </InlineGrid>
    </BlockStack>
  );
}

export default KlaviyoMarketingDashboard;
