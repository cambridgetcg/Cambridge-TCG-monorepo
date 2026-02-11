import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
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
  ResourceList,
  ResourceItem,
  Thumbnail,
  EmptyState,
  ProgressBar,
  Popover,
  ActionList,
  Icon,
} from "@shopify/polaris";
import {
  EditIcon,
  DeleteIcon,
  PlusIcon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  XIcon,
} from "~/utils/polaris-icons";
import { ProductPicker, type SelectedProduct } from "~/components/ProductPicker";
import { authenticate } from "../shopify.server";
import {
  getRaffleWithDetails,
  updateRaffle,
  deleteRaffle,
  transitionRaffleStatus,
  createRafflePrize,
  updateRafflePrize,
  deleteRafflePrize,
  type RaffleStatus,
  type RaffleDrawType,
  type RafflePrizeType,
} from "../services/raffle-management.server";
import { getPointsConfig } from "../services/points-config.server";
import {
  executeRaffleDraw,
  getRaffleWinners,
  updateWinnerDeliveryStatus,
} from "../services/raffle-drawing.server";
import {
  deliverPrize,
  deliverAllRafflePrizes,
} from "../services/raffle-prize-delivery.server";
import db from "../db.server";
import { PointsIcon, DEFAULT_ICON_CONFIG } from "~/components/PointsIcon";
import type { CurrencyIconType } from "~/services/points-config.server";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface PrizeData {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  prizeType: RafflePrizeType;
  prizeValue: any;
  quantity: number;
  quantityWon: number;
  displayOrder: number;
  weight: number;
}

interface WinnerData {
  id: string;
  customerId: string;
  customerEmail: string;
  prizeName: string;
  prizeType: RafflePrizeType;
  position: number;
  entriesCount: number;
  deliveryStatus: "PENDING" | "PROCESSING" | "DELIVERED" | "FAILED" | "CLAIMED";
  discountCode: string | null;
  notifiedAt: string | null;
  claimedAt: string | null;
  createdAt: string;
}

interface RaffleData {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  status: RaffleStatus;
  startsAt: string;
  endsAt: string;
  drawAt: string | null;
  drawnAt: string | null;
  entryCost: number;
  maxEntriesTotal: number | null;
  maxEntriesPerCustomer: number;
  drawType: RaffleDrawType;
  totalWinners: number;
  totalEntries: number;
  uniqueEntrants: number;
  totalPrizePool: number;
  isPublic: boolean;
  tierRestrictions: any;
  minimumTier: string | null;
  prizes: PrizeData[];
}

interface LoaderData {
  raffle: RaffleData;
  pointsConfig: {
    currencyName: string;
    iconType: CurrencyIconType;
    iconId: string;
    iconColor: string;
  };
  recentEntries: Array<{
    id: string;
    customerEmail: string;
    entriesCount: number;
    pointsSpent: number;
    createdAt: string;
  }>;
  winners: WinnerData[];
}

// ============================================
// LOADER
// ============================================

const LOG_PREFIX = "[app.rewards.raffles.$id]";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  console.log(`${LOG_PREFIX} Loader starting for raffle: ${params.id}`);

  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const raffleId = params.id;

  if (!raffleId) {
    throw new Response("Raffle ID required", { status: 400 });
  }

  const [raffle, config] = await Promise.all([
    getRaffleWithDetails(raffleId, shop),
    getPointsConfig(shop),
  ]);

  if (!raffle) {
    throw new Response("Raffle not found", { status: 404 });
  }

  // Get recent entries
  let recentEntries: any[] = [];
  try {
    const entries = await db.raffleEntry.findMany({
      where: { raffleId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        customer: {
          select: { email: true },
        },
      },
    });
    recentEntries = entries.map((e: any) => ({
      id: e.id,
      customerEmail: e.customer?.email || "Unknown",
      entriesCount: e.entriesCount,
      pointsSpent: e.pointsSpent,
      createdAt: e.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching entries:`, error);
  }

  // Get winners if raffle has been drawn
  let winners: WinnerData[] = [];
  if (["DRAWING", "COMPLETED"].includes(raffle.status)) {
    try {
      const winnersData = await getRaffleWinners(raffleId);
      winners = winnersData.map((w: any) => ({
        id: w.id,
        customerId: w.customerId,
        customerEmail: w.customer?.email || "Unknown",
        prizeName: w.prize?.name || "Unknown Prize",
        prizeType: w.prize?.prizeType || "CUSTOM",
        position: w.position,
        entriesCount: w.entriesCount,
        deliveryStatus: w.deliveryStatus,
        discountCode: w.discountCode,
        notifiedAt: w.notifiedAt?.toISOString() || null,
        claimedAt: w.claimedAt?.toISOString() || null,
        createdAt: w.createdAt.toISOString(),
      }));
    } catch (error) {
      console.error(`${LOG_PREFIX} Error fetching winners:`, error);
    }
  }

  return json<LoaderData>({
    raffle: {
      id: raffle.id,
      name: raffle.name,
      description: raffle.description,
      imageUrl: raffle.imageUrl,
      status: raffle.status,
      startsAt: raffle.startsAt.toISOString(),
      endsAt: raffle.endsAt.toISOString(),
      drawAt: raffle.drawAt?.toISOString() || null,
      drawnAt: raffle.drawnAt?.toISOString() || null,
      entryCost: raffle.entryCost,
      maxEntriesTotal: raffle.maxEntriesTotal,
      maxEntriesPerCustomer: raffle.maxEntriesPerCustomer,
      drawType: raffle.drawType,
      totalWinners: raffle.totalWinners,
      totalEntries: raffle.totalEntries,
      uniqueEntrants: raffle.uniqueEntrants,
      totalPrizePool: raffle.totalPrizePool,
      isPublic: raffle.isPublic,
      tierRestrictions: raffle.tierRestrictions,
      minimumTier: raffle.minimumTier,
      prizes: raffle.prizes.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        prizeType: p.prizeType,
        prizeValue: p.prizeValue,
        quantity: p.quantity,
        quantityWon: p.quantityWon,
        displayOrder: p.displayOrder,
        weight: p.weight,
      })),
    },
    pointsConfig: {
      currencyName: config.currencyName,
      // Use default vector icon config (emoji system deprecated)
      iconType: DEFAULT_ICON_CONFIG.iconType,
      iconId: DEFAULT_ICON_CONFIG.iconId,
      iconColor: DEFAULT_ICON_CONFIG.iconColor,
    },
    recentEntries,
    winners,
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
    // Update raffle details
    if (intent === "updateRaffle") {
      const name = formData.get("name") as string;
      const description = formData.get("description") as string;
      const entryCost = parseInt(formData.get("entryCost") as string);
      const maxEntriesPerCustomer = parseInt(formData.get("maxEntriesPerCustomer") as string);
      const maxEntriesTotal = formData.get("maxEntriesTotal") as string;
      const drawType = formData.get("drawType") as RaffleDrawType;
      const totalWinners = parseInt(formData.get("totalWinners") as string);
      const startsAt = new Date(formData.get("startsAt") as string);
      const endsAt = new Date(formData.get("endsAt") as string);
      const isPublic = formData.get("isPublic") === "true";

      await updateRaffle(raffleId, shop, {
        name,
        description: description || undefined,
        entryCost,
        maxEntriesPerCustomer,
        maxEntriesTotal: maxEntriesTotal ? parseInt(maxEntriesTotal) : null,
        drawType,
        totalWinners,
        startsAt,
        endsAt,
        isPublic,
      });

      return json({ success: true, message: "Raffle updated successfully" });
    }

    // Transition status
    if (intent === "transitionStatus") {
      const newStatus = formData.get("newStatus") as RaffleStatus;
      await transitionRaffleStatus(raffleId, shop, newStatus);
      return json({ success: true, message: `Raffle status changed to ${newStatus}` });
    }

    // Delete raffle
    if (intent === "deleteRaffle") {
      await deleteRaffle(raffleId, shop);
      return redirect("/app/rewards/raffles");
    }

    // Create prize
    if (intent === "createPrize") {
      const name = formData.get("prizeName") as string;
      const description = formData.get("prizeDescription") as string;
      const prizeType = formData.get("prizeType") as RafflePrizeType;
      const quantity = parseInt(formData.get("prizeQuantity") as string) || 1;
      const weight = parseInt(formData.get("prizeWeight") as string) || 100;

      // Build prize value based on type
      let prizeValue: any = {};
      if (prizeType === "DISCOUNT") {
        prizeValue = {
          type: formData.get("discountType") as string,
          value: parseInt(formData.get("discountValue") as string),
          maxUses: 1,
        };
      } else if (prizeType === "STORE_CREDIT") {
        prizeValue = {
          amount: parseInt(formData.get("storeCreditAmount") as string),
        };
      } else if (prizeType === "POINTS") {
        prizeValue = {
          amount: parseInt(formData.get("pointsAmount") as string),
        };
      } else if (prizeType === "CUSTOM") {
        prizeValue = {
          fulfillmentInstructions: formData.get("customInstructions") as string,
        };
      } else if (prizeType === "PRODUCT") {
        prizeValue = {
          productId: formData.get("productId") as string,
          variantId: formData.get("variantId") as string,
          quantity: parseInt(formData.get("productQuantityPerWinner") as string) || 1,
          // Cached for display
          productTitle: formData.get("productTitle") as string,
          productImage: formData.get("productImage") as string || undefined,
          price: formData.get("productPrice") as string,
          sku: formData.get("productSku") as string || undefined,
        };
      }

      await createRafflePrize({
        raffleId,
        name,
        description: description || undefined,
        prizeType,
        prizeValue,
        quantity,
        weight,
      });

      return json({ success: true, message: "Prize added successfully" });
    }

    // Update prize
    if (intent === "updatePrize") {
      const prizeId = formData.get("prizeId") as string;
      const name = formData.get("prizeName") as string;
      const quantity = parseInt(formData.get("prizeQuantity") as string);
      const weight = parseInt(formData.get("prizeWeight") as string);

      await updateRafflePrize(prizeId, {
        name,
        quantity,
        weight,
      });

      return json({ success: true, message: "Prize updated successfully" });
    }

    // Delete prize
    if (intent === "deletePrize") {
      const prizeId = formData.get("prizeId") as string;
      await deleteRafflePrize(prizeId);
      return json({ success: true, message: "Prize deleted successfully" });
    }

    // Execute raffle draw
    if (intent === "executeDraw") {
      console.log(`${LOG_PREFIX} Executing draw for raffle: ${raffleId}`);
      const result = await executeRaffleDraw(raffleId, shop);

      if (result.success) {
        // Auto-deliver prizes
        const deliveryResult = await deliverAllRafflePrizes(raffleId, shop);
        return json({
          success: true,
          message: `Draw complete! ${result.winnersCount} winners selected. ${deliveryResult.successful} prizes delivered, ${deliveryResult.requiresManual} require manual action.`,
          winners: result.winners,
        });
      } else {
        return json({
          success: false,
          error: result.error || "Draw failed",
        }, { status: 400 });
      }
    }

    // Deliver single prize
    if (intent === "deliverPrize") {
      const winnerId = formData.get("winnerId") as string;
      console.log(`${LOG_PREFIX} Delivering prize to winner: ${winnerId}`);

      const result = await deliverPrize(winnerId);

      if (result.success) {
        return json({
          success: true,
          message: result.requiresManualAction
            ? `Prize marked for manual fulfillment: ${result.manualActionReason}`
            : `Prize delivered successfully${result.discountCode ? `. Code: ${result.discountCode}` : ""}`,
        });
      } else {
        return json({
          success: false,
          error: result.error || "Delivery failed",
        }, { status: 400 });
      }
    }

    // Deliver all pending prizes
    if (intent === "deliverAllPrizes") {
      console.log(`${LOG_PREFIX} Delivering all prizes for raffle: ${raffleId}`);
      const result = await deliverAllRafflePrizes(raffleId, shop);

      return json({
        success: true,
        message: `Delivery complete: ${result.successful} delivered, ${result.failed} failed, ${result.requiresManual} require manual action.`,
      });
    }

    // Retry failed deliveries
    if (intent === "retryFailedDeliveries") {
      const { retryFailedDeliveries } = await import("../services/raffle-prize-delivery.server");
      console.log(`${LOG_PREFIX} Retrying failed deliveries for raffle: ${raffleId}`);

      const result = await retryFailedDeliveries(raffleId, shop);

      return json({
        success: true,
        message: `Retried ${result.retried} deliveries: ${result.successful} now successful, ${result.stillFailed} still failed.`,
      });
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

export default function RaffleDetail() {
  const { raffle, pointsConfig, recentEntries, winners } = useLoaderData<LoaderData>();
  const actionData = useActionData<{ success: boolean; message?: string; error?: string }>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Standardized toast notifications
  const { toast, showSuccess, showError, hideToast } = useToast();

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrizeModal, setShowPrizeModal] = useState(false);
  const [editingPrize, setEditingPrize] = useState<PrizeData | null>(null);
  const [statusPopoverActive, setStatusPopoverActive] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: raffle.name,
    description: raffle.description || "",
    entryCost: raffle.entryCost.toString(),
    maxEntriesPerCustomer: raffle.maxEntriesPerCustomer.toString(),
    maxEntriesTotal: raffle.maxEntriesTotal?.toString() || "",
    drawType: raffle.drawType,
    totalWinners: raffle.totalWinners.toString(),
    startsAt: raffle.startsAt.split("T")[0],
    endsAt: raffle.endsAt.split("T")[0],
    isPublic: raffle.isPublic,
  });

  // Prize form state
  const [prizeForm, setPrizeForm] = useState({
    name: "",
    description: "",
    prizeType: "DISCOUNT" as RafflePrizeType,
    quantity: "1",
    weight: "100",
    // Type-specific fields
    discountType: "percentage",
    discountValue: "10",
    storeCreditAmount: "500",
    pointsAmount: "100",
    customInstructions: "",
    // Product fields
    selectedProduct: null as SelectedProduct | null,
    productQuantity: "1",
  });

  // Product picker modal state
  const [showProductPicker, setShowProductPicker] = useState(false);

  // Product search handler
  const handleProductSearch = useCallback(async (query: string) => {
    const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.products;
  }, []);

  // Browse products (no search required)
  const handleProductBrowse = useCallback(async () => {
    const response = await fetch(`/api/products/search?browse=1`);
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.products;
  }, []);

  // Get collections for filtering
  const handleGetCollections = useCallback(async () => {
    const response = await fetch(`/api/products/search?collections=1`);
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.collections;
  }, []);

  // Get products in a specific collection
  const handleGetCollectionProducts = useCallback(async (collectionId: string) => {
    const response = await fetch(`/api/products/search?collection=${encodeURIComponent(collectionId)}`);
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.products;
  }, []);

  // Handle product selection
  const handleProductSelect = useCallback((product: SelectedProduct) => {
    setPrizeForm((prev) => ({
      ...prev,
      selectedProduct: product,
      name: prev.name || product.title, // Auto-fill name if empty
    }));
  }, []);

  // Show toast on action result
  useEffect(() => {
    if (actionData) {
      if (actionData.success) {
        showSuccess(actionData.message || "Success");
      } else {
        showError(actionData.error || actionData.message || "An error occurred");
      }
    }
  }, [actionData, showSuccess, showError]);

  // Handle edit form submit
  const handleEditSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "updateRaffle");
    formData.append("name", editForm.name);
    formData.append("description", editForm.description);
    formData.append("entryCost", editForm.entryCost);
    formData.append("maxEntriesPerCustomer", editForm.maxEntriesPerCustomer);
    formData.append("maxEntriesTotal", editForm.maxEntriesTotal);
    formData.append("drawType", editForm.drawType);
    formData.append("totalWinners", editForm.totalWinners);
    formData.append("startsAt", editForm.startsAt);
    formData.append("endsAt", editForm.endsAt);
    formData.append("isPublic", editForm.isPublic.toString());

    submit(formData, { method: "post" });
    setShowEditModal(false);
  }, [editForm, submit]);

  // Handle prize form submit
  const handlePrizeSubmit = useCallback(() => {
    const formData = new FormData();

    if (editingPrize) {
      formData.append("intent", "updatePrize");
      formData.append("prizeId", editingPrize.id);
    } else {
      formData.append("intent", "createPrize");
    }

    formData.append("prizeName", prizeForm.name);
    formData.append("prizeDescription", prizeForm.description);
    formData.append("prizeType", prizeForm.prizeType);
    formData.append("prizeQuantity", prizeForm.quantity);
    formData.append("prizeWeight", prizeForm.weight);

    // Type-specific fields
    if (prizeForm.prizeType === "DISCOUNT") {
      formData.append("discountType", prizeForm.discountType);
      formData.append("discountValue", prizeForm.discountValue);
    } else if (prizeForm.prizeType === "STORE_CREDIT") {
      formData.append("storeCreditAmount", prizeForm.storeCreditAmount);
    } else if (prizeForm.prizeType === "POINTS") {
      formData.append("pointsAmount", prizeForm.pointsAmount);
    } else if (prizeForm.prizeType === "CUSTOM") {
      formData.append("customInstructions", prizeForm.customInstructions);
    } else if (prizeForm.prizeType === "PRODUCT" && prizeForm.selectedProduct) {
      formData.append("productId", prizeForm.selectedProduct.productId);
      formData.append("variantId", prizeForm.selectedProduct.variantId);
      formData.append("productTitle", prizeForm.selectedProduct.title);
      formData.append("productImage", prizeForm.selectedProduct.image || "");
      formData.append("productPrice", prizeForm.selectedProduct.price);
      formData.append("productSku", prizeForm.selectedProduct.sku || "");
      formData.append("productQuantityPerWinner", prizeForm.productQuantity);
    }

    submit(formData, { method: "post" });
    setShowPrizeModal(false);
    setEditingPrize(null);
    resetPrizeForm();
  }, [prizeForm, editingPrize, submit]);

  const resetPrizeForm = () => {
    setPrizeForm({
      name: "",
      description: "",
      prizeType: "DISCOUNT",
      quantity: "1",
      weight: "100",
      discountType: "percentage",
      discountValue: "10",
      storeCreditAmount: "500",
      pointsAmount: "100",
      customInstructions: "",
      selectedProduct: null,
      productQuantity: "1",
    });
  };

  // Handle status transition
  const handleStatusTransition = useCallback((newStatus: RaffleStatus) => {
    const formData = new FormData();
    formData.append("intent", "transitionStatus");
    formData.append("newStatus", newStatus);
    submit(formData, { method: "post" });
    setStatusPopoverActive(false);
  }, [submit]);

  // Handle delete raffle
  const handleDeleteRaffle = useCallback(() => {
    if (!confirm("Are you sure you want to delete this raffle? This cannot be undone.")) return;
    const formData = new FormData();
    formData.append("intent", "deleteRaffle");
    submit(formData, { method: "post" });
  }, [submit]);

  // Handle delete prize
  const handleDeletePrize = useCallback((prizeId: string) => {
    if (!confirm("Delete this prize?")) return;
    const formData = new FormData();
    formData.append("intent", "deletePrize");
    formData.append("prizeId", prizeId);
    submit(formData, { method: "post" });
  }, [submit]);

  // Handle execute draw
  const handleExecuteDraw = useCallback(() => {
    if (!confirm(`Are you sure you want to draw ${raffle.totalWinners} winners?\n\nThis action cannot be undone. Prizes will be automatically delivered.`)) return;
    const formData = new FormData();
    formData.append("intent", "executeDraw");
    submit(formData, { method: "post" });
  }, [submit, raffle.totalWinners]);

  // Handle deliver single prize
  const handleDeliverPrize = useCallback((winnerId: string) => {
    const formData = new FormData();
    formData.append("intent", "deliverPrize");
    formData.append("winnerId", winnerId);
    submit(formData, { method: "post" });
  }, [submit]);

  // Handle deliver all pending prizes
  const handleDeliverAllPrizes = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "deliverAllPrizes");
    submit(formData, { method: "post" });
  }, [submit]);

  // Handle retry failed deliveries
  const handleRetryFailedDeliveries = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "retryFailedDeliveries");
    submit(formData, { method: "post" });
  }, [submit]);

  // Open prize edit modal
  const openEditPrize = useCallback((prize: PrizeData) => {
    setEditingPrize(prize);
    setPrizeForm({
      name: prize.name,
      description: prize.description || "",
      prizeType: prize.prizeType,
      quantity: prize.quantity.toString(),
      weight: prize.weight.toString(),
      discountType: prize.prizeValue?.type || "percentage",
      discountValue: prize.prizeValue?.value?.toString() || "10",
      storeCreditAmount: prize.prizeValue?.amount?.toString() || "500",
      pointsAmount: prize.prizeValue?.amount?.toString() || "100",
      customInstructions: prize.prizeValue?.fulfillmentInstructions || "",
    });
    setShowPrizeModal(true);
  }, []);

  // Status badge helper
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { tone: "info" | "success" | "warning" | "critical" | "attention"; label: string }> = {
      DRAFT: { tone: "info", label: "Draft" },
      SCHEDULED: { tone: "attention", label: "Scheduled" },
      ACTIVE: { tone: "success", label: "Active" },
      CLOSED: { tone: "warning", label: "Closed" },
      DRAWING: { tone: "attention", label: "Drawing" },
      COMPLETED: { tone: "info", label: "Completed" },
      CANCELLED: { tone: "critical", label: "Cancelled" },
    };
    const config = statusConfig[status] || { tone: "info" as const, label: status };
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };

  // Prize type badge helper
  const getPrizeTypeBadge = (type: RafflePrizeType) => {
    const typeConfig: Record<string, { tone: "info" | "success" | "warning" | "attention"; label: string }> = {
      DISCOUNT: { tone: "success", label: "Discount" },
      STORE_CREDIT: { tone: "attention", label: "Store Credit" },
      PRODUCT: { tone: "info", label: "Product" },
      POINTS: { tone: "warning", label: "Points" },
      CUSTOM: { tone: "info", label: "Custom" },
    };
    const config = typeConfig[type] || { tone: "info" as const, label: type };
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };

  // Delivery status badge helper
  const getDeliveryStatusBadge = (status: string) => {
    const statusConfig: Record<string, { tone: "info" | "success" | "warning" | "critical" | "attention"; label: string }> = {
      PENDING: { tone: "warning", label: "Pending" },
      PROCESSING: { tone: "attention", label: "Processing" },
      DELIVERED: { tone: "success", label: "Delivered" },
      FAILED: { tone: "critical", label: "Failed" },
      CLAIMED: { tone: "success", label: "Claimed" },
    };
    const config = statusConfig[status] || { tone: "info" as const, label: status };
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get available status transitions
  const getAvailableTransitions = (currentStatus: RaffleStatus): { status: RaffleStatus; label: string; destructive?: boolean }[] => {
    const transitions: Record<string, { status: RaffleStatus; label: string; destructive?: boolean }[]> = {
      DRAFT: [
        { status: "SCHEDULED", label: "Schedule" },
        { status: "ACTIVE", label: "Activate Now" },
        { status: "CANCELLED", label: "Cancel", destructive: true },
      ],
      SCHEDULED: [
        { status: "ACTIVE", label: "Activate Now" },
        { status: "CANCELLED", label: "Cancel", destructive: true },
      ],
      ACTIVE: [
        { status: "CLOSED", label: "Close Entries" },
        { status: "CANCELLED", label: "Cancel", destructive: true },
      ],
      CLOSED: [
        { status: "DRAWING", label: "Start Drawing" },
        { status: "CANCELLED", label: "Cancel", destructive: true },
      ],
      DRAWING: [
        { status: "COMPLETED", label: "Complete" },
      ],
      COMPLETED: [],
      CANCELLED: [],
    };
    return transitions[currentStatus] || [];
  };

  const availableTransitions = getAvailableTransitions(raffle.status);
  const canEdit = ["DRAFT", "SCHEDULED"].includes(raffle.status);
  const canDelete = raffle.status === "DRAFT";
  const canAddPrizes = ["DRAFT", "SCHEDULED"].includes(raffle.status);
  const canDraw = raffle.status === "CLOSED" && raffle.totalEntries > 0 && raffle.prizes.length > 0;
  const hasWinners = winners.length > 0;
  const pendingDeliveries = winners.filter(w => w.deliveryStatus === "PENDING").length;
  const failedDeliveries = winners.filter(w => w.deliveryStatus === "FAILED").length;

  // Calculate progress
  const entriesProgress = raffle.maxEntriesTotal
    ? Math.min((raffle.totalEntries / raffle.maxEntriesTotal) * 100, 100)
    : 0;

  return (
    <Frame>
      <Page
        title={raffle.name}
        subtitle={`${raffle.entryCost} ${pointsConfig.currencyName}/entry`}
        backAction={{ content: "Raffles", url: "/app/rewards/raffles" }}
        titleMetadata={getStatusBadge(raffle.status)}
        primaryAction={
          canEdit
            ? {
                content: "Edit Raffle",
                icon: EditIcon,
                onAction: () => setShowEditModal(true),
              }
            : undefined
        }
        secondaryActions={[
          ...(availableTransitions.length > 0
            ? [
                {
                  content: "Change Status",
                  onAction: () => setStatusPopoverActive(true),
                },
              ]
            : []),
          ...(canDelete
            ? [
                {
                  content: "Delete",
                  destructive: true,
                  onAction: handleDeleteRaffle,
                },
              ]
            : []),
        ]}
      >
        <Layout>
          {/* Action Banner for Non-draft Status */}
          {raffle.status === "ACTIVE" && raffle.prizes.length === 0 && (
            <Layout.Section>
              <Banner tone="warning" title="No prizes configured">
                <p>This raffle has no prizes. Customers can enter but there's nothing to win.</p>
              </Banner>
            </Layout.Section>
          )}

          {/* Main Content - Details & Prizes */}
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">Raffle Details</Text>

                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Points per Entry</Text>
                      <InlineStack gap="100" blockAlign="center">
                        <PointsIcon iconType={pointsConfig.iconType} iconId={pointsConfig.iconId} iconColor={pointsConfig.iconColor} size={14} />
                        <Text as="span" fontWeight="semibold">{raffle.entryCost}</Text>
                      </InlineStack>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Max Entries per Customer</Text>
                      <Text as="span" fontWeight="semibold">{raffle.maxEntriesPerCustomer}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Total Entry Limit</Text>
                      <Text as="span" fontWeight="semibold">
                        {raffle.maxEntriesTotal?.toLocaleString() || "Unlimited"}
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Draw Type</Text>
                      <Text as="span" fontWeight="semibold">{raffle.drawType}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Winners to Select</Text>
                      <Text as="span" fontWeight="semibold">{raffle.totalWinners}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Visibility</Text>
                      <Badge tone={raffle.isPublic ? "success" : "info"}>
                        {raffle.isPublic ? "Public" : "Private"}
                      </Badge>
                    </InlineStack>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Schedule</Text>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Starts</Text>
                      <Text as="span" fontWeight="semibold">{formatDate(raffle.startsAt)}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Ends</Text>
                      <Text as="span" fontWeight="semibold">{formatDate(raffle.endsAt)}</Text>
                    </InlineStack>
                    {raffle.drawAt && (
                      <InlineStack align="space-between">
                        <Text as="span" tone="subdued">Scheduled Draw</Text>
                        <Text as="span" fontWeight="semibold">{formatDate(raffle.drawAt)}</Text>
                      </InlineStack>
                    )}
                    {raffle.drawnAt && (
                      <InlineStack align="space-between">
                        <Text as="span" tone="subdued">Drawn At</Text>
                        <Text as="span" fontWeight="semibold">{formatDate(raffle.drawnAt)}</Text>
                      </InlineStack>
                    )}
                  </BlockStack>

                  {raffle.description && (
                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h4">Description</Text>
                      <Text as="p">{raffle.description}</Text>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h3">Prizes ({raffle.prizes.length})</Text>
                    {canAddPrizes && (
                      <Button
                        icon={PlusIcon}
                        onClick={() => {
                          resetPrizeForm();
                          setEditingPrize(null);
                          setShowPrizeModal(true);
                        }}
                      >
                        Add Prize
                      </Button>
                    )}
                  </InlineStack>

                  {raffle.prizes.length === 0 ? (
                    <EmptyState
                      heading="No prizes yet"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      action={
                        canAddPrizes
                          ? {
                              content: "Add first prize",
                              onAction: () => {
                                resetPrizeForm();
                                setEditingPrize(null);
                                setShowPrizeModal(true);
                              },
                            }
                          : undefined
                      }
                    >
                      <p>Add prizes to make this raffle exciting for your customers.</p>
                    </EmptyState>
                  ) : (
                    <ResourceList
                      items={raffle.prizes}
                      renderItem={(prize) => (
                        <ResourceItem
                          id={prize.id}
                          onClick={() => canEdit && openEditPrize(prize)}
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                              <InlineStack gap="200">
                                <Text as="span" fontWeight="semibold">{prize.name}</Text>
                                {getPrizeTypeBadge(prize.prizeType)}
                              </InlineStack>
                              <Text as="span" tone="subdued" variant="bodySm">
                                {prize.quantity - prize.quantityWon} of {prize.quantity} available
                                {prize.weight !== 100 && ` • Weight: ${prize.weight}`}
                              </Text>
                            </BlockStack>
                            {canEdit && (
                              <InlineStack gap="100">
                                <Button
                                  size="slim"
                                  icon={EditIcon}
                                  onClick={() => openEditPrize(prize)}
                                />
                                <Button
                                  size="slim"
                                  icon={DeleteIcon}
                                  tone="critical"
                                  onClick={() => handleDeletePrize(prize.id)}
                                />
                              </InlineStack>
                            )}
                          </InlineStack>
                        </ResourceItem>
                      )}
                    />
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Sidebar - Overview & Recent Activity */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">Overview</Text>
                  <BlockStack gap="300">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Total Entries</Text>
                      <Text as="p" variant="headingLg" fontWeight="bold">
                        {raffle.totalEntries.toLocaleString()}
                      </Text>
                      {raffle.maxEntriesTotal && (
                        <ProgressBar progress={entriesProgress} size="small" />
                      )}
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Unique Entrants</Text>
                      <Text as="p" variant="headingLg" fontWeight="bold">
                        {raffle.uniqueEntrants.toLocaleString()}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Points Collected</Text>
                      <InlineStack gap="100" blockAlign="center">
                        <PointsIcon iconType={pointsConfig.iconType} iconId={pointsConfig.iconId} iconColor={pointsConfig.iconColor} size={20} />
                        <Text as="p" variant="headingLg" fontWeight="bold">
                          {raffle.totalPrizePool.toLocaleString()}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">Recent Entries</Text>
                  {recentEntries.length === 0 ? (
                    <Text as="p" tone="subdued">No entries yet.</Text>
                  ) : (
                    <BlockStack gap="200">
                      {recentEntries.map((entry) => (
                        <InlineStack key={entry.id} align="space-between">
                          <BlockStack gap="050">
                            <Text as="span" variant="bodySm">{entry.customerEmail}</Text>
                            <Text as="span" tone="subdued" variant="bodySm">
                              {formatDate(entry.createdAt)}
                            </Text>
                          </BlockStack>
                          <BlockStack gap="050">
                            <Text as="span" fontWeight="semibold" variant="bodySm" alignment="end">
                              {entry.entriesCount} {entry.entriesCount === 1 ? "entry" : "entries"}
                            </Text>
                            <InlineStack gap="100" blockAlign="center">
                              <PointsIcon iconType={pointsConfig.iconType} iconId={pointsConfig.iconId} iconColor={pointsConfig.iconColor} size={12} />
                              <Text as="span" tone="subdued" variant="bodySm" alignment="end">
                                {entry.pointsSpent} spent
                              </Text>
                            </InlineStack>
                          </BlockStack>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Draw Winners Section - Only show for CLOSED status */}
          {canDraw && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h3">Draw Winners</Text>
                      <Text as="p" tone="subdued">
                        Ready to select {raffle.totalWinners} {raffle.totalWinners === 1 ? "winner" : "winners"} from {raffle.totalEntries} {raffle.totalEntries === 1 ? "entry" : "entries"} using {raffle.drawType.toLowerCase()} selection.
                      </Text>
                    </BlockStack>
                    <Button
                      variant="primary"
                      icon={PlayIcon}
                      onClick={handleExecuteDraw}
                      loading={isSubmitting}
                    >
                      Draw Winners Now
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Winners Section - Show when we have winners */}
          {hasWinners && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h3">
                        Winners ({winners.length})
                      </Text>
                      {(pendingDeliveries > 0 || failedDeliveries > 0) && (
                        <InlineStack gap="200">
                          {pendingDeliveries > 0 && (
                            <Badge tone="warning">{pendingDeliveries} pending delivery</Badge>
                          )}
                          {failedDeliveries > 0 && (
                            <Badge tone="critical">{failedDeliveries} failed</Badge>
                          )}
                        </InlineStack>
                      )}
                    </BlockStack>
                    <InlineStack gap="200">
                      {pendingDeliveries > 0 && (
                        <Button
                          onClick={handleDeliverAllPrizes}
                          loading={isSubmitting}
                        >
                          Deliver All Pending
                        </Button>
                      )}
                      {failedDeliveries > 0 && (
                        <Button
                          onClick={handleRetryFailedDeliveries}
                          loading={isSubmitting}
                        >
                          Retry Failed
                        </Button>
                      )}
                    </InlineStack>
                  </InlineStack>
                  <Divider />

                  <ResourceList
                    items={winners}
                    renderItem={(winner) => (
                      <ResourceItem
                        id={winner.id}
                        accessibilityLabel={`Winner ${winner.position}: ${winner.customerEmail}`}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Badge tone="info">#{winner.position}</Badge>
                              <Text as="span" fontWeight="semibold">{winner.customerEmail}</Text>
                            </InlineStack>
                            <InlineStack gap="200">
                              <Text as="span" tone="subdued" variant="bodySm">
                                Prize: {winner.prizeName}
                              </Text>
                              {getPrizeTypeBadge(winner.prizeType)}
                              {winner.discountCode && (
                                <Text as="span" variant="bodySm" fontWeight="semibold">
                                  Code: {winner.discountCode}
                                </Text>
                              )}
                            </InlineStack>
                          </BlockStack>
                          <InlineStack gap="200" blockAlign="center">
                            {getDeliveryStatusBadge(winner.deliveryStatus)}
                            {(winner.deliveryStatus === "PENDING" || winner.deliveryStatus === "FAILED") && (
                              <Button
                                size="slim"
                                onClick={() => handleDeliverPrize(winner.id)}
                                loading={isSubmitting}
                              >
                                {winner.deliveryStatus === "FAILED" ? "Retry" : "Deliver"}
                              </Button>
                            )}
                          </InlineStack>
                        </InlineStack>
                      </ResourceItem>
                    )}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          )}
        </Layout>

        {/* Status Change Popover */}
        {availableTransitions.length > 0 && (
          <Popover
            active={statusPopoverActive}
            activator={<div />}
            onClose={() => setStatusPopoverActive(false)}
          >
            <ActionList
              items={availableTransitions.map((t) => ({
                content: t.label,
                destructive: t.destructive,
                onAction: () => handleStatusTransition(t.status),
              }))}
            />
          </Popover>
        )}

        {/* Edit Raffle Modal */}
        <Modal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          title="Edit Raffle"
          primaryAction={{
            content: "Save Changes",
            onAction: handleEditSubmit,
            loading: isSubmitting,
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setShowEditModal(false) },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Raffle Name"
                value={editForm.name}
                onChange={(v) => setEditForm({ ...editForm, name: v })}
                autoComplete="off"
              />
              <TextField
                label="Description"
                value={editForm.description}
                onChange={(v) => setEditForm({ ...editForm, description: v })}
                multiline={3}
                autoComplete="off"
              />
              <InlineStack gap="400">
                <TextField
                  label={`Points per Entry (${pointsConfig.currencyName})`}
                  type="number"
                  value={editForm.entryCost}
                  onChange={(v) => setEditForm({ ...editForm, entryCost: v })}
                  autoComplete="off"
                />
                <TextField
                  label="Max Entries per Customer"
                  type="number"
                  value={editForm.maxEntriesPerCustomer}
                  onChange={(v) => setEditForm({ ...editForm, maxEntriesPerCustomer: v })}
                  autoComplete="off"
                />
              </InlineStack>
              <InlineStack gap="400">
                <TextField
                  label="Total Entry Limit (leave empty for unlimited)"
                  type="number"
                  value={editForm.maxEntriesTotal}
                  onChange={(v) => setEditForm({ ...editForm, maxEntriesTotal: v })}
                  autoComplete="off"
                />
                <TextField
                  label="Winners to Select"
                  type="number"
                  value={editForm.totalWinners}
                  onChange={(v) => setEditForm({ ...editForm, totalWinners: v })}
                  autoComplete="off"
                />
              </InlineStack>
              <Select
                label="Draw Type"
                options={[
                  { label: "Random - Equal chance for all entries", value: "RANDOM" },
                  { label: "Weighted - More entries = higher chance", value: "WEIGHTED" },
                  { label: "FIFO - First entries win", value: "FIFO" },
                ]}
                value={editForm.drawType}
                onChange={(v) => setEditForm({ ...editForm, drawType: v as RaffleDrawType })}
              />
              <InlineStack gap="400">
                <TextField
                  label="Start Date"
                  type="date"
                  value={editForm.startsAt}
                  onChange={(v) => setEditForm({ ...editForm, startsAt: v })}
                  autoComplete="off"
                />
                <TextField
                  label="End Date"
                  type="date"
                  value={editForm.endsAt}
                  onChange={(v) => setEditForm({ ...editForm, endsAt: v })}
                  autoComplete="off"
                />
              </InlineStack>
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Add/Edit Prize Modal */}
        <Modal
          open={showPrizeModal}
          onClose={() => {
            setShowPrizeModal(false);
            setEditingPrize(null);
          }}
          title={editingPrize ? "Edit Prize" : "Add Prize"}
          primaryAction={{
            content: editingPrize ? "Save Changes" : "Add Prize",
            onAction: handlePrizeSubmit,
            loading: isSubmitting,
            disabled: !prizeForm.name.trim(),
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setShowPrizeModal(false);
                setEditingPrize(null);
              },
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Prize Name"
                value={prizeForm.name}
                onChange={(v) => setPrizeForm({ ...prizeForm, name: v })}
                placeholder="e.g., Grand Prize, Runner-up"
                autoComplete="off"
              />
              <TextField
                label="Description (optional)"
                value={prizeForm.description}
                onChange={(v) => setPrizeForm({ ...prizeForm, description: v })}
                multiline={2}
                autoComplete="off"
              />
              {!editingPrize && (
                <Select
                  label="Prize Type"
                  options={[
                    { label: "Discount Code", value: "DISCOUNT" },
                    { label: "Store Credit", value: "STORE_CREDIT" },
                    { label: "Points", value: "POINTS" },
                    { label: "Product", value: "PRODUCT" },
                    { label: "Custom Prize", value: "CUSTOM" },
                  ]}
                  value={prizeForm.prizeType}
                  onChange={(v) => setPrizeForm({ ...prizeForm, prizeType: v as RafflePrizeType, selectedProduct: null })}
                />
              )}

              {/* Type-specific fields */}
              {prizeForm.prizeType === "DISCOUNT" && !editingPrize && (
                <InlineStack gap="400">
                  <Select
                    label="Discount Type"
                    options={[
                      { label: "Percentage", value: "percentage" },
                      { label: "Fixed Amount", value: "fixed" },
                    ]}
                    value={prizeForm.discountType}
                    onChange={(v) => setPrizeForm({ ...prizeForm, discountType: v })}
                  />
                  <TextField
                    label={prizeForm.discountType === "percentage" ? "Discount %" : "Discount Amount ($)"}
                    type="number"
                    value={prizeForm.discountValue}
                    onChange={(v) => setPrizeForm({ ...prizeForm, discountValue: v })}
                    autoComplete="off"
                  />
                </InlineStack>
              )}

              {prizeForm.prizeType === "STORE_CREDIT" && !editingPrize && (
                <TextField
                  label="Store Credit Amount (cents)"
                  type="number"
                  value={prizeForm.storeCreditAmount}
                  onChange={(v) => setPrizeForm({ ...prizeForm, storeCreditAmount: v })}
                  helpText="Enter amount in cents. e.g., 500 = $5.00"
                  autoComplete="off"
                />
              )}

              {prizeForm.prizeType === "POINTS" && !editingPrize && (
                <TextField
                  label={`${pointsConfig.currencyName} Amount`}
                  type="number"
                  value={prizeForm.pointsAmount}
                  onChange={(v) => setPrizeForm({ ...prizeForm, pointsAmount: v })}
                  autoComplete="off"
                />
              )}

              {prizeForm.prizeType === "CUSTOM" && !editingPrize && (
                <TextField
                  label="Fulfillment Instructions"
                  value={prizeForm.customInstructions}
                  onChange={(v) => setPrizeForm({ ...prizeForm, customInstructions: v })}
                  multiline={3}
                  helpText="Instructions for manually fulfilling this prize"
                  autoComplete="off"
                />
              )}

              {prizeForm.prizeType === "PRODUCT" && !editingPrize && (
                <BlockStack gap="300">
                  <Button onClick={() => setShowProductPicker(true)}>
                    {prizeForm.selectedProduct
                      ? `Change Product: ${prizeForm.selectedProduct.title}`
                      : "Select Product"}
                  </Button>
                  {prizeForm.selectedProduct && (
                    <Box
                      background="bg-surface-secondary"
                      padding="300"
                      borderRadius="200"
                    >
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={prizeForm.selectedProduct.image || ""}
                          alt={prizeForm.selectedProduct.title}
                          size="small"
                        />
                        <BlockStack gap="100">
                          <Text as="span" fontWeight="semibold">
                            {prizeForm.selectedProduct.title}
                          </Text>
                          {prizeForm.selectedProduct.variantTitle && (
                            <Text as="span" tone="subdued">
                              {prizeForm.selectedProduct.variantTitle}
                            </Text>
                          )}
                          <Text as="span">${prizeForm.selectedProduct.price}</Text>
                        </BlockStack>
                      </InlineStack>
                    </Box>
                  )}
                  <TextField
                    label="Quantity per winner"
                    type="number"
                    value={prizeForm.productQuantity}
                    onChange={(v) => setPrizeForm({ ...prizeForm, productQuantity: v })}
                    min={1}
                    helpText="Number of this product each winner receives"
                    autoComplete="off"
                  />
                </BlockStack>
              )}

              <InlineStack gap="400">
                <TextField
                  label="Quantity Available"
                  type="number"
                  value={prizeForm.quantity}
                  onChange={(v) => setPrizeForm({ ...prizeForm, quantity: v })}
                  min={1}
                  autoComplete="off"
                />
                <TextField
                  label="Weight (for weighted draws)"
                  type="number"
                  value={prizeForm.weight}
                  onChange={(v) => setPrizeForm({ ...prizeForm, weight: v })}
                  helpText="Higher = more likely to be selected"
                  autoComplete="off"
                />
              </InlineStack>
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

        {/* Product Picker Modal */}
        <ProductPicker
          open={showProductPicker}
          onClose={() => setShowProductPicker(false)}
          onSelect={handleProductSelect}
          onSearch={handleProductSearch}
          onBrowse={handleProductBrowse}
          onGetCollections={handleGetCollections}
          onGetCollectionProducts={handleGetCollectionProducts}
        />
      </Page>
    </Frame>
  );
}
