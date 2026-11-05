// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldsOf, letFetchersPost } from "../helpers/fetcher-posts";

// The pages' loaders are replaced by the stub's hydration data; nothing here
// reaches Shopify or the database. What the loaders read and what a download
// answers are in the Postgres suite (settings-page).
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));
// A revalidation would build a Request from jsdom's AbortSignal, which Node's
// fetch refuses; the page's call to it is what matters here.
const revalidate = vi.fn(async () => {});
vi.mock("react-router", async (original) => ({
  ...(await original<typeof import("react-router")>()),
  useRevalidator: () => ({ revalidate, state: "idle" }),
}));

const { default: Settings } = await import("~/routes/app.settings._index");
const { default: PrivacyRequests } = await import("~/routes/app.settings.privacy");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  revalidate.mockClear();
});

/** Settings; each post goes to `posted`, and the stand-in action never answers, so it stays in flight. */
async function renderSettings(notifyBuyers: boolean, posted?: Array<Record<string, string>>) {
  const action = async ({ request }: { request: Request }) => {
    posted?.push(await fieldsOf(request));
    return new Promise(() => {});
  };
  const Stub = createRoutesStub([{ id: "routes/app.settings._index", path: "/app/settings", Component: Settings, ...(posted ? { action } : {}) }]);
  render(<Stub initialEntries={["/app/settings"]} hydrationData={{ loaderData: { "routes/app.settings._index": { notifyBuyers } } }} />);
  await screen.findByText("Customer data requests");
}

const OPEN = { id: "r1", buyer: "Ann Smith", received: "November 3, 2026", due: "December 3, 2026", expires: "December 18, 2026", state: "open", downloaded: null };
const DOWNLOADED = { id: "r2", buyer: "Customer ····5678", received: "October 20, 2026", due: "November 19, 2026", expires: "December 4, 2026", state: "downloaded", downloaded: "October 22, 2026" };
const EXPIRED = { id: "r3", buyer: "No customer named", received: "August 1, 2026", due: "August 31, 2026", expires: "September 15, 2026", state: "expired", downloaded: null };

async function renderPrivacy(requests: Array<typeof OPEN | typeof DOWNLOADED | typeof EXPIRED>) {
  const Stub = createRoutesStub([{ id: "routes/app.settings.privacy", path: "/app/settings/privacy", Component: PrivacyRequests }]);
  const data = { dueDays: 30, retentionDays: 45, requests };
  render(<Stub initialEntries={["/app/settings/privacy"]} hydrationData={{ loaderData: { "routes/app.settings.privacy": data } }} />);
  await screen.findByText(/Download the report and send it to the customer within 30 days\. Each report can be downloaded for 45 days\./);
}

const rows = () =>
  [...document.querySelectorAll("s-table-body s-table-row")].map((row) =>
    [...row.querySelectorAll("s-table-cell")].map((cell) => cell.textContent?.trim()),
  );

describe("Settings", () => {
  it("shows the email switch, off, with who sends the email", async () => {
    await renderSettings(false);
    const toggle = document.querySelector("s-switch")!;
    expect(toggle.getAttribute("label")).toBe("Email buyers when they earn store credit");
    expect(toggle.getAttribute("details")).toBe("Shopify sends this email itself. RewardsPro sends no email.");
    expect(toggle.hasAttribute("checked")).toBe(false);
  });

  it("shows the switch on when the merchant turned it on", async () => {
    await renderSettings(true);
    expect(document.querySelector("s-switch")?.hasAttribute("checked")).toBe(true);
  });

  // CONCURRENCY-2: one change at a time
  it("disables the email switch while its change is posted, and posts one change", async () => {
    letFetchersPost();
    const posted: Array<Record<string, string>> = [];
    await renderSettings(false, posted);
    const toggle = document.querySelector("s-switch")!;
    expect(toggle.hasAttribute("disabled")).toBe(false);

    for (const checked of [true, false]) {
      await act(async () => {
        Object.defineProperty(toggle, "checked", { value: checked, configurable: true, writable: true });
        fireEvent.change(toggle);
      });
    }

    expect(posted).toEqual([{ intent: "notify", notify: "on" }]);
    expect(toggle.hasAttribute("disabled")).toBe(true);
  });

  // Ruling 72 (DESIGN-4): no docs link until the docs describe this app
  it("links to the data requests and to help by email, and to no docs", async () => {
    await renderSettings(false);
    expect(document.querySelector('s-link[href="/app/settings/privacy"]')?.textContent).toBe("Customer data requests");
    expect(document.querySelector('s-link[href="mailto:contact@rewardspro.io"]')?.textContent).toBe("contact@rewardspro.io");
    expect([...document.querySelectorAll("s-link")].map((link) => link.getAttribute("href"))).toEqual(["/app/settings/privacy", "mailto:contact@rewardspro.io"]);
    expect(document.body.textContent).not.toContain("docs");
  });
});

describe("Customer data requests", () => {
  it("lists each request's dates, with Download until the report expires", async () => {
    await renderPrivacy([OPEN, DOWNLOADED, EXPIRED]);
    expect(rows()).toEqual([
      // DESIGN-17: whose request each is, named live
      ["Ann Smith", "November 3, 2026", "December 3, 2026", "December 18, 2026", "Download"],
      ["Customer ····5678", "October 20, 2026", "November 19, 2026", "December 4, 2026", "DownloadDownloaded October 22, 2026"],
      ["No customer named", "August 1, 2026", "August 31, 2026", "September 15, 2026", "This report has expired"],
    ]);
    expect(document.querySelectorAll("s-button")).toHaveLength(2);
    expect(document.querySelector('s-link[slot="breadcrumb-actions"]')?.getAttribute("href")).toBe("/app/settings");
  });

  it("says so when no customer has asked", async () => {
    await renderPrivacy([]);
    expect(document.querySelector("s-table")).toBeNull();
    expect(screen.getByText("No customer has asked for their data.")).toBeTruthy();
  });

  it("posts the request's id to the download, and says when the report is gone", async () => {
    const fetch = vi.fn(async () => new Response("This report is no longer available.", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await renderPrivacy([OPEN]);

    await act(async () => {
      fireEvent.click(document.querySelector("s-button")!);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/app/settings/privacy/download");
    expect(init.method).toBe("POST");
    expect(new URLSearchParams(init.body as URLSearchParams).get("id")).toBe("r1");
    expect(await screen.findByText("This report is no longer available.")).toBeTruthy();
    // The list is read again, so it shows what the request has become
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  // A23-F4: a sign-in page answered 200 is not the report
  it("saves nothing, and says the download failed, when the answer isn't the report", async () => {
    // jsdom has no createObjectURL: set for this test, so only the type check can stop the save
    const createObjectURL = vi.fn(() => "blob:x");
    const original = URL.createObjectURL;
    URL.createObjectURL = createObjectURL;
    try {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Sign in</html>", { headers: { "Content-Type": "text/html" } })));
      await renderPrivacy([OPEN]);

      await act(async () => {
        fireEvent.click(document.querySelector("s-button")!);
      });

      expect(await screen.findByText("The report couldn't be downloaded. Try again.")).toBeTruthy();
      expect(createObjectURL).not.toHaveBeenCalled();
    } finally {
      URL.createObjectURL = original;
    }
  });
});
