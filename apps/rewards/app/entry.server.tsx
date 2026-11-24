import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { type EntryContext } from "react-router";
import { isbot } from "isbot";
import * as Sentry from "@sentry/react-router";
import { sentryOptions } from "./lib/telemetry.server";
import { addDocumentResponseHeaders } from "./shopify.server";

// Sentry, off without SENTRY_DSN. Every event and transaction passes
// scrubEvent first (sentryOptions): no request query strings (the app
// proxy's signed buyer id), cookies or bodies, no request header outside its
// allow-list (so no location or client address), and no credentials or email
// addresses, leave the app.
if (process.env.SENTRY_DSN && !Sentry.isInitialized()) {
  Sentry.init(sentryOptions(process.env.SENTRY_DSN, process.env.VERCEL_ENV ?? process.env.NODE_ENV));
}

// Loader, action and render errors reach Sentry (through beforeSend) and the log.
export { handleError } from "./handle-error.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      }
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
