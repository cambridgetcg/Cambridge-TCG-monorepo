import { isRouteErrorResponse, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { SOMETHING_WRONG } from "./words";

const NOT_HERE = "This page isn't here.";

/**
 * What a merchant sees when a page fails (BOUNDARY-3, A21 concern 4). An
 * error the app didn't answer is one plain sentence, never React Router's
 * default page with the error's message and stack; the server's handleError
 * and the browser console still report it in full. A response Shopify's
 * library throws (a sign-in bounce) renders as its own boundary renders it;
 * one React Router makes itself (`internal`: a URL no route matches) gets
 * the app's words, never the router's message.
 * A page whose thing isn't there (a buyer, an order) says so inside the
 * admin, menu and all, with the way back to its list. No boundary here
 * rethrows: on the server a throw from a boundary would fail the whole page.
 */

/** The one sentence for an error the app didn't answer. */
export function PlainError() {
  return <p>{SOMETHING_WRONG}</p>;
}

/** A thrown response as Shopify's boundary renders it; a URL no route matches, and anything else, in plain words. */
export function adminError(error: unknown) {
  if (isRouteErrorResponse(error)) {
    // isRouteErrorResponse checks `internal` too; React Router's public type leaves it out
    if (!(error as { internal?: boolean }).internal) return boundary.error(error);
    if (error.status === 404) return <p>{NOT_HERE}</p>;
  }
  return <PlainError />;
}

/**
 * The ErrorBoundary of a page that shows one thing: a 404 says `sentence`
 * in an s-page inside the admin, with links back to `list`; any other error
 * as adminError.
 */
export function notFoundBoundary(sentence: string, list: { href: string; label: string }) {
  return function ErrorBoundary() {
    const error = useRouteError();
    if (!isRouteErrorResponse(error) || error.status !== 404) return adminError(error);
    return (
      <s-page heading="Not found" inlineSize="base">
        <s-link slot="breadcrumb-actions" href={list.href}>
          {list.label}
        </s-link>
        <s-section>
          <s-stack gap="small-200">
            <s-paragraph>{sentence}</s-paragraph>
            <s-link href={list.href}>Back to {list.label}</s-link>
          </s-stack>
        </s-section>
      </s-page>
    );
  };
}
