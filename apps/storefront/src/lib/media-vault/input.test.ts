import { describe, expect, it, vi } from "vitest";

import {
  collectorMediaMimeType,
  isSameOriginMutation,
  readBoundedCollectorMediaBody,
} from "./input";

function request(body: BodyInit, headers: Record<string, string> = {}): Request {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers,
    body,
    duplex: "half",
  };
  return new Request("https://cambridgetcg.com/api/account/media-vault", init);
}

describe("collector media upload input", () => {
  it("accepts only the three exact image media types", () => {
    expect(collectorMediaMimeType(request("x", { "content-type": "image/jpeg" }))).toBe(
      "image/jpeg",
    );
    expect(
      collectorMediaMimeType(request("x", { "content-type": "image/png; charset=binary" })),
    ).toBe("image/png");
    expect(collectorMediaMimeType(request("x", { "content-type": "image/gif" }))).toBeNull();
    expect(collectorMediaMimeType(request("x", { "content-type": "image/svg+xml" }))).toBeNull();
  });

  it("reads a stream only up to its actual byte bound", async () => {
    const result = await readBoundedCollectorMediaBody(request(new Uint8Array([1, 2, 3])), 3);
    expect(result).toEqual({ ok: true, bytes: Buffer.from([1, 2, 3]) });
  });

  it("rejects a declared oversize body before reading it", async () => {
    const getReader = vi.fn();
    const declaredOversize = {
      headers: new Headers({ "content-length": "4" }),
      body: { getReader },
    } as unknown as Request;
    const result = await readBoundedCollectorMediaBody(
      declaredOversize,
      3,
    );

    expect(result).toEqual({ ok: false, reason: "too-large" });
    expect(getReader).not.toHaveBeenCalled();
  });

  it("bounds chunked bodies that omit Content-Length", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    });
    const result = await readBoundedCollectorMediaBody(request(stream), 3);

    expect(result).toEqual({ ok: false, reason: "too-large" });
  });

  it("rejects empty and malformed declared lengths", async () => {
    await expect(readBoundedCollectorMediaBody(request(""), 3)).resolves.toEqual({
      ok: false,
      reason: "empty",
    });
    await expect(
      readBoundedCollectorMediaBody(request("x", { "content-length": "3.5" }), 3),
    ).resolves.toEqual({ ok: false, reason: "invalid-length" });
  });

  it("requires an exact same-origin mutation", () => {
    expect(isSameOriginMutation(request("x", { origin: "https://cambridgetcg.com" }))).toBe(
      true,
    );
    expect(isSameOriginMutation(request("x", { origin: "https://evil.example" }))).toBe(false);
    expect(isSameOriginMutation(request("x"))).toBe(false);
  });
});
