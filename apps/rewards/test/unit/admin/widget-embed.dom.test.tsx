// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useWidgetEmbed } = await import("~/admin/widget-embed");

// This file's own App Bridge: one mock for the whole file, whose answer each
// test changes through `status` (Home's helper makes a new mock per call).
const list = (status: "active" | "available") => [
  {
    handle: "rewardspro-theme-extension",
    type: "theme_app_extension",
    activations: [{ handle: "membership_widget", name: "Rewards widget", target: "body", status, activations: [] }],
  },
];
let status: "active" | "available" = "available";
const extensions = vi.fn(async () => list(status));
const stubAppBridge = (s: typeof status) => {
  status = s;
  vi.stubGlobal("shopify", { app: { extensions } });
};

function Probe() {
  const { on, recheck, returns } = useWidgetEmbed();
  return (
    <div>
      <p>{String(on)}</p>
      <p>{`returns ${returns}`}</p>
      <button type="button" onClick={recheck}>
        Check again
      </button>
    </div>
  );
}

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  extensions.mockClear();
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useWidgetEmbed", () => {
  it("says on once App Bridge reports the embed active", async () => {
    stubAppBridge("active");
    render(<Probe />);
    await screen.findByText("true");
    expect(extensions).toHaveBeenCalledTimes(1);
    screen.getByText("returns 0");
  });

  it("stays unknown without App Bridge", async () => {
    render(<Probe />);
    await act(async () => {});
    screen.getByText("null");
    // Coming back, or asking again, still has nothing to ask
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => {});
    screen.getByText("null");
  });

  it("stays unknown when App Bridge can't answer", async () => {
    vi.stubGlobal("shopify", { app: { extensions: vi.fn(async () => Promise.reject(new Error("no theme"))) } });
    render(<Probe />);
    await act(async () => {});
    screen.getByText("null");
  });

  it("asks again when the merchant comes back to the tab", async () => {
    stubAppBridge("available");
    render(<Probe />);
    await screen.findByText("false");
    screen.getByText("returns 0");
    status = "active";
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await screen.findByText("true");
    expect(extensions).toHaveBeenCalledTimes(2);
    screen.getByText("returns 1");
  });

  it("counts a tab shown again as a return, and a tab hidden as none", async () => {
    stubAppBridge("available");
    render(<Probe />);
    await screen.findByText("false");
    await act(async () => setHidden(true));
    expect(extensions).toHaveBeenCalledTimes(1);
    screen.getByText("returns 0");

    status = "active";
    await act(async () => setHidden(false));
    await screen.findByText("true");
    expect(extensions).toHaveBeenCalledTimes(2);
    screen.getByText("returns 1");
  });

  it("ignores returns less than 10 s apart", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    stubAppBridge("available");
    render(<Probe />);
    await screen.findByText("false");

    // Focus and visibilitychange arrive together on one return: one ask
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      setHidden(true);
      setHidden(false);
    });
    expect(extensions).toHaveBeenCalledTimes(2);
    screen.getByText("returns 1");

    vi.setSystemTime(Date.now() + 9_999);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(extensions).toHaveBeenCalledTimes(2);
    screen.getByText("returns 1");

    vi.setSystemTime(Date.now() + 10_000);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(extensions).toHaveBeenCalledTimes(3);
    screen.getByText("returns 2");
  });

  it("asks again on recheck", async () => {
    stubAppBridge("available");
    render(<Probe />);
    await screen.findByText("false");
    status = "active";
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await screen.findByText("true");
    expect(extensions).toHaveBeenCalledTimes(2);
    // Asking is not coming back
    screen.getByText("returns 0");
  });

  it("keeps the latest answer when an earlier one arrives late", async () => {
    let answerFirst: (value: ReturnType<typeof list>) => void = () => {};
    const slowThenFast = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)))
      .mockImplementationOnce(async () => list("active"));
    vi.stubGlobal("shopify", { app: { extensions: slowThenFast } });
    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await screen.findByText("true");
    await act(async () => answerFirst(list("available")));
    screen.getByText("true");
  });

  it("stops listening once the page is gone", async () => {
    stubAppBridge("available");
    const { unmount } = render(<Probe />);
    await screen.findByText("false");
    unmount();
    window.dispatchEvent(new Event("focus"));
    setHidden(true);
    setHidden(false);
    expect(extensions).toHaveBeenCalledTimes(1);
  });
});
