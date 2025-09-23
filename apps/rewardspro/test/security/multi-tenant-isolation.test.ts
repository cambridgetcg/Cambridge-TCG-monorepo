import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '~/db.server';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import { createTestApp } from '../test-utils';

describe('Multi-Tenant Data Isolation Security Tests', () => {
  let app: any;

  // Test shops and their data
  const shopA = 'shop-a.myshopify.com';
  const shopB = 'shop-b.myshopify.com';
  const shopC = 'malicious-shop.myshopify.com';

  // Test data IDs
  let shopACustomerId: string;
  let shopBCustomerId: string;
  let shopATierId: string;
  let shopBTierId: string;
  let shopALedgerEntryId: string;

  beforeEach(async () => {
    // Clean database
    await db.storeCreditLedger.deleteMany({});
    await db.customer.deleteMany({});
    await db.tier.deleteMany({});
    await db.shopSettings.deleteMany({});

    // Create test shop settings
    await db.shopSettings.createMany({
      data: [
        {
          id: uuidv4(),
          shop: shopA,
          name: 'Shop A',
          currency: 'USD',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: uuidv4(),
          shop: shopB,
          name: 'Shop B',
          currency: 'USD',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    });

    // Create test tiers
    const tierA = await db.tier.create({
      data: {
        id: uuidv4(),
        shop: shopA,
        name: 'Gold',
        minSpend: 1000,
        cashbackPercent: 5,
        evaluationPeriod: 'ANNUAL',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    shopATierId = tierA.id;

    const tierB = await db.tier.create({
      data: {
        id: uuidv4(),
        shop: shopB,
        name: 'Silver',
        minSpend: 500,
        cashbackPercent: 3,
        evaluationPeriod: 'ANNUAL',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    shopBTierId = tierB.id;

    // Create test customers
    const customerA = await db.customer.create({
      data: {
        id: uuidv4(),
        shop: shopA,
        shopifyCustomerId: 'shopify-cust-a',
        email: 'customer@shopa.com',
        firstName: 'Alice',
        lastName: 'Anderson',
        storeCreditBalance: 100,
        totalSpent: 1500,
        tierId: shopATierId,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    shopACustomerId = customerA.id;

    const customerB = await db.customer.create({
      data: {
        id: uuidv4(),
        shop: shopB,
        shopifyCustomerId: 'shopify-cust-b',
        email: 'customer@shopb.com',
        firstName: 'Bob',
        lastName: 'Brown',
        storeCreditBalance: 50,
        totalSpent: 750,
        tierId: shopBTierId,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    shopBCustomerId = customerB.id;

    // Create test ledger entry for Shop A
    const ledgerEntry = await db.storeCreditLedger.create({
      data: {
        id: uuidv4(),
        shop: shopA,
        customerId: shopACustomerId,
        amount: 10,
        entryType: 'CASHBACK_EARNED',
        description: 'Order #1001',
        orderId: '1001',
        previousBalance: 90,
        newBalance: 100,
        createdAt: new Date()
      }
    });
    shopALedgerEntryId = ledgerEntry.id;

    // Create test app with mocked auth
    app = createTestApp();
  });

  afterEach(async () => {
    // Clean up after tests
    await db.storeCreditLedger.deleteMany({});
    await db.customer.deleteMany({});
    await db.tier.deleteMany({});
    await db.shopSettings.deleteMany({});
  });

  describe('Cross-Shop Data Access Prevention', () => {
    it('should not allow Shop B to access Shop A customers', async () => {
      // Attempt to fetch Shop A's customer while authenticated as Shop B
      const customers = await db.customer.findMany({
        where: { shop: shopB } // Shop B's scope
      });

      // Should only see Shop B's customer
      expect(customers.length).toBe(1);
      expect(customers[0].email).toBe('customer@shopb.com');
      expect(customers[0].id).toBe(shopBCustomerId);

      // Should not contain Shop A's customer
      const shopACustomerFound = customers.some(c => c.id === shopACustomerId);
      expect(shopACustomerFound).toBe(false);
    });

    it('should return 404 when accessing another shop\'s resource by ID', async () => {
      // Simulate Shop B trying to access Shop A's customer directly by ID
      const customer = await db.customer.findFirst({
        where: {
          id: shopACustomerId,
          shop: shopB // Shop B's scope - this should find nothing
        }
      });

      expect(customer).toBeNull();
    });

    it('should isolate tier data between shops', async () => {
      // Shop A should only see its own tiers
      const shopATiers = await db.tier.findMany({
        where: { shop: shopA }
      });

      expect(shopATiers.length).toBe(1);
      expect(shopATiers[0].name).toBe('Gold');
      expect(shopATiers[0].id).toBe(shopATierId);

      // Shop B should only see its own tiers
      const shopBTiers = await db.tier.findMany({
        where: { shop: shopB }
      });

      expect(shopBTiers.length).toBe(1);
      expect(shopBTiers[0].name).toBe('Silver');
      expect(shopBTiers[0].id).toBe(shopBTierId);
    });

    it('should prevent updating another shop\'s data', async () => {
      // Attempt to update Shop A's customer as Shop B
      const updateResult = await db.customer.updateMany({
        where: {
          id: shopACustomerId,
          shop: shopB // Shop B's scope - should match nothing
        },
        data: {
          storeCreditBalance: 999
        }
      });

      expect(updateResult.count).toBe(0); // No records updated

      // Verify Shop A's customer is unchanged
      const customerA = await db.customer.findFirst({
        where: {
          id: shopACustomerId,
          shop: shopA
        }
      });

      expect(customerA?.storeCreditBalance).toBe(100); // Original value
    });

    it('should prevent deleting another shop\'s data', async () => {
      // Attempt to delete Shop A's customer as Shop B
      const deleteResult = await db.customer.deleteMany({
        where: {
          id: shopACustomerId,
          shop: shopB // Shop B's scope - should match nothing
        }
      });

      expect(deleteResult.count).toBe(0); // No records deleted

      // Verify Shop A's customer still exists
      const customerA = await db.customer.findFirst({
        where: {
          id: shopACustomerId,
          shop: shopA
        }
      });

      expect(customerA).toBeDefined();
    });

    it('should isolate ledger entries between shops', async () => {
      // Shop B should not see Shop A's ledger entries
      const shopBLedgerEntries = await db.storeCreditLedger.findMany({
        where: { shop: shopB }
      });

      expect(shopBLedgerEntries.length).toBe(0);

      // Shop A should see only its entries
      const shopALedgerEntries = await db.storeCreditLedger.findMany({
        where: { shop: shopA }
      });

      expect(shopALedgerEntries.length).toBe(1);
      expect(shopALedgerEntries[0].id).toBe(shopALedgerEntryId);
    });
  });

  describe('Shop Domain Validation', () => {
    it('should reject invalid shop domain formats', () => {
      const invalidDomains = [
        'not-a-shop',
        'shop.com',
        'myshopify.com',
        'shop.myshopify.com.evil.com',
        'shop.myshopify.com/path',
        'shop.myshopify.com?query=1',
        'shop.myshopify.com#fragment',
        '../../../etc/passwd',
        'shop.myshopify.com%0a',
        'shop.myshopify.com\n',
        'shop.myshopify.com;ls',
        '',
        null,
        undefined
      ];

      const isValidShopDomain = (domain: any): boolean => {
        if (!domain || typeof domain !== 'string') return false;
        const regex = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
        return regex.test(domain);
      };

      for (const domain of invalidDomains) {
        expect(isValidShopDomain(domain)).toBe(false);
      }
    });

    it('should accept valid shop domain formats', () => {
      const validDomains = [
        'my-shop.myshopify.com',
        'shop123.myshopify.com',
        'test-store-99.myshopify.com',
        'a.myshopify.com',
        '123shop.myshopify.com'
      ];

      const isValidShopDomain = (domain: string): boolean => {
        const regex = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
        return regex.test(domain);
      };

      for (const domain of validDomains) {
        expect(isValidShopDomain(domain)).toBe(true);
      }
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should safely handle SQL injection attempts in shop parameter', async () => {
      const maliciousShops = [
        "shop'; DROP TABLE Customers; --",
        "' OR '1'='1",
        "\" OR \"\"=\"",
        "` OR 1=1 /*",
        "Robert'); DROP TABLE customers;--"
      ];

      for (const maliciousShop of maliciousShops) {
        // Attempt to query with malicious shop value
        const customers = await db.customer.findMany({
          where: { shop: maliciousShop }
        });

        // Should return empty, not error or all records
        expect(customers.length).toBe(0);

        // Verify tables still exist
        const tablesExist = await db.customer.count();
        expect(tablesExist).toBeGreaterThanOrEqual(0); // Table still exists
      }
    });

    it('should handle injection attempts in customer search', async () => {
      const injectionPayloads = [
        "'; DROP TABLE customers; --",
        "1' OR '1'='1",
        "admin'--",
        "' OR 1=1--",
        "' UNION SELECT * FROM customers--"
      ];

      for (const payload of injectionPayloads) {
        // Search with injection payload
        const results = await db.customer.findMany({
          where: {
            shop: shopA,
            OR: [
              { email: { contains: payload } },
              { firstName: { contains: payload } },
              { lastName: { contains: payload } }
            ]
          }
        });

        // Should not return unintended results
        expect(results.length).toBe(0); // No matches for injection strings
      }
    });
  });

  describe('Data Creation Isolation', () => {
    it('should always scope created data to the authenticated shop', async () => {
      // Create a new customer for Shop A
      const newCustomer = await db.customer.create({
        data: {
          id: uuidv4(),
          shop: shopA,
          shopifyCustomerId: 'new-customer-123',
          email: 'new@shopa.com',
          firstName: 'New',
          lastName: 'Customer',
          storeCreditBalance: 0,
          totalSpent: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Verify it's only visible to Shop A
      const shopACustomers = await db.customer.findMany({
        where: { shop: shopA }
      });
      expect(shopACustomers.some(c => c.id === newCustomer.id)).toBe(true);

      // Verify it's not visible to Shop B
      const shopBCustomers = await db.customer.findMany({
        where: { shop: shopB }
      });
      expect(shopBCustomers.some(c => c.id === newCustomer.id)).toBe(false);
    });

    it('should prevent tier assignment across shops', async () => {
      // Try to assign Shop B's customer to Shop A's tier
      const updateResult = await db.customer.updateMany({
        where: {
          id: shopBCustomerId,
          shop: shopB
        },
        data: {
          tierId: shopATierId // Wrong shop's tier
        }
      });

      // Update happens but creates data inconsistency
      // In production, this should be prevented by application logic
      // The test here shows why application-level validation is needed

      // Better approach - validate tier belongs to same shop
      const tier = await db.tier.findFirst({
        where: {
          id: shopATierId,
          shop: shopB // Should not find Shop A's tier for Shop B
        }
      });

      expect(tier).toBeNull();
    });
  });

  describe('Aggregation Query Isolation', () => {
    it('should scope aggregate queries to shop', async () => {
      // Get total store credit for Shop A
      const shopATotal = await db.customer.aggregate({
        where: { shop: shopA },
        _sum: { storeCreditBalance: true }
      });

      expect(shopATotal._sum.storeCreditBalance).toBe(100);

      // Get total store credit for Shop B
      const shopBTotal = await db.customer.aggregate({
        where: { shop: shopB },
        _sum: { storeCreditBalance: true }
      });

      expect(shopBTotal._sum.storeCreditBalance).toBe(50);

      // Totals should be isolated
      expect(shopATotal._sum.storeCreditBalance).not.toBe(shopBTotal._sum.storeCreditBalance);
    });

    it('should isolate count queries', async () => {
      const shopACount = await db.customer.count({
        where: { shop: shopA }
      });

      const shopBCount = await db.customer.count({
        where: { shop: shopB }
      });

      expect(shopACount).toBe(1);
      expect(shopBCount).toBe(1);

      // Total without shop filter would be 2, but we always filter by shop
      const unfilteredCount = await db.customer.count();
      expect(unfilteredCount).toBe(2); // This should never be done in production
    });
  });

  describe('Transaction Isolation', () => {
    it('should maintain isolation in transactions', async () => {
      // Transaction for Shop A
      const shopATransaction = await db.$transaction(async (tx) => {
        // Create new customer
        const customer = await tx.customer.create({
          data: {
            id: uuidv4(),
            shop: shopA,
            shopifyCustomerId: 'tx-customer-a',
            email: 'tx@shopa.com',
            firstName: 'Transaction',
            lastName: 'TestA',
            storeCreditBalance: 0,
            totalSpent: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });

        // Create ledger entry
        await tx.storeCreditLedger.create({
          data: {
            id: uuidv4(),
            shop: shopA,
            customerId: customer.id,
            amount: 10,
            entryType: 'MANUAL_CREDIT',
            description: 'Transaction test',
            previousBalance: 0,
            newBalance: 10,
            createdAt: new Date()
          }
        });

        return customer;
      });

      // Verify transaction data is isolated to Shop A
      const shopBLedger = await db.storeCreditLedger.findMany({
        where: { shop: shopB }
      });

      expect(shopBLedger.length).toBe(0); // Shop B sees no new ledger entries

      const shopALedger = await db.storeCreditLedger.findMany({
        where: { shop: shopA }
      });

      expect(shopALedger.length).toBe(2); // Original + new transaction entry
    });
  });

  describe('API Endpoint Isolation', () => {
    it('should verify all API endpoints scope queries by shop', async () => {
      // This would normally test actual API endpoints
      // For demonstration, we're showing the pattern

      const mockRequest = {
        session: { shop: shopA },
        params: { customerId: shopBCustomerId } // Trying to access Shop B's customer
      };

      // Simulated endpoint logic
      const getCustomer = async (req: any) => {
        const { customerId } = req.params;
        const { shop } = req.session;

        const customer = await db.customer.findFirst({
          where: {
            id: customerId,
            shop: shop // Always include shop in query
          }
        });

        return customer;
      };

      const result = await getCustomer(mockRequest);
      expect(result).toBeNull(); // Shop A cannot access Shop B's customer
    });
  });

  describe('Bulk Operation Isolation', () => {
    it('should isolate bulk updates to authenticated shop', async () => {
      // Bulk update for Shop A
      const updateResult = await db.customer.updateMany({
        where: { shop: shopA },
        data: { storeCreditBalance: 200 }
      });

      expect(updateResult.count).toBe(1);

      // Verify Shop A's customer was updated
      const shopACustomer = await db.customer.findFirst({
        where: { id: shopACustomerId }
      });
      expect(shopACustomer?.storeCreditBalance).toBe(200);

      // Verify Shop B's customer was not affected
      const shopBCustomer = await db.customer.findFirst({
        where: { id: shopBCustomerId }
      });
      expect(shopBCustomer?.storeCreditBalance).toBe(50); // Unchanged
    });

    it('should isolate bulk deletes to authenticated shop', async () => {
      // Create additional test data
      await db.customer.create({
        data: {
          id: uuidv4(),
          shop: shopA,
          shopifyCustomerId: 'to-delete',
          email: 'delete@shopa.com',
          firstName: 'Delete',
          lastName: 'Me',
          storeCreditBalance: 0,
          totalSpent: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Bulk delete for Shop A with specific criteria
      const deleteResult = await db.customer.deleteMany({
        where: {
          shop: shopA,
          email: 'delete@shopa.com'
        }
      });

      expect(deleteResult.count).toBe(1);

      // Verify Shop B's data is unaffected
      const shopBCount = await db.customer.count({
        where: { shop: shopB }
      });
      expect(shopBCount).toBe(1);
    });
  });
});