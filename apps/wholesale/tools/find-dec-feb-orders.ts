#!/usr/bin/env tsx
/**
 * Find all December 2025 – February 2026 orders on Remambo.
 * Uses Playwright click interactions for AJAX-based filtering.
 */
import { writeFileSync } from "fs";
import path from "path";
import { getRemamboSession } from "./lib/remambo-session";

interface Order { id: string; date: string; total: string; title: string }

function parseOrders(text: string): Order[] {
  const lines = text.split("\n").map(l => l.trim());
  const orders: Order[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/A-(\d{7})/);
    if (m) {
      let date = "", total = "", title = "";
      for (let j = i - 3; j < Math.min(i + 15, lines.length); j++) {
        if (j < 0) continue;
        const dateMatch = lines[j].match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dateMatch && !date) date = dateMatch[1];
        const totalMatch = lines[j].match(/¥([\d,]+)/);
        if (totalMatch && !total && j > i) total = "¥" + totalMatch[1];
        if (!title && j > i && lines[j].match(/^(OP|EB|ST|P-|PRB)/))
          title = lines[j].trim().slice(0, 70);
      }
      orders.push({ id: "A-" + m[1], date, total, title });
    }
  }
  return orders;
}

function isInRange(dateStr: string): boolean {
  const [d, m, y] = dateStr.split(".").map(Number);
  if (!d || !m || !y) return false;
  if (y === 2025 && m === 12) return true;
  if (y === 2026 && (m === 1 || m === 2)) return true;
  return false;
}

async function main() {
  const headed = process.argv.includes("--headed");
  const session = await getRemamboSession(headed);
  const { page } = session;

  try {
    console.log("Loading orders page...");
    await page.goto("https://www.remambo.jp/office/orders", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // Dump initial state
    let text = await page.evaluate(() => document.body.innerText);
    let totalMatch = text.match(/Total:\s*(\d+)/);
    console.log(`Initial state: Total = ${totalMatch ? totalMatch[1] : "?"}`);

    // Uncheck all status checkboxes via clicks, then check only "received"
    const statusIds = ['status_2', 'status_6', 'status_10', 'status_5', 'status_16', 'status_7', 'status_8', 'status_13'];
    for (const id of statusIds) {
      const cb = page.locator(`#${id}`);
      if (await cb.count() > 0 && await cb.isChecked()) {
        await cb.click();
        await page.waitForTimeout(100);
      }
    }

    // Check received
    const receivedCb = page.locator('#status_7');
    if (await receivedCb.count() > 0 && !(await receivedCb.isChecked())) {
      await receivedCb.click();
      console.log("Checked 'received' checkbox");
    }

    // Find and click Show/submit button inside the search_status form
    const formHtml = await page.evaluate(() => {
      const form = document.getElementById('search_status');
      return form ? form.innerHTML.slice(0, 500) : "FORM NOT FOUND";
    });
    console.log("Form snippet:", formHtml.slice(0, 200));

    // Try submitting by finding the submit input inside the form
    const submitted = await page.evaluate(() => {
      const form = document.getElementById('search_status');
      if (!form) return "no form";
      const submit = form.querySelector('input[type="submit"]');
      if (submit) {
        (submit as HTMLElement).click();
        return "clicked submit";
      }
      // Try button
      const btn = form.querySelector('button');
      if (btn) {
        btn.click();
        return "clicked button";
      }
      // Try form.submit()
      form.submit();
      return "called form.submit()";
    });
    console.log(`Submit action: ${submitted}`);
    await page.waitForTimeout(3000);

    text = await page.evaluate(() => document.body.innerText);
    totalMatch = text.match(/Total:\s*(\d+)/);
    const total = totalMatch ? parseInt(totalMatch[1]) : 0;
    console.log(`After submit: Total = ${total}`);

    if (total === 0) {
      // The form might use AJAX via Prototype's Ajax.Updater
      // Let's try intercepting the request and doing it directly
      console.log("\nTrying direct XHR approach...");

      // Get cookies and make direct request
      const cookies = await page.context().cookies();
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");

      // Try fetching orders with XHR from within the page
      const result = await page.evaluate(async () => {
        try {
          const resp = await fetch("/office/orders?stat%5B%5D=7&ps=0", {
            credentials: "include",
            headers: { "X-Requested-With": "XMLHttpRequest" }
          });
          const html = await resp.text();
          return { ok: true, length: html.length, snippet: html.slice(0, 300) };
        } catch (e: any) {
          return { ok: false, error: e.message };
        }
      });
      console.log("XHR result:", JSON.stringify(result).slice(0, 300));

      if (result.ok && result.length > 1000) {
        // Try loading the HTML response into a temp element and parsing
        const orderText = await page.evaluate(async () => {
          const resp = await fetch("/office/orders?stat%5B%5D=7&ps=0", {
            credentials: "include",
            headers: { "X-Requested-With": "XMLHttpRequest" }
          });
          const html = await resp.text();
          const div = document.createElement("div");
          div.innerHTML = html;
          return div.innerText;
        });

        writeFileSync(path.join(__dirname, "logs", "orders-xhr.txt"), orderText);
        const xhrOrders = parseOrders(orderText);
        console.log(`XHR orders parsed: ${xhrOrders.length}`);

        if (xhrOrders.length > 0) {
          const targetOrders = xhrOrders.filter(o => isInRange(o.date));
          const dates = xhrOrders.map(o => o.date).filter(Boolean);
          console.log(`Date range: ${dates[0]} → ${dates[dates.length - 1]}`);

          console.log(`\n=== Dec 2025 – Feb 2026 Orders: ${targetOrders.length} ===\n`);
          for (const o of targetOrders) {
            console.log(`${o.id}\t${o.date}\t${o.total}\t${o.title}`);
          }
          if (targetOrders.length > 0) {
            console.log("\nOrder IDs:");
            console.log(targetOrders.map(o => o.id.replace("A-", "")).join(" "));
          }
          return;
        }
      }
    }

    // Parse from the page text
    const allOrders = parseOrders(text);
    console.log(`Page orders parsed: ${allOrders.length}`);

    const targetOrders = allOrders.filter(o => isInRange(o.date));
    console.log(`\n=== Dec 2025 – Feb 2026 Orders: ${targetOrders.length} ===\n`);
    for (const o of targetOrders) {
      console.log(`${o.id}\t${o.date}\t${o.total}\t${o.title}`);
    }

    if (targetOrders.length > 0) {
      console.log("\nOrder IDs:");
      console.log(targetOrders.map(o => o.id.replace("A-", "")).join(" "));
    }
  } finally {
    await session.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
