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

  it("stays unknown without App Bridge, and still counts returns", async () => {
    render(<Probe />);
    await act(async () => {});
    screen.getByText("null");
    // Coming back, or asking again, still has nothing to ask
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    screen.getByText("returns 1");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => {});
    screen.getByText("null");
    screen.getByText("returns 1");
  });

  it("stays unknown when App Bridge can't answer", async () => {
    vi.stubGlobal("shopify", { app: { extensions: vi.fn(async () => Promise.reject(new Error("no theme"))) } });
    render(<Probe />);
    await act(async () => {});
    screen.getByText("null");
  });

  it("stays unknown when App Bridge throws at once, on the first ask", async () => {
    const throwing = vi.fn(() => {
      throw new Error("App Bridge is not ready");
    });
    vi.stubGlobal("shopify", { app: { extensions: throwing } });
    render(<Probe />);
    await act(async () => {});
    // It was asked, and its throw left the answer unknown
    expect(throwing).toHaveBeenCalledTimes(1);
    screen.getByText("null");
  });

  it("goes back to unknown when App Bridge throws at once, or answers what can't be read, on Check again", async () => {
    stubAppBridge("available");
    render(<Probe />);
    await screen.findByText("false");

    extensions.mockImplementationOnce(() => {
      throw new Error("App Bridge is not ready");
    });
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await screen.findByText("null");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    });
    screen.getByText("false");

    // A theme extension with no activations: widgetEmbedOn throws reading it
    extensions.mockImplementationOnce(async () => [{ type: "theme_app_extension" }] as unknown as ReturnType<typeof list>);
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await screen.findByText("null");
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
    const t0 = Date.now();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      setHidden(true);
      setHidden(false);
    });
    expect(extensions).toHaveBeenCalledTimes(2);
    screen.getByText("returns 1");

    // Measured from that counted return, not from the last event
    for (const after of [5_000, 9_999]) {
      vi.setSystemTime(t0 + after);
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(extensions).toHaveBeenCalledTimes(2);
      screen.getByText("returns 1");
    }

    vi.setSystemTime(t0 + 10_000);
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
