import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusDot } from "~/components/CustomerDetails/StatusDot";

describe("StatusDot", () => {
  // Admin API 2026-10 returns FULFILLMENT_NOT_REQUIRED for orders with nothing
  // left to fulfill, where earlier versions said UNFULFILLED
  it("names an order with nothing to fulfill in plain words", () => {
    render(<StatusDot status="FULFILLMENT_NOT_REQUIRED" type="fulfillment" />);

    expect(screen.getByText("Not Required")).toBeInTheDocument();
    expect(screen.queryByText("FULFILLMENT_NOT_REQUIRED")).not.toBeInTheDocument();
  });
});
