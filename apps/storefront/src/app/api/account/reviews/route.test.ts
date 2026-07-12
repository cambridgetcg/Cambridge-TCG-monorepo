import { beforeEach, describe, expect, it, vi } from "vitest";

const { appealMock, authMock, logMock, queryMock } = vi.hoisted(() => ({
  appealMock: vi.fn(),
  authMock: vi.fn(),
  logMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ query: queryMock }));
vi.mock("@/lib/reviews/moderation", () => ({ appealReview: appealMock }));
vi.mock("@/lib/reviews/lifecycle-log", () => ({ logReviewTransition: logMock }));

import { GET, PATCH } from "./route";

const REVIEW_ID = "123e4567-e89b-42d3-a456-426614174000";
const USER_ID = "123e4567-e89b-42d3-a456-426614174001";

function patch(body: unknown): Request {
  return new Request("https://cambridgetcg.com/api/account/reviews", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("account review publication controls", () => {
  beforeEach(() => {
    authMock.mockReset();
    queryMock.mockReset();
    logMock.mockReset();
    appealMock.mockReset();
    authMock.mockResolvedValue({ user: { id: USER_ID } });
    logMock.mockResolvedValue(undefined);
  });

  it("includes publication state in both owner-only review lists", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "received", is_public: false }] })
      .mockResolvedValueOnce({ rows: [{ id: REVIEW_ID, is_public: true }] });

    const response = await GET();
    const body = await response.json();

    expect(body.received[0].is_public).toBe(false);
    expect(body.given[0].is_public).toBe(true);
    expect(queryMock.mock.calls[0][0]).toContain("r.is_public");
    expect(queryMock.mock.calls[1][0]).toContain("r.is_public");
  });

  it("unpublishes only when the signed-in user wrote a currently-public review", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: REVIEW_ID, is_public: false }] });

    const response = await PATCH(patch({ reviewId: REVIEW_ID, action: "unpublish" }));
    const body = await response.json();
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, reviewId: REVIEW_ID, is_public: false });
    expect(sql).toContain("SET is_public = FALSE");
    expect(sql).toContain("reviewer_id = $2");
    expect(sql).toContain("is_public = TRUE");
    expect(params).toEqual([REVIEW_ID, USER_ID]);
    await vi.waitFor(() => expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewId: REVIEW_ID,
        action: "unpublished",
        actorId: USER_ID,
      }),
    ));
  });

  it("has no route action that can republish a private review", async () => {
    const response = await PATCH(patch({ reviewId: REVIEW_ID, action: "publish" }));

    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("does not treat another user's or already-private review as a successful withdrawal", async () => {
    queryMock.mockResolvedValue({ rows: [] });

    const response = await PATCH(patch({ reviewId: REVIEW_ID, action: "unpublish" }));

    expect(response.status).toBe(404);
    expect(logMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in owner", async () => {
    authMock.mockResolvedValue(null);

    const response = await PATCH(patch({ reviewId: REVIEW_ID, action: "unpublish" }));

    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
