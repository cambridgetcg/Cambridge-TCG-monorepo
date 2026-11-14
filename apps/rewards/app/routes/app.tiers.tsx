import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { formatMoney } from "~/admin/format";
import { PASS_FOLLOW_MS, usePolling } from "~/admin/polling";
import { requireMerchant } from "~/admin/require-merchant.server";
import { useReviewAfterSave } from "~/admin/review-request";
import { CASHBACK_BASE, TIER_WINDOW_LABEL } from "~/admin/words";
import type { ConnectionContext } from "~/lib/merchant.server";
import { reviewRequestDue } from "~/lib/stats.server";
import {
  TIER_ERRORS,
  TIER_NAME_MAX,
  type TierErrors,
  type TierWindow,
  deleteTier,
  isDeadlock,
  requestTierPass,
  saveTier,
  setTierWindow,
  tierPassPending,
  tierTable,
} from "~/lib/tiers.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { syncWidgetConfig } from "~/shopify/widget-config.server";

/**
 * Tiers (spec 4.5): the table (name, minimum spend, cashback, members), add,
 * edit and delete, the shop-wide "Spend counted over" choice and the line on
 * what cashback is paid on. A change that can move buyers (a new minimum, a
 * tier added or deleted, a new window) asks for a tier pass
 * (tierPassRequestedAt, then 25 s of it after the response; the nightly pass
 * finishes the rest, Ruling 77); until it has reached every buyer the page
 * says buyers are moving and reloads its data (Ruling 76). Every change
 * rewrites the widget's settings. The page follows a pending pass for two
 * minutes from its load and from each change made here, then keeps the
 * banner without reloading until the next load (Ruling 82). Each control
 * posts one change at a time, and an edit says which version of the tier it
 * was made on (CONCURRENCY-3).
 *
 * Built for Shopify 4.1.5 and 4.1.6: a tier is added or edited in a modal
 * whose Save and Cancel sit in its primary-action and secondary-actions
 * slots, as the Delete modal's do; it stays open, with the action's errors
 * beside their fields, until the save is taken. The "Spend counted over"
 * choice is the page's one setting: a new choice is held until the merchant
 * saves it from App Bridge's save bar (`ui-save-bar`, shown and hidden with
 * `shopify.saveBar`), which the admin keeps up, and won't let them leave
 * past, until it is saved or discarded. The bar is driven from the page's own
 * state rather than a `data-save-bar` form, because App Bridge hides a form's
 * bar on submit, before the action answers, and a refused save would then
 * leave unsaved changes with no bar.
 * The modal opens with Name focused, and after a delete focus goes to Add
 * tier, since the row it came from is gone (DESIGN-14).
 */

const DELETE_MODAL = "delete-tier";
const TIER_MODAL = "tier-form";
const SAVE_BAR = "tier-window-save-bar";
/** What "Spend counted over" decides (Built for Shopify 4.2.1). */
const WINDOW_DETAILS = "Which of a buyer's orders count toward their tier.";
/** How often the page reloads its data while buyers are moving to their new tiers. */
const MOVING_POLL_MS = 10_000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { conn } = await requireMerchant(request);
  const [tiers, moving, reviewDue] = await Promise.all([
    tierTable(conn.merchantId),
    tierPassPending(conn.connectionId),
    reviewRequestDue(conn.merchantId, new Date()),
  ]);
  return {
    currency: conn.currency,
    // Asked only after a tier is saved (admin/review-request.ts, #173)
    reviewDue,
    tierWindow: conn.tierWindow,
    nameMax: TIER_NAME_MAX,
    // A requested tier pass hasn't reached every buyer yet (TRUTH-10)
    moving,
    // For a tier being edited that another tab deleted (A20-F4)
    goneError: TIER_ERRORS.gone,
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      minSpend: t.minSpend.toFixed(),
      percent: t.cashbackPercent.toFixed(),
      members: t.members,
      lowest: t.lowest,
      version: t.version,
    })),
  };
};

type ActionResult = { ok: true } | { ok: false; errors: TierErrors };

/**
 * After any change: re-place buyers when it can move them (Ruling 77), then
 * tell the widget (if Shopify can't take it now, the nightly run does).
 */
async function afterChange(admin: GraphqlClient, conn: ConnectionContext, movesBuyers: boolean): Promise<void> {
  if (movesBuyers) await requestTierPass(conn.connectionId);
  try {
    await syncWidgetConfig(admin, conn);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error(`[tiers] Could not update the widget's settings for ${conn.shop}: ${messageOf(error)}`);
  }
}

/**
 * Delete a tier, once more when Postgres aborted it to break a deadlock (a
 * resolve of one of its members, Ruling 61): the transaction changed
 * nothing, so trying again is safe. A second deadlock is the form's plain
 * error, with nothing changed (M3b-F5).
 */
async function deleteRetried(merchantId: string, tierId: string): Promise<Awaited<ReturnType<typeof deleteTier>> | { ok: false; reason: "busy" }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await deleteTier(merchantId, tierId);
    } catch (error) {
      if (!isDeadlock(error)) throw error;
      if (attempt === 2) {
        console.warn(`[tiers] Deleting tier ${tierId} deadlocked twice; the merchant can try again: ${messageOf(error)}`);
        return { ok: false, reason: "busy" };
      }
    }
  }
}

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const form = await request.formData();

  switch (form.get("intent")) {
    case "save": {
      const id = field(form, "id");
      const saved = await saveTier(conn.merchantId, {
        id: id ? id : null,
        name: field(form, "name"),
        minSpend: field(form, "minSpend"),
        percent: field(form, "percent"),
        // The version the edit was made on; an edit that names none is refused
        version: field(form, "version"),
      });
      if (!saved.ok) return { ok: false, errors: saved.errors } satisfies ActionResult;
      await afterChange(admin, conn, saved.movesBuyers);
      return { ok: true } satisfies ActionResult;
    }
    case "delete": {
      const deleted = await deleteRetried(conn.merchantId, field(form, "id") ?? "");
      if (!deleted.ok) return { ok: false, errors: { form: TIER_ERRORS[deleted.reason] } } satisfies ActionResult;
      await afterChange(admin, conn, true);
      return { ok: true } satisfies ActionResult;
    }
    case "window": {
      const tierWindow = field(form, "tierWindow");
      if (tierWindow !== "rolling_12_months" && tierWindow !== "lifetime") {
        return data({ ok: false, errors: { form: "Unknown window." } } satisfies ActionResult, { status: 400 });
      }
      const changed = await setTierWindow(conn.merchantId, tierWindow);
      await afterChange(admin, conn, changed);
      return { ok: true } satisfies ActionResult;
    }
    default:
      return data({ ok: false, errors: { form: "Unknown action." } } satisfies ActionResult, { status: 400 });
  }
};

type TierView = ReturnType<typeof useLoaderData<typeof loader>>["tiers"][number];

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const errorsOf = (result: ActionResult | undefined): TierErrors => (result && !result.ok ? result.errors : {});

const EMPTY = { name: "", minSpend: "", percent: "" };

const isTierWindow = (value: string | undefined): value is TierWindow => value !== undefined && Object.hasOwn(TIER_WINDOW_LABEL, value);

/** What a delete does to the tier's buyers. */
function deleteSentence(tier: TierView): string {
  const locks = `Buyers locked to ${tier.name} go back to automatic.`;
  if (tier.members === 0) return `No buyers are in ${tier.name}. ${locks}`;
  return `${count(tier.members, "member moves", "members move")} to the tier their spend qualifies for. ${locks}`;
}

export default function Tiers() {
  const d = useLoaderData<typeof loader>();
  const saveFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const windowFetcher = useFetcher<typeof action>();
  const modal = useRef<HTMLElementTagNameMap["s-modal"]>(null);
  const tierModal = useRef<HTMLElementTagNameMap["s-modal"]>(null);
  const addButton = useRef<HTMLElementTagNameMap["s-button"]>(null);
  const nameField = useRef<HTMLElementTagNameMap["s-text-field"]>(null);
  // The tier this tab deleted, which the edit form then lets go of quietly
  const deletedHere = useRef<string | null>(null);
  // A delete is done: once the modal has closed, focus goes to Add tier
  const focusAfterDelete = useRef(false);
  // Each change made here, which asks for a new pass to follow
  const [changes, setChanges] = useState(0);
  // While buyers are moving to their new tiers (Ruling 76), for two minutes from the load or the last change (Ruling 82)
  usePolling(d.moving, MOVING_POLL_MS, { forMs: PASS_FOLLOW_MS, restartKey: changes });
  useReviewAfterSave(d.reviewDue, saveFetcher, saveFetcher.data?.ok === true);

  // The tier being edited, or null while adding one
  const [editingId, setEditingId] = useState<string | null>(null);
  // The version the edit was opened on, taken with its fields: a reload while
  // editing brings the tier's newest version but keeps these fields, so the
  // save names this one and a change made elsewhere is caught (M3b-F1)
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<TierErrors>({});
  const [deleting, setDeleting] = useState<TierView | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The window chosen here and not saved yet; null while the saved one shows,
  // so a reload that brings another tab's choice is shown, not held against it
  const [chosenWindow, setChosenWindow] = useState<TierWindow | null>(null);

  const editing = d.tiers.find((t) => t.id === editingId) ?? null;
  // The first tier, and the lowest when edited, start at 0
  const minFixed = d.tiers.length === 0 || Boolean(editing?.lowest);
  const money = (amount: string) => formatMoney(amount, d.currency);
  const saving = saveFetcher.state !== "idle";

  const tierWindow = chosenWindow ?? d.tierWindow;
  const windowUnsaved = chosenWindow !== null && chosenWindow !== d.tierWindow;
  const windowError = windowUnsaved ? errorsOf(windowFetcher.data).form : undefined;
  // One window change at a time, so the last one chosen is the one kept (CONCURRENCY-2)
  const windowBusy = windowFetcher.state !== "idle";

  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
    // Taken: the modal closes. Its fields are set afresh each time it opens,
    // so they don't change under it while it fades
    if (saveFetcher.data.ok) {
      tierModal.current?.hideOverlay?.();
      setChanges((n) => n + 1);
    }
    setErrors(errorsOf(saveFetcher.data));
  }, [saveFetcher.state, saveFetcher.data]);

  useEffect(() => {
    if (deleteFetcher.state !== "idle" || !deleteFetcher.data) return;
    if (deleteFetcher.data.ok) {
      focusAfterDelete.current = true;
      modal.current?.hideOverlay?.();
      setChanges((n) => n + 1);
    } else deletedHere.current = null;
    setDeleteError(errorsOf(deleteFetcher.data).form ?? null);
  }, [deleteFetcher.state, deleteFetcher.data]);

  // Saved and reloaded: the page shows the saved window again, and the bar goes
  useEffect(() => {
    if (windowFetcher.state !== "idle" || !windowFetcher.data?.ok) return;
    setChosenWindow(null);
    setChanges((n) => n + 1);
  }, [windowFetcher.state, windowFetcher.data]);

  // The save bar is up exactly while a window is chosen and not saved. While
  // it is up, the admin stops the merchant leaving (its menu, the app's own
  // links, a reload) until they save or discard. Without App Bridge (a test)
  // there is no bar.
  useEffect(() => {
    if (typeof shopify === "undefined" || typeof shopify.saveBar?.show !== "function") return;
    (windowUnsaved ? shopify.saveBar.show(SAVE_BAR) : shopify.saveBar.hide(SAVE_BAR)).catch(() => {});
  }, [windowUnsaved]);

  // Listened for directly: React 19 would listen for "AfterHide", not the element's "afterhide"
  useEffect(() => {
    const element = modal.current;
    if (!element) return;
    const afterHide = () => {
      if (!focusAfterDelete.current) return;
      focusAfterDelete.current = false;
      addButton.current?.focus();
    };
    element.addEventListener("afterhide", afterHide);
    return () => element.removeEventListener("afterhide", afterHide);
  }, []);

  // The form opens ready to type in
  useEffect(() => {
    const element = tierModal.current;
    if (!element) return;
    const afterShow = () => nameField.current?.focus();
    element.addEventListener("aftershow", afterShow);
    return () => element.removeEventListener("aftershow", afterShow);
  }, []);

  // The tier being edited is gone (deleted in another tab): say so and start
  // over, so Save can't bring it back as a new tier (A20-F4)
  useEffect(() => {
    if (editingId === null || editing) return;
    setEditingId(null);
    setEditingVersion(null);
    setValues(EMPTY);
    setErrors(deletedHere.current === editingId ? {} : { form: d.goneError });
  }, [editingId, editing, d.goneError]);

  // Each opening of the modal starts from the tier chosen, or from nothing
  const startAdd = () => {
    setEditingId(null);
    setEditingVersion(null);
    setValues(EMPTY);
    setErrors({});
  };
  const startEdit = (tier: TierView) => {
    setEditingId(tier.id);
    setEditingVersion(tier.version);
    setValues({ name: tier.name, minSpend: tier.minSpend, percent: tier.percent });
    setErrors({});
  };
  const save = () => {
    if (saving) return;
    saveFetcher.submit(
      {
        intent: "save",
        id: editing?.id ?? "",
        name: values.name,
        percent: values.percent,
        ...(minFixed ? {} : { minSpend: values.minSpend }),
        // The version this edit was made on (CONCURRENCY-3)
        ...(editing && editingVersion !== null ? { version: editingVersion } : {}),
      },
      { method: "post" },
    );
  };

  const saveWindow = () => {
    if (chosenWindow === null || chosenWindow === d.tierWindow || windowBusy) return;
    windowFetcher.submit({ intent: "window", tierWindow: chosenWindow }, { method: "post" });
  };
  const discardWindow = () => {
    if (!windowBusy) setChosenWindow(null);
  };

  return (
    <s-page heading="Tiers" inlineSize="base">
      {/* App Bridge's contextual save bar: the admin shows its own Save and
          Discard, which click these (Built for Shopify 4.1.5) */}
      <ui-save-bar id={SAVE_BAR}>
        <button variant="primary" disabled={windowBusy} loading={windowBusy ? "" : undefined} onClick={saveWindow}>
          Save
        </button>
        <button disabled={windowBusy} onClick={discardWindow}>
          Discard
        </button>
      </ui-save-bar>
      {/* The page's banners in one stack, as on Home (M3d-F6) */}
      {d.moving ? (
        <s-stack slot="supplemental-start" gap="base">
          <s-banner tone="info">Buyers are moving to their new tiers.</s-banner>
        </s-stack>
      ) : null}
      <s-section>
        <s-stack gap="base">
          {d.tiers.length === 0 ? (
            <s-text color="subdued">No tiers yet. Add your first one; everyone starts there.</s-text>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Name</s-table-header>
                <s-table-header listSlot="secondary" format="currency">
                  Minimum spend
                </s-table-header>
                <s-table-header format="numeric">Cashback</s-table-header>
                <s-table-header format="numeric">Members</s-table-header>
                {/* Inline on a phone's list, so no "Actions" label shows beside each tier */}
                <s-table-header listSlot="inline">
                  <s-text accessibilityVisibility="exclusive">Actions</s-text>
                </s-table-header>
              </s-table-header-row>
              <s-table-body>
                {d.tiers.map((tier) => (
                  <s-table-row key={tier.id}>
                    <s-table-cell>{tier.name}</s-table-cell>
                    <s-table-cell>
                      {tier.lowest ? (
                        <s-stack gap="small-300">
                          <s-text>{money(tier.minSpend)}</s-text>
                          <s-text color="subdued">Everyone starts here</s-text>
                        </s-stack>
                      ) : (
                        money(tier.minSpend)
                      )}
                    </s-table-cell>
                    <s-table-cell>{tier.percent}%</s-table-cell>
                    <s-table-cell>{count(tier.members, "member", "members")}</s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-200" justifyContent="end">
                        <s-button
                          variant="tertiary"
                          accessibilityLabel={`Edit ${tier.name}`}
                          commandFor={TIER_MODAL}
                          command="--show"
                          onClick={() => startEdit(tier)}
                        >
                          Edit
                        </s-button>
                        {tier.lowest ? null : (
                          <s-button
                            variant="tertiary"
                            tone="critical"
                            accessibilityLabel={`Delete ${tier.name}`}
                            commandFor={DELETE_MODAL}
                            command="--show"
                            onClick={() => {
                              setDeleting(tier);
                              setDeleteError(null);
                            }}
                          >
                            Delete
                          </s-button>
                        )}
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
          <s-paragraph color="subdued">{CASHBACK_BASE}</s-paragraph>
          <s-stack direction="inline">
            <s-button ref={addButton} commandFor={TIER_MODAL} command="--show" onClick={startAdd}>
              Add tier
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Spend counted over">
        <s-stack gap="base">
          <s-choice-list
            label="Spend counted over"
            labelAccessibilityVisibility="exclusive"
            name="tierWindow"
            details={WINDOW_DETAILS}
            error={windowError}
            disabled={windowBusy}
            onChange={(event) => {
              // Held until the save bar's Save (Built for Shopify 4.1.5)
              const [chosen] = event.currentTarget.values;
              if (windowBusy || !isTierWindow(chosen)) return;
              setChosenWindow(chosen === d.tierWindow ? null : chosen);
            }}
          >
            {(Object.keys(TIER_WINDOW_LABEL) as TierWindow[]).map((key) => (
              <s-choice key={key} value={key} selected={key === tierWindow}>
                {TIER_WINDOW_LABEL[key]}
              </s-choice>
            ))}
          </s-choice-list>
          <s-text color="subdued">After you save a change, buyers move to their new tiers. In a large store some move overnight.</s-text>
        </s-stack>
      </s-section>

      <s-modal id={TIER_MODAL} ref={tierModal} heading={editing ? `Edit ${editing.name}` : "Add a tier"}>
        <s-stack gap="base">
          <s-text-field
            ref={nameField}
            label="Name"
            name="name"
            maxLength={d.nameMax}
            value={values.name}
            error={errors.name}
            onInput={(event) => setValues({ ...values, name: event.currentTarget.value })}
          />
          {minFixed ? (
            <s-stack gap="small-300">
              <s-text>Minimum spend: {money("0")}</s-text>
              <s-text color="subdued">Everyone starts here</s-text>
            </s-stack>
          ) : (
            // Polaris's money field (DESIGN-18); it has no step, so whole amounts are the action's rule
            <s-money-field
              label="Minimum spend"
              name="minSpend"
              currencyCode={d.currency as HTMLElementTagNameMap["s-money-field"]["currencyCode"]}
              min={0}
              value={values.minSpend}
              error={errors.minSpend}
              details="Buyers reach this tier once they spend this much. Whole amounts only."
              onInput={(event) => setValues({ ...values, minSpend: event.currentTarget.value })}
            />
          )}
          {/* What the percent is of, in Home's words (Built for Shopify 4.2.1) */}
          <s-number-field
            label="Cashback"
            name="percent"
            suffix="%"
            min={0}
            max={100}
            step={1}
            value={values.percent}
            error={errors.percent}
            details={CASHBACK_BASE}
            onInput={(event) => setValues({ ...values, percent: event.currentTarget.value })}
          />
          {errors.form ? <s-text tone="critical">{errors.form}</s-text> : null}
        </s-stack>
        <s-button slot="primary-action" variant="primary" loading={saving} onClick={save}>
          {editing ? "Save" : "Add tier"}
        </s-button>
        <s-button slot="secondary-actions" commandFor={TIER_MODAL} command="--hide">
          Cancel
        </s-button>
      </s-modal>

      <s-modal id={DELETE_MODAL} ref={modal} heading={deleting ? `Delete ${deleting.name}?` : "Delete tier?"}>
        <s-stack gap="base">
          <s-paragraph>
            {deleting ? deleteSentence(deleting) : null}
          </s-paragraph>
          {deleteError ? <s-text tone="critical">{deleteError}</s-text> : null}
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          loading={deleteFetcher.state !== "idle"}
          onClick={() => {
            if (!deleting || deleteFetcher.state !== "idle") return;
            deletedHere.current = deleting.id;
            deleteFetcher.submit({ intent: "delete", id: deleting.id }, { method: "post" });
          }}
        >
          Delete tier
        </s-button>
        <s-button slot="secondary-actions" commandFor={DELETE_MODAL} command="--hide">
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
