import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrismSignalsBetaPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({
  intakeEnabled: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prism-signals/beta-interest-config.server", () => ({
  prismSignalsBetaIntakeEnabled: mocks.intakeEnabled,
}));
vi.mock("@/lib/auth/realms", () => ({
  getSessionUser: mocks.getSessionUser,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.intakeEnabled.mockReturnValue(false);
  mocks.getSessionUser.mockResolvedValue({
    id: "user-a",
    email: "owner@example.test",
    role: "user",
  });
});

describe("PRISM beta management page lifecycle", () => {
  it("remains signed-in and manageable while new intake is paused", async () => {
    const markup = renderToStaticMarkup(await PrismSignalsBetaPage());
    const metadata = generateMetadata();

    expect(mocks.getSessionUser).toHaveBeenCalledOnce();
    expect(markup).toContain("Manage an existing beta request");
    expect(markup).toContain("Intake paused");
    expect(markup).toContain("Status and withdrawal");
    expect(markup).toContain("New interest intake paused");
    expect(metadata.title).toBe("Manage an existing PRISM Signals beta request");
    expect(metadata.description).toContain("while new intake is paused");
  });

  it("exposes new-interest controls only while intake is enabled", async () => {
    mocks.intakeEnabled.mockReturnValue(true);
    const markup = renderToStaticMarkup(await PrismSignalsBetaPage());
    const metadata = generateMetadata();

    expect(markup).toContain("Record interest. Nothing else starts.");
    expect(markup).not.toContain("New interest intake paused");
    expect(metadata.title).toBe("PRISM Signals closed-beta interest");
  });
});
