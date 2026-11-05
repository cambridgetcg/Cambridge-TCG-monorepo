// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The revalidator is the page's only tie to React Router here: its state
// is set by each test, and its calls are counted.
const revalidator = { state: "idle" as "idle" | "loading", revalidate: vi.fn(async () => {}) };
vi.mock("react-router", async (original) => ({
  ...(await original<typeof import("react-router")>()),
  useRevalidator: () => revalidator,
}));

const { usePolling } = await import("~/admin/polling");

function Page({ active }: { active: boolean }) {
  usePolling(active, 1000);
  return null;
}

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  revalidator.state = "idle";
  revalidator.revalidate.mockClear();
  setHidden(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// OPERATIONS-5: the next reload is scheduled once the last has finished, and never in a hidden tab
describe("usePolling", () => {
  it("reloads once the wait has passed with the page idle", async () => {
    render(<Page active />);
    await act(async () => vi.advanceTimersByTime(999));
    expect(revalidator.revalidate).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(revalidator.revalidate).toHaveBeenCalledTimes(1);
  });

  it("waits for a reload in flight to end before it schedules the next", async () => {
    const { rerender } = render(<Page active />);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(revalidator.revalidate).toHaveBeenCalledTimes(1);

    // The reload is slow: however long it takes, no second one starts
    revalidator.state = "loading";
    rerender(<Page active />);
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(revalidator.revalidate).toHaveBeenCalledTimes(1);

    // Done: the next one waits its full time from now
    revalidator.state = "idle";
    rerender(<Page active />);
    await act(async () => vi.advanceTimersByTime(999));
    expect(revalidator.revalidate).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(revalidator.revalidate).toHaveBeenCalledTimes(2);
  });

  it("skips a hidden tab, and reloads when it is shown again", async () => {
    render(<Page active />);
    setHidden(true);
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(revalidator.revalidate).not.toHaveBeenCalled();

    await act(async () => setHidden(false));
    expect(revalidator.revalidate).toHaveBeenCalledTimes(1);
  });

  it("does nothing while there is nothing to follow", async () => {
    render(<Page active={false} />);
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(revalidator.revalidate).not.toHaveBeenCalled();
  });
});
