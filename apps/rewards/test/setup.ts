import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

// Fixed test secrets, set before any test module reads them.
process.env.SHOPIFY_API_SECRET = "test-api-secret";
process.env.ENCRYPTION_SECRET = "test-encryption-secret";
process.env.ENCRYPTION_SALT = "00112233445566778899aabbccddeeff";
process.env.SHOPIFY_APP_URL = "https://test.example.com";

// No default handlers: a test declares every answer it expects with
// server.use(), and any other request fails the test.
export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
