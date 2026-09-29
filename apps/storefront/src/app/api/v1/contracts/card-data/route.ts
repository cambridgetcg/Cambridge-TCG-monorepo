import { CARD_DATA_CONTRACT } from "@/lib/contracts/card-data";
import { jsonResponse } from "@/lib/data-pantry";

/** Static contracts; no catalogue lookup, account read or provider operation. */
export function GET() {
  return jsonResponse({
    data: CARD_DATA_CONTRACT,
    endpoint: "/api/v1/contracts/card-data",
    sources: ["sku_contract", "data_spec"],
    freshness: "methodology",
    as_of: "2026-09-29T00:00:00.000Z",
    license: "NOASSERTION",
  });
}
