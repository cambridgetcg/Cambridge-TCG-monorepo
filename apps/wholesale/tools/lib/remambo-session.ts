/**
 * Persistent Remambo browser session.
 * Saves/loads cookies to avoid re-logging in every time.
 * Provides reconnect() for recovering from dropped browser contexts.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import path from "path";

const COOKIE_PATH = path.join(__dirname, "..", "logs", "remambo-cookies.json");

if (existsSync(path.join(__dirname, "..", "..", ".env.local"))) {
  for (const line of readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

export interface RemamboSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  /** Get a fresh page with a new login (recovers from dropped contexts). */
  reconnect: () => Promise<Page>;
  /** Save cookies and close browser. */
  close: () => Promise<void>;
}

async function login(page: Page): Promise<void> {
  const email = process.env.REMAMBO_EMAIL || "";
  const pass = process.env.REMAMBO_PASS || process.env.REMAMBO_PASSWORD || "";
  if (!email || !pass) {
    throw new Error("REMAMBO_EMAIL and REMAMBO_PASS must be set in .env.local");
  }
  await page.goto("https://www.remambo.jp/login", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="Email"]', email);
  await page.fill('input[placeholder="Password"]', pass);
  await page.click('text="Sign in to your account"');
  await page.waitForLoadState("networkidle");

  if (page.url().includes("/login")) {
    throw new Error("Login failed — still on login page. Check REMAMBO_EMAIL / REMAMBO_PASS.");
  }
}

function saveCookies(context: BrowserContext): void {
  mkdirSync(path.dirname(COOKIE_PATH), { recursive: true });
  context.cookies().then((cookies) => {
    writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
  });
}

export async function getRemamboSession(headed = false): Promise<RemamboSession> {
  const browser = await chromium.launch({ headless: !headed });
  let context = await browser.newContext();
  let page: Page;

  // Try loading saved cookies
  let loggedIn = false;
  if (existsSync(COOKIE_PATH)) {
    try {
      const cookies = JSON.parse(readFileSync(COOKIE_PATH, "utf-8"));
      await context.addCookies(cookies);
      page = await context.newPage();
      await page.goto("https://www.remambo.jp/office/orders", { waitUntil: "networkidle" });
      if (!page.url().includes("login")) {
        console.log("  Reused saved Remambo session.");
        loggedIn = true;
      } else {
        await page.close();
      }
    } catch {
      // Cookie file invalid, fall through to fresh login
    }
  }

  if (!loggedIn) {
    page = await context.newPage();
    await login(page);
    console.log("  Logged in to Remambo (fresh session).");
    const cookies = await context.cookies();
    writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
  }

  const session: RemamboSession = {
    browser,
    context,
    page: page!,
    reconnect: async () => {
      // Create fresh context + page and re-login
      context = await browser.newContext();
      const newPage = await context.newPage();
      await login(newPage);
      session.context = context;
      session.page = newPage;
      return newPage;
    },
    close: async () => {
      try {
        const cookies = await context.cookies();
        mkdirSync(path.dirname(COOKIE_PATH), { recursive: true });
        writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
      } catch {
        // Browser may already be closed
      }
      await browser.close();
    },
  };

  return session;
}
