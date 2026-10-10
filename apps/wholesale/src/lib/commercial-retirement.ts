/** New paid acquisition is retired; existing order obligations keep their lifecycle. */
export const NEW_ORDERS_RETIRED = true;
export const NEW_ORDERS_RETIRED_MESSAGE =
  "New orders and quote requests are retired. Existing orders, payment arrangements, cancellation and support remain available.";
export const NEW_ORDERS_RETIRED_STATUS = 410;
export function newOrdersRetiredResult() {
  return { success: false as const, code: "NEW_ORDERS_RETIRED", error: NEW_ORDERS_RETIRED_MESSAGE };
}
