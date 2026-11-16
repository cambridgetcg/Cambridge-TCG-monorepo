// @vitest-environment jsdom
// The server renders each document as React Router does on Vercel
// (import.meta.env.SSR is stubbed on for that), and jsdom only parses the
// HTML it sends: DOMParser runs no script. The last tests then hydrate that
// HTML as the browser does (SSR off).
import { act, createElement, type ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { RouterProvider, StaticRouterProvider, createMemoryRouter, createStaticHandler, createStaticRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Links, Meta, Scripts and ScrollRestoration need the framework's manifest,
// which exists only in a real build. Scripts stands in with what it renders
// in the body: an inline script and an inline module, neither of which
// App Bridge counts as a script before it.
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    Links: () => null,
    Meta: () => null,
    ScrollRestoration: () => null,
    Scripts: () => [
      createElement("script", { key: "context", dangerouslySetInnerHTML: { __html: "window.__reactRouterContext = {};" } }),
      createElement("script", { key: "entry", type: "module", async: true, dangerouslySetInnerHTML: { __html: 'import("/assets/entry.client.js");' } }),
    ],
  };
});
// The loaders are the test's own; nothing here reaches Shopify or the database.
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, login: async () => ({}) }));

const root = await import("~/root");
const app = await import("~/routes/app");
const authLogin = await import("~/routes/auth.login");
const { APP_BRIDGE_URL, appBridgeHead, renderedAppBridgeHead } = await import("~/shopify/app-bridge");
const { POLARIS_URL } = await import("~/shopify/polaris");

const KEY = "test-client-id";
const ENV_NAMES = ["SHOPIFY_API_KEY", "VERCEL_ENV", "NODE_ENV"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  vi.stubEnv("SSR", true);
  saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  process.env.SHOPIFY_API_KEY = KEY;
  process.env.VERCEL_ENV = "production";
  // React Router logs a loader's error on the server; kept out of the test output
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const name of ENV_NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function failing(): never {
  throw new Error("Cannot read properties of null (reading 'name')");
}

/**
 * The app's route tree as React Router's framework builds it: root's Layout
 * around root's component and around root's boundary, the admin shell at
 * /app with one page, the dev login, and a route with no boundary of its own.
 */
function routes(page: { loader?: () => unknown }) {
  return [
    {
      id: "root",
      path: "/",
      Component: () => (
        <root.Layout>
          <root.default />
        </root.Layout>
      ),
      ErrorBoundary: () => (
        <root.Layout>
          <root.ErrorBoundary />
        </root.Layout>
      ),
      children: [
        {
          id: "routes/app",
          path: "app",
          loader: () => null,
          Component: app.default,
          ErrorBoundary: app.ErrorBoundary,
          children: [{ id: "routes/app._index", index: true, loader: page.loader, Component: () => <s-page heading="Home" /> }],
        },
        { id: "routes/auth.login", path: "auth/login", handle: authLogin.handle, loader: () => ({ errors: {} }), Component: authLogin.default },
        { id: "routes/broken", path: "broken", loader: failing, Component: () => null as ReactNode },
      ],
    },
  ];
}

/** The document the server sends for `path`, parsed. */
async function documentFor(path: string, page: { loader?: () => unknown } = {}) {
  const handler = createStaticHandler(routes(page));
  const context = await handler.query(new Request(`https://rewards.test${path}`));
  if (context instanceof Response) throw new Error(`Expected a document, got a ${context.status} response`);
  const router = createStaticRouter(handler.dataRoutes, context);
  const html = renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
  return { html, context, document: new DOMParser().parseFromString(html, "text/html") };
}

/** Built for Shopify 3.1.1, as App Bridge checks itself when it starts. */
function expectAppBridgeFirstInHead(document: Document) {
  const bridges = [...document.querySelectorAll("script")].filter((script) => script.getAttribute("src") === APP_BRIDGE_URL);
  expect(bridges).toHaveLength(1);
  const [bridge] = bridges;
  expect(bridge.parentElement).toBe(document.head);
  // The first script of any kind in the document
  expect(document.querySelector("script")).toBe(bridge);
  for (const attribute of ["async", "defer", "type"]) expect(bridge.hasAttribute(attribute)).toBe(false);
  // The key, read by App Bridge as it starts, so before its script
  const key = document.querySelector('meta[name="shopify-api-key"]');
  expect(key?.getAttribute("content")).toBe(KEY);
  expect(key?.parentElement).toBe(document.head);
  expect(key!.compareDocumentPosition(bridge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // Polaris once, after App Bridge
  const polaris = [...document.querySelectorAll("script")].filter((script) => script.getAttribute("src") === POLARIS_URL);
  expect(polaris).toHaveLength(1);
  expect(polaris[0].parentElement).toBe(document.head);
  expect([...document.scripts].indexOf(polaris[0])).toBe(1);
}

// Built for Shopify 3.1.1 and D3: App Bridge in the <head> of every document
describe("every document the admin can show", () => {
  it("an admin page loads App Bridge with the key, first in the head, once", async () => {
    const { document } = await documentFor("/app");

    expect(document.querySelector('s-page[heading="Home"]')).not.toBeNull();
    expect(document.querySelector("s-app-nav")).not.toBeNull();
    expectAppBridgeFirstInHead(document);
  });

  it("the admin's error page loads it too", async () => {
    const { document, html } = await documentFor("/app", { loader: failing });

    expect(document.querySelector('s-banner[tone="critical"]')?.textContent).toBe("Something went wrong. Reload the page.");
    expect(html).not.toContain("Cannot read properties");
    expectAppBridgeFirstInHead(document);
  });

  it("React Router's own 404, where no loader runs, loads it with the key", async () => {
    // An old admin path, as a merchant's bookmark from the earlier app might open it inside the admin
    const { document, context } = await documentFor("/app/analytics");

    expect(context.statusCode).toBe(404);
    expect(context.loaderData).toEqual({});
    expect(document.querySelector("s-paragraph")?.textContent).toBe("This page isn't here.");
    expectAppBridgeFirstInHead(document);
  });

  it("the last boundary's crash page loads it too", async () => {
    const { document } = await documentFor("/broken");

    expect(document.querySelector('s-banner[tone="critical"]')?.textContent).toBe("Something went wrong. Reload the page.");
    expectAppBridgeFirstInHead(document);
  });

  it("the dev login form, which the admin never shows, loads Polaris but no App Bridge", async () => {
    const { document } = await documentFor("/auth/login");

    expect(document.querySelector('s-text-field[name="shop"]')).not.toBeNull();
    expect(document.querySelector(`script[src="${APP_BRIDGE_URL}"]`)).toBeNull();
    expect(document.querySelector('meta[name="shopify-api-key"]')).toBeNull();
    expect(document.querySelectorAll(`script[src="${POLARIS_URL}"]`)).toHaveLength(1);
  });

  it("the browser reads back what the server rendered, so hydration renders the same tags", async () => {
    process.env.VERCEL_ENV = "preview";
    const { document } = await documentFor("/app/analytics");

    expect(renderedAppBridgeHead(document)).toEqual(appBridgeHead(process.env));
    expect(renderedAppBridgeHead(document)).toEqual({ apiKey: KEY, webVitalsDebug: true });
  });
});

// Built for Shopify 2.1 and D5: Shopify's debug switch logs the admin's LCP, CLS and INP in the console
describe("Web Vitals in the console", () => {
  it("is off in production", async () => {
    const { document } = await documentFor("/app");

    expect(document.querySelector('meta[name="shopify-debug"]')).toBeNull();
  });

  it("is on outside production, before App Bridge's script", async () => {
    process.env.VERCEL_ENV = "preview";
    const { document } = await documentFor("/app");

    const debug = document.querySelector('meta[name="shopify-debug"]');
    expect(debug?.getAttribute("content")).toBe("web-vitals");
    expect(debug?.parentElement).toBe(document.head);
    const bridge = document.querySelector(`script[src="${APP_BRIDGE_URL}"]`)!;
    expect(debug!.compareDocumentPosition(bridge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expectAppBridgeFirstInHead(document);
  });

  it.each([
    [{ VERCEL_ENV: "production", NODE_ENV: "production" }, false],
    [{ VERCEL_ENV: "preview", NODE_ENV: "production" }, true],
    [{ VERCEL_ENV: "development", NODE_ENV: "development" }, true],
    // Off Vercel: a production build is production, `shopify app dev` (staging) is not
    [{ NODE_ENV: "production" }, false],
    [{ NODE_ENV: "development" }, true],
    // Only a named place outside production turns it on: unknown counts as production
    [{}, false],
    [{ NODE_ENV: "test" }, false],
  ])("with %o, logging is %s", (env, on) => {
    expect(appBridgeHead({ SHOPIFY_API_KEY: KEY, ...env })).toEqual({ apiKey: KEY, webVitalsDebug: on });
  });
});

// Layout's browser side: React 19 hoists <meta>, so a tag the browser renders
// differently from the server's is added as a second one, not repaired
describe("hydration in the browser", () => {
  type ActEnvironment = { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let hydrated: Root | undefined;
  let actEnvironment: boolean | undefined;
  beforeEach(() => {
    actEnvironment = (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    act(() => hydrated?.unmount());
    hydrated = undefined;
    vi.unstubAllGlobals();
    (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = actEnvironment;
  });

  it.each([
    ["an admin page", "/app"],
    ["React Router's own 404", "/app/analytics"],
  ])("of %s keeps the server's one key and one App Bridge, with nothing to repair", async (_what, path) => {
    process.env.VERCEL_ENV = "preview";
    const { html, context } = await documentFor(path);
    // The page as the browser receives it, in a document of its own: every
    // test file shares one jsdom (singleThread), and testing-library's
    // `screen` keeps the shared document's body. jsdom runs none of its scripts.
    const served = new DOMParser().parseFromString(html, "text/html");
    const page = document.implementation.createHTMLDocument("");
    page.replaceChild(page.importNode(served.documentElement, true), page.documentElement);
    vi.stubGlobal("document", page);
    const key = page.querySelector('meta[name="shopify-api-key"]');
    const bridge = page.querySelector(`script[src="${APP_BRIDGE_URL}"]`);
    vi.mocked(console.error).mockClear();

    // A browser has no process.env: the key and the switch can come only from the page
    vi.stubEnv("SSR", false);
    delete process.env.SHOPIFY_API_KEY;
    delete process.env.VERCEL_ENV;
    const router = createMemoryRouter(routes({}), {
      initialEntries: [path],
      hydrationData: { loaderData: context.loaderData, actionData: context.actionData, errors: context.errors },
    });
    const repaired: unknown[] = [];
    await act(async () => {
      hydrated = hydrateRoot(page, <RouterProvider router={router} />, { onRecoverableError: (error) => repaired.push(error) });
    });

    expect(repaired).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
    // React adopted the server's tags, the ones App Bridge has already read, rather than making new ones
    expect(page.querySelector('meta[name="shopify-api-key"]')).toBe(key);
    expect(page.querySelector(`script[src="${APP_BRIDGE_URL}"]`)).toBe(bridge);
    expect(page.querySelectorAll('meta[name="shopify-api-key"]')).toHaveLength(1);
    expect(page.querySelectorAll('meta[name="shopify-debug"]')).toHaveLength(1);
    expect(page.querySelectorAll(`script[src="${APP_BRIDGE_URL}"]`)).toHaveLength(1);
    expect(page.querySelectorAll(`script[src="${POLARIS_URL}"]`)).toHaveLength(1);
    expectAppBridgeFirstInHead(page);
  });
});
