import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ChoiceCardGroup,
  type ChoiceCardOption,
  type ChoiceCardSection,
} from "../../app/components/ChoiceCardGroup";

type Choice = "tier_change" | "purchase";

const options: readonly ChoiceCardOption<Choice>[] = [
  {
    value: "tier_change",
    label: "Tier Change",
    description: "Triggered when a customer moves to a new tier",
  },
  {
    value: "purchase",
    label: "Purchase Made",
    description: "Triggered after a customer completes a purchase",
  },
];

const sections: readonly ChoiceCardSection<Choice>[] = [
  {
    heading: "Customer activity",
    options: [options[0]],
  },
  {
    heading: "Store activity",
    options: [options[1]],
  },
];

function ControlledGroup({
  onChange = () => {},
}: {
  onChange?: (value: Choice) => void;
}) {
  const [value, setValue] = useState<Choice>("tier_change");

  return (
    <ChoiceCardGroup
      legend="Customer activity triggers"
      name="automation-trigger"
      onChange={(nextValue) => {
        setValue(nextValue);
        onChange(nextValue);
      }}
      options={options}
      value={value}
    />
  );
}

describe("ChoiceCardGroup", () => {
  it("gives every native radio a visible accessible name and description", () => {
    render(<ControlledGroup />);

    expect(
      screen.getByRole("group", { name: "Customer activity triggers" }),
    ).toBeInTheDocument();

    const tierChoice = screen.getByRole("radio", { name: "Tier Change" });
    expect(tierChoice).toBeChecked();
    expect(tierChoice).toHaveAccessibleDescription(
      "Triggered when a customer moves to a new tier",
    );

    const purchaseChoice = screen.getByRole("radio", { name: "Purchase Made" });
    expect(purchaseChoice).not.toBeChecked();
    expect(purchaseChoice).toHaveAccessibleDescription(
      "Triggered after a customer completes a purchase",
    );
  });

  it("changes selection when a card radio is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ControlledGroup onChange={onChange} />);

    const purchaseChoice = screen.getByRole("radio", { name: "Purchase Made" });
    await user.click(purchaseChoice);

    expect(purchaseChoice).toBeChecked();
    expect(onChange).toHaveBeenCalledWith("purchase");
  });

  it("retains native arrow-key navigation within the radio group", async () => {
    const user = userEvent.setup();
    render(<ControlledGroup />);

    const tierChoice = screen.getByRole("radio", { name: "Tier Change" });
    const purchaseChoice = screen.getByRole("radio", { name: "Purchase Made" });

    tierChoice.focus();
    await user.keyboard("{ArrowRight}");

    expect(purchaseChoice).toHaveFocus();
    expect(purchaseChoice).toBeChecked();
  });

  it("keeps visual categories inside one programmatic radio group", () => {
    render(
      <ChoiceCardGroup
        legend="Trigger event"
        name="automation-trigger"
        onChange={() => {}}
        sections={sections}
        value="tier_change"
      />,
    );

    expect(document.querySelectorAll("fieldset")).toHaveLength(1);
    expect(
      screen.getByRole("group", { name: "Trigger event" }),
    ).toContainElement(screen.getByRole("radio", { name: "Tier Change" }));
    expect(
      screen.getByRole("group", { name: "Trigger event" }),
    ).toContainElement(screen.getByRole("radio", { name: "Purchase Made" }));
    expect(
      screen.getByRole("heading", { name: "Customer activity" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Store activity" }),
    ).toBeInTheDocument();
  });
});
