// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { letFetchersPost } from "../helpers/fetcher-posts";

// The layout's loader is replaced by the stub's; nothing here reaches Shopify
// or the database.
vi.mock("~/shopify.server", () => ({ authenticate: {} }));

const { default: App } = await import("~/routes/app");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderShell() {
  const Stub = createRoutesStub([
    {
      id: "routes/app",
      path: "/app",
      Component: App,
      loader: () => null,
      children: [
        { index: true, Component: () => <p>Home page</p> },
        { path: "customers", Component: () => <p>Customers page</p> },
      ],
    },
  ]);
  // The loader's answer as server rendering hands it over, so the router
  // runs no loader in jsdom (whose AbortSignal Node's Request refuses).
  render(<Stub initialEntries={["/app"]} hydrationData={{ loaderData: { "routes/app": null } }} />);
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

  // Built for Shopify 3.1.1: App Bridge and Polaris load in the document's head (root.tsx, test/unit/document.test.tsx)
  it("adds no second App Bridge or Polaris script to the page", async () => {
    renderShell();
    await screen.findByText("Home page");

    expect(document.querySelectorAll("script")).toHaveLength(0);
  });

  it("follows a shopify:navigate from a menu link without reloading", async () => {
    // A navigation builds a Node Request from jsdom's AbortSignal, which Node refuses
    letFetchersPost();
    renderShell();
    await screen.findByText("Home page");

    const customers = document.querySelector('s-app-nav > s-link[href="/app/customers"]')!;
    act(() => {
      customers.dispatchEvent(new Event("shopify:navigate", { bubbles: true }));
    });

    expect(await screen.findByText("Customers page")).toBeTruthy();
    expect(screen.queryByText("Home page")).toBeNull();
  });
});
