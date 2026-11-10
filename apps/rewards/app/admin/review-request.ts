import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { reviewWasShown } from "./home-rules";

/** Home's action, which records what Shopify answered (intent review-shown). */
const RECORD_ACTION = "/app?index";

/**
 * Shopify's review modal (`shopify.reviews.request()`), asked for only right
 * after a save the merchant made here has succeeded and the page shows it
 * saved, while the request is due (lib/stats.server.ts reviewDue), at most
 * once each time the page is opened (#173). Never from a page load, a timer,
 * a banner or the review card's own link.
 *
 * Shopify's Reviews API page: "It's better to request a review at the end of
 * a successful workflow than when a merchant first opens your app, or at any
 * point that interrupts their task. Don't trigger a request with a merchant
 * action, as rate-limiting might prevent the modal from displaying, making
 * your app appear to be broken." Its use cases: "Request an app review modal
 * at strategic moments like after a successful merchant action." The save
 * has already answered on the page, so a modal Shopify holds back leaves
 * nothing looking broken.
 *
 * `save` is the fetcher that saved: each answer is a new `data` object, so a
 * save is acted on once, when the fetcher is idle again (its revalidation
 * done). `succeeded` says whether that save is one to follow, from the page's
 * data as it now stands. An answer the page already had when it opened is
 * never a save.
 */
export function useReviewAfterSave(due: boolean, save: { state: string; data: unknown }, succeeded: boolean): void {
  const recordFetcher = useFetcher();
  const record = recordFetcher.submit;
  const handled = useRef(save.data);
  const asked = useRef(false);

  useEffect(() => {
    if (save.state !== "idle" || save.data === handled.current) return;
    handled.current = save.data;
    if (!succeeded || !due || asked.current) return;
    if (typeof shopify === "undefined" || typeof shopify.reviews?.request !== "function") return;
    asked.current = true;
    shopify.reviews.request().then(
      (result) => {
        // Any other answer (a cooldown, say) leaves it for a later save
        if (reviewWasShown(result.code)) void record({ intent: "review-shown", code: result.code }, { method: "post", action: RECORD_ACTION });
      },
      () => {},
    );
  }, [save.state, save.data, succeeded, due, record]);
}
