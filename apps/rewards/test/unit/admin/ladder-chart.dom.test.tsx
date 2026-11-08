// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import styles from "~/admin/admin.module.css";
import { LadderChart } from "~/admin/LadderChart";
import { MAX_BINS, countsFor } from "~/lib/ladder";

afterEach(cleanup);

// jsdom lays nothing out and has no pointer capture or PointerEvent: the
// capture calls are recorded, and pointer events are mouse events with a
// pointer id, which is all the chart reads (clientX and pointerId)
const setPointerCapture = vi.fn();
const releasePointerCapture = vi.fn();
Element.prototype.setPointerCapture = setPointerCapture;
Element.prototype.releasePointerCapture = releasePointerCapture;
Element.prototype.hasPointerCapture = () => true;
if (typeof window.PointerEvent === "undefined") {
  class PointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEvent as typeof window.PointerEvent;
}

// 7 buyers below 200, 9 from 200 to 499, 3 from 500 up, with buyers in the bins either side of each
// start (the last bin holds everything above the picture)
const bins = Array.from({ length: MAX_BINS }, () => 0);
bins[3] = 3;
bins[15] = 4;
bins[20] = 1;
bins[25] = 5;
bins[30] = 2;
bins[49] = 1;
bins[50] = 1;
bins[60] = 1;
bins[MAX_BINS - 1] = 1;
const BIN_WIDTH = 10;

// The SVG laid out 2000 px wide from x 50: its 200 bins of 10 are one pixel per unit of spend
const LEFT = 50;
const PIXELS = 2000;
const xOf = (amount: number) => LEFT + (amount / (MAX_BINS * BIN_WIDTH)) * PIXELS;

const LABEL = "Buyers by what they spent over the last 12 months: 7 buyers below £200";

function draw(starts: [number, number] | null, onStartsChange = vi.fn()) {
  render(
    <LadderChart ariaLabel={LABEL} buyers={bins} binWidth={BIN_WIDTH} starts={starts} formatAmount={(n) => `£${n}`} onStartsChange={onStartsChange} />,
  );
  const svg = screen.getByRole("img");
  svg.getBoundingClientRect = () => ({ left: LEFT, right: LEFT + PIXELS, width: PIXELS, top: 0, bottom: 160, height: 160, x: LEFT, y: 0, toJSON: () => ({}) });
  return { svg, onStartsChange };
}

const classesOf = (element: Element) => (element.getAttribute("class") ?? "").split(" ").filter(Boolean);
const withClass = (name: string) => [...document.querySelectorAll("*")].filter((element) => classesOf(element).includes(name));
const bars = () => [...document.querySelectorAll("rect")];

describe("LadderChart", () => {
  it("draws one bar per bin under the label it's given", () => {
    draw([200, 500]);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(LABEL);
    expect(document.querySelectorAll("rect")).toHaveLength(MAX_BINS);
    // No text inside the picture: the ends of its scale are page text below it
    expect(screen.getByRole("img").textContent).toBe("");
    expect([...document.querySelectorAll("s-text")].map((text) => text.textContent)).toEqual(["£0", "£2000"]);
  });

  it("draws each bar as tall as its buyers, and none for an empty bin", () => {
    draw([200, 500]);
    const height = (bin: number) => Number(bars()[bin].getAttribute("height"));
    expect(height(0)).toBe(0);
    expect(height(3)).toBeGreaterThan(0);
    expect(height(25)).toBeGreaterThan(height(15));
    expect(height(15)).toBeGreaterThan(height(3));
    // One buyer still shows next to the tallest bin
    expect(height(60)).toBeGreaterThan(0);
    expect(height(60)).toBe(height(MAX_BINS - 1));
  });

  it("marks the three tiers by more than colour", () => {
    draw([200, 500]);
    expect(bars().map(classesOf)).toEqual(
      bins.map((_, bin) => (bin < 20 ? [styles.bar] : bin < 50 ? [styles.bar, styles.barMid] : [styles.bar, styles.barTop])),
    );
  });

  it("shades each bar in the tier its buyers are counted in, starts off the grid included", () => {
    for (const starts of [
      [200, 500],
      [205, 495],
    ] as [number, number][]) {
      draw(starts);
      const counted: [number, number, number] = [0, 0, 0];
      bars().forEach((bar, bin) => {
        const classes = classesOf(bar);
        counted[classes.includes(styles.barTop) ? 2 : classes.includes(styles.barMid) ? 1 : 0] += bins[bin];
      });
      expect(counted).toEqual(countsFor(bins, BIN_WIDTH, [0, ...starts]));
      cleanup();
    }
  });

  it("draws no lines or tier shading without valid starts", () => {
    draw(null);
    expect(withClass(styles.threshold)).toHaveLength(0);
    expect(withClass(styles.thresholdGrip)).toHaveLength(0);
    expect(bars().map(classesOf)).toEqual(bins.map(() => [styles.bar]));
  });

  it("reports a dragged line snapped to the grid, kept above the other", () => {
    const { onStartsChange } = draw([200, 500]);
    const [second, third] = withClass(styles.thresholdGrip);

    fireEvent.pointerDown(second, { clientX: xOf(200), pointerId: 1 });
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    fireEvent.pointerMove(second, { clientX: xOf(233), pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([230, 500]);
    // Dragging tier 2 past tier 3 stops one bin below it
    fireEvent.pointerMove(second, { clientX: xOf(700), pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([490, 500]);
    // Never below the first bin
    fireEvent.pointerMove(second, { clientX: xOf(-40), pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([10, 500]);
    fireEvent.pointerUp(second, { clientX: xOf(-40), pointerId: 1 });
    expect(releasePointerCapture).toHaveBeenCalledWith(1);

    // Let go, a move reports nothing
    onStartsChange.mockClear();
    fireEvent.pointerMove(second, { clientX: xOf(300), pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();

    // Tier 3 dragged below tier 2 stops one bin above it, and at the picture's last bin
    fireEvent.pointerDown(third, { clientX: xOf(500), pointerId: 2 });
    fireEvent.pointerMove(third, { clientX: xOf(100), pointerId: 2 });
    expect(onStartsChange).toHaveBeenLastCalledWith([200, 210]);
    fireEvent.pointerMove(third, { clientX: xOf(5000), pointerId: 2 });
    expect(onStartsChange).toHaveBeenLastCalledWith([200, 1990]);
    // A move that snaps back to where the start already is reports nothing
    onStartsChange.mockClear();
    fireEvent.pointerMove(third, { clientX: xOf(498), pointerId: 2 });
    expect(onStartsChange).not.toHaveBeenCalled();
    // Another pointer's moves are not this drag's
    fireEvent.pointerMove(third, { clientX: xOf(800), pointerId: 3 });
    expect(onStartsChange).not.toHaveBeenCalled();
  });

  it("leaves a start beyond the picture as typed until the line is dragged inward", () => {
    const { onStartsChange } = draw([500, 9000]);
    const [, third] = withClass(styles.thresholdGrip);
    // Drawn at the picture's right edge; a press with no sideways motion reports nothing
    fireEvent.pointerDown(third, { clientX: xOf(2000), pointerId: 1 });
    fireEvent.pointerMove(third, { clientX: xOf(2000), pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();
    // Pushed outward past the edge, it stays where the merchant typed it
    fireEvent.pointerMove(third, { clientX: xOf(2000) + 40, pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();
    // Dragged inward, it follows the pointer from the edge
    fireEvent.pointerMove(third, { clientX: xOf(2000) - 100, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([500, 1900]);
  });

  it("reports nothing for a press that has not gone 3px sideways", () => {
    const { onStartsChange } = draw([205, 495]);
    const [second, third] = withClass(styles.thresholdGrip);
    fireEvent.pointerDown(second, { clientX: xOf(205), pointerId: 1 });
    // Touch jitter, and a vertical scroll that starts on the line, move under 3px sideways
    fireEvent.pointerMove(second, { clientX: xOf(205) + 2.9, clientY: 80, pointerId: 1 });
    fireEvent.pointerMove(second, { clientX: xOf(205) - 2.9, clientY: 140, pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();
    // Past the dead zone it moves by the pointer's motion, snapped: 205 + 6 is 211
    fireEvent.pointerMove(second, { clientX: xOf(205) + 6, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([210, 495]);
    // Once dragging, coming back within 3px still moves the line
    fireEvent.pointerMove(second, { clientX: xOf(205) - 2, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([200, 495]);
    fireEvent.pointerUp(second, { clientX: xOf(205) - 2, pointerId: 1 });
    // The other line works the same way
    onStartsChange.mockClear();
    fireEvent.pointerDown(third, { clientX: xOf(495), pointerId: 2 });
    fireEvent.pointerMove(third, { clientX: xOf(495) + 1, pointerId: 2 });
    expect(onStartsChange).not.toHaveBeenCalled();
  });

  it("leaves a typed start as it was when the line is pushed into the other", () => {
    // 495 is above the highest tier 2 can be dragged to (490) below a tier 3 of 500
    const { onStartsChange } = draw([495, 500]);
    const [second] = withClass(styles.thresholdGrip);
    fireEvent.pointerDown(second, { clientX: xOf(495), pointerId: 1 });
    fireEvent.pointerMove(second, { clientX: xOf(495) + 50, pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();
    // Dragged away from tier 3 it moves
    fireEvent.pointerMove(second, { clientX: xOf(495) - 25, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([470, 500]);
  });

  it("moves a line by the pointer's motion, wherever on the line it was taken", () => {
    const { onStartsChange } = draw([200, 500]);
    const [second] = withClass(styles.thresholdGrip);
    // Taken 12px right of the tier-2 line, then moved one bin (10px) right
    fireEvent.pointerDown(second, { clientX: xOf(200) + 12, pointerId: 1 });
    fireEvent.pointerMove(second, { clientX: xOf(200) + 22, pointerId: 1 });
    expect(onStartsChange).toHaveBeenCalledTimes(1);
    expect(onStartsChange).toHaveBeenLastCalledWith([210, 500]);
  });

  it("keeps its lines out of the accessibility tree", () => {
    draw([200, 500]);
    const lines = withClass(styles.threshold);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.getAttribute("aria-hidden")).toBe("true");
    // The picture itself has nothing to tab to: the fields are the control
    expect(document.querySelectorAll("[tabindex]")).toHaveLength(0);
  });
});
