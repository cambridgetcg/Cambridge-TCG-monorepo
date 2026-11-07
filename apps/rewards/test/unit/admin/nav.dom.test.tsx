// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// The layout's loader is replaced by the stub's; nothing here reaches Shopify
// or the database.
vi.mock("~/shopify.server", () => ({ authenticate: {} }));

const { default: App } = await import("~/routes/app");

afterEach(cleanup);

function renderShell() {
  const Stub = createRoutesStub([
    {
      id: "routes/app",
      path: "/app",
      Component: App,
      loader: () => ({ apiKey: "test-api-key" }),
      children: [{ index: true, Component: () => <p>Home page</p> }],
    },
  ]);
  // The loader's answer as server rendering hands it over, so the router
  // runs no loader in jsdom (whose AbortSignal Node's Request refuses).
  render(<Stub initialEntries={["/app"]} hydrationData={{ loaderData: { "routes/app": { apiKey: "test-api-key" } } }} />);
}

describe("the admin shell", () => {
  it("lists Home, Customers, Tiers, Orders and Settings in that order", async () => {
    renderShell();
    await screen.findByText("Home page");

    const links = [...document.querySelectorAll("s-app-nav > s-link")];
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Home", "/app"],
      ["Customers", "/app/customers"],
      ["Tiers", "/app/tiers"],
      ["Orders", "/app/orders"],
      ["Settings", "/app/settings"],
    ]);
    // Home is the app's landing page, which Shopify hides from the menu.
    expect(links.map((link) => link.getAttribute("rel"))).toEqual(["home", null, null, null, null]);
  });

  it("loads App Bridge with the app's key and Polaris 2", async () => {
    renderShell();
    await screen.findByText("Home page");

    const sources = [...document.querySelectorAll("script")].map((script) => script.getAttribute("src"));
    expect(sources).toContain("https://cdn.shopify.com/shopifycloud/polaris-2.js");
    expect(document.querySelector('script[src="https://cdn.shopify.com/shopifycloud/app-bridge.js"]')?.getAttribute("data-api-key")).toBe(
      "test-api-key",
    );
  });
});
