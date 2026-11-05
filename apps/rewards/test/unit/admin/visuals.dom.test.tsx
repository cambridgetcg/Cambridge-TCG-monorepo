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

  it("draws one line per series across every day, with a legend", () => {
    const { container } = render(<Chart series={[given, spent]} formatValue={(v) => `£${v.toFixed(2)}`} />);

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Cashback given and Store credit spent, Nov 1 to Nov 3");
    // Days across 640 units; 0 to the highest value (4) from y 172 up to 24.
    // The teal line is drawn twice: its navy edge, then the line
    const lines = [...container.querySelectorAll("polyline")].map((line) => line.getAttribute("points"));
    expect(lines).toEqual(["0.0,79.5 320.0,24.0", "0.0,135.0 640.0,61.0", "0.0,135.0 640.0,61.0"]);
    expect(container.textContent).toContain("£4.00");
    expect([...container.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["Cashback given", "Store credit spent"]);
  });

  it("says so when there is nothing to draw", () => {
    const { container } = render(<Chart series={[{ label: "Cashback given", points: [] }]} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toBe("Nothing to show yet.");
  });
});
