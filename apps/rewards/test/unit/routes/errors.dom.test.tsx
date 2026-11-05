// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { UNSAFE_ErrorResponseImpl as ErrorResponse, createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The loaders are replaced by the stub's hydration data and errors; nothing
// here reaches Shopify or the database.
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

const app = await import("~/routes/app");
const root = await import("~/root");
const buyer = await import("~/routes/app.customers.$id");
const order = await import("~/routes/app.orders.$id");

const STACK_LINE = "at secretFunction (/var/task/build/server/index.js:4711:13)";

/** An error thrown while rendering, with a stack the merchant must never see. */
function failing(): never {
  const error = new Error("Cannot read properties of null (reading 'name')");
  error.stack = `TypeError: ${error.message}\n    ${STACK_LINE}`;
  throw error;
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // React and React Router report a caught render error on the console; kept out of the test output
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  consoleError.mockRestore();
});

type Child = { id: string; path: string; Component: () => React.ReactNode; ErrorBoundary?: () => React.ReactNode };

/**
 * The admin shell with one page under it. `error` is a loader's error as
 * server rendering hands it over: at the route whose boundary renders it
 * (`errorAt`, the page by default).
 */
function renderInShell(child: Child, url: string, error?: unknown, errorAt = child.id) {
  const Stub = createRoutesStub([
    { id: "routes/app", path: "/app", Component: app.default, ErrorBoundary: app.ErrorBoundary, children: [child] },
  ]);
  render(
    <Stub
      initialEntries={[url]}
      hydrationData={{ loaderData: { "routes/app": { apiKey: "test-api-key" } }, ...(error ? { errors: { [errorAt]: error } } : {}) }}
    />,
  );
}

const notFound = () => new ErrorResponse(404, "Not Found", "Not found");

// BOUNDARY-3
describe("an error the app didn't answer", () => {
  it("shows one plain sentence in the admin, never the stack", async () => {
    renderInShell({ id: "routes/app._index", path: "", Component: failing }, "/app");

    expect(await screen.findByText("Something went wrong. Reload the page.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("secretFunction");
    expect(document.body.textContent).not.toContain("Cannot read properties");
    expect(document.querySelector("pre")).toBeNull();
    // M3c-F1: inside the admin, in Polaris
    expect(document.querySelector("s-page s-section s-paragraph")?.textContent).toBe("Something went wrong. Reload the page.");
    expect(document.querySelector("p")).toBeNull();
  });

  it("shows one plain sentence at the root, never the stack", async () => {
    const Stub = createRoutesStub([{ id: "root", path: "/", Component: failing, ErrorBoundary: root.ErrorBoundary }]);
    render(<Stub initialEntries={["/"]} />);

    expect(await screen.findByText("Something went wrong. Reload the page.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("secretFunction");
    expect(document.querySelector("pre")).toBeNull();
    // Polaris may not be loaded at the root: plain HTML
    expect(document.querySelector("p")?.textContent).toBe("Something went wrong. Reload the page.");
    expect(document.querySelector("s-page")).toBeNull();
  });

  it("says a page isn't here at the root when no route matches", async () => {
    const Stub = createRoutesStub([{ id: "root", path: "/", Component: () => <p>Root</p>, ErrorBoundary: root.ErrorBoundary }]);
    // As the server hands over a URL no route matches
    const noMatch = new ErrorResponse(404, "Not Found", new Error('No route matches URL "/nowhere"'), true);
    render(<Stub initialEntries={["/"]} hydrationData={{ errors: { root: noMatch } }} />);

    expect(await screen.findByText("This page isn't here.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("No route matches");
  });

  it("still renders a response Shopify's library throws, as its boundary does", async () => {
    const bounce = new ErrorResponse(401, "Unauthorized", "<p>Signing you in</p>");
    renderInShell({ id: "routes/app._index", path: "", Component: () => <p>Home</p> }, "/app", bounce, "routes/app");

    expect(await screen.findByText("Signing you in")).toBeTruthy();
  });
});

// A21 concern 4: a 404 keeps the admin's menu and offers the way back
describe("a page that isn't there", () => {
  it.each([
    ["a buyer", { id: "routes/app.customers.$id", path: "customers/:id", Component: buyer.default, ErrorBoundary: buyer.ErrorBoundary }, "/app/customers/x", "This buyer isn't here.", "/app/customers", "Customers"],
    ["an order", { id: "routes/app.orders.$id", path: "orders/:id", Component: order.default, ErrorBoundary: order.ErrorBoundary }, "/app/orders/x", "This order isn't here.", "/app/orders", "Orders"],
  ] as const)("for %s, inside the admin with the menu", async (_what, child, url, sentence, listHref, listLabel) => {
    renderInShell(child, url, notFound());

    expect(await screen.findByText(sentence)).toBeTruthy();
    expect(document.querySelector("s-app-nav")).not.toBeNull();
    expect(document.querySelector("s-page")?.getAttribute("heading")).toBe("Not found");
    expect(document.querySelector(`s-page s-link[slot="breadcrumb-actions"][href="${listHref}"]`)?.textContent).toBe(listLabel);
    expect(document.querySelector(`s-section s-link[href="${listHref}"]`)?.textContent).toBe(`Back to ${listLabel}`);
  });

  it("for any other error in the page, shows the plain sentence inside the admin", async () => {
    const throwing = { id: "routes/app.orders.$id", path: "orders/:id", Component: failing, ErrorBoundary: order.ErrorBoundary };
    renderInShell(throwing, "/app/orders/x");

    expect(await screen.findByText("Something went wrong. Reload the page.")).toBeTruthy();
    expect(document.querySelector("s-app-nav")).not.toBeNull();
    expect(document.body.textContent).not.toContain("secretFunction");
    // M3c-F1: in Polaris, as the page's own 404
    expect(document.querySelector("s-page s-section s-paragraph")?.textContent).toBe("Something went wrong. Reload the page.");
    expect(document.querySelector("p")).toBeNull();
  });

  it("says a page isn't here, in Polaris, when the admin gets React Router's own 404", async () => {
    const noMatch = new ErrorResponse(404, "Not Found", new Error('No route matches URL "/app/nowhere"'), true);
    renderInShell({ id: "routes/app._index", path: "", Component: () => <p>Home</p> }, "/app", noMatch, "routes/app");

    expect(await screen.findByText("This page isn't here.")).toBeTruthy();
    expect(document.querySelector("s-page s-section s-paragraph")?.textContent).toBe("This page isn't here.");
    expect(document.body.textContent).not.toContain("No route matches");
  });
});
