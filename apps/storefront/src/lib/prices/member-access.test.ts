import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/auth/realms", () => ({ getSessionUser: mocks.session }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
import { getMemberSessionActor } from "./member-access";
beforeEach(() => vi.clearAllMocks());
it("returns no actor without a real session and does not query prices or owners", async () => {
  mocks.session.mockResolvedValue(null);
  expect(await getMemberSessionActor()).toBeNull();
  expect(mocks.query).not.toHaveBeenCalled();
});
it("requires the session owner to still exist", async () => {
  mocks.session.mockResolvedValue({ id: "removed", role: "user" });
  mocks.query.mockResolvedValue({ rows: [] });
  expect(await getMemberSessionActor()).toBeNull();
  expect(mocks.query).toHaveBeenCalledWith("SELECT id FROM users WHERE id = $1", ["removed"]);
});
it("a free ordinary session is sufficient, with no tier or agent lookup", async () => {
  mocks.session.mockResolvedValue({ id: "free", role: "user" });
  mocks.query.mockResolvedValue({ rows: [{ id: "free" }] });
  expect(await getMemberSessionActor()).toEqual({ userId: "free" });
  expect(mocks.query).toHaveBeenCalledTimes(1);
});
