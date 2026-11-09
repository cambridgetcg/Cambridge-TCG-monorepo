import { afterEach, describe, expect, it, vi } from "vitest";

import { waitUntil } from "~/utils/wait-until.server";

// Vercel's runtime publishes the current request's context here; it is
// what waitUntil in @vercel/functions reads.
const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");
const globals = globalThis as Record<symbol, unknown>;

afterEach(() => {
  delete globals[REQUEST_CONTEXT];
});

describe("waitUntil", () => {
  it("hands the work to the Vercel request's waitUntil, so the function stays alive after responding", () => {
    const keepAlive = vi.fn();
    globals[REQUEST_CONTEXT] = { get: () => ({ waitUntil: keepAlive }) };
    const work = Promise.resolve();

    waitUntil(work);

    expect(keepAlive).toHaveBeenCalledWith(work);
  });

  it("lets the work run on where there is no Vercel request (local dev, tests)", () => {
    expect(() => waitUntil(Promise.resolve())).not.toThrow();

    globals[REQUEST_CONTEXT] = { get: () => undefined };
    expect(() => waitUntil(Promise.resolve())).not.toThrow();
  });
});
