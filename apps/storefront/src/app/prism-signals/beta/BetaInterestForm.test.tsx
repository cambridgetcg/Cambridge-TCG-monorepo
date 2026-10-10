import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import BetaInterestForm, {
  BetaInterestLoadBoundary,
  betaInterestDeleteAllowed,
  betaInterestSaveAllowed,
} from "./BetaInterestForm";

describe("PRISM beta owner-state load boundary", () => {
  it("renders failure as unknown, never as verified absence", () => {
    const markup = renderToStaticMarkup(
      <BetaInterestLoadBoundary outcome="error" onRetry={vi.fn()} />,
    );

    expect(markup).toContain("Stored state not verified");
    expect(markup).toContain("cannot say here whether");
    expect(markup).toContain("Save and withdrawal controls remain locked");
    expect(markup).toContain("Retry owner status");
    expect(markup).not.toContain(
      "No active PRISM Signals beta-interest row is stored",
    );
    expect(betaInterestSaveAllowed("error", "idle", true)).toBe(false);
    expect(betaInterestSaveAllowed("loading", "idle", true)).toBe(false);
    expect(betaInterestDeleteAllowed("error", "idle")).toBe(false);
    expect(betaInterestDeleteAllowed("loading", "idle")).toBe(false);
  });

  it("server-renders the initial unknown state with mutation controls locked", () => {
    const markup = renderToStaticMarkup(<BetaInterestForm intakeEnabled />);

    expect(markup).toContain("Loading your owner-scoped stored state");
    expect(markup).toContain("Ask to be considered");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Ask to be considered<\/button>/);
    expect(markup).not.toContain("Withdraw and delete request");
    expect(markup).not.toContain(
      "No active PRISM Signals beta-interest row is stored",
    );
  });

  it("pauses save but preserves delete eligibility after a successful owner read", () => {
    expect(betaInterestSaveAllowed("loaded", "idle", false)).toBe(false);
    expect(betaInterestDeleteAllowed("loaded", "idle")).toBe(true);

    const markup = renderToStaticMarkup(
      <BetaInterestForm intakeEnabled={false} />,
    );
    expect(markup).toContain("New interest intake is paused");
    expect(markup).toContain("Status and withdrawal");
  });
});
