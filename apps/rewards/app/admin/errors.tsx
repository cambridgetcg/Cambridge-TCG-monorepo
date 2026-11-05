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
 * Inside the admin the sentence is Polaris, as the pages are (M3c-F1); at
 * the root, where Polaris may not be loaded, it is a plain paragraph.
 * A page whose thing isn't there (a buyer, an order) says so inside the
 * admin, menu and all, with the way back to its list. No boundary here
 * rethrows: on the server a throw from a boundary would fail the whole page.
 */

/** One sentence: in an s-page inside the admin, plain HTML at the root. */
function Sentence({ text, polaris }: { text: string; polaris: boolean }) {
  if (!polaris) return <p>{text}</p>;
  return (
    <s-page inlineSize="base">
      <s-section>
        <s-paragraph>{text}</s-paragraph>
      </s-section>
    </s-page>
  );
}

/**
 * A thrown response as Shopify's boundary renders it; a URL no route
 * matches, and anything else, in plain words: Polaris inside the admin
 * (`polaris`), plain HTML at the root.
 */
export function adminError(error: unknown, o: { polaris?: boolean } = {}) {
  const polaris = o.polaris ?? false;
  if (isRouteErrorResponse(error)) {
    // isRouteErrorResponse checks `internal` too; React Router's public type leaves it out
    if (!(error as { internal?: boolean }).internal) return boundary.error(error);
    if (error.status === 404) return <Sentence text={NOT_HERE} polaris={polaris} />;
  }
  return <Sentence text={SOMETHING_WRONG} polaris={polaris} />;
}

/**
 * The ErrorBoundary of a page that shows one thing: a 404 says `sentence`
 * in an s-page inside the admin, with links back to `list`; any other error
 * as adminError, in Polaris.
 */
export function notFoundBoundary(sentence: string, list: { href: string; label: string }) {
  return function ErrorBoundary() {
    const error = useRouteError();
    if (!isRouteErrorResponse(error) || error.status !== 404) return adminError(error, { polaris: true });
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
