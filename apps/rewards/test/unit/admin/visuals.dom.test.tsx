// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Chart } from "~/admin/Chart";
import { TierChip } from "~/admin/TierChip";
import { Money } from "~/lib/money";

afterEach(cleanup);

describe("TierChip", () => {
  it("shows the tier and its rate as stored, without trailing zeros", () => {
    const { container } = render(
      <>
        <TierChip name="Gold" percent={new Money("5.00")} />
        <TierChip name="Silver" percent="2.50" />
      </>,
    );
    expect([...container.children].map((chip) => chip.textContent)).toEqual(["Gold 5%", "Silver 2.5%"]);
  });
});

describe("Chart", () => {
  const given = { label: "Cashback given", points: [{ date: "2026-11-02", value: "4.00" }, { date: "2026-11-01", value: "2.50" }] };
  const spent = { label: "Store credit spent", points: [{ date: "2026-11-01", value: 1 }, { date: "2026-11-03", value: new Money("3") }] };
  const money = (v: { toFixed(n: number): string }) => `£${v.toFixed(2)}`;
  const EMPTY = "No cashback given or store credit spent in the last 30 days.";

  // Ruling 71 (TRUTH-16, DESIGN-7, DESIGN-8, A18-F4)
  it("is labelled with its range, and names both series' totals for a screen reader", () => {
    const { container } = render(<Chart label="Last 30 days" empty={EMPTY} series={[given, spent]} formatValue={money} />);
    expect(container.textContent).toContain("Last 30 days");
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe(
      "Last 30 days, Nov 1 to Nov 3: Cashback given £6.50, Store credit spent £4.00",
    );
  });

  it("draws each series across every day at a fixed height, the navy series last and the teal one dashed", () => {
    const { container } = render(<Chart label="Last 30 days" empty={EMPTY} series={[given, spent]} formatValue={money} />);
    const svg = container.querySelector("svg")!;
    // Stretched to the width at a fixed height, so the lines keep their pixel width
    expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 40");
    // Days from 0 to 100; 0 to the highest value (4) from y 38 up to 2. The teal
    // line comes first, its navy edge then the line, and the navy line last
    const lines = [...svg.querySelectorAll("polyline")].map((line) => [line.getAttribute("class"), line.getAttribute("points")]);
    expect(lines).toEqual([
      [expect.stringMatching(/tealEdge/), "0.00,29.00 100.00,11.00"],
      [expect.stringMatching(/teal/), "0.00,29.00 100.00,11.00"],
      [expect.stringMatching(/navy/), "0.00,15.50 50.00,2.00"],
    ]);
    expect(lines[0][0]).toMatch(/dashed/);
    expect(lines[1][0]).toMatch(/dashed/);
    expect(lines[2][0]).not.toMatch(/dashed/);
  });

  it("has a legend with each series' total, and its first and last day, in page text", () => {
    const { container } = render(<Chart label="Last 30 days" empty={EMPTY} series={[given, spent]} formatValue={money} />);
    expect([...container.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["Cashback given £6.50", "Store credit spent £4.00"]);
    expect(container.textContent).toContain("Nov 1");
    expect(container.textContent).toContain("Nov 3");
    // No scale label the ledger didn't give
    expect(container.querySelectorAll("svg text")).toHaveLength(0);
  });

  it("keeps two series of the same name apart", () => {
    const { container } = render(<Chart label="Last 30 days" empty={EMPTY} series={[given, { ...spent, label: given.label }]} formatValue={money} />);
    expect(container.querySelectorAll("polyline")).toHaveLength(3);
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  // M3d-F4: a dash pattern draws nothing on a zero-length line, so one day's teal mark is a round dot in its navy edge
  it("draws a visible mark for each series of one day", () => {
    const day = (label: string, value: string) => ({ label, points: [{ date: "2026-11-01", value }] });
    const { container } = render(<Chart label="Last 30 days" empty={EMPTY} series={[day("Cashback given", "4.00"), day("Store credit spent", "2.00")]} formatValue={money} />);
    const lines = [...container.querySelectorAll("svg[role=img] polyline")].map((line) => ({ cls: line.getAttribute("class") ?? "", points: line.getAttribute("points") }));
    expect(lines.map((line) => line.points)).toEqual(["50.00,20.00 50.00,20.00", "50.00,20.00 50.00,20.00", "50.00,2.00 50.00,2.00"]);
    expect(lines.map((line) => /dashed/.test(line.cls))).toEqual([false, false, false]);
    expect(lines[0].cls).toMatch(/tealEdge/);
    cleanup();

    // One teal point beside a navy series of two days
    const { container: beside } = render(<Chart label="Last 30 days" empty={EMPTY} series={[given, day("Store credit spent", "2.00")]} formatValue={money} />);
    const teal = [...beside.querySelectorAll("svg[role=img] polyline")].slice(0, 2).map((line) => line.getAttribute("class") ?? "");
    expect(teal.map((cls) => /dashed/.test(cls))).toEqual([false, false]);
  });

  it("says one plain sentence, and draws no scale, when every value is 0", () => {
    const zeros = (label: string) => ({ label, points: ["2026-11-01", "2026-11-02"].map((date) => ({ date, value: "0" })) });
    const { container } = render(<Chart label="Last 30 days" empty={EMPTY} series={[zeros("Cashback given"), zeros("Store credit spent")]} formatValue={money} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toBe(EMPTY);
  });

  it("says the same when there is nothing to draw", () => {
    const { container } = render(<Chart label="Last 30 days" empty={EMPTY} series={[{ label: "Cashback given", points: [] }]} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toBe(EMPTY);
  });
});
