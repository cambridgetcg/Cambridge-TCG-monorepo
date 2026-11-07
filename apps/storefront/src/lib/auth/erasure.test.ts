import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => db);

import { PgAdapter } from "./adapter";
import { AccountErasureHeldError, accountErasureHold } from "./erasure";

const migration = (name: string) => readFileSync(new URL(`../../../drizzle/${name}`, import.meta.url), "utf8");
const guardMessage = (sql: string) => /RAISE EXCEPTION\s+'([^']+)'/.exec(sql)?.[1];

beforeEach(() => db.query.mockReset());

describe("account erasure holds", () => {
  it("recognises exactly the two subscription guards' refusals", () => {
    const dataApi = guardMessage(migration("0142_data_api_plans.sql").split("data_api_subscription_erasure_guard")[1]!);
    const prism = guardMessage(migration("0136_prism_stripe_sandbox.sql").split("protect_prism_stripe_active_account_erasure")[1]!);
    expect(dataApi).toBe("cannot erase a data-API subscription before Stripe reports it ended");
    expect(prism).toBe("cannot erase PRISM Stripe account mapping before provider subscription termination");
    expect(accountErasureHold({ code: "23503", message: dataApi })).toBe("data-api-subscription");
    expect(accountErasureHold({ code: "23503", message: prism })).toBe("prism-signals-subscription");
  });

  it("leaves every other failure as it was", () => {
    for (const error of [
      null, "23503", new Error("cannot erase a data-API subscription before Stripe reports it ended"),
      { code: "23503", message: 'update or delete on table "users" violates foreign key constraint "orders_user_id_fkey"' },
      { code: "40001", message: "cannot erase a data-API subscription before Stripe reports it ended" },
    ]) {
      expect(accountErasureHold(error)).toBeNull();
    }
  });

  it("makes deleteUser answer why it waits, and keeps other errors intact", async () => {
    const refusal = Object.assign(new Error("cannot erase a data-API subscription before Stripe reports it ended"), { code: "23503" });
    db.query.mockRejectedValueOnce(refusal);
    const held = await Promise.resolve(PgAdapter().deleteUser!("user-1")).then(() => null, (error: unknown) => error);
    expect(held).toBeInstanceOf(AccountErasureHeldError);
    expect(held).toMatchObject({ code: "ACCOUNT_ERASURE_HELD", status: 409, hold: "data-api-subscription", cause: refusal });

    const other = Object.assign(new Error("connection reset"), { code: "08006" });
    db.query.mockRejectedValueOnce(other);
    await expect(PgAdapter().deleteUser!("user-1")).rejects.toBe(other);

    db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(PgAdapter().deleteUser!("user-1")).resolves.toBeUndefined();
    expect(db.query).toHaveBeenLastCalledWith("DELETE FROM users WHERE id = $1", ["user-1"]);
  });
});
