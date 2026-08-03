import { describe, expect, it } from "vitest";
import { readCashloomJsonBody } from "./http";

function streamedRequest(
  chunks: Uint8Array[],
  contentType = "application/json",
  onCancel?: () => void,
): Request {
  let index = 0;
  return {
    headers: new Headers({ "content-type": contentType }),
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[index++];
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel() {
        onCancel?.();
      },
    }),
  } as unknown as Request;
}

describe("CashLoom bounded JSON reader", () => {
  it("parses a small chunked application/json body", async () => {
    const encoder = new TextEncoder();
    const request = streamedRequest([
      encoder.encode('{"action":'),
      encoder.encode('"prepare"}'),
    ]);

    await expect(readCashloomJsonBody(request, 64)).resolves.toEqual({
      ok: true,
      value: { action: "prepare" },
    });
  });

  it("cancels a chunked body as soon as its byte cap is crossed", async () => {
    let cancelled = false;
    const request = streamedRequest(
      [new TextEncoder().encode("123456")],
      "application/json",
      () => { cancelled = true; },
    );

    await expect(readCashloomJsonBody(request, 5)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(cancelled).toBe(true);
  });

  it("rejects non-JSON media types before touching the body", async () => {
    const request = {
      headers: new Headers({ "content-type": "text/plain" }),
      get body(): never {
        throw new Error("body must not be touched");
      },
    } as unknown as Request;

    await expect(readCashloomJsonBody(request)).resolves.toEqual({
      ok: false,
      reason: "unsupported_media_type",
    });
  });
});
