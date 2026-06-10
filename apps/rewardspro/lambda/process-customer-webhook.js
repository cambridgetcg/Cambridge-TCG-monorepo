/**
 * AWS Lambda Function: Process Shopify Customer Webhooks from EventBridge
 * 
 * This Lambda function processes customers/create and customers/update webhooks
 * delivered via EventBridge. It syncs customer data to your database and
 * calculates loyalty tiers.
 * 
 * Deploy this to AWS Lambda and configure EventBridge to trigger it.
 */

const { RDSDataClient, ExecuteStatementCommand, BatchExecuteStatementCommand } = require("@aws-sdk/client-rds-data");
const crypto = require('crypto');

// Initialize RDS Data API client
const rdsClient = new RDSDataClient({
  region: process.env.AWS_REGION || 'eu-north-1'
});

// Database configuration from environment variables
const DB_CONFIG = {
  resourceArn: process.env.AURORA_RESOURCE_ARN,
  secretArn: process.env.AURORA_SECRET_ARN,
  database: process.env.AURORA_DATABASE_NAME || 'rewardspro'
};

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Received EventBridge event:', JSON.stringify(event, null, 2));
  
  try {
    // Extract webhook topic and shop domain
    const topic = event.detail?.metadata?.['X-Shopify-Topic'];
    const shopDomain = event.detail?.metadata?.['X-Shopify-Shop-Domain'];
    const webhookId = event.detail?.metadata?.['X-Shopify-Webhook-Id'];
    
    console.log(`Processing webhook: ${topic} from ${shopDomain} (ID: ${webhookId})`);
    
    // EventBridge wraps the Shopify webhook payload in the 'detail.payload' field
    const shopifyPayload = event.detail?.payload;
    
    if (!shopifyPayload) {
      throw new Error('No payload found in event');
    }
    
    // Route to appropriate handler based on topic
    let result;
    switch (topic) {
      case 'customers/create':
        result = await handleCustomerCreate(shopifyPayload, shopDomain);
        break;
      case 'customers/update':
        result = await handleCustomerUpdate(shopifyPayload, shopDomain);
        break;
      case 'customers/delete':
        result = await handleCustomerDelete(shopifyPayload, shopDomain);
        break;
      default:
        console.warn(`Unhandled webhook topic: ${topic}`);
        return {
          statusCode: 200,
          body: JSON.stringify({ message: `Topic ${topic} not handled` })
        };
    }
    
    console.log('Webhook processed successfully:', result);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Webhook processed successfully',
        topic,
        customerId: result?.customerId,
        action: result?.action
      })
    };
  } catch (error) {
    console.error('Error processing webhook:', error);
    
    // EventBridge will retry based on your configured retry policy
    // Throw the error to trigger a retry
    throw error;
  }
};

/**
 * Handle customers/create webhook
 */
async function handleCustomerCreate(payload, shopDomain) {
  const customer = parseCustomerPayload(payload);
  
  // Check if customer already exists
  const existingCustomer = await findCustomerByShopifyId(
    shopDomain, 
    customer.shopifyCustomerId
  );
  
  if (existingCustomer) {
    console.log(`Customer already exists: ${customer.shopifyCustomerId}`);
    // Update instead of create
    return await updateCustomer(existingCustomer.id, customer, shopDomain);
  }
  
  // Create new customer
  const customerId = crypto.randomUUID();
  
  const sql = `
    INSERT INTO "Customer" (
      id, shop, "shopifyCustomerId", email, "firstName", "lastName",
      phone, tags, "totalSpent", "ordersCount", "lastOrderDate",
      "shopifyCreatedAt", "shopifyUpdatedAt", "storeCredit", 
      "tierId", "createdAt", "updatedAt"
    ) VALUES (
      :id, :shop, :shopifyCustomerId, :email, :firstName, :lastName,
      :phone, :tags, :totalSpent, :ordersCount, :lastOrderDate,
      :shopifyCreatedAt, :shopifyUpdatedAt, :storeCredit,
      :tierId, :createdAt, :updatedAt
    )
  `;
  
  const params = {
    id: customerId,
    shop: shopDomain,
    shopifyCustomerId: customer.shopifyCustomerId,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    tags: customer.tags,
    totalSpent: customer.totalSpent,
    ordersCount: customer.ordersCount,
    lastOrderDate: customer.lastOrderDate,
    shopifyCreatedAt: customer.shopifyCreatedAt,
    shopifyUpdatedAt: customer.shopifyUpdatedAt,
    storeCredit: 0, // Initialize with 0 store credit
    tierId: null, // Will be calculated separately
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  await executeStatement(sql, params);
  
  // Calculate and assign tier
  await calculateAndAssignTier(customerId, shopDomain, customer.totalSpent);
  
  return {
    action: 'created',
    customerId: customerId
  };
}

/**
 * Handle customers/update webhook
 */
async function handleCustomerUpdate(payload, shopDomain) {
  const customer = parseCustomerPayload(payload);
  
  // Find existing customer
  const existingCustomer = await findCustomerByShopifyId(
    shopDomain, 
    customer.shopifyCustomerId
  );
  
  if (!existingCustomer) {
    console.log(`Customer not found, creating: ${customer.shopifyCustomerId}`);
    // Create if doesn't exist
    return await handleCustomerCreate(payload, shopDomain);
  }
  
  return await updateCustomer(existingCustomer.id, customer, shopDomain);
}

/**
 * Handle customers/delete webhook
 */
async function handleCustomerDelete(payload, shopDomain) {
  const shopifyCustomerId = String(payload.id);
  
  // Soft delete by setting a deletedAt timestamp
  const sql = `
    UPDATE "Customer" 
    SET "deletedAt" = :deletedAt, "updatedAt" = :updatedAt
    WHERE shop = :shop AND "shopifyCustomerId" = :shopifyCustomerId
  `;
  
  await executeStatement(sql, {
    shop: shopDomain,
    shopifyCustomerId: shopifyCustomerId,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  
  return {
    action: 'deleted',
    shopifyCustomerId: shopifyCustomerId
  };
}

/**
 * Update existing customer
 */
async function updateCustomer(customerId, customer, shopDomain) {
  const sql = `
    UPDATE "Customer" SET
      email = :email,
      "firstName" = :firstName,
      "lastName" = :lastName,
      phone = :phone,
      tags = :tags,
      "totalSpent" = :totalSpent,
      "ordersCount" = :ordersCount,
      "lastOrderDate" = :lastOrderDate,
      "shopifyUpdatedAt" = :shopifyUpdatedAt,
      "updatedAt" = :updatedAt
    WHERE id = :id AND shop = :shop
  `;
  
  await executeStatement(sql, {
    id: customerId,
    shop: shopDomain,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    tags: customer.tags,
    totalSpent: customer.totalSpent,
    ordersCount: customer.ordersCount,
    lastOrderDate: customer.lastOrderDate,
    shopifyUpdatedAt: customer.shopifyUpdatedAt,
    updatedAt: new Date().toISOString()
  });
  
  // Recalculate tier based on new total spent
  await calculateAndAssignTier(customerId, shopDomain, customer.totalSpent);
  
  return {
    action: 'updated',
    customerId: customerId
  };
}

/**
 * Parse Shopify customer payload
 */
function parseCustomerPayload(payload) {
  return {
    shopifyCustomerId: String(payload.id),
    email: payload.email || null,
    firstName: payload.first_name || null,
    lastName: payload.last_name || null,
    phone: payload.phone || null,
    tags: payload.tags || '',
    totalSpent: parseFloat(payload.total_spent || '0'),
    ordersCount: parseInt(payload.orders_count || '0', 10),
    lastOrderDate: payload.last_order_id ? new Date().toISOString() : null,
    shopifyCreatedAt: payload.created_at ? new Date(payload.created_at).toISOString() : new Date().toISOString(),
    shopifyUpdatedAt: payload.updated_at ? new Date(payload.updated_at).toISOString() : new Date().toISOString()
  };
}

/**
 * Find customer by Shopify ID
 */
async function findCustomerByShopifyId(shop, shopifyCustomerId) {
  const sql = `
    SELECT id, "tierId", "storeCredit", "totalSpent"
    FROM "Customer"
    WHERE shop = :shop 
      AND "shopifyCustomerId" = :shopifyCustomerId
      AND "deletedAt" IS NULL
    LIMIT 1
  `;
  
  const result = await executeStatement(sql, { shop, shopifyCustomerId });
  
  if (result.records && result.records.length > 0) {
    const record = result.records[0];
    return {
      id: record[0].stringValue,
      tierId: record[1].stringValue || null,
      storeCredit: parseFloat(record[2].stringValue || '0'),
      totalSpent: parseFloat(record[3].stringValue || '0')
    };
  }
  
  return null;
}

/**
 * Calculate and assign tier based on spending
 */
async function calculateAndAssignTier(customerId, shop, totalSpent) {
  // Get all tiers for this shop
  const tiersSql = `
    SELECT id, name, "minSpend", "cashbackPercent"
    FROM "Tier"
    WHERE shop = :shop
    ORDER BY "minSpend" DESC
  `;
  
  const tiersResult = await executeStatement(tiersSql, { shop });
  
  if (!tiersResult.records || tiersResult.records.length === 0) {
    console.log('No tiers configured for shop:', shop);
    return null;
  }
  
  // Find the appropriate tier based on spending
  let appropriateTier = null;
  for (const record of tiersResult.records) {
    const tier = {
      id: record[0].stringValue,
      name: record[1].stringValue,
      minSpend: parseFloat(record[2].stringValue || '0'),
      cashbackPercent: parseFloat(record[3].stringValue || '0')
    };
    
    if (totalSpent >= tier.minSpend) {
      appropriateTier = tier;
      break; // Found the highest tier they qualify for
    }
  }
  
  if (!appropriateTier) {
    // Customer doesn't qualify for any tier
    console.log('Customer does not qualify for any tier');
    return null;
  }
  
  // Update customer's tier
  const updateSql = `
    UPDATE "Customer"
    SET "tierId" = :tierId, "updatedAt" = :updatedAt
    WHERE id = :customerId
  `;
  
  await executeStatement(updateSql, {
    customerId: customerId,
    tierId: appropriateTier.id,
    updatedAt: new Date().toISOString()
  });
  
  // Log tier change
  const logSql = `
    INSERT INTO "TierChangeLog" (
      id, "customerId", "previousTierId", "newTierId", 
      "changeType", reason, "createdAt"
    ) VALUES (
      :id, :customerId, :previousTierId, :newTierId,
      :changeType, :reason, :createdAt
    )
  `;
  
  await executeStatement(logSql, {
    id: crypto.randomUUID(),
    customerId: customerId,
    previousTierId: null,
    newTierId: appropriateTier.id,
    changeType: 'UPGRADE',
    reason: `Webhook sync: Total spent ${totalSpent} qualifies for ${appropriateTier.name}`,
    createdAt: new Date().toISOString()
  });
  
  console.log(`Assigned tier ${appropriateTier.name} to customer ${customerId}`);
  return appropriateTier;
}

/**
 * Execute SQL statement using RDS Data API
 */
async function executeStatement(sql, parameters = {}) {
  // Convert parameters to RDS Data API format
  const formattedParams = [];
  for (const [key, value] of Object.entries(parameters)) {
    const param = { name: key };
    
    if (value === null || value === undefined) {
      param.value = { isNull: true };
    } else if (typeof value === 'string') {
      param.value = { stringValue: value };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        param.value = { longValue: value };
      } else {
        param.value = { stringValue: value.toString() };
      }
    } else if (typeof value === 'boolean') {
      param.value = { booleanValue: value };
    } else if (value instanceof Date) {
      param.value = { stringValue: value.toISOString() };
    } else {
      param.value = { stringValue: JSON.stringify(value) };
    }
    
    formattedParams.push(param);
  }
  
  const command = new ExecuteStatementCommand({
    ...DB_CONFIG,
    sql: sql,
    parameters: formattedParams
  });
  
  try {
    const response = await rdsClient.send(command);
    return response;
  } catch (error) {
    console.error('Database error:', error);
    console.error('SQL:', sql);
    console.error('Parameters:', parameters);
    throw error;
  }
}

// Export for testing
module.exports = {
  handler: exports.handler,
  handleCustomerCreate,
  handleCustomerUpdate,
  handleCustomerDelete,
  parseCustomerPayload,
  calculateAndAssignTier
};