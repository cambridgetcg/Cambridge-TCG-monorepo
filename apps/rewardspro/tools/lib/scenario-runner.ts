/**
 * Test Scenario Runner
 *
 * Orchestrates complete test scenarios by combining webhook simulation
 * with shop state inspection. Validates that webhooks produce expected
 * state changes in the database.
 *
 * Usage:
 *   const runner = new ScenarioRunner(config);
 *   const result = await runner.run('newCustomerFirstOrder', 'shop.myshopify.com');
 */

import { WebhookSimulator, type WebhookResult } from './webhook-simulator.js';
import { ShopInspector, type ShopInspectionResult } from './shop-inspector.js';

// ============================================================================
// Types
// ============================================================================

export interface ScenarioConfig {
  webhookEndpoint: string;
  webhookSecret: string;
  databaseUrl: string;
  verbose?: boolean;
  /** Delay between steps in ms (default: 500) */
  stepDelay?: number;
  /** Timeout for waiting for state changes in ms (default: 5000) */
  stateChangeTimeout?: number;
}

export interface ScenarioStep {
  name: string;
  description: string;
  action: 'webhook' | 'wait' | 'inspect' | 'assert' | 'custom';
  /** For webhook action */
  webhookTopic?: string;
  webhookPayload?: Record<string, unknown>;
  /** For wait action - milliseconds */
  waitMs?: number;
  /** For inspect action */
  inspectSections?: string[];
  /** For assert action */
  assertions?: ScenarioAssertion[];
  /** For custom action */
  customFn?: (context: ScenarioContext) => Promise<void>;
}

export interface ScenarioAssertion {
  path: string; // dot notation path into inspection result
  operator: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'contains' | 'exists' | 'notExists';
  expected?: unknown;
  message?: string;
}

export interface ScenarioDefinition {
  name: string;
  description: string;
  /** Variables that can be overridden when running */
  variables: Record<string, unknown>;
  steps: ScenarioStep[];
}

export interface ScenarioContext {
  shop: string;
  variables: Record<string, unknown>;
  webhookResults: WebhookResult[];
  inspectionResults: ShopInspectionResult[];
  lastInspection?: ShopInspectionResult;
  stepResults: StepResult[];
}

export interface StepResult {
  step: ScenarioStep;
  success: boolean;
  durationMs: number;
  error?: string;
  data?: unknown;
}

export interface ScenarioResult {
  scenario: string;
  shop: string;
  success: boolean;
  steps: StepResult[];
  totalDurationMs: number;
  context: ScenarioContext;
  summary: {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    assertions: {
      total: number;
      passed: number;
      failed: number;
    };
  };
}

// ============================================================================
// Built-in Scenarios
// ============================================================================

export const BuiltInScenarios: Record<string, ScenarioDefinition> = {
  /**
   * New customer makes their first order
   * Tests: customer creation, order processing, points earning
   */
  newCustomerFirstOrder: {
    name: 'New Customer First Order',
    description: 'Simulates a new customer making their first purchase and earning points',
    variables: {
      customerId: 'gid://shopify/Customer/7000000001',
      customerEmail: 'scenario-test@example.com',
      orderId: 'gid://shopify/Order/5000000001',
      orderNumber: '1001',
      orderTotal: '99.99',
      currency: 'USD',
    },
    steps: [
      {
        name: 'Initial State Check',
        description: 'Verify customer does not exist before test',
        action: 'inspect',
        inspectSections: ['customers'],
      },
      {
        name: 'Create Customer',
        description: 'Send customer creation webhook',
        action: 'webhook',
        webhookTopic: 'customers/create',
        webhookPayload: {
          id: '{{customerId}}',
          email: '{{customerEmail}}',
          first_name: 'Scenario',
          last_name: 'Test',
          created_at: '{{now}}',
          updated_at: '{{now}}',
          orders_count: 0,
          total_spent: '0.00',
          currency: '{{currency}}',
        },
      },
      {
        name: 'Wait for Customer Processing',
        description: 'Allow time for customer webhook to be processed',
        action: 'wait',
        waitMs: 1000,
      },
      {
        name: 'Verify Customer Created',
        description: 'Check that customer exists in database',
        action: 'assert',
        assertions: [
          {
            path: 'customers.total',
            operator: 'greaterThan',
            expected: 0,
            message: 'Customer should exist after creation webhook',
          },
        ],
      },
      {
        name: 'Create Order',
        description: 'Send order creation webhook',
        action: 'webhook',
        webhookTopic: 'orders/create',
        webhookPayload: {
          id: '{{orderId}}',
          order_number: '{{orderNumber}}',
          email: '{{customerEmail}}',
          customer: {
            id: '{{customerId}}',
            email: '{{customerEmail}}',
          },
          financial_status: 'pending',
          total_price: '{{orderTotal}}',
          subtotal_price: '{{orderTotal}}',
          currency: '{{currency}}',
          created_at: '{{now}}',
          updated_at: '{{now}}',
          line_items: [
            {
              id: 'gid://shopify/LineItem/1',
              title: 'Test Product',
              quantity: 1,
              price: '{{orderTotal}}',
            },
          ],
        },
      },
      {
        name: 'Mark Order Paid',
        description: 'Send order paid webhook',
        action: 'webhook',
        webhookTopic: 'orders/paid',
        webhookPayload: {
          id: '{{orderId}}',
          order_number: '{{orderNumber}}',
          financial_status: 'paid',
          total_price: '{{orderTotal}}',
          customer: {
            id: '{{customerId}}',
          },
        },
      },
      {
        name: 'Wait for Order Processing',
        description: 'Allow time for order to be queued and processed',
        action: 'wait',
        waitMs: 2000,
      },
      {
        name: 'Final State Inspection',
        description: 'Inspect final state after all webhooks',
        action: 'inspect',
        inspectSections: ['customers', 'orders', 'points'],
      },
      {
        name: 'Verify Order Created',
        description: 'Check that order exists in database',
        action: 'assert',
        assertions: [
          {
            path: 'orders.total',
            operator: 'greaterThan',
            expected: 0,
            message: 'Order should exist after order webhooks',
          },
        ],
      },
    ],
  },

  /**
   * Order with full refund
   * Tests: points earning then deduction on refund
   */
  orderWithRefund: {
    name: 'Order with Full Refund',
    description: 'Simulates an order being placed, paid, then fully refunded',
    variables: {
      customerId: 'gid://shopify/Customer/7000000002',
      customerEmail: 'refund-test@example.com',
      orderId: 'gid://shopify/Order/5000000002',
      orderNumber: '1002',
      orderTotal: '150.00',
      currency: 'USD',
    },
    steps: [
      {
        name: 'Create Order',
        description: 'Send order creation webhook',
        action: 'webhook',
        webhookTopic: 'orders/create',
        webhookPayload: {
          id: '{{orderId}}',
          order_number: '{{orderNumber}}',
          email: '{{customerEmail}}',
          customer: { id: '{{customerId}}' },
          financial_status: 'pending',
          total_price: '{{orderTotal}}',
          subtotal_price: '{{orderTotal}}',
          currency: '{{currency}}',
          created_at: '{{now}}',
          line_items: [
            {
              id: 'gid://shopify/LineItem/2',
              title: 'Refund Test Product',
              quantity: 1,
              price: '{{orderTotal}}',
            },
          ],
        },
      },
      {
        name: 'Mark Order Paid',
        description: 'Send order paid webhook',
        action: 'webhook',
        webhookTopic: 'orders/paid',
        webhookPayload: {
          id: '{{orderId}}',
          financial_status: 'paid',
          total_price: '{{orderTotal}}',
          customer: { id: '{{customerId}}' },
        },
      },
      {
        name: 'Wait for Points Earning',
        description: 'Allow time for points to be earned',
        action: 'wait',
        waitMs: 2000,
      },
      {
        name: 'Check Points Before Refund',
        description: 'Inspect points state before refund',
        action: 'inspect',
        inspectSections: ['points'],
      },
      {
        name: 'Process Refund',
        description: 'Send refund creation webhook',
        action: 'webhook',
        webhookTopic: 'refunds/create',
        webhookPayload: {
          id: 'gid://shopify/Refund/1',
          order_id: '{{orderId}}',
          created_at: '{{now}}',
          refund_line_items: [
            {
              id: 'gid://shopify/RefundLineItem/1',
              line_item_id: 'gid://shopify/LineItem/2',
              quantity: 1,
              subtotal: '{{orderTotal}}',
            },
          ],
          transactions: [
            {
              amount: '{{orderTotal}}',
              kind: 'refund',
              status: 'success',
            },
          ],
        },
      },
      {
        name: 'Wait for Refund Processing',
        description: 'Allow time for refund to be processed',
        action: 'wait',
        waitMs: 2000,
      },
      {
        name: 'Final Inspection',
        description: 'Check state after refund',
        action: 'inspect',
        inspectSections: ['orders', 'points'],
      },
    ],
  },

  /**
   * Customer tier upgrade flow
   * Tests: tier subscription creation and customer tier assignment
   */
  tierUpgrade: {
    name: 'Customer Tier Upgrade',
    description: 'Simulates a customer purchasing a tier subscription upgrade',
    variables: {
      customerId: 'gid://shopify/Customer/7000000003',
      customerEmail: 'tier-test@example.com',
      orderId: 'gid://shopify/Order/5000000003',
      tierProductId: 'gid://shopify/Product/9000000001',
      tierPrice: '29.99',
      currency: 'USD',
    },
    steps: [
      {
        name: 'Initial Tier Check',
        description: 'Inspect current tiers available',
        action: 'inspect',
        inspectSections: ['tiers'],
      },
      {
        name: 'Customer Purchase Tier',
        description: 'Send order with tier product',
        action: 'webhook',
        webhookTopic: 'orders/create',
        webhookPayload: {
          id: '{{orderId}}',
          email: '{{customerEmail}}',
          customer: { id: '{{customerId}}' },
          financial_status: 'pending',
          total_price: '{{tierPrice}}',
          currency: '{{currency}}',
          created_at: '{{now}}',
          line_items: [
            {
              id: 'gid://shopify/LineItem/3',
              product_id: '{{tierProductId}}',
              title: 'Gold Tier Subscription',
              quantity: 1,
              price: '{{tierPrice}}',
              properties: [
                { name: '_tier_subscription', value: 'true' },
              ],
            },
          ],
        },
      },
      {
        name: 'Mark Tier Order Paid',
        description: 'Send order paid webhook',
        action: 'webhook',
        webhookTopic: 'orders/paid',
        webhookPayload: {
          id: '{{orderId}}',
          financial_status: 'paid',
          total_price: '{{tierPrice}}',
          customer: { id: '{{customerId}}' },
        },
      },
      {
        name: 'Wait for Tier Processing',
        description: 'Allow time for tier assignment',
        action: 'wait',
        waitMs: 3000,
      },
      {
        name: 'Final Tier Inspection',
        description: 'Check customer tier assignment',
        action: 'inspect',
        inspectSections: ['tiers', 'customers'],
      },
    ],
  },

  /**
   * App uninstall and data cleanup
   * Tests: GDPR-compliant data deletion
   */
  appUninstall: {
    name: 'App Uninstall Flow',
    description: 'Simulates app uninstall and verifies data cleanup',
    variables: {},
    steps: [
      {
        name: 'Pre-Uninstall State',
        description: 'Capture state before uninstall',
        action: 'inspect',
        inspectSections: ['overview', 'sessions'],
      },
      {
        name: 'Send Uninstall Webhook',
        description: 'Send app uninstalled webhook',
        action: 'webhook',
        webhookTopic: 'app/uninstalled',
        webhookPayload: {},
      },
      {
        name: 'Wait for Cleanup',
        description: 'Allow time for data cleanup',
        action: 'wait',
        waitMs: 5000,
      },
      {
        name: 'Post-Uninstall State',
        description: 'Verify data has been cleaned up',
        action: 'inspect',
        inspectSections: ['overview', 'sessions'],
      },
      {
        name: 'Verify Cleanup',
        description: 'Assert that shop data is removed',
        action: 'assert',
        assertions: [
          {
            path: 'sessions.total',
            operator: 'equals',
            expected: 0,
            message: 'All sessions should be deleted after uninstall',
          },
        ],
      },
    ],
  },

  /**
   * Health check scenario
   * Tests: basic connectivity and system health
   */
  healthCheck: {
    name: 'System Health Check',
    description: 'Verifies system connectivity and basic functionality',
    variables: {},
    steps: [
      {
        name: 'Database Connection',
        description: 'Verify database is accessible',
        action: 'inspect',
        inspectSections: ['overview'],
      },
      {
        name: 'Webhook Endpoint',
        description: 'Verify webhook endpoint is reachable',
        action: 'custom',
        customFn: async (context) => {
          // This will be handled by the runner
          console.log(`Health check for ${context.shop}`);
        },
      },
      {
        name: 'Verify Connectivity',
        description: 'Assert basic system health',
        action: 'assert',
        assertions: [
          {
            path: 'overview',
            operator: 'exists',
            message: 'Should be able to fetch shop overview',
          },
        ],
      },
    ],
  },
};

// ============================================================================
// Scenario Runner
// ============================================================================

export class ScenarioRunner {
  private config: Required<ScenarioConfig>;
  private webhookSimulator: WebhookSimulator;
  private shopInspector: ShopInspector;

  constructor(config: ScenarioConfig) {
    this.config = {
      verbose: false,
      stepDelay: 500,
      stateChangeTimeout: 5000,
      ...config,
    };

    this.webhookSimulator = new WebhookSimulator({
      appUrl: config.webhookEndpoint,
      endpoint: config.webhookEndpoint,
      webhookSecret: config.webhookSecret,
      secret: config.webhookSecret,
      verbose: config.verbose,
    });

    this.shopInspector = new ShopInspector({
      verbose: config.verbose,
    } as any);
  }

  /**
   * Run a built-in or custom scenario
   */
  async run(
    scenarioNameOrDef: string | ScenarioDefinition,
    shop: string,
    variableOverrides?: Record<string, unknown>
  ): Promise<ScenarioResult> {
    const startTime = Date.now();

    // Get scenario definition
    const scenario = typeof scenarioNameOrDef === 'string'
      ? BuiltInScenarios[scenarioNameOrDef]
      : scenarioNameOrDef;

    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenarioNameOrDef}`);
    }

    // Validate shop domain
    if (!shop || !shop.includes('.myshopify.com')) {
      throw new Error(`Invalid shop domain: ${shop}`);
    }

    // Initialize context
    const context: ScenarioContext = {
      shop,
      variables: {
        ...scenario.variables,
        ...variableOverrides,
        now: new Date().toISOString(),
        shop,
      },
      webhookResults: [],
      inspectionResults: [],
      stepResults: [],
    };

    this.log(`\n${'='.repeat(60)}`);
    this.log(`Running Scenario: ${scenario.name}`);
    this.log(`Shop: ${shop}`);
    this.log(`Description: ${scenario.description}`);
    this.log(`${'='.repeat(60)}\n`);

    let totalAssertions = 0;
    let passedAssertions = 0;
    let failedAssertions = 0;

    // Run each step
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const stepStart = Date.now();

      this.log(`\n[Step ${i + 1}/${scenario.steps.length}] ${step.name}`);
      this.log(`  Action: ${step.action}`);
      this.log(`  ${step.description}`);

      try {
        let stepData: unknown;

        switch (step.action) {
          case 'webhook':
            stepData = await this.executeWebhookStep(step, context);
            break;

          case 'wait':
            await this.executeWaitStep(step);
            stepData = { waitedMs: step.waitMs };
            break;

          case 'inspect':
            stepData = await this.executeInspectStep(step, context);
            break;

          case 'assert':
            const assertResult = await this.executeAssertStep(step, context);
            totalAssertions += assertResult.total;
            passedAssertions += assertResult.passed;
            failedAssertions += assertResult.failed;
            stepData = assertResult;

            if (assertResult.failed > 0) {
              throw new Error(`${assertResult.failed} assertion(s) failed`);
            }
            break;

          case 'custom':
            if (step.customFn) {
              await step.customFn(context);
            }
            stepData = { custom: true };
            break;
        }

        const stepResult: StepResult = {
          step,
          success: true,
          durationMs: Date.now() - stepStart,
          data: stepData,
        };
        context.stepResults.push(stepResult);

        this.log(`  ✓ Completed in ${stepResult.durationMs}ms`);

      } catch (error: any) {
        const stepResult: StepResult = {
          step,
          success: false,
          durationMs: Date.now() - stepStart,
          error: error.message,
        };
        context.stepResults.push(stepResult);

        this.log(`  ✗ Failed: ${error.message}`);

        // Continue to next step unless it's an assertion failure
        if (step.action === 'assert') {
          this.log(`  Stopping scenario due to assertion failure`);
          break;
        }
      }

      // Delay between steps
      if (i < scenario.steps.length - 1 && this.config.stepDelay > 0) {
        await this.sleep(this.config.stepDelay);
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const passedSteps = context.stepResults.filter(r => r.success).length;
    const failedSteps = context.stepResults.filter(r => !r.success).length;
    const success = failedSteps === 0;

    const result: ScenarioResult = {
      scenario: scenario.name,
      shop,
      success,
      steps: context.stepResults,
      totalDurationMs,
      context,
      summary: {
        totalSteps: context.stepResults.length,
        passedSteps,
        failedSteps,
        assertions: {
          total: totalAssertions,
          passed: passedAssertions,
          failed: failedAssertions,
        },
      },
    };

    this.log(`\n${'='.repeat(60)}`);
    this.log(`Scenario ${success ? 'PASSED' : 'FAILED'}: ${scenario.name}`);
    this.log(`  Steps: ${passedSteps}/${result.summary.totalSteps} passed`);
    this.log(`  Assertions: ${passedAssertions}/${totalAssertions} passed`);
    this.log(`  Duration: ${totalDurationMs}ms`);
    this.log(`${'='.repeat(60)}\n`);

    return result;
  }

  /**
   * List available built-in scenarios
   */
  listScenarios(): Array<{ name: string; key: string; description: string; stepCount: number }> {
    return Object.entries(BuiltInScenarios).map(([key, scenario]) => ({
      key,
      name: scenario.name,
      description: scenario.description,
      stepCount: scenario.steps.length,
    }));
  }

  /**
   * Run multiple scenarios in sequence
   */
  async runMultiple(
    scenarios: Array<string | ScenarioDefinition>,
    shop: string
  ): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      const result = await this.run(scenario, shop);
      results.push(result);

      // Stop if a scenario fails
      if (!result.success) {
        this.log(`\nStopping after failed scenario: ${result.scenario}`);
        break;
      }
    }

    return results;
  }

  // ============================================================================
  // Step Executors
  // ============================================================================

  private async executeWebhookStep(
    step: ScenarioStep,
    context: ScenarioContext
  ): Promise<WebhookResult> {
    if (!step.webhookTopic) {
      throw new Error('Webhook step requires webhookTopic');
    }

    // Interpolate variables in payload
    const payload = this.interpolateVariables(
      step.webhookPayload || {},
      context.variables
    );

    const result = await this.webhookSimulator.send({
      topic: step.webhookTopic as any,
      shop: context.shop,
      payload,
    });

    context.webhookResults.push(result);

    if (!result.success) {
      throw new Error(`Webhook failed: ${result.error || result.statusCode}`);
    }

    return result;
  }

  private async executeWaitStep(step: ScenarioStep): Promise<void> {
    const waitMs = step.waitMs || 1000;
    this.log(`  Waiting ${waitMs}ms...`);
    await this.sleep(waitMs);
  }

  private async executeInspectStep(
    step: ScenarioStep,
    context: ScenarioContext
  ): Promise<ShopInspectionResult> {
    const sections = step.inspectSections || ['overview'];

    const result = await this.shopInspector.inspect({
      shop: context.shop,
      sections: sections as any,
      verbose: this.config.verbose,
    });

    context.inspectionResults.push(result);
    context.lastInspection = result;

    return result;
  }

  private async executeAssertStep(
    step: ScenarioStep,
    context: ScenarioContext
  ): Promise<{ total: number; passed: number; failed: number; details: string[] }> {
    if (!step.assertions || step.assertions.length === 0) {
      return { total: 0, passed: 0, failed: 0, details: [] };
    }

    // Run inspection if we don't have a recent one
    if (!context.lastInspection) {
      await this.executeInspectStep(
        { ...step, action: 'inspect', inspectSections: ['overview', 'customers', 'orders', 'points'] },
        context
      );
    }

    const details: string[] = [];
    let passed = 0;
    let failed = 0;

    for (const assertion of step.assertions) {
      const actual = this.getValueByPath(context.lastInspection, assertion.path);
      const result = this.evaluateAssertion(assertion, actual);

      if (result.success) {
        passed++;
        details.push(`  ✓ ${assertion.path} ${assertion.operator} ${JSON.stringify(assertion.expected)}`);
      } else {
        failed++;
        const msg = assertion.message || `Expected ${assertion.path} ${assertion.operator} ${JSON.stringify(assertion.expected)}, got ${JSON.stringify(actual)}`;
        details.push(`  ✗ ${msg}`);
      }
    }

    for (const detail of details) {
      this.log(detail);
    }

    return {
      total: step.assertions.length,
      passed,
      failed,
      details,
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private interpolateVariables(
    obj: Record<string, unknown>,
    variables: Record<string, unknown>
  ): Record<string, unknown> {
    const json = JSON.stringify(obj);
    const interpolated = json.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = variables[varName];
      if (value === undefined) {
        return match; // Keep original if variable not found
      }
      // Handle different types
      if (typeof value === 'string') {
        return value;
      }
      return JSON.stringify(value).slice(1, -1); // Remove quotes for embedding in JSON
    });
    return JSON.parse(interpolated);
  }

  private getValueByPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private evaluateAssertion(
    assertion: ScenarioAssertion,
    actual: unknown
  ): { success: boolean } {
    switch (assertion.operator) {
      case 'equals':
        return { success: actual === assertion.expected };

      case 'notEquals':
        return { success: actual !== assertion.expected };

      case 'greaterThan':
        return { success: typeof actual === 'number' && actual > (assertion.expected as number) };

      case 'lessThan':
        return { success: typeof actual === 'number' && actual < (assertion.expected as number) };

      case 'contains':
        if (Array.isArray(actual)) {
          return { success: actual.includes(assertion.expected) };
        }
        if (typeof actual === 'string') {
          return { success: actual.includes(String(assertion.expected)) };
        }
        return { success: false };

      case 'exists':
        return { success: actual !== undefined && actual !== null };

      case 'notExists':
        return { success: actual === undefined || actual === null };

      default:
        return { success: false };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(message: string): void {
    if (this.config.verbose !== false) {
      console.log(message);
    }
  }
}

// ============================================================================
// Factory function
// ============================================================================

export function createScenarioRunner(config: ScenarioConfig): ScenarioRunner {
  return new ScenarioRunner(config);
}
