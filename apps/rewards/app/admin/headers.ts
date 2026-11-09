import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

/**
 * The headers of a page that shows buyers' names or balances (BOUNDARY-2):
 * Shopify's boundary headers, which keep the headers of a response the
 * library throws, plus `Cache-Control: private, no-store`, so neither the
 * browser's disk cache nor a shared cache keeps the page or its data
 * request, as the downloads and the membership answer already ask.
 */
export const privatePageHeaders: HeadersFunction = (args) => {
  const headers = new Headers(boundary.headers(args));
  headers.set("Cache-Control", "private, no-store");
  return headers;
};
