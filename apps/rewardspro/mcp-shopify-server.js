#!/usr/bin/env node

/**
 * Custom MCP Server for Shopify App Testing
 * Provides browser automation capabilities for testing Shopify apps
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium } from "playwright";

class ShopifyTestServer {
  constructor() {
    this.browser = null;
    this.page = null;
    this.server = new Server(
      {
        name: "shopify-test-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    // Tool to launch browser and navigate to Shopify app
    this.server.setRequestHandler("tools/call", async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "launch_browser":
          return await this.launchBrowser(args);
        
        case "navigate":
          return await this.navigate(args);
        
        case "click":
          return await this.click(args);
        
        case "fill":
          return await this.fill(args);
        
        case "screenshot":
          return await this.screenshot(args);
        
        case "get_text":
          return await this.getText(args);
        
        case "wait_for":
          return await this.waitFor(args);
        
        case "close_browser":
          return await this.closeBrowser();
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    // List available tools
    this.server.setRequestHandler("tools/list", async () => {
      return {
        tools: [
          {
            name: "launch_browser",
            description: "Launch browser and navigate to Shopify app",
            inputSchema: {
              type: "object",
              properties: {
                url: { type: "string", description: "URL to navigate to" },
                headless: { type: "boolean", description: "Run in headless mode" }
              }
            }
          },
          {
            name: "navigate",
            description: "Navigate to a URL",
            inputSchema: {
              type: "object",
              properties: {
                url: { type: "string", description: "URL to navigate to" }
              },
              required: ["url"]
            }
          },
          {
            name: "click",
            description: "Click an element",
            inputSchema: {
              type: "object",
              properties: {
                selector: { type: "string", description: "CSS selector or text" }
              },
              required: ["selector"]
            }
          },
          {
            name: "fill",
            description: "Fill a form field",
            inputSchema: {
              type: "object",
              properties: {
                selector: { type: "string", description: "CSS selector" },
                value: { type: "string", description: "Value to fill" }
              },
              required: ["selector", "value"]
            }
          },
          {
            name: "screenshot",
            description: "Take a screenshot",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Path to save screenshot" },
                fullPage: { type: "boolean", description: "Capture full page" }
              }
            }
          },
          {
            name: "get_text",
            description: "Get text content of element",
            inputSchema: {
              type: "object",
              properties: {
                selector: { type: "string", description: "CSS selector" }
              },
              required: ["selector"]
            }
          },
          {
            name: "wait_for",
            description: "Wait for element or condition",
            inputSchema: {
              type: "object",
              properties: {
                selector: { type: "string", description: "CSS selector to wait for" },
                state: { type: "string", description: "State to wait for (visible, hidden, attached)" },
                timeout: { type: "number", description: "Timeout in milliseconds" }
              },
              required: ["selector"]
            }
          },
          {
            name: "close_browser",
            description: "Close the browser",
            inputSchema: {
              type: "object",
              properties: {}
            }
          }
        ]
      };
    });
  }

  async launchBrowser(args) {
    const { url = "http://localhost:3000", headless = false } = args;
    
    if (this.browser) {
      await this.browser.close();
    }

    this.browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    });

    this.page = await context.newPage();
    
    // Navigate to the URL
    await this.page.goto(url, { waitUntil: 'networkidle' });

    return {
      content: `Browser launched and navigated to ${url}`,
      success: true
    };
  }

  async navigate(args) {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch_browser first.");
    }

    await this.page.goto(args.url, { waitUntil: 'networkidle' });
    return {
      content: `Navigated to ${args.url}`,
      success: true
    };
  }

  async click(args) {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch_browser first.");
    }

    // Try to click by text first, then by selector
    try {
      await this.page.getByText(args.selector).click();
    } catch {
      await this.page.click(args.selector);
    }

    return {
      content: `Clicked element: ${args.selector}`,
      success: true
    };
  }

  async fill(args) {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch_browser first.");
    }

    await this.page.fill(args.selector, args.value);
    return {
      content: `Filled ${args.selector} with value`,
      success: true
    };
  }

  async screenshot(args) {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch_browser first.");
    }

    const path = args.path || `screenshot-${Date.now()}.png`;
    const screenshot = await this.page.screenshot({
      path,
      fullPage: args.fullPage || false
    });

    return {
      content: `Screenshot saved to ${path}`,
      success: true,
      data: screenshot.toString('base64')
    };
  }

  async getText(args) {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch_browser first.");
    }

    const text = await this.page.textContent(args.selector);
    return {
      content: text,
      success: true
    };
  }

  async waitFor(args) {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch_browser first.");
    }

    await this.page.waitForSelector(args.selector, {
      state: args.state || 'visible',
      timeout: args.timeout || 30000
    });

    return {
      content: `Element ${args.selector} is ${args.state || 'visible'}`,
      success: true
    };
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }

    return {
      content: "Browser closed",
      success: true
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Shopify Test MCP Server started");
  }
}

// Start the server
const server = new ShopifyTestServer();
server.start().catch(console.error);