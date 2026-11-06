import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CONTACT_TOPICS, FEEDBACK_DETAIL_FIELDS, FEEDBACK_HOURLY_CAP, FEEDBACK_INSERT_SQL, FEEDBACK_KINDS, FEEDBACK_STATUSES,
  HOLDER_KEY_PATTERN, eraseFeedbackForHolder, feedbackDoorOpen, holderKeyFrom, holderKeySha256, keptFields, newFeedbackId,
  newHolderKey, readFeedbackForHolder, secondsToNextHour, storeFeedback, validateFeedback,
} from "./door";
import { DOOR_RETENTION_SWEEP_SQL, runDoorRetentionSweep } from "./retention";
import { PEER_HELLO_KINDS } from "@/lib/peers";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

// The lists the database refuses anything outside of, read from 0149 itself.
const migration = readFileSync(new URL("../../../drizzle/0149_agent_doors.sql", import.meta.url), "utf8");
function checkList(table: string, column: string): string[] {
  const body = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`).exec(migration)?.[1];
  if (!body) throw new Error(`no table ${table}`);
  const list = new RegExp(`CHECK \\(${column} IN \\(((?:'(?:[^']|'')*'(?:, )?)+)\\)\\)`).exec(body)?.[1];
  if (!list) throw new Error(`no IN check for ${table}.${column}`);
  return [...list.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1]!);
}

const ok = (input: unknown) => {
  const result = validateFeedback(input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const refused = (input: unknown) => {
  const result = validateFeedback(input);
  if (result.ok) throw new Error("accepted");
  return result;
};

describe("feedback door vocabulary", () => {
  it.each([
    ["public_feedback", "kind", FEEDBACK_KINDS],
    ["public_feedback", "topic", CONTACT_TOPICS],
    ["public_feedback", "status", FEEDBACK_STATUSES],
    ["peer_hello_daily", "declared_kind", PEER_HELLO_KINDS],
  ] as const)("%s.%s matches its list in 0149, word for word", (table, column, words) => {
    expect(checkList(table, column)).toEqual([...words]);
  });

  it("names the same reference fields as the database's check", () => {
    const named = /field\.key NOT IN \(([^)]*)\)/.exec(migration)?.[1];
    expect([...named!.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual(Object.keys(FEEDBACK_DETAIL_FIELDS));
  });

  it("opens only on exactly \"on\"", () => {
    expect(feedbackDoorOpen({})).toBe(false);
    expect(feedbackDoorOpen({ PUBLIC_FEEDBACK: "true" })).toBe(false);
    expect(feedbackDoorOpen({ PUBLIC_FEEDBACK: "on " })).toBe(false);
    expect(feedbackDoorOpen({ PUBLIC_FEEDBACK: "on" })).toBe(true);
  });
});

describe("validateFeedback", () => {
  it("keeps a question as the sender wrote it, trimmed, with Windows line ends folded", () => {
    expect(ok({ kind: "question", message: "  Is the One Piece set list complete?\r\nThanks  " })).toEqual({
      kind: "question", topic: null, message: "Is the One Piece set list complete?\nThanks", details: {}, replyTo: null, replyName: null,
    });
  });

  it("reads the contact form's fields and the older names its signposts use", () => {
    expect(ok({ kind: "general", topic: "order", message: "Where is my parcel?", name: "Ada", reporter_contact: "ada@example.com" })).toMatchObject({
      topic: "order", replyName: "Ada", replyTo: "ada@example.com",
    });
    const drift = ok({ kind: "contract-drift", endpoint: "/api/v1/universal/card/op-op01-001-ja", observed: "missing _meta.source_license", expected: "per OpenAPI spec", request_id_to_correlate: "req_0123abcd" });
    expect(drift.details).toEqual({ observed: "missing _meta.source_license", expected: "per OpenAPI spec", endpoint: "/api/v1/universal/card/op-op01-001-ja", request_id: "req_0123abcd" });
    expect(ok({ kind: "federation-adopter", platform_name: "My TCG App", platform_url: "https://my-tcg.example", federation_endpoint: "https://my-tcg.example/api/v1/federation/identify/{hash}" }).details)
      .toMatchObject({ platform_url: "https://my-tcg.example" });
    expect(ok({ kind: "guide-feedback", guide_slug: "respect-our-limits", step_number: "4", observation: "step 4 404s" }).details).toMatchObject({ step_number: 4 });
  });

  it("names exactly what it keeps", () => {
    expect(keptFields(ok({ kind: "data-error", endpoint: "/api/v1/market/indices", subject: "op-op01", as_of: "2026-11-05", method_version: "ctcg.market-derived/v1", message: "index missing", reply_to: "https://agent.example/inbox" })))
      .toEqual(["kind", "message", "endpoint", "subject", "as_of", "method_version", "reply_to"]);
  });

  it("refuses a field it does not know rather than dropping it, and quotes no odd name back", () => {
    const result = refused({ kind: "general", message: "hi", ip: "203.0.113.9", "<script>": 1 });
    expect(result.error).toContain("Unknown fields: ip, (unnamed)");
    expect(result.error).not.toContain("<script>");
  });

  it("refuses bodies with nothing said, unknown kinds, bad shapes and over-long text", () => {
    expect(refused([]).error).toContain("JSON object");
    expect(refused({ kind: "praise", message: "hi" }).field).toBe("kind");
    expect(refused({ kind: "general" }).field).toBe("message");
    expect(refused({ kind: "general", message: "   " }).field).toBe("message");
    expect(refused({ kind: "general", message: "x".repeat(4001) }).error).toContain("4000");
    expect(refused({ kind: "general", message: "a\u0000b" }).error).toContain("control characters");
    expect(refused({ kind: "general", message: "hi", reply_name: "Ada\nLovelace" }).field).toBe("reply_name");
    expect(refused({ kind: "general", message: "hi", reply_to: "not an address" }).field).toBe("reply_to");
    expect(refused({ kind: "general", message: "hi", reply_to: "http://plain.example" }).field).toBe("reply_to");
    expect(refused({ kind: "general", message: "hi", topic: "refund-now" }).field).toBe("topic");
    expect(refused({ kind: "general", message: "hi", endpoint: "api/v1/x" }).field).toBe("endpoint");
    expect(refused({ kind: "general", message: "hi", endpoint: "/a b" }).field).toBe("endpoint");
    expect(refused({ kind: "general", message: "hi", step_number: 0 }).field).toBe("step_number");
    expect(refused({ kind: "general", message: "hi", as_of: "yesterday" }).field).toBe("as_of");
    expect(refused({ kind: "general", message: "hi", reply_to: "a@b.example", reporter_contact: "c@d.example" }).field).toBe("reporter_contact");
  });

  it("asks a data-error to name its endpoint and key", () => {
    expect(refused({ kind: "data-error", message: "wrong" }).field).toBe("endpoint");
    expect(refused({ kind: "data-error", message: "wrong", endpoint: "/api/v1/market/indices" }).field).toBe("subject");
  });
});

describe("holder keys", () => {
  it("are random, shown once, and kept only as SHA-256", () => {
    const key = newHolderKey();
    expect(key).toMatch(HOLDER_KEY_PATTERN);
    expect(newHolderKey()).not.toBe(key);
    expect(holderKeySha256(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(newFeedbackId()).toMatch(/^fb_[0-9a-f]{24}$/);
  });

  it("come only from a Bearer header, and any other bearer is not one", () => {
    const key = newHolderKey();
    expect(holderKeyFrom(null)).toEqual({ present: false });
    expect(holderKeyFrom(`Bearer ${key}`)).toEqual({ present: true, key });
    expect(holderKeyFrom(`bearer ${key}`)).toEqual({ present: true, key });
    expect(holderKeyFrom(`Bearer ${key.slice(0, 20)}`)).toEqual({ present: true, key: null });
    expect(holderKeyFrom("Bearer ctcg_agt_0123456789abcdef0123")).toEqual({ present: false });
    expect(holderKeyFrom(key)).toEqual({ present: false });
  });
});

describe("storage", () => {
  const submission = ok({ kind: "question", message: "hello", reply_to: "ada@example.com" });

  it("writes the named fields, the key's hash and never the key, in one capped statement", async () => {
    const run = vi.fn(async () => ({ rows: [{ received_at: new Date("2026-11-06T10:00:00Z"), expires_at: "2027-05-05T10:00:00Z" }] }));
    const stored = await storeFeedback(submission, run);
    expect(stored).toMatchObject({ ok: true, receivedAt: "2026-11-06T10:00:00.000Z", expiresAt: "2027-05-05T10:00:00.000Z" });
    if (!stored.ok) throw new Error("not stored");
    const [sql, params] = run.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toBe(FEEDBACK_INSERT_SQL);
    expect(sql).toContain(`< ${FEEDBACK_HOURLY_CAP}`);
    expect(params).toEqual([stored.feedbackId, holderKeySha256(stored.holderKey), "question", null, "hello", "{}", "ada@example.com", null]);
    expect(JSON.stringify(params)).not.toContain(stored.holderKey);
  });

  it("reads no row back as the cap, and a missing table as not provisioned", async () => {
    expect(await storeFeedback(submission, async () => ({ rows: [] }))).toEqual({ ok: false, reason: "capped" });
    const missing = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    expect(await storeFeedback(submission, async () => { throw missing; })).toEqual({ ok: false, reason: "not-provisioned" });
    expect(await storeFeedback(submission, async () => { throw new Error("busy"); })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("finds a holder's row by the key's hash only, and erases it whole", async () => {
    const key = newHolderKey();
    const row = { feedback_id: "fb_0123456789abcdef01234567", kind: "question", topic: null, message: "hello", details: { endpoint: "/x" }, reply_to: null, reply_name: null,
      status: "answered", answer: "Yes.", answered_at: new Date("2026-11-07T09:00:00Z"), received_at: new Date("2026-11-06T10:00:00Z"), expires_at: new Date("2027-05-05T10:00:00Z") };
    const run = vi.fn(async () => ({ rows: [row] }));
    const read = await readFeedbackForHolder(key, run);
    expect(read).toEqual({ ok: true, view: expect.objectContaining({ status: "answered", answer: { text: "Yes.", answered_at: "2026-11-07T09:00:00.000Z" }, held: expect.objectContaining({ message: "hello", details: { endpoint: "/x" } }) }) });
    expect(run.mock.calls[0]).toEqual([expect.stringContaining("expires_at > now()"), [holderKeySha256(key)]]);
    expect(await readFeedbackForHolder(key, async () => ({ rows: [] }))).toEqual({ ok: true, view: null });
    expect(await eraseFeedbackForHolder(key, async () => ({ rows: [{ feedback_id: row.feedback_id }] }))).toEqual({ ok: true, erased: row.feedback_id });
    expect(await eraseFeedbackForHolder(key, async () => ({ rows: [] }))).toEqual({ ok: true, erased: null });
  });

  it("says when the cap resets", () => {
    expect(secondsToNextHour(Date.UTC(2026, 10, 6, 10, 59, 30))).toBe(30);
    expect(secondsToNextHour(Date.UTC(2026, 10, 6, 11, 0, 0))).toBe(3600);
  });
});

describe("the hourly sweep", () => {
  it("runs at minute 23 only, deletes past each period, and counts what went", async () => {
    const run = vi.fn(async () => ({ rows: [{ feedback: 2, intake: 5, hello: 1 }] }));
    expect(await runDoorRetentionSweep(new Date("2026-11-06T10:22:00Z"), run)).toEqual({ ranInWindow: false });
    expect(run).not.toHaveBeenCalled();
    expect(await runDoorRetentionSweep(new Date("2026-11-06T10:23:10Z"), run)).toEqual({ ranInWindow: true, provisioned: true, deleted: { feedback: 2, intake: 5, hello: 1 } });
    expect(run).toHaveBeenCalledWith(DOOR_RETENTION_SWEEP_SQL);
    expect(DOOR_RETENTION_SWEEP_SQL).toContain("expires_at <= now()");
    expect(DOOR_RETENTION_SWEEP_SQL).toContain("interval '48 hours'");
    expect(DOOR_RETENTION_SWEEP_SQL).toContain("interval '13 months'");
  });

  it("finds nothing to sweep before 0149, and lets other errors through", async () => {
    const missing = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    expect(await runDoorRetentionSweep(new Date("2026-11-06T10:23:00Z"), async () => { throw missing; })).toEqual({ ranInWindow: true, provisioned: false });
    await expect(runDoorRetentionSweep(new Date("2026-11-06T10:23:00Z"), async () => { throw new Error("busy"); })).rejects.toThrow("busy");
  });
});
