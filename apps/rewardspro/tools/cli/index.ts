#!/usr/bin/env node
/**
 * RewardsPro Development Tools CLI
 *
 * Unified command-line interface for testing and debugging
 * Shopify embedded app webhooks and shop state.
 *
 * Usage:
 *   pnpm --filter rewardspro-dev-tools webhook orders/create --shop test.myshopify.com
 *   pnpm --filter rewardspro-dev-tools inspect --shop test.myshopify.com --sections customers,orders
 *   pnpm --filter rewardspro-dev-tools scenario newCustomerFirstOrder --shop test.myshopify.com
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';

import {
  WebhookSimulator,
  WebhookSequences,
  WEBHOOK_TOPICS,
  type WebhookTopic,
} from '../lib/webhook-simulator.js';
import {
  ShopInspector,
  INSPECTION_SECTIONS,
  disconnectDb,
  type InspectionSection,
} from '../lib/shop-inspector.js';
import {
  ScenarioRunner,
  BuiltInScenarios,
  type ScenarioDefinition,
} from '../lib/scenario-runner.js';

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function cleanup(): Promise<void> {
  try {
    await disconnectDb();
  } catch {
    // Ignore cleanup errors
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  console.error(chalk.red('Uncaught exception:'), error.message);
  await cleanup();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  console.error(chalk.red('Unhandled rejection:'), reason);
  await cleanup();
  process.exit(1);
});

// ============================================================================
// Configuration
// ============================================================================

interface CLIConfig {
  webhookEndpoint: string;
  webhookSecret: string;
  databaseUrl: string;
  defaultShop?: string;
}

function loadConfig(): CLIConfig {
  // Load from environment variables
  const webhookEndpoint = process.env.WEBHOOK_ENDPOINT || 'http://localhost:3000/webhooks';
  const webhookSecret = process.env.SHOPIFY_API_SECRET || process.env.WEBHOOK_SECRET || '';
  const databaseUrl = process.env.DATABASE_URL || '';
  const defaultShop = process.env.DEFAULT_SHOP;

  if (!webhookSecret) {
    console.warn(chalk.yellow('Warning: No SHOPIFY_API_SECRET or WEBHOOK_SECRET set'));
  }

  if (!databaseUrl) {
    console.warn(chalk.yellow('Warning: No DATABASE_URL set - inspect commands will fail'));
  }

  return {
    webhookEndpoint,
    webhookSecret,
    databaseUrl,
    defaultShop,
  };
}

// ============================================================================
// CLI Program
// ============================================================================

const program = new Command();
const config = loadConfig();

program
  .name('rewardspro-tools')
  .description('Development tools for RewardsPro Shopify embedded app')
  .version('1.0.0');

// ============================================================================
// Webhook Commands
// ============================================================================

const webhookCmd = program
  .command('webhook')
  .description('Send simulated webhooks with valid HMAC signatures')
  .argument('<topic>', `Webhook topic (${WEBHOOK_TOPICS.slice(0, 3).join(', ')}...)`)
  .option('-s, --shop <domain>', 'Shop domain (e.g., test.myshopify.com)', config.defaultShop)
  .option('-p, --payload <json>', 'Custom payload JSON')
  .option('-f, --file <path>', 'Payload from JSON file')
  .option('-e, --endpoint <url>', 'Webhook endpoint URL', config.webhookEndpoint)
  .option('-v, --verbose', 'Show detailed output')
  .action(async (topic: string, options) => {
    const spinner = ora('Sending webhook...').start();

    try {
      // Validate topic
      if (!WEBHOOK_TOPICS.includes(topic as WebhookTopic)) {
        spinner.fail(`Invalid topic: ${topic}`);
        console.log(chalk.gray(`Valid topics: ${WEBHOOK_TOPICS.join(', ')}`));
        process.exit(1);
      }

      // Validate shop
      if (!options.shop) {
        spinner.fail('Shop domain is required');
        console.log(chalk.gray('Use --shop <domain> or set DEFAULT_SHOP env var'));
        process.exit(1);
      }

      // Parse payload
      let payload = {};
      if (options.payload) {
        payload = JSON.parse(options.payload);
      } else if (options.file) {
        const fs = await import('fs');
        payload = JSON.parse(fs.readFileSync(options.file, 'utf-8'));
      }

      const simulator = new WebhookSimulator({
        endpoint: options.endpoint,
        secret: config.webhookSecret,
        verbose: options.verbose,
      });

      const result = await simulator.send({
        topic: topic as WebhookTopic,
        shop: options.shop,
        payload,
      });

      if (result.success) {
        spinner.succeed(chalk.green(`Webhook sent successfully`));
        console.log(chalk.gray(`  Topic: ${result.topic}`));
        console.log(chalk.gray(`  Shop: ${result.shop}`));
        console.log(chalk.gray(`  Status: ${result.statusCode}`));
        console.log(chalk.gray(`  Duration: ${result.durationMs}ms`));
        if (result.response) {
          console.log(chalk.gray(`  Response: ${JSON.stringify(result.response)}`));
        }
      } else {
        spinner.fail(chalk.red(`Webhook failed: ${result.error || result.statusCode}`));
        if (result.response) {
          console.log(chalk.gray(`Response: ${JSON.stringify(result.response)}`));
        }
        process.exit(1);
      }
    } catch (error: any) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Webhook sequence command
program
  .command('webhook:sequence')
  .description('Run a predefined webhook sequence')
  .argument('<name>', `Sequence name (${Object.keys(WebhookSequences).join(', ')})`)
  .option('-s, --shop <domain>', 'Shop domain', config.defaultShop)
  .option('-e, --endpoint <url>', 'Webhook endpoint URL', config.webhookEndpoint)
  .option('-d, --delay <ms>', 'Delay between webhooks', '1000')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (name: string, options) => {
    const spinner = ora(`Running sequence: ${name}`).start();

    try {
      const sequence = WebhookSequences[name as keyof typeof WebhookSequences];
      if (!sequence) {
        spinner.fail(`Unknown sequence: ${name}`);
        console.log(chalk.gray(`Available: ${Object.keys(WebhookSequences).join(', ')}`));
        process.exit(1);
      }

      if (!options.shop) {
        spinner.fail('Shop domain is required');
        process.exit(1);
      }

      const simulator = new WebhookSimulator({
        endpoint: options.endpoint,
        secret: config.webhookSecret,
        verbose: options.verbose,
        defaultDelay: parseInt(options.delay, 10),
      });

      spinner.text = `Running ${sequence.steps.length}-step sequence...`;
      const result = await simulator.runSequence(options.shop, sequence);

      if (result.success) {
        spinner.succeed(chalk.green(`Sequence completed: ${sequence.name}`));
        console.log(chalk.gray(`  Steps: ${result.results.length}`));
        console.log(chalk.gray(`  Duration: ${result.totalDurationMs}ms`));

        // Show step summary
        for (const step of result.results) {
          const icon = step.success ? chalk.green('✓') : chalk.red('✗');
          console.log(chalk.gray(`  ${icon} ${step.topic} (${step.durationMs}ms)`));
        }
      } else {
        spinner.fail(chalk.red(`Sequence failed at step ${result.results.length}`));
        const failed = result.results[result.results.length - 1];
        if (failed) {
          console.log(chalk.red(`  Failed: ${failed.topic} - ${failed.error}`));
        }
        process.exit(1);
      }
    } catch (error: any) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// List webhook topics
program
  .command('webhook:list')
  .description('List available webhook topics and sequences')
  .action(() => {
    console.log(chalk.bold('\nWebhook Topics:'));
    const topicTable = new Table({
      head: [chalk.cyan('Topic'), chalk.cyan('Description')],
      colWidths: [30, 50],
    });

    const topicDescriptions: Record<string, string> = {
      'orders/create': 'Fired when a new order is created',
      'orders/updated': 'Fired when an order is modified',
      'orders/paid': 'Fired when an order payment is completed',
      'orders/fulfilled': 'Fired when an order is fully shipped',
      'orders/cancelled': 'Fired when an order is cancelled',
      'customers/create': 'Fired when a new customer is created',
      'customers/update': 'Fired when a customer is modified',
      'customers/delete': 'Fired when a customer is deleted',
      'refunds/create': 'Fired when a refund is processed',
      'app/uninstalled': 'Fired when the app is uninstalled',
    };

    for (const topic of WEBHOOK_TOPICS) {
      topicTable.push([topic, topicDescriptions[topic] || '-']);
    }
    console.log(topicTable.toString());

    console.log(chalk.bold('\nWebhook Sequences:'));
    const seqTable = new Table({
      head: [chalk.cyan('Name'), chalk.cyan('Steps'), chalk.cyan('Description')],
      colWidths: [25, 8, 45],
    });

    for (const [name, seq] of Object.entries(WebhookSequences)) {
      seqTable.push([name, seq.steps.length.toString(), seq.description || seq.name]);
    }
    console.log(seqTable.toString());
  });

// ============================================================================
// Inspect Commands
// ============================================================================

program
  .command('inspect')
  .description('Inspect shop state in the database')
  .option('-s, --shop <domain>', 'Shop domain', config.defaultShop)
  .option('--sections <list>', `Sections to inspect (${INSPECTION_SECTIONS.join(',')})`, 'overview')
  .option('--customer <id>', 'Specific customer ID to inspect')
  .option('--order <id>', 'Specific order ID to inspect')
  .option('-l, --limit <n>', 'Limit records returned', '10')
  .option('-v, --verbose', 'Show full record details')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Inspecting shop state...').start();

    try {
      if (!options.shop) {
        spinner.fail('Shop domain is required');
        process.exit(1);
      }

      if (!config.databaseUrl) {
        spinner.fail('DATABASE_URL is required for inspection');
        process.exit(1);
      }

      const inspector = new ShopInspector({
        verbose: options.verbose,
      } as any);

      const sections = options.sections.split(',') as InspectionSection[];
      const result = await inspector.inspect({
        shop: options.shop,
        sections,
        customerId: options.customer,
        orderId: options.order,
        limit: parseInt(options.limit, 10),
        verbose: options.verbose,
      });

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      // Pretty print results
      console.log(chalk.bold(`\nShop: ${chalk.cyan(options.shop)}`));
      console.log(chalk.gray(`Inspected at: ${result.timestamp}`));
      console.log(chalk.gray(`Duration: ${result.durationMs}ms`));

      // Overview
      if (result.overview) {
        console.log(chalk.bold('\n📊 Overview'));
        const overviewTable = new Table();
        overviewTable.push(
          { 'Customers': result.overview.totalCustomers },
          { 'Orders': result.overview.totalOrders },
          { 'Tiers': result.overview.totalTiers },
          { 'Has Settings': result.overview.hasSettings ? '✓' : '✗' },
          { 'Has Points Config': result.overview.hasPointsConfig ? '✓' : '✗' },
        );
        console.log(overviewTable.toString());
      }

      // Customers
      if (result.customers) {
        console.log(chalk.bold(`\n👥 Customers (${result.customers.total})`));
        if (result.customers.records.length > 0) {
          const custTable = new Table({
            head: [chalk.cyan('ID'), chalk.cyan('Email'), chalk.cyan('Points'), chalk.cyan('Credits'), chalk.cyan('Tier')],
          });
          for (const c of result.customers.records) {
            custTable.push([
              c.shopifyCustomerId.slice(-8),
              c.email || '-',
              c.totalPointsEarned?.toString() || '0',
              c.storeCreditBalance?.toString() || '0',
              c.currentTier || '-',
            ]);
          }
          console.log(custTable.toString());
        }
      }

      // Orders
      if (result.orders) {
        console.log(chalk.bold(`\n📦 Orders (${result.orders.total})`));
        if (result.orders.records.length > 0) {
          const orderTable = new Table({
            head: [chalk.cyan('ID'), chalk.cyan('Number'), chalk.cyan('Status'), chalk.cyan('Total'), chalk.cyan('Points')],
          });
          for (const o of result.orders.records) {
            orderTable.push([
              o.shopifyOrderId.slice(-8),
              o.orderNumber?.toString() || '-',
              o.financialStatus || '-',
              o.totalPrice?.toString() || '0',
              o.pointsEarned?.toString() || '0',
            ]);
          }
          console.log(orderTable.toString());
        }
      }

      // Tiers
      if (result.tiers) {
        console.log(chalk.bold(`\n🏆 Tiers (${result.tiers.total})`));
        if (result.tiers.records.length > 0) {
          const tierTable = new Table({
            head: [chalk.cyan('Name'), chalk.cyan('Level'), chalk.cyan('Multiplier'), chalk.cyan('Subscribers')],
          });
          for (const t of result.tiers.records) {
            tierTable.push([
              t.name,
              t.level?.toString() || '-',
              t.pointsMultiplier?.toString() || '1',
              t.subscriberCount?.toString() || '0',
            ]);
          }
          console.log(tierTable.toString());
        }
      }

      // Points
      if (result.points) {
        console.log(chalk.bold(`\n💰 Points Summary`));
        const pointsTable = new Table();
        pointsTable.push(
          { 'Total Earned': result.points.totalEarned },
          { 'Total Redeemed': result.points.totalRedeemed },
          { 'Total Expired': result.points.totalExpired },
          { 'Net Balance': result.points.totalEarned - result.points.totalRedeemed - result.points.totalExpired },
        );
        console.log(pointsTable.toString());
      }

      // Sessions
      if (result.sessions) {
        console.log(chalk.bold(`\n🔐 Sessions (${result.sessions.total})`));
        if (result.sessions.records.length > 0) {
          const sessTable = new Table({
            head: [chalk.cyan('ID'), chalk.cyan('Scope'), chalk.cyan('Online'), chalk.cyan('Expires')],
          });
          for (const s of result.sessions.records) {
            sessTable.push([
              s.id.slice(0, 20) + '...',
              s.scope?.slice(0, 30) || '-',
              s.isOnline ? '✓' : '✗',
              s.expires ? new Date(s.expires).toLocaleDateString() : '-',
            ]);
          }
          console.log(sessTable.toString());
        }
      }

      // Errors
      if (result.errors && result.errors.length > 0) {
        console.log(chalk.bold(chalk.red('\n⚠ Errors')));
        for (const err of result.errors) {
          console.log(chalk.red(`  - ${err}`));
        }
      }

    } catch (error: any) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Quick health check
program
  .command('inspect:health')
  .description('Quick health check for a shop')
  .option('-s, --shop <domain>', 'Shop domain', config.defaultShop)
  .action(async (options) => {
    const spinner = ora('Checking shop health...').start();

    try {
      if (!options.shop) {
        spinner.fail('Shop domain is required');
        process.exit(1);
      }

      const inspector = new ShopInspector({} as any);

      const health = await inspector.healthCheck(options.shop);
      spinner.stop();

      const statusIcon = health.healthy ? chalk.green('✓') : chalk.red('✗');
      console.log(`\n${statusIcon} Shop: ${chalk.cyan(options.shop)}`);
      console.log(chalk.gray(`  Status: ${health.healthy ? 'Healthy' : 'Issues Detected'}`));
      console.log(chalk.gray(`  Customers: ${health.customerCount}`));
      console.log(chalk.gray(`  Orders: ${health.orderCount}`));
      console.log(chalk.gray(`  Active Sessions: ${health.activeSessionCount}`));

      if (health.issues.length > 0) {
        console.log(chalk.yellow('\n  Issues:'));
        for (const issue of health.issues) {
          console.log(chalk.yellow(`    - ${issue}`));
        }
      }

    } catch (error: any) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ============================================================================
// Scenario Commands
// ============================================================================

program
  .command('scenario')
  .description('Run a test scenario')
  .argument('<name>', `Scenario name (${Object.keys(BuiltInScenarios).slice(0, 3).join(', ')}...)`)
  .option('-s, --shop <domain>', 'Shop domain', config.defaultShop)
  .option('-v, --verbose', 'Show detailed output')
  .option('--var <key=value>', 'Override scenario variable', (val, acc: string[]) => {
    acc.push(val);
    return acc;
  }, [])
  .option('--json', 'Output as JSON')
  .action(async (name: string, options) => {
    const spinner = ora(`Running scenario: ${name}`).start();

    try {
      if (!options.shop) {
        spinner.fail('Shop domain is required');
        process.exit(1);
      }

      const scenario = BuiltInScenarios[name as keyof typeof BuiltInScenarios];
      if (!scenario) {
        spinner.fail(`Unknown scenario: ${name}`);
        console.log(chalk.gray(`Available: ${Object.keys(BuiltInScenarios).join(', ')}`));
        process.exit(1);
      }

      // Parse variable overrides
      const varOverrides: Record<string, string> = {};
      for (const v of options.var || []) {
        const [key, value] = v.split('=');
        if (key && value) {
          varOverrides[key] = value;
        }
      }

      spinner.text = `Running: ${scenario.name}`;

      const runner = new ScenarioRunner({
        webhookEndpoint: config.webhookEndpoint,
        webhookSecret: config.webhookSecret,
        databaseUrl: config.databaseUrl,
        verbose: options.verbose,
      });

      // Stop spinner for verbose output
      if (options.verbose) {
        spinner.stop();
      }

      const result = await runner.run(name, options.shop, varOverrides);

      if (!options.verbose) {
        spinner.stop();
      }

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      // Summary output
      const icon = result.success ? chalk.green('✓') : chalk.red('✗');
      console.log(`\n${icon} Scenario: ${chalk.bold(result.scenario)}`);
      console.log(chalk.gray(`  Shop: ${result.shop}`));
      console.log(chalk.gray(`  Duration: ${result.totalDurationMs}ms`));
      console.log(chalk.gray(`  Steps: ${result.summary.passedSteps}/${result.summary.totalSteps} passed`));
      console.log(chalk.gray(`  Assertions: ${result.summary.assertions.passed}/${result.summary.assertions.total} passed`));

      if (!result.success) {
        console.log(chalk.red('\nFailed Steps:'));
        for (const step of result.steps.filter(s => !s.success)) {
          console.log(chalk.red(`  - ${step.step.name}: ${step.error}`));
        }
        process.exit(1);
      }

    } catch (error: any) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// List scenarios
program
  .command('scenario:list')
  .description('List available test scenarios')
  .action(() => {
    console.log(chalk.bold('\nAvailable Scenarios:'));

    const table = new Table({
      head: [chalk.cyan('Name'), chalk.cyan('Steps'), chalk.cyan('Description')],
      colWidths: [25, 8, 50],
    });

    for (const [key, scenario] of Object.entries(BuiltInScenarios)) {
      table.push([key, scenario.steps.length.toString(), scenario.description]);
    }

    console.log(table.toString());

    console.log(chalk.gray('\nRun a scenario:'));
    console.log(chalk.gray('  pnpm --filter rewardspro-dev-tools scenario <name> --shop <domain>'));
  });

// ============================================================================
// Preview Command (Extension Preview)
// ============================================================================

program
  .command('preview')
  .description('Start extension preview server')
  .option('-p, --port <port>', 'Server port', '3001')
  .option('-s, --shop <domain>', 'Shop domain for context', config.defaultShop)
  .action(async (options) => {
    console.log(chalk.yellow('\n⚠ Extension Preview Server'));
    console.log(chalk.gray('This feature is planned but not yet implemented.'));
    console.log(chalk.gray('For now, use Shopify CLI dev server for extension testing.'));
    console.log(chalk.gray('\nUsage: npm run dev'));
  });

// ============================================================================
// Run CLI
// ============================================================================

program.parse();
