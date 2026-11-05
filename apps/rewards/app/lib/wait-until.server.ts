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
 * undone), and tests can wait for the work with flushWaitUntil. Failures are
 * kept for flushWaitUntil only under the test runner (SECURITY-4): an
 * instance that serves for hours would otherwise hold every error it saw.
 */

const VERCEL_REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

interface VercelRequestContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** The work still running, for flushWaitUntil. Each piece leaves the set once it settles. */
const running = new Set<Promise<unknown>>();
/** The errors of work that failed, oldest first, until flushWaitUntil reports them; test runs only. */
const failures: unknown[] = [];
/** Vitest sets VITEST in every test run; production never does. */
const keepsFailures = () => Boolean(process.env.VITEST);

export function waitUntil(promise: Promise<unknown>): void {
  running.add(promise);
  const settled = promise.then(
    () => undefined,
    (error: unknown) => {
      if (keepsFailures()) failures.push(error);
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
 * on, has settled. Rejects with the first error of work that failed since the
 * last flush, whether it failed before this call or while it waited, and
 * forgets them all (A13-F2), so a test's afterEach flush hears of a failure
 * even when the test never flushed.
 */
export async function flushWaitUntil(): Promise<void> {
  while (running.size > 0) {
    await Promise.allSettled([...running]);
    // Let each settled piece record its failure and leave the set before looking again.
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (failures.length > 0) {
    const [first] = failures.splice(0);
    throw first;
  }
}
