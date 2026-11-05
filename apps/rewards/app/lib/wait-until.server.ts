/**
 * Keep the serverless function alive until `promise` settles, after the
 * response has gone out (rule 9: the webhook answers, then the credit is
 * sent). On serverless, work a request leaves running can be frozen or cut
 * off once the response is sent.
 *
 * Carried from apps/rewardspro/app/utils/wait-until.server.ts. Vercel
 * publishes each request's context (with its waitUntil) under this global
 * symbol; waitUntil in @vercel/functions reads it the same way. Where there
 * is no Vercel request (local dev, tests), the promise simply runs on.
 *
 * Added here: the work's failure is logged instead of escaping as an
 * unhandled rejection (the hourly job is the backstop for anything it left
 * undone), and tests can wait for the work with flushWaitUntil.
 */

const VERCEL_REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

interface VercelRequestContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** The work still running, for flushWaitUntil. Each piece leaves the set once it settles. */
const running = new Set<Promise<unknown>>();

export function waitUntil(promise: Promise<unknown>): void {
  running.add(promise);
  const settled = promise.then(
    () => undefined,
    (error: unknown) => {
      console.error(`[wait-until] Work after the response failed: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
  void settled.finally(() => running.delete(promise));
  const store = (globalThis as { [VERCEL_REQUEST_CONTEXT]?: { get?: () => VercelRequestContext | undefined } })[
    VERCEL_REQUEST_CONTEXT
  ];
  store?.get?.()?.waitUntil?.(settled);
}

/**
 * For tests: wait until the work handed to waitUntil, and any work it hands
 * on, has settled. Rejects with the first error of work that failed while it
 * waited (work that failed before is only logged).
 */
export async function flushWaitUntil(): Promise<void> {
  let failure: { error: unknown } | null = null;
  while (running.size > 0) {
    for (const result of await Promise.allSettled([...running])) {
      if (result.status === "rejected") failure ??= { error: result.reason };
    }
    // Let each settled piece leave the set before looking again.
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (failure) throw failure.error;
}
