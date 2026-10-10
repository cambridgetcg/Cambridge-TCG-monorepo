// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import PlayPage from "./page";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("play entry availability", () => {
  it.each(["pending", "failed", "paused"])("keeps practice available while server status is %s", async (status) => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "/api/auth/session") return new Response(JSON.stringify({ user: null }));
      if (input === "/api/game/pve") {
        if (status === "pending") return new Promise<Response>(() => {});
        if (status === "failed") return new Response("Unavailable", { status: 503 });
        return new Response(JSON.stringify({
          levels: [], highestCleared: 0, mode: "read_only", mutations_enabled: false,
          rewards_enabled: false, reason: "Saved battles are paused for this fixture.",
        }));
      }
      if (input.startsWith("/api/v1/play/starters/")) return new Response("Unavailable", { status: 503 });
      throw new Error(`Unexpected fixture request: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => root.render(<PlayPage />));

    const practice = container.querySelector('a[href="/play/adventure/1"]');
    expect(practice?.textContent).toBe("Start practice");
    expect(container.textContent).toContain("no account needed");
    expect(container.textContent).toContain("Practice does not award rewards");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    expect(fetchMock.mock.calls.map(([input]) => input)).not.toContain("/api/game/rooms");
    expect(fetchMock.mock.calls.every((args) => args.length === 1)).toBe(true);

    if (status === "failed") expect(container.textContent).toContain("Saved game progress is unavailable");
    if (status === "pending") expect(container.textContent).toContain("Checking saved game progress");
    if (status === "paused") expect(container.textContent).toContain("Saved battles are paused for this fixture");
    else expect(container.textContent).not.toContain("Saved battles are paused for this fixture");
  });
});
