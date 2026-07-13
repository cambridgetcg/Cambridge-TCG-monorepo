export type BoundedUtf8BodyRead =
  | { ok: true; text: string }
  | { ok: false; kind: "too_large" | "invalid_utf8" | "unreadable" };

/** Read and decode an HTTP body without ever buffering more than maxBytes. */
export async function readBoundedUtf8Body(
  request: Request,
  maxBytes: number,
  cancelReason: string,
): Promise<BoundedUtf8BodyRead> {
  if (request.body === null) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel(`${cancelReason} exceeds request limit`);
        return { ok: false, kind: "too_large" };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch (error) {
    try {
      await reader.cancel(`${cancelReason} could not be decoded`);
    } catch {
      // The stream may already be closed; cancellation is best-effort.
    }
    return {
      ok: false,
      kind: error instanceof TypeError ? "invalid_utf8" : "unreadable",
    };
  } finally {
    reader.releaseLock();
  }
}
