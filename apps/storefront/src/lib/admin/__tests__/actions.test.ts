import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sister's requireAdmin + logAdminAction + Next's revalidatePath
vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/admin/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("admin/actions adminAction wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects with unauthorized when requireAdmin returns null", async () => {
    const { requireAdmin } = await import("@/lib/admin/auth");
    (requireAdmin as any).mockResolvedValue(null);

    const { adminAction } = await import("../actions");
    const result = await adminAction({
      action: "test.noop",
      targetKind: "test",
      targetId: "0",
      reason: "test",
      run: async () => "should not be called",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unauthorized");
      expect(result.error).toMatch(/not authorized/i);
    }
  });

  it("returns ok:true with the run() result when admin is authorized", async () => {
    const { requireAdmin } = await import("@/lib/admin/auth");
    (requireAdmin as any).mockResolvedValue({
      id: "u-1",
      email: "admin@example.com",
      role: "admin",
    });

    const { adminAction } = await import("../actions");
    const result = await adminAction({
      action: "test.noop",
      targetKind: "test",
      targetId: "0",
      run: async (admin) => `did the thing for ${admin.email}`,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe("did the thing for admin@example.com");
  });

  it("passes the admin session to the run callback", async () => {
    const { requireAdmin } = await import("@/lib/admin/auth");
    const session = { id: "u-2", email: "second@example.com", role: "admin" };
    (requireAdmin as any).mockResolvedValue(session);

    const { adminAction } = await import("../actions");
    let captured: unknown = null;
    await adminAction({
      action: "test.noop",
      targetKind: "test",
      run: async (admin) => {
        captured = admin;
        return null;
      },
    });

    expect(captured).toEqual(session);
  });

  it("writes to the audit log on success", async () => {
    const { requireAdmin } = await import("@/lib/admin/auth");
    const { logAdminAction } = await import("@/lib/admin/audit");
    (requireAdmin as any).mockResolvedValue({
      id: "u-3",
      email: "third@example.com",
      role: "admin",
    });

    const { adminAction } = await import("../actions");
    await adminAction({
      action: "user.suspend",
      targetKind: "user",
      targetId: "user-abc",
      targetUserId: "user-abc",
      reason: "abusive behaviour",
      run: async () => ({ suspended: true }),
    });

    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.suspend",
        targetKind: "user",
        targetId: "user-abc",
        targetUserId: "user-abc",
        reason: "abusive behaviour",
        admin: expect.objectContaining({ email: "third@example.com" }),
      }),
    );
  });

  it("can replace the retained email label with a generic protocol role", async () => {
    const { requireAdmin } = await import("@/lib/admin/auth");
    const { logAdminAction } = await import("@/lib/admin/audit");
    (requireAdmin as any).mockResolvedValue({
      id: "u-private",
      email: "private-admin@example.com",
      role: "admin",
    });

    const { adminAction } = await import("../actions");
    await adminAction({
      action: "coverage_hunt.resolve",
      targetKind: "coverage_hunt_case",
      targetId: "case-1",
      auditActorLabel: "admin-reviewer",
      run: async () => ({ resolved: true }),
    });

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorLabelOverride: "admin-reviewer",
        admin: expect.objectContaining({ id: "u-private" }),
      }),
    );
  });

  it("does NOT write to the audit log when run throws", async () => {
    const { requireAdmin } = await import("@/lib/admin/auth");
    const { logAdminAction } = await import("@/lib/admin/audit");
    (requireAdmin as any).mockResolvedValue({
      id: "u-4",
      email: "fourth@example.com",
      role: "admin",
    });

    const { adminAction } = await import("../actions");
    const result = await adminAction({
      action: "user.delete",
      targetKind: "user",
      run: async () => {
        throw new Error("boom");
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("internal");
      expect(result.error).toBe("boom");
    }
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("returns validation code when ActionInputError is thrown", async () => {
    const { requireAdmin } = await import("@/lib/admin/auth");
    (requireAdmin as any).mockResolvedValue({
      id: "u-5",
      email: "fifth@example.com",
      role: "admin",
    });

    const { adminAction, ActionInputError } = await import("../actions");
    const result = await adminAction({
      action: "test.validate",
      targetKind: "test",
      run: async () => {
        throw new ActionInputError("Reason required");
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("validation");
      expect(result.error).toBe("Reason required");
    }
  });

  it("revalidates each path passed in spec.revalidate", async () => {
    const { requireAdmin } = await import("@/lib/admin/auth");
    const { revalidatePath } = await import("next/cache");
    (requireAdmin as any).mockResolvedValue({
      id: "u-6",
      email: "sixth@example.com",
      role: "admin",
    });

    const { adminAction } = await import("../actions");

    // single path
    await adminAction({
      action: "test.noop",
      targetKind: "test",
      revalidate: "/admin/something",
      run: async () => null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/something");

    // array of paths
    vi.clearAllMocks();
    await adminAction({
      action: "test.noop",
      targetKind: "test",
      revalidate: ["/admin/a", "/admin/b"],
      run: async () => null,
    });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/a");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/b");
  });
});
