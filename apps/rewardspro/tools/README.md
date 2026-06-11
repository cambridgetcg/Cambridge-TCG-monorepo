# RewardsPro Development Tools

Custom development tools for testing and debugging the RewardsPro Shopify embedded app. These tools solve the fundamental challenge that Shopify embedded apps cannot be tested with traditional browser automation tools like Playwright due to OAuth flows, iframe isolation, and App Bridge requirements.

## Overview

| Tool | Purpose |
|------|---------|
| **Webhook Simulator** | Send webhooks with valid HMAC signatures to test webhook handlers |
| **Shop Inspector** | Query shop state directly from the database for debugging |
| **Scenario Runner** | Run complete test scenarios combining webhooks and state verification |

## Quick Start

```bash
# From the project root
cd tools

# Install dependencies
pnpm install

# Set environment variables
export SHOPIFY_API_SECRET="your-shopify-api-secret"
export DATABASE_URL="postgresql://..."
export DEFAULT_SHOP="test-store.myshopify.com"

# List available commands
pnpm cli --help
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_API_SECRET` | Yes | Shopify API secret for HMAC signing |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DEFAULT_SHOP` | No | Default shop domain for commands |
| `WEBHOOK_ENDPOINT` | No | Webhook endpoint URL (default: `http://localhost:3000/webhooks`) |

## Commands

### Webhook Commands

#### Send a Single Webhook

```bash
# Send order created webhook
pnpm webhook orders/create --shop test.myshopify.com

# With custom payload
pnpm webhook orders/paid --shop test.myshopify.com --payload '{"id":"123","financial_status":"paid"}'

# From a JSON file
pnpm webhook orders/create --shop test.myshopify.com --file ./payloads/order.json

# Verbose output
pnpm webhook orders/create --shop test.myshopify.com --verbose
```

#### Run Webhook Sequence

```bash
# Full order lifecycle: create → paid → fulfilled
pnpm webhook:sequence orderLifecycle --shop test.myshopify.com

# Order with refund
pnpm webhook:sequence orderWithRefund --shop test.myshopify.com

# New customer first order
pnpm webhook:sequence newCustomerFirstOrder --shop test.myshopify.com

# With custom delay between webhooks
pnpm webhook:sequence orderLifecycle --shop test.myshopify.com --delay 2000
```

#### List Available Webhooks

```bash
pnpm webhook:list
```

### Inspect Commands

#### Inspect Shop State

```bash
# Overview of shop state
pnpm inspect --shop test.myshopify.com

# Specific sections
pnpm inspect --shop test.myshopify.com --sections customers,orders,points

# Detailed customer info
pnpm inspect --shop test.myshopify.com --sections customers --verbose

# Specific customer
pnpm inspect --shop test.myshopify.com --customer gid://shopify/Customer/123

# JSON output
pnpm inspect --shop test.myshopify.com --json
```

#### Quick Health Check

```bash
pnpm inspect:health --shop test.myshopify.com
```

### Scenario Commands

#### Run Test Scenario

```bash
# New customer first order flow
pnpm scenario newCustomerFirstOrder --shop test.myshopify.com

# Order with refund
pnpm scenario orderWithRefund --shop test.myshopify.com

# With variable overrides
pnpm scenario newCustomerFirstOrder --shop test.myshopify.com --var customerEmail=test@example.com

# Verbose output
pnpm scenario newCustomerFirstOrder --shop test.myshopify.com --verbose
```

#### List Available Scenarios

```bash
pnpm scenario:list
```

## Available Webhook Topics

| Topic | Description |
|-------|-------------|
| `orders/create` | New order created |
| `orders/updated` | Order modified |
| `orders/paid` | Payment completed |
| `orders/fulfilled` | Order shipped |
| `orders/cancelled` | Order cancelled |
| `customers/create` | New customer created |
| `customers/update` | Customer modified |
| `customers/delete` | Customer deleted |
| `refunds/create` | Refund processed |
| `app/uninstalled` | App uninstalled |

## Available Webhook Sequences

| Sequence | Steps | Description |
|----------|-------|-------------|
| `orderLifecycle` | 3 | create → paid → fulfilled |
| `orderWithRefund` | 4 | create → paid → fulfilled → refund |
| `newCustomerFirstOrder` | 4 | customer create → order create → paid |
| `highValueCustomer` | 5 | Multiple orders to simulate VIP customer |
| `orderCancellation` | 3 | create → paid → cancelled |
| `appUninstall` | 1 | App uninstalled webhook |

## Available Test Scenarios

| Scenario | Description |
|----------|-------------|
| `newCustomerFirstOrder` | New customer makes first purchase, earns points |
| `orderWithRefund` | Order placed then fully refunded |
| `tierUpgrade` | Customer purchases tier subscription |
| `appUninstall` | App uninstall and data cleanup verification |
| `healthCheck` | System connectivity and basic health |

## Programmatic Usage

```typescript
import {
  WebhookSimulator,
  ShopInspector,
  ScenarioRunner,
  WebhookSequences,
  BuiltInScenarios,
} from 'rewardspro-dev-tools';

// Send a webhook
const simulator = new WebhookSimulator({
  endpoint: 'http://localhost:3000/webhooks',
  secret: process.env.SHOPIFY_API_SECRET,
});

await simulator.send({
  topic: 'orders/paid',
  shop: 'test.myshopify.com',
  payload: { id: '123', financial_status: 'paid' },
});

// Inspect shop state
const inspector = new ShopInspector({
  databaseUrl: process.env.DATABASE_URL,
});

const state = await inspector.inspect({
  shop: 'test.myshopify.com',
  sections: ['customers', 'orders', 'points'],
});

// Run a scenario
const runner = new ScenarioRunner({
  webhookEndpoint: 'http://localhost:3000/webhooks',
  webhookSecret: process.env.SHOPIFY_API_SECRET,
  databaseUrl: process.env.DATABASE_URL,
});

const result = await runner.run('newCustomerFirstOrder', 'test.myshopify.com');
```

## Creating Custom Scenarios

```typescript
import { ScenarioRunner, type ScenarioDefinition } from 'rewardspro-dev-tools';

const customScenario: ScenarioDefinition = {
  name: 'Custom VIP Flow',
  description: 'Test VIP customer earning bonus points',
  variables: {
    customerId: 'gid://shopify/Customer/123',
    orderTotal: '500.00',
  },
  steps: [
    {
      name: 'Create High Value Order',
      description: 'Place order over $500',
      action: 'webhook',
      webhookTopic: 'orders/create',
      webhookPayload: {
        id: 'gid://shopify/Order/{{orderId}}',
        total_price: '{{orderTotal}}',
        customer: { id: '{{customerId}}' },
      },
    },
    {
      name: 'Wait for Processing',
      action: 'wait',
      waitMs: 2000,
    },
    {
      name: 'Verify Bonus Points',
      action: 'assert',
      assertions: [
        {
          path: 'points.totalEarned',
          operator: 'greaterThan',
          expected: 500, // Expecting bonus multiplier
          message: 'VIP should earn bonus points',
        },
      ],
    },
  ],
};

const runner = new ScenarioRunner(config);
await runner.run(customScenario, 'test.myshopify.com');
```

## Architecture

```
tools/
├── cli/
│   └── index.ts          # Unified CLI interface
├── lib/
│   ├── index.ts          # Library exports
│   ├── webhook-simulator.ts   # HMAC-signed webhook sender
│   ├── shop-inspector.ts      # Database state inspector
│   └── scenario-runner.ts     # Test scenario orchestrator
├── package.json
├── tsconfig.json
└── README.md
```

## Why These Tools?

Shopify embedded apps face unique testing challenges:

1. **OAuth Flow** - Apps require Shopify authentication that Playwright can't automate
2. **Iframe Isolation** - Apps run in sandboxed iframes with restricted access
3. **App Bridge** - Communication with Shopify requires the App Bridge SDK
4. **Webhooks** - Core business logic runs in response to webhooks, not user actions
5. **Multi-Tenancy** - Each shop has isolated data requiring shop-scoped testing

These tools bypass the UI entirely and test the business logic directly through:
- Simulated webhooks with valid HMAC signatures
- Direct database inspection for state verification
- Automated scenario execution with assertions
