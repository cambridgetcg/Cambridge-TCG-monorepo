import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  CommerceConnectionNotFoundError,
  CommerceEventConflictError,
  type CommerceEventInbox,
} from "../src/repositories/commerce-event-inbox.js";
import { apiConfig, TEST_CONNECTION_ID, TEST_EVENT_ID, TEST_WORKSPACE_ID } from "./helpers.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeApp(options: {
  databaseQuery?: ReturnType<typeof vi.fn>;
  ingest?: ReturnType<typeof vi.fn>;
} = {}) {
  const query =
    options.databaseQuery ?? vi.fn(async () => ({ rows: [{ ready: true }] }));
  const ingest =
    options.ingest ??
    vi.fn(async () => ({
      commerceConnectionId: TEST_CONNECTION_ID,
      duplicate: false,
      eventId: TEST_EVENT_ID,
      workspaceId: TEST_WORKSPACE_ID,
    }));
  const app = buildApp({
    config: apiConfig(),
    inbox: {
      ingest: ingest as unknown as CommerceEventInbox["ingest"],
    },
    pool: { query } as never,
  });
  apps.push(app);
  return { app, ingest, query };
}

function webhookHeaders(rawBody: string, overrides: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-shopify-hmac-sha256": createHmac(
      "sha256",
      "shopify-test-secret",
    )
      .update(rawBody)
      .digest("base64"),
    "x-shopify-shop-domain": "example.myshopify.com",
    "x-shopify-topic": "orders/paid",
    "x-shopify-triggered-at": "2026-07-23T10:00:00Z",
    "x-shopify-webhook-id": "webhook-id-1",
    ...overrides,
  };
}

describe("health routes", () => {
  it("serves liveness without touching dependencies", async () => {
    const { app, query } = makeApp();
    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(query).not.toHaveBeenCalled();
  });

  it("requires the exact Bearer token before checking PostgreSQL", async () => {
    const { app, query } = makeApp();

    for (const authorization of [
      undefined,
      "operator-test-token",
      "bearer operator-test-token",
      "Bearer  operator-test-token",
      "Bearer operator-test-token ",
    ]) {
      const response = await app.inject({
        ...(authorization ? { headers: { authorization } } : {}),
        method: "GET",
        url: "/health/ready",
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("returns generic ready and not-ready states", async () => {
    const ready = makeApp();
    const readyResponse = await ready.app.inject({
      headers: { authorization: "Bearer operator-test-token" },
      method: "GET",
      url: "/health/ready",
    });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toEqual({ status: "ready" });

    const unavailable = makeApp({
      databaseQuery: vi.fn(async () => {
        throw new Error("sensitive database detail");
      }),
    });
    const unavailableResponse = await unavailable.app.inject({
      headers: { authorization: "Bearer operator-test-token" },
      method: "GET",
      url: "/health/ready",
    });
    expect(unavailableResponse.statusCode).toBe(503);
    expect(unavailableResponse.json()).toEqual({ status: "not_ready" });
    expect(unavailableResponse.body).not.toContain("sensitive database detail");
  });

  it("is not ready when required runtime schema or grants are absent", async () => {
    const { app } = makeApp({
      databaseQuery: vi.fn(async () => ({ rows: [{ ready: false }] })),
    });

    const response = await app.inject({
      headers: { authorization: "Bearer operator-test-token" },
      method: "GET",
      url: "/health/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "not_ready" });
  });
});

describe("Shopify webhook route", () => {
  it("verifies raw bytes and ends the request path at the durable commit", async () => {
    const rawBody = '{\n  "id": 42,\n  "currency": "GBP"\n}\n';
    const { app, ingest } = makeApp();

    const response = await app.inject({
      headers: webhookHeaders(rawBody),
      method: "POST",
      payload: rawBody,
      url: "/webhooks/shopify",
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: "accepted" });
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatch: false,
        externalEventId: "webhook-id-1",
        externalEventType: "orders/paid",
        payloadJson: rawBody,
        provider: "shopify",
        sourceAccountId: "example.myshopify.com",
      }),
    );
  });

  it("hands PostgreSQL the exact 64-bit provider id token", async () => {
    const rawBody =
      '{"id":820982911946154508,"currency":"GBP","line_items":[]}';
    const { app, ingest } = makeApp();

    const response = await app.inject({
      headers: webhookHeaders(rawBody),
      method: "POST",
      payload: rawBody,
      url: "/webhooks/shopify/",
    });

    expect(response.statusCode).toBe(202);
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({ payloadJson: rawBody }),
    );
  });

  it("marks the committed row pending when SQS delivery is configured", async () => {
    const rawBody = '{"id":42}';
    const ingest = vi.fn(async () => ({
      commerceConnectionId: TEST_CONNECTION_ID,
      duplicate: false,
      eventId: TEST_EVENT_ID,
      workspaceId: TEST_WORKSPACE_ID,
    }));
    const app = buildApp({
      config: apiConfig({
        awsRegion: "eu-west-2",
        sqsQueueUrl: "https://sqs.eu-west-2.amazonaws.com/123/events",
      }),
      inbox: { ingest },
      pool: { query: vi.fn() } as never,
    });
    apps.push(app);

    const response = await app.inject({
      headers: webhookHeaders(rawBody),
      method: "POST",
      payload: rawBody,
      url: "/webhooks/shopify/",
    });
    expect(response.statusCode).toBe(202);
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({ dispatch: true }),
    );
  });

  it("does not parse or persist a body with an invalid signature", async () => {
    const rawBody = '{"id":42}';
    const { app, ingest } = makeApp();
    const response = await app.inject({
      headers: webhookHeaders(rawBody, {
        "x-shopify-hmac-sha256": createHmac("sha256", "wrong-secret")
          .update(rawBody)
          .digest("base64"),
      }),
      method: "POST",
      payload: rawBody,
      url: "/webhooks/shopify/",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(ingest).not.toHaveBeenCalled();
  });

  it("keeps connection lookup and idempotency failures generic", async () => {
    const rawBody = '{"id":42}';
    const missingConnection = makeApp({
      ingest: vi.fn(async () => {
        throw new CommerceConnectionNotFoundError("private shop detail");
      }),
    });
    const missingResponse = await missingConnection.app.inject({
      headers: webhookHeaders(rawBody),
      method: "POST",
      payload: rawBody,
      url: "/webhooks/shopify/",
    });
    expect(missingResponse.statusCode).toBe(404);
    expect(missingResponse.json()).toEqual({ error: "not_found" });

    const conflict = makeApp({
      ingest: vi.fn(async () => {
        throw new CommerceEventConflictError("private event detail");
      }),
    });
    const conflictResponse = await conflict.app.inject({
      headers: webhookHeaders(rawBody),
      method: "POST",
      payload: rawBody,
      url: "/webhooks/shopify/",
    });
    expect(conflictResponse.statusCode).toBe(409);
    expect(conflictResponse.json()).toEqual({ error: "conflict" });
  });
});
