/**
 * Raffle Bonus Events Admin UI
 *
 * Allows merchants to create and manage bonus events for raffles.
 * Event types: HAPPY_HOUR, FLASH_BONUS, EARLY_BIRD, LAST_CHANCE, MILESTONE
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, Link } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import { useToast } from "~/hooks/useToast";
import {
  Page,
  Layout,
  Card,
  Button,
  Banner,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  Box,
  Toast,
  Frame,
  TextField,
  Select,
  FormLayout,
  Modal,
  Divider,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import {
  EditIcon,
  DeleteIcon,
  PlusIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import {
  createBonusEvent,
  updateBonusEvent,
  deleteBonusEvent,
  type BonusEventInfo,
} from "../services/raffle-bonus-events.server";
import db from "../db.server";
import type { RaffleBonusEventType } from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface BonusEventData {
  id: string;
  name: string;
  description: string | null;
  eventType: RaffleBonusEventType;
  bonusMultiplier: number;
  bonusEntriesFlat: number;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  currentUses: number;
  isRecurring: boolean;
}

interface LoaderData {
  raffle: {
    id: string;
    name: string;
    status: string;
  };
  bonusEvents: BonusEventData[];
}

// ============================================
// LOADER
// ============================================

const LOG_PREFIX = "[app.rewards.raffles.$id.bonus-events]";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  console.log(`${LOG_PREFIX} Loader starting for raffle: ${params.id}`);

  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const raffleId = params.id;

  if (!raffleId) {
    throw new Response("Raffle ID required", { status: 400 });
  }

  // Get raffle basic info
  const raffle = await db.raffle.findFirst({
    where: { id: raffleId, shop },
    select: { id: true, name: true, status: true },
  });

  if (!raffle) {
    throw new Response("Raffle not found", { status: 404 });
  }

  // Get all bonus events for this raffle (including inactive and shop-wide)
  const bonusEvents = await db.raffleBonusEvent.findMany({
    where: {
      shop,
      OR: [
        { raffleId },
        { raffleId: null }, // Shop-wide events
      ],
    },
    orderBy: [
      { isActive: "desc" },
      { startsAt: "desc" },
    ],
  });

  return json<LoaderData>({
    raffle: {
      id: raffle.id,
      name: raffle.name,
      status: raffle.status,
    },
    bonusEvents: bonusEvents.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      eventType: e.eventType,
      bonusMultiplier: Number(e.bonusMultiplier),
      bonusEntriesFlat: e.bonusEntriesFlat,
      discountPercent: e.discountPercent,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      isActive: e.isActive,
      maxUses: e.maxUses,
      maxUsesPerCustomer: e.maxUsesPerCustomer,
      currentUses: e.currentUses,
      isRecurring: e.isRecurring,
    })),
  });
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const raffleId = params.id;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (!raffleId) {
    return json({ success: false, error: "Raffle ID required" }, { status: 400 });
  }

  try {
    // Create bonus event
    if (intent === "create") {
      const name = formData.get("name") as string;
      const description = formData.get("description") as string;
      const eventType = formData.get("eventType") as RaffleBonusEventType;
      const bonusMultiplier = parseFloat(formData.get("bonusMultiplier") as string) || 1.5;
      const bonusEntriesFlat = parseInt(formData.get("bonusEntriesFlat") as string) || 0;
      const discountPercent = parseInt(formData.get("discountPercent") as string) || 0;
      const startsAt = new Date(formData.get("startsAt") as string);
      const endsAt = new Date(formData.get("endsAt") as string);
      const maxUses = formData.get("maxUses") as string;
      const maxUsesPerCustomer = formData.get("maxUsesPerCustomer") as string;
      const applyToAllRaffles = formData.get("applyToAllRaffles") === "true";

      await createBonusEvent(shop, {
        raffleId: applyToAllRaffles ? undefined : raffleId,
        name,
        description: description || undefined,
        eventType,
        bonusMultiplier,
        bonusEntriesFlat,
        discountPercent,
        startsAt,
        endsAt,
        maxUses: maxUses ? parseInt(maxUses) : undefined,
        maxUsesPerCustomer: maxUsesPerCustomer ? parseInt(maxUsesPerCustomer) : undefined,
      });

      return json({ success: true, message: "Bonus event created successfully" });
    }

    // Update bonus event
    if (intent === "update") {
      const eventId = formData.get("eventId") as string;
      const name = formData.get("name") as string;
      const description = formData.get("description") as string;
      const bonusMultiplier = parseFloat(formData.get("bonusMultiplier") as string);
      const bonusEntriesFlat = parseInt(formData.get("bonusEntriesFlat") as string);
      const discountPercent = parseInt(formData.get("discountPercent") as string);
      const startsAt = new Date(formData.get("startsAt") as string);
      const endsAt = new Date(formData.get("endsAt") as string);
      const maxUses = formData.get("maxUses") as string;
      const maxUsesPerCustomer = formData.get("maxUsesPerCustomer") as string;
      const isActive = formData.get("isActive") === "true";

      await updateBonusEvent(eventId, {
        name,
        description: description || undefined,
        bonusMultiplier,
        bonusEntriesFlat,
        discountPercent,
        startsAt,
        endsAt,
        maxUses: maxUses ? parseInt(maxUses) : null,
        maxUsesPerCustomer: maxUsesPerCustomer ? parseInt(maxUsesPerCustomer) : null,
        isActive,
      });

      return json({ success: true, message: "Bonus event updated successfully" });
    }

    // Delete bonus event
    if (intent === "delete") {
      const eventId = formData.get("eventId") as string;
      await deleteBonusEvent(eventId);
      return json({ success: true, message: "Bonus event deleted successfully" });
    }

    // Toggle active status
    if (intent === "toggle") {
      const eventId = formData.get("eventId") as string;
      const isActive = formData.get("isActive") === "true";
      await updateBonusEvent(eventId, { isActive: !isActive });
      return json({ success: true, message: `Bonus event ${isActive ? "deactivated" : "activated"}` });
    }

    return json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error(`${LOG_PREFIX} Action error:`, error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "An error occurred",
    }, { status: 400 });
  }
};

// ============================================
// COMPONENT
// ============================================

export default function RaffleBonusEvents() {
  const { raffle, bonusEvents } = useLoaderData<LoaderData>();
  const actionData = useActionData<{ success: boolean; message?: string; error?: string }>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Toast notifications
  const { toast, showSuccess, showError, hideToast } = useToast();

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<BonusEventData | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "",
    description: "",
    eventType: "HAPPY_HOUR" as RaffleBonusEventType,
    bonusMultiplier: "2.0",
    bonusEntriesFlat: "0",
    discountPercent: "0",
    startsAt: "",
    endsAt: "",
    maxUses: "",
    maxUsesPerCustomer: "",
    applyToAllRaffles: false,
    isActive: true,
  });

  // Reset form
  const resetForm = useCallback(() => {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);

    setForm({
      name: "",
      description: "",
      eventType: "HAPPY_HOUR",
      bonusMultiplier: "2.0",
      bonusEntriesFlat: "0",
      discountPercent: "0",
      startsAt: oneHourLater.toISOString().slice(0, 16),
      endsAt: threeHoursLater.toISOString().slice(0, 16),
      maxUses: "",
      maxUsesPerCustomer: "",
      applyToAllRaffles: false,
      isActive: true,
    });
  }, []);

  // Show toast on action result
  useEffect(() => {
    if (actionData) {
      if (actionData.success) {
        showSuccess(actionData.message || "Success");
        setShowCreateModal(false);
        setEditingEvent(null);
      } else {
        showError(actionData.error || "An error occurred");
      }
    }
  }, [actionData, showSuccess, showError]);

  // Handle create submit
  const handleCreateSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "create");
    formData.append("name", form.name);
    formData.append("description", form.description);
    formData.append("eventType", form.eventType);
    formData.append("bonusMultiplier", form.bonusMultiplier);
    formData.append("bonusEntriesFlat", form.bonusEntriesFlat);
    formData.append("discountPercent", form.discountPercent);
    formData.append("startsAt", form.startsAt);
    formData.append("endsAt", form.endsAt);
    formData.append("maxUses", form.maxUses);
    formData.append("maxUsesPerCustomer", form.maxUsesPerCustomer);
    formData.append("applyToAllRaffles", form.applyToAllRaffles.toString());

    submit(formData, { method: "post" });
  }, [form, submit]);

  // Handle edit submit
  const handleEditSubmit = useCallback(() => {
    if (!editingEvent) return;

    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("eventId", editingEvent.id);
    formData.append("name", form.name);
    formData.append("description", form.description);
    formData.append("bonusMultiplier", form.bonusMultiplier);
    formData.append("bonusEntriesFlat", form.bonusEntriesFlat);
    formData.append("discountPercent", form.discountPercent);
    formData.append("startsAt", form.startsAt);
    formData.append("endsAt", form.endsAt);
    formData.append("maxUses", form.maxUses);
    formData.append("maxUsesPerCustomer", form.maxUsesPerCustomer);
    formData.append("isActive", form.isActive.toString());

    submit(formData, { method: "post" });
  }, [editingEvent, form, submit]);

  // Handle delete
  const handleDelete = useCallback((eventId: string) => {
    if (!confirm("Delete this bonus event?")) return;

    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("eventId", eventId);
    submit(formData, { method: "post" });
  }, [submit]);

  // Handle toggle active
  const handleToggleActive = useCallback((event: BonusEventData) => {
    const formData = new FormData();
    formData.append("intent", "toggle");
    formData.append("eventId", event.id);
    formData.append("isActive", event.isActive.toString());
    submit(formData, { method: "post" });
  }, [submit]);

  // Open edit modal
  const openEditModal = useCallback((event: BonusEventData) => {
    setEditingEvent(event);
    setForm({
      name: event.name,
      description: event.description || "",
      eventType: event.eventType,
      bonusMultiplier: event.bonusMultiplier.toString(),
      bonusEntriesFlat: event.bonusEntriesFlat.toString(),
      discountPercent: event.discountPercent.toString(),
      startsAt: event.startsAt.slice(0, 16),
      endsAt: event.endsAt.slice(0, 16),
      maxUses: event.maxUses?.toString() || "",
      maxUsesPerCustomer: event.maxUsesPerCustomer?.toString() || "",
      applyToAllRaffles: false,
      isActive: event.isActive,
    });
  }, []);

  // Get status badge
  const getStatusBadge = (event: BonusEventData) => {
    const now = new Date();
    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);

    if (!event.isActive) {
      return <Badge tone="info">Inactive</Badge>;
    }
    if (now < startsAt) {
      return <Badge tone="attention">Scheduled</Badge>;
    }
    if (now >= startsAt && now <= endsAt) {
      return <Badge tone="success">Active</Badge>;
    }
    return <Badge>Ended</Badge>;
  };

  // Get event type badge
  const getEventTypeBadge = (type: RaffleBonusEventType) => {
    const config: Record<RaffleBonusEventType, { tone: "info" | "success" | "warning" | "attention"; label: string }> = {
      HAPPY_HOUR: { tone: "success", label: "Happy Hour" },
      FLASH_BONUS: { tone: "attention", label: "Flash Bonus" },
      EARLY_BIRD: { tone: "info", label: "Early Bird" },
      LAST_CHANCE: { tone: "warning", label: "Last Chance" },
      MILESTONE: { tone: "info", label: "Milestone" },
    };
    const c = config[type];
    return <Badge tone={c.tone}>{c.label}</Badge>;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format bonus description
  const formatBonus = (event: BonusEventData) => {
    const parts: string[] = [];
    if (event.bonusMultiplier > 1) {
      parts.push(`${event.bonusMultiplier}x entries`);
    }
    if (event.bonusEntriesFlat > 0) {
      parts.push(`+${event.bonusEntriesFlat} bonus`);
    }
    if (event.discountPercent > 0) {
      parts.push(`${event.discountPercent}% off`);
    }
    return parts.join(", ") || "No bonus configured";
  };

  // Build table rows
  const tableRows = bonusEvents.map((event) => [
    <BlockStack gap="100" key={`name-${event.id}`}>
      <Text as="span" fontWeight="semibold">{event.name}</Text>
      {getEventTypeBadge(event.eventType)}
    </BlockStack>,
    formatBonus(event),
    <BlockStack gap="050" key={`dates-${event.id}`}>
      <Text as="span" variant="bodySm">{formatDate(event.startsAt)}</Text>
      <Text as="span" variant="bodySm" tone="subdued">to {formatDate(event.endsAt)}</Text>
    </BlockStack>,
    <BlockStack gap="050" key={`uses-${event.id}`}>
      <Text as="span">{event.currentUses} uses</Text>
      {event.maxUses && (
        <Text as="span" variant="bodySm" tone="subdued">of {event.maxUses} max</Text>
      )}
    </BlockStack>,
    getStatusBadge(event),
    <InlineStack gap="100" key={`actions-${event.id}`}>
      <Button
        size="slim"
        icon={EditIcon}
        onClick={() => openEditModal(event)}
        accessibilityLabel="Edit"
      />
      <Button
        size="slim"
        onClick={() => handleToggleActive(event)}
        accessibilityLabel={event.isActive ? "Deactivate" : "Activate"}
      >
        {event.isActive ? "Pause" : "Resume"}
      </Button>
      <Button
        size="slim"
        icon={DeleteIcon}
        tone="critical"
        onClick={() => handleDelete(event.id)}
        accessibilityLabel="Delete"
      />
    </InlineStack>,
  ]);

  // Event type options
  const eventTypeOptions = [
    { label: "Happy Hour - Time-limited bonus window", value: "HAPPY_HOUR" },
    { label: "Flash Bonus - Short burst of bonus entries", value: "FLASH_BONUS" },
    { label: "Early Bird - Reward first entries", value: "EARLY_BIRD" },
    { label: "Last Chance - Final hours urgency", value: "LAST_CHANCE" },
    { label: "Milestone - Entry count trigger", value: "MILESTONE" },
  ];

  // Apply preset based on event type
  const applyPreset = useCallback((eventType: RaffleBonusEventType) => {
    const now = new Date();

    switch (eventType) {
      case "HAPPY_HOUR": {
        const start = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2 hours duration
        setForm((prev) => ({
          ...prev,
          eventType,
          name: "Happy Hour - 2x Entries!",
          description: "Double your entries during this special window!",
          bonusMultiplier: "2.0",
          bonusEntriesFlat: "0",
          discountPercent: "0",
          startsAt: start.toISOString().slice(0, 16),
          endsAt: end.toISOString().slice(0, 16),
        }));
        break;
      }
      case "FLASH_BONUS": {
        const start = new Date(now.getTime() + 30 * 60 * 1000); // 30 min from now
        const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min duration
        setForm((prev) => ({
          ...prev,
          eventType,
          name: "Flash Bonus - +5 Free Entries!",
          description: "Quick! Get 5 bonus entries with every purchase!",
          bonusMultiplier: "1.0",
          bonusEntriesFlat: "5",
          discountPercent: "0",
          startsAt: start.toISOString().slice(0, 16),
          endsAt: end.toISOString().slice(0, 16),
        }));
        break;
      }
      case "EARLY_BIRD": {
        const start = new Date(now.getTime() + 60 * 60 * 1000);
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        setForm((prev) => ({
          ...prev,
          eventType,
          name: "Early Bird Special - 1.5x Entries",
          description: "Get 50% more entries for being an early supporter!",
          bonusMultiplier: "1.5",
          bonusEntriesFlat: "0",
          discountPercent: "0",
          startsAt: start.toISOString().slice(0, 16),
          endsAt: end.toISOString().slice(0, 16),
        }));
        break;
      }
      case "LAST_CHANCE": {
        const start = new Date(now.getTime() + 60 * 60 * 1000);
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        setForm((prev) => ({
          ...prev,
          eventType,
          name: "Last Chance - 2x Entries!",
          description: "Final hours! Double entries before the draw!",
          bonusMultiplier: "2.0",
          bonusEntriesFlat: "0",
          discountPercent: "0",
          startsAt: start.toISOString().slice(0, 16),
          endsAt: end.toISOString().slice(0, 16),
        }));
        break;
      }
      case "MILESTONE": {
        const start = new Date(now.getTime() + 60 * 60 * 1000);
        const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week
        setForm((prev) => ({
          ...prev,
          eventType,
          name: "100th Entry Bonus!",
          description: "Be the 100th entry and get bonus entries!",
          bonusMultiplier: "1.0",
          bonusEntriesFlat: "10",
          discountPercent: "0",
          startsAt: start.toISOString().slice(0, 16),
          endsAt: end.toISOString().slice(0, 16),
          maxUses: "1",
        }));
        break;
      }
    }
  }, []);

  return (
    <Frame>
      <Page
        title="Bonus Events"
        subtitle={`Manage bonus events for ${raffle.name}`}
        backAction={{ content: "Back to Raffle", url: `/app/rewards/raffles/${raffle.id}` }}
        primaryAction={{
          content: "Create Bonus Event",
          icon: PlusIcon,
          onAction: () => {
            resetForm();
            setEditingEvent(null);
            setShowCreateModal(true);
          },
        }}
      >
        <Layout>
          {/* Info Banner */}
          <Layout.Section>
            <Banner tone="info">
              <p>
                Bonus events create urgency and drive engagement. Use Happy Hours for recurring time windows,
                Flash Bonuses for surprise promotions, or Last Chance for final-hours urgency.
              </p>
            </Banner>
          </Layout.Section>

          {/* Events Table */}
          <Layout.Section>
            <Card>
              {bonusEvents.length === 0 ? (
                <EmptyState
                  heading="No bonus events yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Create first bonus event",
                    onAction: () => {
                      resetForm();
                      setEditingEvent(null);
                      setShowCreateModal(true);
                    },
                  }}
                >
                  <p>Create bonus events to boost engagement and create excitement.</p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "numeric", "text", "text"]}
                  headings={["Event", "Bonus", "Schedule", "Usage", "Status", "Actions"]}
                  rows={tableRows}
                />
              )}
            </Card>
          </Layout.Section>
        </Layout>

        {/* Create/Edit Modal */}
        <Modal
          open={showCreateModal || editingEvent !== null}
          onClose={() => {
            setShowCreateModal(false);
            setEditingEvent(null);
          }}
          title={editingEvent ? "Edit Bonus Event" : "Create Bonus Event"}
          primaryAction={{
            content: editingEvent ? "Save Changes" : "Create Event",
            onAction: editingEvent ? handleEditSubmit : handleCreateSubmit,
            loading: isSubmitting,
            disabled: !form.name.trim() || !form.startsAt || !form.endsAt,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setShowCreateModal(false);
                setEditingEvent(null);
              },
            },
          ]}
          large
        >
          <Modal.Section>
            <FormLayout>
              {/* Event Type (only for create) */}
              {!editingEvent && (
                <Select
                  label="Event Type"
                  options={eventTypeOptions}
                  value={form.eventType}
                  onChange={(v) => {
                    applyPreset(v as RaffleBonusEventType);
                  }}
                  helpText="Select a type to auto-fill recommended settings"
                />
              )}

              <TextField
                label="Event Name"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                placeholder="e.g., Happy Hour - 2x Entries!"
                autoComplete="off"
              />

              <TextField
                label="Description (optional)"
                value={form.description}
                onChange={(v) => setForm({ ...form, description: v })}
                multiline={2}
                autoComplete="off"
              />

              <Divider />

              <Text variant="headingSm" as="h3">Bonus Configuration</Text>

              <InlineStack gap="400">
                <TextField
                  label="Entry Multiplier"
                  type="number"
                  value={form.bonusMultiplier}
                  onChange={(v) => setForm({ ...form, bonusMultiplier: v })}
                  helpText="e.g., 2.0 = double entries"
                  min={1}
                  step={0.5}
                  autoComplete="off"
                />
                <TextField
                  label="Flat Bonus Entries"
                  type="number"
                  value={form.bonusEntriesFlat}
                  onChange={(v) => setForm({ ...form, bonusEntriesFlat: v })}
                  helpText="Additional entries added"
                  min={0}
                  autoComplete="off"
                />
                <TextField
                  label="Entry Discount %"
                  type="number"
                  value={form.discountPercent}
                  onChange={(v) => setForm({ ...form, discountPercent: v })}
                  helpText="Discount on entry cost"
                  min={0}
                  max={100}
                  autoComplete="off"
                />
              </InlineStack>

              <Divider />

              <Text variant="headingSm" as="h3">Schedule</Text>

              <InlineStack gap="400">
                <TextField
                  label="Start Time"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(v) => setForm({ ...form, startsAt: v })}
                  autoComplete="off"
                />
                <TextField
                  label="End Time"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(v) => setForm({ ...form, endsAt: v })}
                  autoComplete="off"
                />
              </InlineStack>

              <Divider />

              <Text variant="headingSm" as="h3">Limits (Optional)</Text>

              <InlineStack gap="400">
                <TextField
                  label="Max Total Uses"
                  type="number"
                  value={form.maxUses}
                  onChange={(v) => setForm({ ...form, maxUses: v })}
                  helpText="Leave empty for unlimited"
                  min={1}
                  autoComplete="off"
                />
                <TextField
                  label="Max Uses Per Customer"
                  type="number"
                  value={form.maxUsesPerCustomer}
                  onChange={(v) => setForm({ ...form, maxUsesPerCustomer: v })}
                  helpText="Leave empty for unlimited"
                  min={1}
                  autoComplete="off"
                />
              </InlineStack>

              {/* Apply to all raffles (only for create) */}
              {!editingEvent && (
                <Box paddingBlockStart="400">
                  <Select
                    label="Apply to"
                    options={[
                      { label: `This raffle only (${raffle.name})`, value: "false" },
                      { label: "All raffles (shop-wide)", value: "true" },
                    ]}
                    value={form.applyToAllRaffles.toString()}
                    onChange={(v) => setForm({ ...form, applyToAllRaffles: v === "true" })}
                  />
                </Box>
              )}

              {/* Active toggle (only for edit) */}
              {editingEvent && (
                <Box paddingBlockStart="400">
                  <Select
                    label="Status"
                    options={[
                      { label: "Active", value: "true" },
                      { label: "Inactive", value: "false" },
                    ]}
                    value={form.isActive.toString()}
                    onChange={(v) => setForm({ ...form, isActive: v === "true" })}
                  />
                </Box>
              )}
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Toast */}
        {toast.active && (
          <Toast
            content={toast.content}
            error={toast.error}
            onDismiss={hideToast}
          />
        )}
      </Page>
    </Frame>
  );
}
