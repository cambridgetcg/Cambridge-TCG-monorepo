import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  sfQuery: vi.fn(),
  requireAdmin: vi.fn(),
  logAdminAction: vi.fn(),
  redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` }); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/db", () => ({ sfQuery: mocks.sfQuery }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: mocks.logAdminAction }));

import FeedbackPage from "./page";
import { answerFeedback, deleteFeedback, markFeedback } from "./_actions";
import { ADMIN_NAV } from "@/components/admin/AdminShell";
import { FEEDBACK_ANSWER_SQL, FEEDBACK_OPERATOR_DELETE_SQL, FEEDBACK_STATUS_SQL } from "@/lib/feedback/door";

const ID = "fb_0123456789abcdef01234567";
const MESSAGE = "PRIVATE-MESSAGE-SENTINEL";
const session = (role: string | null) => mocks.auth.mockResolvedValue(role ? { user: { id: "u-1", email: "someone@example.test", role } } : null);
const row = { feedback_id: ID, kind: "general", topic: "order", message: MESSAGE, details: { endpoint: "/api/v1/prices" }, reply_to: "ada@example.com", reply_name: "Ada",
  status: "received", answer: null, answered_at: null, received_at: new Date("2026-11-06T10:00:00Z"), expires_at: new Date("2027-05-05T10:00:00Z"), total: 1, open: 1 };
const rows = (count: number, over: Record<string, unknown> = {}) => Array.from({ length: count }, (_, index) => ({ ...row, feedback_id: `fb_${String(index).padStart(24, "0")}`, ...over }));
const page = async (...answer: Record<string, unknown>[]) => {
  session("admin");
  mocks.sfQuery.mockResolvedValueOnce({ rows: answer });
  const markup = renderToStaticMarkup(await FeedbackPage());
  return { markup, text: markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ") };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1", email: "admin@example.test" });
});

describe("/admin/feedback, the operator's half of the door", () => {
  it.each([[null, "/login"], ["user", "/"]])("sends a %s session to %s before reading anything", async (role, to) => {
    session(role);
    await expect(FeedbackPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(to);
    expect(mocks.sfQuery).not.toHaveBeenCalled();
  });

  it("shows an admin what the sender chose to send, and says unknown when the table is not there", async () => {
    session("admin");
    mocks.sfQuery.mockResolvedValueOnce({ rows: [row] });
    const markup = renderToStaticMarkup(await FeedbackPage());
    for (const text of [ID, MESSAGE, "/api/v1/prices", "ada@example.com", "PUBLIC_FEEDBACK", "Save answer"]) expect(markup).toContain(text);
    expect(mocks.sfQuery.mock.calls[0][0]).toContain("expires_at > now()");

    mocks.sfQuery.mockRejectedValueOnce(Object.assign(new Error("relation does not exist"), { code: "42P01" }));
    expect(renderToStaticMarkup(await FeedbackPage())).toContain("migration 0149");
  });

  it("brings its own dark ground, so its light text is readable whatever theme the visitor wears", async () => {
    for (const { markup } of [await page(row), await page()]) {
      expect(markup).toMatch(/^<main class="min-h-screen bg-neutral-950 text-white">/);
      expect(markup).toMatch(/<\/main>$/);
    }
    // AdminShell's ground, without its wait for a fetch.
    expect(readFileSync(new URL("../../../components/admin/AdminShell.tsx", import.meta.url), "utf8")).toContain('<main className="min-h-screen bg-neutral-950 text-white">');
  });

  it("says that saving an answer sends nothing, and that an address left is not checked", async () => {
    const left = await page(row);
    for (const words of [
      "Your answer is shown to whoever holds the message's key; nothing is emailed from here.",
      "They left ada@example.com (Ada), which nobody has checked is theirs. Nothing is sent to it from here; a person may write to it.",
      "Saving sends nothing, to anyone. The sender sees the answer only by coming back with their key.",
    ]) expect(left.text).toContain(words);
    // The sentence sits between the answer and its button, and is read with the box.
    expect(left.markup).toMatch(new RegExp(`aria-describedby="saving-${ID}"[\\s\\S]*id="saving-${ID}"[\\s\\S]*Save answer`));
    expect((await page({ ...row, reply_to: null, reply_name: null })).text).toContain("No reply address: the holder reads the answer with their key.");
  });

  it("says how many messages its list leaves out, from a count, and says nothing when it shows them all", async () => {
    const short = await page(...rows(100, { total: 1150, open: 1130 }));
    expect(short.text).toContain("Showing 100 of 1,150 messages");
    expect(short.text).toContain("Left out: 1,030 not answered or closed, the oldest of those, and 20 answered or closed. Answer, close or delete some below and they appear here.");
    const openOnly = await page(...rows(100, { total: 101, open: 101 }));
    expect(openOnly.text).toContain("Left out: 1 not answered or closed, the oldest of those. Answer, close or delete some below and they appear here.");
    const done = await page(...rows(50, { total: 130, open: 60 }), ...rows(10, { status: "read", total: 130, open: 60 }), ...rows(40, { status: "closed", total: 130, open: 60 }));
    expect(done.text).toContain("Showing 100 of 130 messages");
    expect(done.text).toContain("Left out: 30 answered or closed, the oldest of those.");
    for (const all of [await page(...rows(100, { total: 100, open: 100 })), await page(row), await page()]) expect(all.text).not.toMatch(/Showing|Left out/);
    // A count that did not come is not guessed at.
    expect((await page({ ...row, total: null })).text).toContain("The storefront database could not be read.");
  });

  it("writes the answer, marks and deletes by id, and logs the verb and id, never the words", async () => {
    mocks.sfQuery.mockResolvedValue({ rows: [{ feedback_id: ID }] });
    expect(await answerFeedback({ id: ID, answer: `  ${MESSAGE} answered  ` })).toMatchObject({ ok: true });
    expect(mocks.sfQuery).toHaveBeenLastCalledWith(FEEDBACK_ANSWER_SQL, [ID, `${MESSAGE} answered`]);
    expect(await markFeedback({ id: ID, status: "closed" })).toMatchObject({ ok: true });
    expect(mocks.sfQuery).toHaveBeenLastCalledWith(FEEDBACK_STATUS_SQL, [ID, "closed"]);
    expect(await deleteFeedback({ id: ID })).toMatchObject({ ok: true });
    expect(mocks.sfQuery).toHaveBeenLastCalledWith(FEEDBACK_OPERATOR_DELETE_SQL, [ID]);
    expect(mocks.logAdminAction.mock.calls.map(([entry]) => [entry.action, entry.targetId])).toEqual([["feedback.answer", ID], ["feedback.close", ID], ["feedback.delete", ID]]);
    expect(JSON.stringify(mocks.logAdminAction.mock.calls)).not.toContain(MESSAGE);
  });

  it("refuses a bad id, an empty answer or a status it does not set, before the database", async () => {
    expect(await answerFeedback({ id: "fb_nope", answer: "x" })).toMatchObject({ ok: false, code: "validation" });
    expect(await answerFeedback({ id: ID, answer: "   " })).toMatchObject({ ok: false, code: "validation" });
    expect(await markFeedback({ id: ID, status: "answered" as never })).toMatchObject({ ok: false, code: "validation" });
    expect(mocks.sfQuery).not.toHaveBeenCalled();
    mocks.requireAdmin.mockResolvedValue(null);
    expect(await deleteFeedback({ id: ID })).toMatchObject({ ok: false, code: "unauthorized" });
    expect(mocks.sfQuery).not.toHaveBeenCalled();
  });

  it("is in the admin nav, and its page reads only after the admin check", () => {
    expect(ADMIN_NAV).toContainEqual({ href: "/admin/feedback", label: "Feedback", group: "ops" });
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/await requireAdminPage\(\);\n\s+const open = feedbackDoorOpen\(\);\n\s+const listed = await listFeedbackForOperator/);
  });
});
