import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  NOT_SHOPPER_DATA,
  SHOPPER_COLUMNS,
  shopErasureOrder,
} from "~/services/shop-data-cleanup.server";

const models = Prisma.dmmf.datamodel.models;
const byName = new Map(models.map((m) => [m.name, m]));
const hasShop = (name: string) =>
  byName.get(name)!.fields.some((f) => f.kind === "scalar" && f.name === "shop");

// Models with no shop column and no foreign key to one: global data.
const GLOBAL_MODELS = new Set([
  "CronLock",
  "SubscriptionProcessingLock",
  "ExchangeRate",
  "SystemAlert",
  "AISession",
  "AILearningPattern",
  "AICodeQualitySignal",
  "AIArchitectureHealth",
  "AIInnovationTracker",
]);

describe("shop erasure plan", () => {
  it("covers every model with a shop column", () => {
    const order = shopErasureOrder();
    const expected = models.filter((m) => hasShop(m.name)).map((m) => m.name);
    expect([...order].sort()).toEqual([...expected].sort());
  });

  it("deletes every model before the models it references unless the key is SET NULL", () => {
    const order = shopErasureOrder();
    const position = new Map(order.map((name, index) => [name, index]));
    for (const name of order) {
      for (const field of byName.get(name)!.fields) {
        if (field.kind !== "object" || !field.relationFromFields?.length) continue;
        if (field.type === name || !position.has(field.type)) continue;
        // Only SET NULL keys (explicit, or the optional-relation default) never delete or block
        const action = field.relationOnDelete;
        if (action === "SetNull" || (action === undefined && !field.isRequired)) continue;
        expect(position.get(name)!, `${name} -> ${field.type}`).toBeLessThan(position.get(field.type)!);
      }
    }
  });

  it("leaves no shop data behind in models without a shop column", () => {
    for (const model of models.filter((m) => !hasShop(m.name))) {
      const parents = model.fields.filter((f) => f.kind === "object" && f.relationFromFields?.length);
      if (parents.length === 0) {
        expect(GLOBAL_MODELS, `${model.name} holds no foreign key; is it global?`).toContain(model.name);
        continue;
      }
      // Rows of shop-less children must disappear with their parent
      for (const parent of parents) {
        if (GLOBAL_MODELS.has(parent.type)) continue;
        expect(parent.relationOnDelete, `${model.name}.${parent.name}`).toBe("Cascade");
      }
    }
  });
});

describe("customer erasure columns", () => {
  it("lists every customer-identifying column outside a Customer foreign key", () => {
    const unlisted: string[] = [];
    for (const model of models) {
      if (model.name === "Customer" || NOT_SHOPPER_DATA.has(model.name)) continue;
      // Rows holding a foreign key to Customer are deleted whole
      if (model.fields.some((f) => f.kind === "object" && f.type === "Customer")) continue;
      const listed = new Set([
        ...(SHOPPER_COLUMNS[model.name]?.ids ?? []),
        ...(SHOPPER_COLUMNS[model.name]?.emails ?? []),
      ]);
      for (const field of model.fields) {
        if (field.kind !== "scalar" || field.type !== "String") continue;
        if (/^(customerId|shopifyCustomerId|email|customerEmail|recipientEmail|purchasedByEmail|purchasedByCustomerId|recipientCustomerId)$/.test(field.name) && !listed.has(field.name)) {
          unlisted.push(`${model.name}.${field.name}`);
        }
      }
    }
    expect(unlisted).toEqual([]);
  });

  it("only names columns that exist", () => {
    for (const [name, columns] of Object.entries(SHOPPER_COLUMNS)) {
      const fields = new Set(byName.get(name)?.fields.map((f) => f.name));
      for (const column of [...(columns.ids ?? []), ...(columns.emails ?? [])]) {
        expect(fields, `${name}.${column}`).toContain(column);
      }
    }
  });
});
