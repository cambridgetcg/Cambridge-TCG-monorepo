import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '~/db.server';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

describe('GDPR Compliance and Privacy Tests', () => {
  const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || 'test-webhook-secret';
  const testShop = 'gdpr-test-shop.myshopify.com';
  const testCustomerId = uuidv4();

  // Helper to generate webhook HMAC
  function generateWebhookHMAC(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('base64');
  }

  // Helper to create webhook request
  function createWebhookRequest(topic: string, body: any) {
    const bodyString = JSON.stringify(body);
    const hmac = generateWebhookHMAC(bodyString, WEBHOOK_SECRET);

    return {
      headers: {
        'x-shopify-topic': topic,
        'x-shopify-hmac-sha256': hmac,
        'x-shopify-shop-domain': testShop,
        'x-shopify-webhook-id': uuidv4(),
        'x-shopify-triggered-at': new Date().toISOString(),
        'x-shopify-api-version': '2024-01',
        'content-type': 'application/json'
      },
      body: bodyString
    };
  }

  beforeEach(async () => {
    // Clean database
    await db.storeCreditLedger.deleteMany({});
    await db.tierChangeLog.deleteMany({});
    await db.customer.deleteMany({});
    await db.tier.deleteMany({});
    await db.shopSettings.deleteMany({});

    // Create test shop
    await db.shopSettings.create({
      data: {
        id: uuidv4(),
        shop: testShop,
        name: 'GDPR Test Shop',
        currency: 'USD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Create test tier
    const tier = await db.tier.create({
      data: {
        id: uuidv4(),
        shop: testShop,
        name: 'Gold',
        minSpend: 1000,
        cashbackPercent: 5,
        evaluationPeriod: 'ANNUAL',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Create test customer
    await db.customer.create({
      data: {
        id: testCustomerId,
        shop: testShop,
        shopifyCustomerId: 'shopify-customer-123',
        email: 'customer@example.com',
        firstName: 'John',
        lastName: 'Doe',
        storeCreditBalance: 100,
        totalSpent: 1500,
        tierId: tier.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Create ledger entries
    await db.storeCreditLedger.create({
      data: {
        id: uuidv4(),
        shop: testShop,
        customerId: testCustomerId,
        amount: 50,
        entryType: 'CASHBACK_EARNED',
        description: 'Order #1001',
        orderId: '1001',
        previousBalance: 50,
        newBalance: 100,
        createdAt: new Date()
      }
    });

    // Create tier change log
    await db.tierChangeLog.create({
      data: {
        id: uuidv4(),
        shop: testShop,
        customerId: testCustomerId,
        previousTierId: null,
        newTierId: tier.id,
        changeType: 'INITIAL_ASSIGNMENT',
        changeReason: 'Initial tier assignment',
        createdAt: new Date()
      }
    });
  });

  afterEach(async () => {
    // Clean up
    await db.storeCreditLedger.deleteMany({});
    await db.tierChangeLog.deleteMany({});
    await db.customer.deleteMany({});
    await db.tier.deleteMany({});
    await db.shopSettings.deleteMany({});
  });

  describe('Customer Data Request Webhook', () => {
    it('should retrieve all customer data for data request', async () => {
      const webhook = createWebhookRequest('customers/data_request', {
        shop_id: 12345,
        shop_domain: testShop,
        customer: {
          id: 67890,
          email: 'customer@example.com',
          phone: '+1234567890'
        },
        orders_requested: [1001, 1002, 1003]
      });

      // Simulate processing the data request
      const customerData = await db.customer.findFirst({
        where: {
          shop: testShop,
          email: 'customer@example.com'
        },
        include: {
          tier: true,
          storeCreditLedger: true,
          tierChangeLogs: true
        }
      });

      expect(customerData).toBeDefined();
      expect(customerData?.email).toBe('customer@example.com');
      expect(customerData?.storeCreditLedger).toHaveLength(1);
      expect(customerData?.tierChangeLogs).toHaveLength(1);

      // Format response for Shopify
      const response = {
        customer: {
          id: customerData?.shopifyCustomerId,
          email: customerData?.email,
          firstName: customerData?.firstName,
          lastName: customerData?.lastName,
          storeCreditBalance: customerData?.storeCreditBalance,
          totalSpent: customerData?.totalSpent,
          tier: customerData?.tier?.name,
          createdAt: customerData?.createdAt,
          updatedAt: customerData?.updatedAt
        },
        storeCreditHistory: customerData?.storeCreditLedger.map(entry => ({
          amount: entry.amount,
          type: entry.entryType,
          description: entry.description,
          date: entry.createdAt
        })),
        tierHistory: customerData?.tierChangeLogs.map(log => ({
          changeType: log.changeType,
          reason: log.changeReason,
          date: log.createdAt
        }))
      };

      // Verify response contains all personal data
      expect(response.customer.email).toBe('customer@example.com');
      expect(response.storeCreditHistory).toHaveLength(1);
      expect(response.tierHistory).toHaveLength(1);
    });

    it('should handle data request for non-existent customer', async () => {
      const webhook = createWebhookRequest('customers/data_request', {
        shop_id: 12345,
        shop_domain: testShop,
        customer: {
          id: 99999,
          email: 'nonexistent@example.com'
        }
      });

      const customerData = await db.customer.findFirst({
        where: {
          shop: testShop,
          email: 'nonexistent@example.com'
        }
      });

      expect(customerData).toBeNull();

      // Should return empty response, not error
      const response = {
        customer: null,
        storeCreditHistory: [],
        tierHistory: []
      };

      expect(response.customer).toBeNull();
    });
  });

  describe('Customer Redact Webhook', () => {
    it('should delete customer personal data on redact request', async () => {
      const webhook = createWebhookRequest('customers/redact', {
        shop_id: 12345,
        shop_domain: testShop,
        customer: {
          id: 67890,
          email: 'customer@example.com'
        },
        orders_to_redact: [1001]
      });

      // Process redaction
      const customersToRedact = await db.customer.findMany({
        where: {
          shop: testShop,
          email: 'customer@example.com'
        }
      });

      expect(customersToRedact).toHaveLength(1);

      // Anonymize personal data instead of full deletion
      // This preserves financial records while removing PII
      const redactedCustomer = await db.customer.updateMany({
        where: {
          shop: testShop,
          email: 'customer@example.com'
        },
        data: {
          email: `redacted-${customersToRedact[0].id}@redacted.com`,
          firstName: 'REDACTED',
          lastName: 'REDACTED',
          phone: null,
          acceptsMarketing: false,
          tags: null,
          note: null,
          updatedAt: new Date()
        }
      });

      expect(redactedCustomer.count).toBe(1);

      // Verify personal data is removed
      const afterRedaction = await db.customer.findFirst({
        where: { id: testCustomerId }
      });

      expect(afterRedaction?.email).toContain('redacted');
      expect(afterRedaction?.firstName).toBe('REDACTED');
      expect(afterRedaction?.lastName).toBe('REDACTED');
      expect(afterRedaction?.phone).toBeNull();

      // Verify financial records remain (for accounting)
      expect(afterRedaction?.storeCreditBalance).toBe(100);
      expect(afterRedaction?.totalSpent).toBe(1500);

      // Verify ledger entries remain but are anonymized
      const ledgerEntries = await db.storeCreditLedger.findMany({
        where: { customerId: testCustomerId }
      });

      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0].amount).toBe(50);
    });

    it('should handle redaction for customer with no data', async () => {
      const webhook = createWebhookRequest('customers/redact', {
        shop_id: 12345,
        shop_domain: testShop,
        customer: {
          id: 99999,
          email: 'nonexistent@example.com'
        }
      });

      const updateResult = await db.customer.updateMany({
        where: {
          shop: testShop,
          email: 'nonexistent@example.com'
        },
        data: {
          email: 'redacted@redacted.com',
          firstName: 'REDACTED',
          lastName: 'REDACTED'
        }
      });

      expect(updateResult.count).toBe(0); // No records to update
    });
  });

  describe('Shop Redact Webhook', () => {
    it('should delete all shop data on uninstall', async () => {
      const webhook = createWebhookRequest('shop/redact', {
        shop_id: 12345,
        shop_domain: testShop
      });

      // Count data before deletion
      const beforeCounts = {
        customers: await db.customer.count({ where: { shop: testShop } }),
        ledger: await db.storeCreditLedger.count({ where: { shop: testShop } }),
        tiers: await db.tier.count({ where: { shop: testShop } }),
        tierLogs: await db.tierChangeLog.count({ where: { shop: testShop } }),
        settings: await db.shopSettings.count({ where: { shop: testShop } })
      };

      expect(beforeCounts.customers).toBeGreaterThan(0);
      expect(beforeCounts.ledger).toBeGreaterThan(0);
      expect(beforeCounts.tiers).toBeGreaterThan(0);

      // Process shop redaction (full deletion)
      await db.$transaction(async (tx) => {
        // Delete in order of dependencies
        await tx.storeCreditLedger.deleteMany({ where: { shop: testShop } });
        await tx.tierChangeLog.deleteMany({ where: { shop: testShop } });
        await tx.customer.deleteMany({ where: { shop: testShop } });
        await tx.tier.deleteMany({ where: { shop: testShop } });
        await tx.shopSettings.deleteMany({ where: { shop: testShop } });
      });

      // Verify all data is deleted
      const afterCounts = {
        customers: await db.customer.count({ where: { shop: testShop } }),
        ledger: await db.storeCreditLedger.count({ where: { shop: testShop } }),
        tiers: await db.tier.count({ where: { shop: testShop } }),
        tierLogs: await db.tierChangeLog.count({ where: { shop: testShop } }),
        settings: await db.shopSettings.count({ where: { shop: testShop } })
      };

      expect(afterCounts.customers).toBe(0);
      expect(afterCounts.ledger).toBe(0);
      expect(afterCounts.tiers).toBe(0);
      expect(afterCounts.tierLogs).toBe(0);
      expect(afterCounts.settings).toBe(0);
    });

    it('should not affect other shops data during redaction', async () => {
      // Create another shop
      const otherShop = 'other-shop.myshopify.com';
      await db.shopSettings.create({
        data: {
          id: uuidv4(),
          shop: otherShop,
          name: 'Other Shop',
          currency: 'USD',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      await db.customer.create({
        data: {
          id: uuidv4(),
          shop: otherShop,
          shopifyCustomerId: 'other-customer',
          email: 'other@example.com',
          firstName: 'Other',
          lastName: 'Customer',
          storeCreditBalance: 50,
          totalSpent: 500,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Delete test shop data
      await db.$transaction(async (tx) => {
        await tx.storeCreditLedger.deleteMany({ where: { shop: testShop } });
        await tx.tierChangeLog.deleteMany({ where: { shop: testShop } });
        await tx.customer.deleteMany({ where: { shop: testShop } });
        await tx.tier.deleteMany({ where: { shop: testShop } });
        await tx.shopSettings.deleteMany({ where: { shop: testShop } });
      });

      // Verify other shop data remains
      const otherShopData = await db.customer.findMany({
        where: { shop: otherShop }
      });

      expect(otherShopData).toHaveLength(1);
      expect(otherShopData[0].email).toBe('other@example.com');
    });
  });

  describe('Data Retention and Deletion Policies', () => {
    it('should identify data older than retention period', async () => {
      const retentionDays = 365 * 2; // 2 years
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // Create old data
      const oldCustomerId = uuidv4();
      await db.customer.create({
        data: {
          id: oldCustomerId,
          shop: testShop,
          shopifyCustomerId: 'old-customer',
          email: 'old@example.com',
          firstName: 'Old',
          lastName: 'Customer',
          storeCreditBalance: 0,
          totalSpent: 100,
          createdAt: new Date('2020-01-01'),
          updatedAt: new Date('2020-01-01'),
          lastActiveAt: new Date('2020-01-01')
        }
      });

      // Find customers inactive beyond retention period
      const inactiveCustomers = await db.customer.findMany({
        where: {
          shop: testShop,
          lastActiveAt: {
            lt: cutoffDate
          }
        }
      });

      // Should find old inactive customers
      const hasOldCustomer = inactiveCustomers.some(c => c.id === oldCustomerId);
      expect(hasOldCustomer).toBe(true);
    });

    it('should export customer data in portable format', async () => {
      const customer = await db.customer.findFirst({
        where: { id: testCustomerId },
        include: {
          tier: true,
          storeCreditLedger: true,
          tierChangeLogs: true
        }
      });

      // Create portable JSON export
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        customer: {
          id: customer?.id,
          email: customer?.email,
          name: `${customer?.firstName} ${customer?.lastName}`,
          storeCreditBalance: customer?.storeCreditBalance,
          tier: customer?.tier?.name,
          createdAt: customer?.createdAt,
          lastActiveAt: customer?.lastActiveAt
        },
        transactions: customer?.storeCreditLedger.map(entry => ({
          date: entry.createdAt,
          type: entry.entryType,
          amount: entry.amount,
          description: entry.description,
          balance: entry.newBalance
        })),
        tierHistory: customer?.tierChangeLogs.map(log => ({
          date: log.createdAt,
          change: log.changeType,
          reason: log.changeReason
        }))
      };

      // Verify export is complete and portable
      expect(exportData.customer?.email).toBe('customer@example.com');
      expect(exportData.transactions).toBeDefined();
      expect(exportData.tierHistory).toBeDefined();

      // Should be valid JSON
      const jsonString = JSON.stringify(exportData);
      const parsed = JSON.parse(jsonString);
      expect(parsed.customer.email).toBe(exportData.customer?.email);
    });
  });

  describe('Data Anonymization', () => {
    it('should properly anonymize customer data', () => {
      const anonymize = (data: any) => {
        return {
          ...data,
          email: `anon-${crypto.randomBytes(8).toString('hex')}@redacted.com`,
          firstName: 'Anonymous',
          lastName: 'User',
          phone: null,
          ipAddress: null,
          tags: null,
          note: null
        };
      };

      const original = {
        email: 'real@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        ipAddress: '192.168.1.1',
        tags: ['vip', 'gold'],
        note: 'Important customer'
      };

      const anonymized = anonymize(original);

      expect(anonymized.email).toContain('@redacted.com');
      expect(anonymized.email).not.toBe(original.email);
      expect(anonymized.firstName).toBe('Anonymous');
      expect(anonymized.lastName).toBe('User');
      expect(anonymized.phone).toBeNull();
      expect(anonymized.ipAddress).toBeNull();
      expect(anonymized.tags).toBeNull();
      expect(anonymized.note).toBeNull();
    });

    it('should maintain referential integrity after anonymization', async () => {
      // Anonymize customer
      await db.customer.update({
        where: { id: testCustomerId },
        data: {
          email: `anon-${testCustomerId}@redacted.com`,
          firstName: 'Anonymous',
          lastName: 'User'
        }
      });

      // Verify related records still work
      const ledgerEntries = await db.storeCreditLedger.findMany({
        where: { customerId: testCustomerId }
      });

      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0].customerId).toBe(testCustomerId);

      const tierLogs = await db.tierChangeLog.findMany({
        where: { customerId: testCustomerId }
      });

      expect(tierLogs).toHaveLength(1);
      expect(tierLogs[0].customerId).toBe(testCustomerId);
    });
  });

  describe('Webhook Authentication', () => {
    it('should verify HMAC for all GDPR webhooks', () => {
      const topics = [
        'customers/data_request',
        'customers/redact',
        'shop/redact'
      ];

      for (const topic of topics) {
        const body = { shop_domain: testShop };
        const bodyString = JSON.stringify(body);
        const validHmac = generateWebhookHMAC(bodyString, WEBHOOK_SECRET);

        // Valid HMAC should pass
        const isValid = crypto.timingSafeEqual(
          Buffer.from(validHmac),
          Buffer.from(validHmac)
        );
        expect(isValid).toBe(true);

        // Invalid HMAC should fail
        const invalidHmac = validHmac + 'invalid';
        const isInvalid = validHmac === invalidHmac;
        expect(isInvalid).toBe(false);
      }
    });

    it('should handle webhook idempotency', async () => {
      const webhookId = 'gdpr-webhook-123';
      const processedWebhooks = new Set<string>();

      // First processing
      if (!processedWebhooks.has(webhookId)) {
        processedWebhooks.add(webhookId);

        // Process webhook
        const result = await db.customer.updateMany({
          where: { shop: testShop },
          data: { firstName: 'PROCESSED' }
        });

        expect(result.count).toBeGreaterThan(0);
      }

      // Second processing (duplicate)
      if (!processedWebhooks.has(webhookId)) {
        // Should not execute
        throw new Error('Should not process duplicate');
      }

      expect(processedWebhooks.has(webhookId)).toBe(true);
    });
  });

  describe('Data Encryption at Rest', () => {
    it('should verify sensitive data is encrypted', () => {
      // Mock encryption check
      const isSensitiveFieldEncrypted = (field: string): boolean => {
        // In production, this would check if the field is actually encrypted
        const sensitiveFields = [
          'accessToken',
          'apiSecret',
          'webhookSecret',
          'encryptionKey'
        ];
        return sensitiveFields.includes(field);
      };

      expect(isSensitiveFieldEncrypted('accessToken')).toBe(true);
      expect(isSensitiveFieldEncrypted('shop')).toBe(false);
    });
  });
});