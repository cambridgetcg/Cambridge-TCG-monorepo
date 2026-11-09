// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import styles from "~/admin/admin.module.css";
import { GUIDE } from "~/admin/guide-words";
import { LadderChart } from "~/admin/LadderChart";
import { MAX_BINS, countsFor } from "~/lib/ladder";

afterEach(cleanup);

// jsdom lays nothing out and has no pointer capture or PointerEvent: the
// capture calls are recorded, and pointer events are mouse events with a
// pointer id, which is all the chart reads (clientX, buttons and pointerId)
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

function draw(starts: [number, number] | null, { buyers = bins, binWidth = BIN_WIDTH, onStartsChange = vi.fn() } = {}) {
  const chart = (next: [number, number] | null) => (
    <LadderChart ariaLabel={LABEL} buyers={buyers} binWidth={binWidth} starts={next} formatAmount={(n) => `£${n}`} onStartsChange={onStartsChange} />
  );
  const { rerender } = render(chart(starts));
  const svg = screen.getByRole("img");
  svg.getBoundingClientRect = () => ({ left: LEFT, right: LEFT + PIXELS, width: PIXELS, top: 0, bottom: 160, height: 160, x: LEFT, y: 0, toJSON: () => ({}) });
  return { svg, onStartsChange, redraw: (next: [number, number] | null) => rerender(chart(next)) };
}

const classesOf = (element: Element) => (element.getAttribute("class") ?? "").split(" ").filter(Boolean);
const withClass = (name: string) => [...document.querySelectorAll("*")].filter((element) => classesOf(element).includes(name));
/** The lines' grips as [tier 2's, tier 3's]: the picture draws tier 3's first, so tier 2's is on top */
const grips = () => {
  const [third, second] = withClass(styles.thresholdGrip);
  return [second, third];
};
const shapes = () => [...document.querySelectorAll("path")];
const SHAPES = [styles.tier1Shape, styles.tier2Shape, styles.tier3Shape];
/** The bins a tier's shape covers: from where it starts on the baseline to where it ends */
const spanOf = (shape: Element) => {
  const d = shape.getAttribute("d") ?? "";
  const across = [...d.matchAll(/H([\d.]+)/g)].map((match) => Number(match[1]));
  return { from: Number(/^M([\d.]+) /.exec(d)?.[1]), to: across[across.length - 1] };
};

describe("LadderChart", () => {
  it("draws one shape per tier under the label it's given", () => {
    draw([200, 500]);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(LABEL);
    expect(shapes().map(classesOf)).toEqual([[styles.tier1Shape], [styles.tier2Shape], [styles.tier3Shape]]);
    expect(shapes().map(spanOf)).toEqual([
      { from: 0, to: 20 },
      { from: 20, to: 50 },
      { from: 50, to: MAX_BINS },
    ]);
    expect(document.querySelectorAll("rect")).toHaveLength(0);
    // No text inside the picture: the ends of its scale are page text below it, the last bar holding every spend from its start up
    expect(screen.getByRole("img").textContent).toBe("");
    expect([...document.querySelectorAll("s-text")].map((text) => text.textContent)).toEqual(["£0", GUIDE.andAbove("£1990")]);
  });

  it("outlines each tier's bars as one stepped shape, as tall as their buyers, an empty bin on the baseline", () => {
    // Bins of 10: tier 1 is bins 0-1, tier 2 bins 2-3, tier 3 bin 4. The tallest bins reach 4,
    // the top of the plot less its headroom, and 2 buyers half as high
    draw([20, 40], { buyers: [0, 4, 2, 0, 4] });
    expect(shapes().map((shape) => shape.getAttribute("d"))).toEqual(["M0 100H1V4H2V100Z", "M2 100V52H3V100H4Z", "M4 100V4H5V100Z"]);
  });

  it("still shows one buyer beside thousands", () => {
    draw([20, 40], { buyers: [0, 5000, 1, 0, 0] });
    // The lowest bar with buyers is 2 units high, not a fraction of a pixel
    expect(shapes()[1].getAttribute("d")).toBe("M2 100V98H3V100H4Z");
  });

  it("draws no shape for a tier with no bins in the picture", () => {
    draw([200, 9000]);
    expect(shapes().map(classesOf)).toEqual([[styles.tier1Shape], [styles.tier2Shape]]);
    expect(shapes().map(spanOf)).toEqual([
      { from: 0, to: 20 },
      { from: 20, to: MAX_BINS },
    ]);
  });

  it("shades each bin in the tier its buyers are counted in, starts off the grid included", () => {
    for (const starts of [
      [200, 500],
      [205, 495],
    ] as [number, number][]) {
      draw(starts);
      const counted: [number, number, number] = [0, 0, 0];
      for (const shape of shapes()) {
        const tier = SHAPES.indexOf(classesOf(shape)[0]);
        const { from, to } = spanOf(shape);
        counted[tier] += bins.slice(from, to).reduce((sum, count) => sum + count, 0);
      }
      expect(counted).toEqual(countsFor(bins, BIN_WIDTH, [0, ...starts]));
      cleanup();
    }
  });

  it("draws the whole picture as one tier-1 shape, with no lines, without valid starts", () => {
    draw(null);
    expect(withClass(styles.threshold)).toHaveLength(0);
    expect(withClass(styles.thresholdGrip)).toHaveLength(0);
    expect(shapes().map(classesOf)).toEqual([[styles.tier1Shape]]);
    expect(shapes().map(spanOf)).toEqual([{ from: 0, to: MAX_BINS }]);
  });

  it("reports a dragged line snapped to the grid, kept above the other", () => {
    const { onStartsChange } = draw([200, 500]);
    const [second, third] = grips();

    fireEvent.pointerDown(second, { clientX: xOf(200), pointerId: 1 });
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    fireEvent.pointerMove(second, { clientX: xOf(233), buttons: 1, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([230, 500]);
    // Dragging tier 2 past tier 3 stops one bin below it
    fireEvent.pointerMove(second, { clientX: xOf(700), buttons: 1, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([490, 500]);
    // Never below the first bin
    fireEvent.pointerMove(second, { clientX: xOf(-40), buttons: 1, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([10, 500]);
    fireEvent.pointerUp(second, { clientX: xOf(-40), pointerId: 1 });
    expect(releasePointerCapture).toHaveBeenCalledWith(1);

    // Let go, a move reports nothing
    onStartsChange.mockClear();
    fireEvent.pointerMove(second, { clientX: xOf(300), buttons: 1, pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();

    // Tier 3 dragged below tier 2 stops one bin above it, and at the picture's last bin
    fireEvent.pointerDown(third, { clientX: xOf(500), pointerId: 2 });
    fireEvent.pointerMove(third, { clientX: xOf(100), buttons: 1, pointerId: 2 });
    expect(onStartsChange).toHaveBeenLastCalledWith([200, 210]);
    fireEvent.pointerMove(third, { clientX: xOf(5000), buttons: 1, pointerId: 2 });
    expect(onStartsChange).toHaveBeenLastCalledWith([200, 1990]);
    // A move that snaps back to where the start already is reports nothing
    onStartsChange.mockClear();
    fireEvent.pointerMove(third, { clientX: xOf(498), buttons: 1, pointerId: 2 });
    expect(onStartsChange).not.toHaveBeenCalled();
    // Another pointer's moves are not this drag's
    fireEvent.pointerMove(third, { clientX: xOf(800), buttons: 1, pointerId: 3 });
    expect(onStartsChange).not.toHaveBeenCalled();
  });

  it("leaves a start beyond the picture as typed until the line is dragged inward", () => {
    const { onStartsChange } = draw([500, 9000]);
    const [, third] = grips();
    // Drawn at the picture's right edge; a press with no sideways motion reports nothing
    fireEvent.pointerDown(third, { clientX: xOf(2000), pointerId: 1 });
    fireEvent.pointerMove(third, { clientX: xOf(2000), buttons: 1, pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();
    // Pushed outward past the edge, it stays where the merchant typed it
    fireEvent.pointerMove(third, { clientX: xOf(2000) + 40, buttons: 1, pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();
    // Dragged inward, it follows the pointer from the edge
    fireEvent.pointerMove(third, { clientX: xOf(2000) - 100, buttons: 1, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([500, 1900]);
  });

  // F2-F2: tier 3 can't move inward past tier 2, so with both on the edge tier 2's line must be the one taken
  it("lets tier 2's line be taken when both starts sit on the picture's edge", () => {
    const { onStartsChange } = draw([3000, 9000]);
    expect(withClass(styles.threshold).map((group) => group.querySelector("line")?.getAttribute("x1"))).toEqual([String(MAX_BINS), String(MAX_BINS)]);
    // A press where the lines overlap takes the one drawn on top: the last in the picture
    const onTop = withClass(styles.thresholdGrip).at(-1)!;
    fireEvent.pointerDown(onTop, { clientX: xOf(2000), pointerId: 1 });
    fireEvent.pointerMove(onTop, { clientX: xOf(2000) - 100, buttons: 1, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([1900, 9000]);
  });

  it("reports nothing for a press that has not gone 3px sideways", () => {
    const { onStartsChange } = draw([205, 495]);
    const [second, third] = grips();
    fireEvent.pointerDown(second, { clientX: xOf(205), pointerId: 1 });
    // Touch jitter, and a vertical scroll that starts on the line, move under 3px sideways
    fireEvent.pointerMove(second, { clientX: xOf(205) + 2.9, clientY: 80, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(second, { clientX: xOf(205) - 2.9, clientY: 140, buttons: 1, pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();
    // Past the dead zone it moves by the pointer's motion, snapped: 205 + 6 is 211
    fireEvent.pointerMove(second, { clientX: xOf(205) + 6, buttons: 1, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([210, 495]);
    // Once dragging, coming back within 3px still moves the line
    fireEvent.pointerMove(second, { clientX: xOf(205) - 2, buttons: 1, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([200, 495]);
    fireEvent.pointerUp(second, { clientX: xOf(205) - 2, pointerId: 1 });
    // The other line works the same way
    onStartsChange.mockClear();
    fireEvent.pointerDown(third, { clientX: xOf(495), pointerId: 2 });
    fireEvent.pointerMove(third, { clientX: xOf(495) + 1, buttons: 1, pointerId: 2 });
    expect(onStartsChange).not.toHaveBeenCalled();
  });

  it("leaves a typed start as it was when the line is pushed into the other", () => {
    // 495 is above the highest tier 2 can be dragged to (490) below a tier 3 of 500
    const { onStartsChange } = draw([495, 500]);
    const [second] = grips();
    fireEvent.pointerDown(second, { clientX: xOf(495), pointerId: 1 });
    fireEvent.pointerMove(second, { clientX: xOf(495) + 50, buttons: 1, pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();
    // Dragged away from tier 3 it moves
    fireEvent.pointerMove(second, { clientX: xOf(495) - 25, buttons: 1, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([470, 500]);
  });

  it("moves a line by the pointer's motion, wherever on the line it was taken", () => {
    const { onStartsChange } = draw([200, 500]);
    const [second] = grips();
    // Taken 12px right of the tier-2 line, then moved one bin (10px) right
    fireEvent.pointerDown(second, { clientX: xOf(200) + 12, pointerId: 1 });
    fireEvent.pointerMove(second, { clientX: xOf(200) + 22, buttons: 1, pointerId: 1 });
    expect(onStartsChange).toHaveBeenCalledTimes(1);
    expect(onStartsChange).toHaveBeenLastCalledWith([210, 500]);
  });

  it("ignores a move with no button pressed", () => {
    const { onStartsChange } = draw([200, 500]);
    const [second] = grips();
    fireEvent.pointerDown(second, { clientX: xOf(200), pointerId: 1 });
    // The button let go where the page didn't see it (outside the frame): the pointer only hovers
    fireEvent.pointerMove(second, { clientX: xOf(300), buttons: 0, pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();
  });

  it("forgets a drag when the starts go away", () => {
    const { onStartsChange, redraw } = draw([200, 500]);
    fireEvent.pointerDown(grips()[0], { clientX: xOf(200), pointerId: 1 });
    fireEvent.pointerMove(grips()[0], { clientX: xOf(230), buttons: 1, pointerId: 1 });
    expect(onStartsChange).toHaveBeenLastCalledWith([230, 500]);
    onStartsChange.mockClear();
    // A start emptied mid-drag takes the lines away; typed back, they return
    redraw(null);
    redraw([200, 500]);
    const [second] = grips();
    fireEvent.pointerMove(second, { clientX: xOf(260), pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();
    // Nor does the old drag carry on with the button still down: only a new press takes a line
    fireEvent.pointerMove(second, { clientX: xOf(260), buttons: 1, pointerId: 1 });
    expect(onStartsChange).not.toHaveBeenCalled();
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
