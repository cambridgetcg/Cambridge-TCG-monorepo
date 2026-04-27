/**
 * Quick Remambo form inspection script.
 * Usage: npx playwright test tools/inspect-remambo.ts --headed
 * Or:    npx tsx tools/inspect-remambo.ts
 */
import { chromium } from "@playwright/test";

const EMAIL = process.env.REMAMBO_EMAIL || "aaasiadog@gmail.com";
const PASS = process.env.REMAMBO_PASS || "17171514Alex";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 1. Log in
  console.log("→ Navigating to login page…");
  await page.goto("https://www.remambo.jp/login", { waitUntil: "networkidle" });
  await page.screenshot({ path: "test-results/remambo-01-login.png" });

  // Fill login form
  console.log("→ Logging in…");
  await page.fill('input[placeholder="Email"]', EMAIL);
  await page.fill('input[placeholder="Password"]', PASS);
  await page.screenshot({ path: "test-results/remambo-02-login-filled.png" });

  // Submit — click "Sign in to your account" (could be button, input, or div)
  await page.click('text="Sign in to your account"');
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/remambo-03-after-login.png" });
  console.log("→ Current URL after login:", page.url());

  // 2. Navigate to new order form
  console.log("→ Navigating to order form…");
  await page.goto("https://www.remambo.jp/neworder", { waitUntil: "networkidle" });
  await page.screenshot({ path: "test-results/remambo-04-neworder.png" });

  // 3. Dump the full form HTML
  const formHTML = await page.evaluate(() => {
    // Try to find forms
    const forms = document.querySelectorAll("form");
    if (forms.length > 0) {
      return Array.from(forms).map((f) => f.outerHTML).join("\n---\n");
    }
    // Fallback: dump main content
    const main = document.querySelector("main") || document.querySelector(".content") || document.body;
    return main?.innerHTML || "NO CONTENT FOUND";
  });
  console.log("\n=== FORM HTML ===\n");
  console.log(formHTML);

  // 4. List all input fields on the page
  const inputs = await page.evaluate(() => {
    const els = document.querySelectorAll("input, select, textarea, button");
    return Array.from(els).map((el) => ({
      tag: el.tagName,
      type: (el as HTMLInputElement).type,
      name: (el as HTMLInputElement).name,
      id: el.id,
      placeholder: (el as HTMLInputElement).placeholder,
      value: (el as HTMLInputElement).value,
      classes: el.className,
    }));
  });
  console.log("\n=== ALL INPUT FIELDS ===\n");
  console.table(inputs);

  // 5. Try pasting a Cardrush URL to see what happens
  const testUrl = "https://www.cardrush-op.jp/product/66051";
  console.log(`\n→ Trying to paste Cardrush URL: ${testUrl}`);

  // Find the URL input field
  const urlInput = await page.$('input[name*="url" i], input[placeholder*="url" i], input[placeholder*="link" i], textarea[name*="url" i]');
  if (urlInput) {
    await urlInput.fill(testUrl);
    await page.screenshot({ path: "test-results/remambo-05-url-pasted.png" });
    console.log("→ URL field found and filled!");

    // Look for a next/submit/add button
    const nextBtn = await page.$('button:has-text("Next"), button:has-text("Add"), button:has-text("Submit"), a:has-text("Next")');
    if (nextBtn) {
      console.log("→ Found next/submit button, clicking…");

      // Intercept network requests to see what API calls are made
      page.on("request", (req) => {
        if (req.method() === "POST" || req.url().includes("api")) {
          console.log(`  [REQUEST] ${req.method()} ${req.url()}`);
          const postData = req.postData();
          if (postData) console.log(`  [BODY] ${postData}`);
        }
      });
      page.on("response", (res) => {
        if (res.url().includes("api") || res.url().includes("order") || res.url().includes("neworder")) {
          console.log(`  [RESPONSE] ${res.status()} ${res.url()}`);
        }
      });

      await nextBtn.click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "test-results/remambo-06-after-submit.png" });
      console.log("→ Current URL:", page.url());

      // Dump any new form fields that appeared
      const newInputs = await page.evaluate(() => {
        const els = document.querySelectorAll("input, select, textarea");
        return Array.from(els).map((el) => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type,
          name: (el as HTMLInputElement).name,
          placeholder: (el as HTMLInputElement).placeholder,
          value: (el as HTMLInputElement).value,
        }));
      });
      console.log("\n=== FORM AFTER URL SUBMIT ===\n");
      console.table(newInputs);
    }
  } else {
    console.log("→ Could not find URL input field automatically.");
    console.log("→ Dumping all visible text content for manual inspection:");
    const text = await page.evaluate(() => document.body.innerText);
    console.log(text.slice(0, 3000));
  }

  // Keep browser open for manual inspection
  console.log("\n→ Browser stays open for 60 seconds for manual inspection…");
  await page.waitForTimeout(60000);

  await browser.close();
}

main().catch(console.error);
