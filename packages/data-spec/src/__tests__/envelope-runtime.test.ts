import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { ENVELOPE_SCHEMA, META_SCHEMA } from "../index";
import { envelope } from "../../../../apps/storefront/src/lib/data-pantry/envelope";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
ajv.addSchema(META_SCHEMA);
const validate = ajv.compile(ENVELOPE_SCHEMA);

describe("public envelope schema against emitted bytes", () => {
  it("resolves the metadata reference and accepts existing additive runtime extensions", () => {
    const body = envelope({ data: { amount: "12.34", currency: "EUR" }, endpoint: "/test",
      sources: ["fixture"], freshness: "catalog", request_id: "req_contract_fixture",
      extra_meta: { price_rights: "fixture; no publication grant" } });
    const wire = JSON.parse(JSON.stringify(body));
    expect(validate(wire), JSON.stringify(validate.errors)).toBe(true);
    expect(wire._meta.price_rights).toBe("fixture; no publication grant");
  });
  it("still rejects missing or malformed core metadata", () => {
    const body = envelope({ data: null, endpoint: "/test", sources: [], freshness: "catalog" });
    expect(validate({ ...body, _meta: { ...body._meta, freshness_seconds: "daily" } })).toBe(false);
    const { sources: _sources, ...incomplete } = body._meta;
    expect(validate({ ...body, _meta: incomplete })).toBe(false);
  });
});
