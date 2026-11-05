import { URLSearchParams as NodeURLSearchParams } from "node:url";
import { vi } from "vitest";

/**
 * Let a page's fetcher posts reach a route stub's action in a jsdom test.
 *
 * React Router builds each post as a Node Request from jsdom's objects: its
 * AbortSignal, which Node's Request refuses, and its URLSearchParams body,
 * which Node can't read as a form. In their place the Request gets a Node
 * URLSearchParams of the same fields and no signal; the browser's signal is
 * kept beside it, so a test can still ask whether the page aborted a post
 * (`abortedByPage`). Undo with vi.unstubAllGlobals().
 */
const pageSignals = new WeakMap<Request, AbortSignal>();

export function letFetchersPost(): void {
  const NodeRequest = globalThis.Request;
  class PageRequest extends NodeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const body = init?.body;
      const form = body && typeof body === "object" && body.constructor?.name === "URLSearchParams" ? new NodeURLSearchParams(String(body)) : body;
      super(input, init ? { ...init, body: form as BodyInit | null | undefined, signal: undefined } : init);
      if (init?.signal) pageSignals.set(this, init.signal);
    }
  }
  vi.stubGlobal("Request", PageRequest);
}

/** Whether the page aborted this post (a fetcher's second submit aborts its first). */
export function abortedByPage(request: Request): boolean {
  return pageSignals.get(request)?.aborted ?? false;
}

/** The fields of a post, as the action reads them. */
export async function fieldsOf(request: Request): Promise<Record<string, string>> {
  return Object.fromEntries([...(await request.formData())].map(([key, value]) => [key, String(value)]));
}
