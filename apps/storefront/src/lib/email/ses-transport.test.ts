import { afterEach, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("@cambridge-tcg/aws/ses", () => ({ createSESClient: () => ({ send }), SendRawEmailCommand: class {} }));

import { sendMail } from "@cambridge-tcg/email";

afterEach(() => vi.unstubAllEnvs());

it("a refused message comes back as a value, with the provider's own name for why", async () => {
  vi.stubEnv("EMAIL_TRANSPORT", "ses");
  const mail = { from: "Shop <shop@example.test>", to: "owner@example.test", subject: "s", text: "t" };
  send.mockRejectedValueOnce(Object.assign(new Error("User is not authorized to send to owner@example.test"), { name: "AccessDenied" }));
  expect(await sendMail(mail)).toEqual({ ok: false, error: "User is not authorized to send to owner@example.test", code: "AccessDenied", transport: "ses" });
  send.mockRejectedValueOnce("not an Error");
  expect(await sendMail(mail)).toEqual({ ok: false, error: "not an Error", code: undefined, transport: "ses" });
  send.mockResolvedValueOnce({ MessageId: "m1" });
  expect(await sendMail(mail)).toEqual({ ok: true, messageId: "m1", transport: "ses" });
});
