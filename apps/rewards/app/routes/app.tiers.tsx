import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { formatMoney } from "~/admin/format";
import { requireMerchant } from "~/admin/require-merchant.server";
import type { ConnectionContext } from "~/lib/merchant.server";
import {
  TIER_ERRORS,
  TIER_NAME_MAX,
  type TierErrors,
  type TierWindow,
  deleteTier,
  requestTierPass,
  saveTier,
  setTierWindow,
  tierTable,
} from "~/lib/tiers.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { syncWidgetConfig } from "~/shopify/widget-config.server";

/**
 * Tiers (spec 4.5): the table (name, minimum spend, cashback, members), add,
 * edit and delete, the shop-wide "Spend counted over" choice and the line on
 * what cashback is paid on. Every save, delete or window change asks for a
 * tier pass (tierPassRequestedAt, then 25 s of it after the response; the
 * nightly pass finishes the rest) and rewrites the widget's settings.
 */

const DELETE_MODAL = "delete-tier";
const WINDOWS: Record<TierWindow, string> = { rolling_12_months: "Last 12 months", lifetime: "All time" };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { conn } = await requireMerchant(request);
  const tiers = await tierTable(conn.merchantId);
  return {
    currency: conn.currency,
    tierWindow: conn.tierWindow,
    nameMax: TIER_NAME_MAX,
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      minSpend: t.minSpend.toFixed(),
      percent: t.cashbackPercent.toFixed(),
      members: t.members,
      lowest: t.lowest,
    })),
  };
};

type ActionResult = { ok: true } | { ok: false; errors: TierErrors };

/** After any change: re-place buyers, then tell the widget (if Shopify can't take it now, the nightly run does). */
async function afterChange(admin: GraphqlClient, conn: ConnectionContext): Promise<void> {
  await requestTierPass(conn.connectionId);
  try {
    await syncWidgetConfig(admin, conn);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error(`[tiers] Could not update the widget's settings for ${conn.shop}: ${messageOf(error)}`);
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
      });
      if (!saved.ok) return { ok: false, errors: saved.errors } satisfies ActionResult;
      await afterChange(admin, conn);
      return { ok: true } satisfies ActionResult;
    }
    case "delete": {
      const deleted = await deleteTier(conn.merchantId, field(form, "id") ?? "");
      if (!deleted.ok) return { ok: false, errors: { form: TIER_ERRORS[deleted.reason] } } satisfies ActionResult;
      await afterChange(admin, conn);
      return { ok: true } satisfies ActionResult;
    }
    case "window": {
      const tierWindow = field(form, "tierWindow");
      if (tierWindow !== "rolling_12_months" && tierWindow !== "lifetime") {
        return data({ ok: false, errors: { form: "Unknown window." } } satisfies ActionResult, { status: 400 });
      }
      await setTierWindow(conn.merchantId, tierWindow);
      await afterChange(admin, conn);
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

  // The tier being edited, or null while adding one
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<TierErrors>({});
  const [deleting, setDeleting] = useState<TierView | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const editing = d.tiers.find((t) => t.id === editingId) ?? null;
  // The first tier, and the lowest when edited, start at 0
  const minFixed = d.tiers.length === 0 || Boolean(editing?.lowest);
  const money = (amount: string) => formatMoney(amount, d.currency);

  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
    if (saveFetcher.data.ok) {
      setEditingId(null);
      setValues(EMPTY);
    }
    setErrors(errorsOf(saveFetcher.data));
  }, [saveFetcher.state, saveFetcher.data]);

  useEffect(() => {
    if (deleteFetcher.state !== "idle" || !deleteFetcher.data) return;
    if (deleteFetcher.data.ok) modal.current?.hideOverlay();
    setDeleteError(errorsOf(deleteFetcher.data).form ?? null);
  }, [deleteFetcher.state, deleteFetcher.data]);

  const startEdit = (tier: TierView) => {
    setEditingId(tier.id);
    setValues({ name: tier.name, minSpend: tier.minSpend, percent: tier.percent });
    setErrors({});
  };
  const cancelEdit = () => {
    setEditingId(null);
    setValues(EMPTY);
    setErrors({});
  };
  const save = () =>
    saveFetcher.submit(
      { intent: "save", id: editing?.id ?? "", name: values.name, percent: values.percent, ...(minFixed ? {} : { minSpend: values.minSpend }) },
      { method: "post" },
    );

  const pendingWindow = windowFetcher.formData?.get("tierWindow");
  const tierWindow = typeof pendingWindow === "string" ? pendingWindow : d.tierWindow;
  const windowError = errorsOf(windowFetcher.data).form;

  return (
    <s-page heading="Tiers" inlineSize="base">
      <s-section>
        <s-stack gap="base">
          {d.tiers.length === 0 ? (
            <s-text color="subdued">No tiers yet. Add your first one below; everyone starts there.</s-text>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Name</s-table-header>
                <s-table-header listSlot="secondary" format="currency">
                  Minimum spend
                </s-table-header>
                <s-table-header format="numeric">Cashback</s-table-header>
                <s-table-header format="numeric">Members</s-table-header>
                <s-table-header>
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
                        <s-button variant="tertiary" accessibilityLabel={`Edit ${tier.name}`} onClick={() => startEdit(tier)}>
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
          <s-paragraph color="subdued">
            Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns
            nothing.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading={editing ? `Edit ${editing.name}` : "Add a tier"}>
        <s-stack gap="base">
          <s-text-field
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
            <s-number-field
              label="Minimum spend"
              name="minSpend"
              suffix={d.currency}
              min={0}
              step={1}
              value={values.minSpend}
              error={errors.minSpend}
              details="Buyers reach this tier once they spend this much. Whole amounts only."
              onInput={(event) => setValues({ ...values, minSpend: event.currentTarget.value })}
            />
          )}
          <s-number-field
            label="Cashback"
            name="percent"
            suffix="%"
            min={0}
            max={100}
            step={1}
            value={values.percent}
            error={errors.percent}
            onInput={(event) => setValues({ ...values, percent: event.currentTarget.value })}
          />
          {errors.form ? <s-text tone="critical">{errors.form}</s-text> : null}
          <s-stack direction="inline" gap="small-200">
            <s-button variant="primary" loading={saveFetcher.state !== "idle"} onClick={save}>
              {editing ? "Save" : "Add tier"}
            </s-button>
            {editing ? <s-button onClick={cancelEdit}>Cancel</s-button> : null}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Spend counted over">
        <s-stack gap="base">
          <s-choice-list
            label="Spend counted over"
            labelAccessibilityVisibility="exclusive"
            name="tierWindow"
            error={windowError}
            onChange={(event) => {
              const [chosen] = event.currentTarget.values;
              if (chosen && chosen !== tierWindow) windowFetcher.submit({ intent: "window", tierWindow: chosen }, { method: "post" });
            }}
          >
            {(Object.keys(WINDOWS) as TierWindow[]).map((key) => (
              <s-choice key={key} value={key} selected={key === tierWindow}>
                {WINDOWS[key]}
              </s-choice>
            ))}
          </s-choice-list>
          <s-text color="subdued">After a change, buyers move to their new tiers. In a large store some move overnight.</s-text>
        </s-stack>
      </s-section>

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
          onClick={() => deleting && deleteFetcher.submit({ intent: "delete", id: deleting.id }, { method: "post" })}
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
