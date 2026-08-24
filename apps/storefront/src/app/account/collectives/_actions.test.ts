import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  updateCollective: vi.fn(),
  createCollective: vi.fn(),
  isSteward: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/collectives/db", () => ({
  createCollective: mocks.createCollective,
  updateCollective: mocks.updateCollective,
  inviteMember: vi.fn(),
  acceptInvite: vi.fn(),
  leaveCollective: vi.fn(),
  removeMember: vi.fn(),
  isSteward: mocks.isSteward,
  CollectiveError: class CollectiveError extends Error {},
}));

import { updateCollectiveAction } from "./_actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.query.mockResolvedValue({ rows: [{ id: "collective-1" }] });
  mocks.isSteward.mockResolvedValue(true);
  mocks.updateCollective.mockResolvedValue(undefined);
});

describe("collective directory publication action", () => {
  it("rejects a stale displayed notice before the profile write", async () => {
    const form = new FormData();
    form.set("directory_listed", "on");
    form.set("directory_publication_version", "community-directory-v0");

    await expect(updateCollectiveAction("quiet-lab", form)).resolves.toEqual({
      ok: false,
      error:
        "The directory publication notice changed. Reload and review it before listing.",
    });
    expect(mocks.updateCollective).not.toHaveBeenCalled();
  });

  it("treats absent full-form checkboxes as public and directory withdrawal", async () => {
    const form = new FormData();
    form.set("display_name", "Quiet Lab");
    form.set("directory_publication_version", "community-directory-v1");

    await expect(updateCollectiveAction("quiet-lab", form)).resolves.toEqual({
      ok: true,
    });
    expect(mocks.updateCollective).toHaveBeenCalledWith(
      "collective-1",
      expect.objectContaining({
        is_public: false,
        directory_listed: false,
        directory_publication_version: "community-directory-v1",
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/community/directory");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/api/v1/directory/organisations",
    );
  });
});
