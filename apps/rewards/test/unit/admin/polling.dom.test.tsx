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

function Page({ active, forMs, restartKey }: { active: boolean; forMs?: number; restartKey?: number }) {
  usePolling(active, 1000, { forMs, restartKey });
  return null;
}

type Props = Parameters<typeof Page>[0];

/** A reload React Router has finished: loading, then idle again. */
async function finishReload(rerender: (ui: React.ReactElement) => void, props: Props) {
  revalidator.state = "loading";
  rerender(<Page {...props} />);
  revalidator.state = "idle";
  await act(async () => rerender(<Page {...props} />));
}

/** Let `ms` pass with each reload finishing at once; how many reloads there were. */
async function follow(rerender: (ui: React.ReactElement) => void, props: Props, ms: number) {
  for (let t = 0; t < ms; t += 500) {
    const before = revalidator.revalidate.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(500));
    if (revalidator.revalidate.mock.calls.length > before) await finishReload(rerender, props);
  }
  return revalidator.revalidate.mock.calls.length;
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

  // Ruling 82: a pass that can't finish waits for the nightly run, not an open tab
  it("follows for `forMs` from the page load, then stops", async () => {
    const props = { active: true, forMs: 3000 };
    const { rerender } = render(<Page {...props} />);
    expect(await follow(rerender, props, 3000)).toBe(3);
    expect(await follow(rerender, props, 60_000)).toBe(3);
  });

  it("follows for `forMs` again after a change (restartKey) or when it turns active again", async () => {
    let props: Props = { active: true, forMs: 2000, restartKey: 0 };
    const { rerender } = render(<Page {...props} />);
    expect(await follow(rerender, props, 10_000)).toBe(2);

    // A change made on the page
    props = { ...props, restartKey: 1 };
    await act(async () => rerender(<Page {...props} />));
    expect(await follow(rerender, props, 10_000)).toBe(4);

    // Nothing to follow, then a pass to follow again
    await act(async () => rerender(<Page {...props} active={false} />));
    await act(async () => rerender(<Page {...props} />));
    expect(await follow(rerender, props, 10_000)).toBe(6);
  });

  it("doesn't reload a tab shown again after its time is up", async () => {
    render(<Page active forMs={3000} />);
    setHidden(true);
    await act(async () => vi.advanceTimersByTime(10_000));
    await act(async () => setHidden(false));
    expect(revalidator.revalidate).not.toHaveBeenCalled();
  });

  it("does nothing while there is nothing to follow", async () => {
    render(<Page active={false} />);
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(revalidator.revalidate).not.toHaveBeenCalled();
  });
});
