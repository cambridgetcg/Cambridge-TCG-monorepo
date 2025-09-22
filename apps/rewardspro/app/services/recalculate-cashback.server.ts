import db from "../db.server";

/**
 * Recalculate cashback for all existing orders based on customer tiers
 */
export async function recalculateCashbackForAllOrders(shop: string) {
  console.log(`[Cashback Recalculation] Starting for shop: ${shop}`);

  // Get all orders that don't have cashback calculated
  const orders = await db.order.findMany({
    where: {
      shop,
      cashbackAmount: null,
      cashbackEligible: true,
      financialStatus: 'PAID'
    },
    include: {
      customer: {
        include: {
          currentTier: true
        }
      }
    }
  });

  console.log(`[Cashback Recalculation] Found ${orders.length} orders to process`);

  let processed = 0;
  let totalCashback = 0;

  for (const order of orders) {
    // Skip if no customer or no tier
    if (!order.customer?.currentTier) {
      console.log(`[Cashback Recalculation] Skipping order ${order.shopifyOrderName} - no customer tier`);
      continue;
    }

    // Calculate cashback
    const cashbackPercent = order.customer.currentTier.cashbackPercent;
    const cashbackAmount = (Number(order.netAmount) * cashbackPercent) / 100;

    // Update the order with cashback details
    await db.order.update({
      where: { id: order.id },
      data: {
        cashbackPercent,
        cashbackAmount,
        tierIdAtOrder: order.customer.currentTier.id,
        tierNameAtOrder: order.customer.currentTier.name
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
  const customer = await db.customer.findUnique({
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
  const orders = await db.order.findMany({
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
      await db.order.update({
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

/**
 * Process cashback credit for orders that have cashback calculated but not processed
 */
export async function processPendingCashback(shop: string) {
  console.log(`[Cashback Processing] Starting for shop: ${shop}`);

  // Get orders with unprocessed cashback
  const orders = await db.order.findMany({
    where: {
      shop,
      cashbackAmount: { not: null },
      cashbackProcessed: false,
      financialStatus: 'PAID'
    },
    include: {
      customer: true
    }
  });

  console.log(`[Cashback Processing] Found ${orders.length} orders with pending cashback`);

  let processed = 0;
  let totalCredited = 0;

  for (const order of orders) {
    if (!order.customer || !order.cashbackAmount) {
      continue;
    }

    // Get current balance
    const lastEntry = await db.storeCreditLedger.findFirst({
      where: { customerId: order.customerId },
      orderBy: { createdAt: 'desc' }
    });

    const currentBalance = lastEntry ? Number(lastEntry.balance) : 0;
    const newBalance = currentBalance + Number(order.cashbackAmount);

    // Create ledger entry
    await db.storeCreditLedger.create({
      data: {
        id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
        customerId: order.customerId,
        shop,
        amount: order.cashbackAmount,
        balance: newBalance,
        type: 'CASHBACK_EARNED',
        shopifyOrderId: order.shopifyOrderId,
        metadata: {
          orderNumber: order.shopifyOrderNumber,
          cashbackPercent: order.cashbackPercent,
          orderTotal: Number(order.totalPrice)
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Update customer balance
    await db.customer.update({
      where: { id: order.customerId },
      data: {
        storeCredit: newBalance
      }
    });

    // Mark order cashback as processed
    await db.order.update({
      where: { id: order.id },
      data: {
        cashbackProcessed: true
      }
    });

    processed++;
    totalCredited += Number(order.cashbackAmount);

    console.log(`[Cashback Processing] Credited ${order.cashbackAmount} to customer ${order.customer.email} for order ${order.shopifyOrderName}`);
  }

  console.log(`[Cashback Processing] Complete. Processed ${processed} orders, total credited: ${totalCredited}`);

  return {
    ordersProcessed: processed,
    totalCredited
  };
}