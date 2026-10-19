import prisma from "../db.server";

/**
 * Recalculate cashback for all existing orders based on customer tiers
 */
export async function recalculateCashbackForAllOrders(shop: string) {
  console.log(`[Cashback Recalculation] Starting for shop: ${shop}`);

  // DATA API COMPATIBLE: Nested include not supported, use two-step query
  // Get all orders that don't have cashback calculated
  const ordersRaw = await prisma.order.findMany({
    where: {
      shop,
      cashbackAmount: null,
      cashbackEligible: true,
      financialStatus: 'PAID'
    },
    include: {
      customer: true, // Flat include, no nested currentTier
    }
  });

  // Fetch tiers separately and join in memory
  const tierIds = [...new Set(
    ordersRaw
      .map(o => o.customer?.currentTierId)
      .filter((id): id is string => !!id)
  )];
  const tiers = tierIds.length > 0
    ? await prisma.tier.findMany({
        where: { id: { in: tierIds } },
      })
    : [];
  const tierMap = new Map(tiers.map(t => [t.id, t]));

  // Attach currentTier to each order's customer
  const orders = ordersRaw.map(order => ({
    ...order,
    customer: order.customer ? {
      ...order.customer,
      currentTier: order.customer.currentTierId
        ? tierMap.get(order.customer.currentTierId) || null
        : null,
    } : null,
  }));

  console.log(`[Cashback Recalculation] Found ${orders.length} orders to process`);

  let processed = 0;
  let totalCashback = 0;

  for (const order of orders) {
    // Determine which cashback percent to use
    let cashbackPercent = 0;
    let tierUsed = 'none';

    // Priority 1: Use cashbackPercentAtOrder if available (most accurate)
    if (order.cashbackPercentAtOrder !== null && order.cashbackPercentAtOrder !== undefined) {
      cashbackPercent = order.cashbackPercentAtOrder;
      tierUsed = 'historical-percent';
    }
    // Priority 2: Use tierIdAtOrder to look up historical tier
    else if (order.tierIdAtOrder) {
      const historicalTier = await prisma.tier.findUnique({
        where: { id: order.tierIdAtOrder }
      });
      if (historicalTier) {
        cashbackPercent = historicalTier.cashbackPercent;
        tierUsed = 'historical-tier';
      }
    }
    // Priority 3: Use customer's current tier (with warning)
    else if (order.customer?.currentTier) {
      console.warn(`[Cashback Recalculation] Using current tier for historical order ${order.shopifyOrderName} - may not be accurate`);
      cashbackPercent = order.customer.currentTier.cashbackPercent;
      tierUsed = 'current-tier';
    }
    // Priority 4: Skip if no tier information available
    else {
      console.log(`[Cashback Recalculation] Skipping order ${order.shopifyOrderName} - no tier information available`);
      continue;
    }

    // Calculate cashback
    const cashbackAmount = (Number(order.netAmount) * cashbackPercent) / 100;

    // Update the order with cashback details
    await prisma.order.update({
      where: { id: order.id },
      data: {
        cashbackPercent,
        cashbackPercentAtOrder: cashbackPercent, // Store for future reference
        cashbackAmount,
        // Only update tier info if we're using current tier (not historical)
        ...(tierUsed === 'current-tier' && order.customer?.currentTier ? {
          tierIdAtOrder: order.customer.currentTier.id,
          tierNameAtOrder: order.customer.currentTier.name
        } : {})
      }
    });

    processed++;
    totalCashback += cashbackAmount;

    console.log(`[Cashback Recalculation] Order ${order.shopifyOrderName}: ${cashbackPercent}% = ${cashbackAmount}`);
  }

  console.log(`[Cashback Recalculation] Complete. Processed ${processed} orders, total cashback: ${totalCashback}`);

  return {
    ordersProcessed: processed,
    totalCashback,
    ordersSkipped: orders.length - processed
  };
}

/**
 * Recalculate cashback for a specific customer's orders
 */
export async function recalculateCashbackForCustomer(shop: string, customerId: string) {
  console.log(`[Cashback Recalculation] Starting for customer: ${customerId}`);

  // Get customer with tier
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { currentTier: true }
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  if (!customer.currentTier) {
    console.log(`[Cashback Recalculation] Customer has no tier assigned`);
    return { ordersProcessed: 0, totalCashback: 0 };
  }

  // Get all paid orders for this customer
  const orders = await prisma.order.findMany({
    where: {
      shop,
      customerId,
      cashbackEligible: true,
      financialStatus: 'PAID'
    }
  });

  console.log(`[Cashback Recalculation] Found ${orders.length} orders for customer`);

  let processed = 0;
  let totalCashback = 0;

  for (const order of orders) {
    // Calculate cashback
    const cashbackPercent = customer.currentTier.cashbackPercent;
    const cashbackAmount = (Number(order.netAmount) * cashbackPercent) / 100;

    // Only update if cashback changed
    if (order.cashbackPercent !== cashbackPercent || Number(order.cashbackAmount) !== cashbackAmount) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          cashbackPercent,
          cashbackAmount,
          tierIdAtOrder: customer.currentTier.id,
          tierNameAtOrder: customer.currentTier.name
        }
      });

      processed++;
      totalCashback += cashbackAmount;

      console.log(`[Cashback Recalculation] Updated order ${order.shopifyOrderName}: ${cashbackPercent}% = ${cashbackAmount}`);
    }
  }

  console.log(`[Cashback Recalculation] Complete. Updated ${processed} orders, total cashback: ${totalCashback}`);

  return {
    ordersProcessed: processed,
    totalCashback,
    ordersTotal: orders.length
  };
}
