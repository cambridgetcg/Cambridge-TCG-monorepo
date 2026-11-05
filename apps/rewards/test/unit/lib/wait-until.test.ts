import { afterEach, describe, expect, it, vi } from "vitest";
import { flushWaitUntil, waitUntil } from "~/lib/wait-until.server";

// Vercel's runtime publishes the current request's context here; it is
// what waitUntil in @vercel/functions reads.
const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");
const globals = globalThis as Record<symbol, unknown>;

afterEach(() => {
  delete globals[REQUEST_CONTEXT];
  vi.restoreAllMocks();
});

/** A promise and the function that settles it. */
function later<T = void>() {
  let settle!: { resolve: (value: T) => void; reject: (error: unknown) => void };
  const promise = new Promise<T>((resolve, reject) => {
    settle = { resolve, reject };
  });
  return { promise, ...settle };
}

describe("waitUntil", () => {
  it("hands the work to the Vercel request's waitUntil, so the function stays alive after responding", async () => {
    const keepAlive = vi.fn();
    globals[REQUEST_CONTEXT] = { get: () => ({ waitUntil: keepAlive }) };
    const work = later();

    waitUntil(work.promise);

    expect(keepAlive).toHaveBeenCalledTimes(1);
    // Vercel waits for the work itself, and never sees it reject
    const kept = keepAlive.mock.calls[0][0] as Promise<unknown>;
    let done = false;
    void kept.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    work.reject(new Error("Shopify did not answer"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(kept).resolves.toBeUndefined();
  });

  it("lets the work run on where there is no Vercel request (local dev, tests)", async () => {
    expect(() => waitUntil(Promise.resolve())).not.toThrow();

    globals[REQUEST_CONTEXT] = { get: () => undefined };
    expect(() => waitUntil(Promise.resolve())).not.toThrow();
    await flushWaitUntil();
  });

  it("logs work that fails after the response, without its error escaping as an unhandled rejection", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const work = later();
    waitUntil(work.promise);

    work.reject(new Error("Shopify did not answer"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logged).toHaveBeenCalledWith("[wait-until] Work after the response failed: Shopify did not answer");
    await expect(flushWaitUntil()).resolves.toBeUndefined();
  });
});

describe("flushWaitUntil (tests only)", () => {
  it("waits for every piece of work still running, and the work it starts", async () => {
    const first = later();
    const second = later();
    const done: string[] = [];
    waitUntil(first.promise.then(() => done.push("first")));
    waitUntil(
      second.promise.then(() => {
        done.push("second");
        waitUntil(Promise.resolve().then(() => done.push("third")));
      }),
    );

    const flushed = flushWaitUntil();
    first.resolve();
    second.resolve();
    await flushed;

    expect(done).toEqual(["first", "second", "third"]);
  });

  it("rejects with the error of work that failed while it waited", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const work = later();
    waitUntil(work.promise);

    const flushed = flushWaitUntil();
    work.reject(new Error("the credit could not be sent"));

    await expect(flushed).rejects.toThrow("the credit could not be sent");
    await expect(flushWaitUntil()).resolves.toBeUndefined();
  });
});
