// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEY_EXPIRY_NEVER_WARNING, keyExpiryDateRange } from "@/lib/agents/key-expiry";

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn() },
  createAgent: vi.fn(),
  mintKey: vi.fn(),
  revokeKey: vi.fn(),
  archiveAgent: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/agents/operator-actions", () => ({
  createAgent: mocks.createAgent,
  mintKey: mocks.mintKey,
  revokeKey: mocks.revokeKey,
  archiveAgent: mocks.archiveAgent,
}));
vi.mock("@/lib/agents/signing-key-actions", () => ({
  bindSigningKey: vi.fn(),
  removeSigningKey: vi.fn(),
  listSigningKeys: vi.fn(),
}));

import { AgentsClient } from "./_client";
import type { AgentRow } from "./page";

const HOLD_NOTE = "Copy or dismiss the key above first.";
// Placeholder-shaped tokens, built at runtime.
const tokenA = "ctcg_agt_" + "a".repeat(22);
const tokenB = "ctcg_agt_" + "b".repeat(22);
const EXPIRES = "2027-02-08T09:14:02.000Z";

function agent(id: string, handle: string): AgentRow {
  return {
    id,
    public_handle: handle,
    display_name: handle,
    model_tag: "example-model",
    description: null,
    rating: 1500,
    rating_deviation: 350,
    matches_played: 0,
    matches_won: 0,
    status: "active",
    suspended_reason: null,
    registered_via: "operator",
    created_at: "2026-10-29T10:00:00Z",
  };
}

function minted(token: string, keyExpiresAt: string | null = EXPIRES) {
  return { ok: true, data: { key_id: "k1", token, key_prefix: token.slice(0, 12), key_expires_at: keyExpiresAt } };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  // Minting no longer asks through a prompt; a call would be a regression.
  vi.spyOn(window, "prompt").mockImplementation(() => {
    throw new Error("window.prompt was called");
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const buttons = (label: string) =>
  Array.from(container.querySelectorAll("button")).filter((b) => b.textContent?.trim() === label);
const button = (label: string) => {
  const [found] = buttons(label);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
};
const createForm = () => {
  const form = Array.from(container.querySelectorAll("form")).find((f) => f.querySelector('[name="public_handle"]'));
  if (!form) throw new Error("no create form");
  return form;
};
const mintForms = () => Array.from(container.querySelectorAll<HTMLFormElement>('form[aria-label^="Mint a key"]'));
const mintForm = () => {
  const [found] = mintForms();
  if (!found) throw new Error("no mint form");
  return found;
};
const expirySelect = (form: HTMLFormElement) => form.querySelector<HTMLSelectElement>('select[name="key_expiry_choice"]')!;

/** Fills the create form's required fields so HTML validation passes. */
function fill(form: HTMLFormElement) {
  for (const [name, value] of [["public_handle", "first-agent"], ["display_name", "First"], ["model_tag", "example-model"]]) {
    form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value;
  }
  expect(form.checkValidity()).toBe(true);
}

/** Picks an expiry the way a person does: the select's change event. */
async function choose(form: HTMLFormElement, value: string) {
  const select = expirySelect(form);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("/account/agents fresh key card", () => {
  it("holds create and mint while a key is on screen, so no second key can replace it", async () => {
    mocks.mintKey.mockResolvedValue(minted(tokenA));
    await act(async () =>
      root.render(<AgentsClient agents={[agent("a1", "first-agent"), agent("a2", "second-agent")]} keys={[]} />),
    );
    expect(container.textContent).not.toContain(HOLD_NOTE);
    expect(buttons("+ mint key").map((b) => b.disabled)).toEqual([false, false]);

    // The button opens a form; nothing is minted until it is submitted.
    await act(async () => button("+ mint key").click());
    expect(mocks.mintKey).not.toHaveBeenCalled();
    await act(async () => mintForm().requestSubmit());

    expect(mocks.mintKey).toHaveBeenCalledWith({ agent_id: "a1", name: "", key_expiry: "90d" });
    expect(container.textContent).toContain(tokenA);
    expect(container.textContent).toContain(HOLD_NOTE);
    expect(mintForms()).toHaveLength(0);
    expect(buttons("+ mint key").map((b) => b.disabled)).toEqual([true, true]);
    expect(button("+ new agent").disabled).toBe(true);

    // A second mint does nothing while the first key is up.
    mocks.mintKey.mockResolvedValue(minted(tokenB));
    await act(async () => buttons("+ mint key")[1].click());
    expect(mintForms()).toHaveLength(0);
    expect(mocks.mintKey).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(tokenA);
    expect(container.textContent).not.toContain(tokenB);
    expect(mocks.router.refresh).not.toHaveBeenCalled();

    await act(async () => button("dismiss").click());

    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain(tokenA);
    expect(container.textContent).not.toContain(HOLD_NOTE);
    expect(buttons("+ mint key").map((b) => b.disabled)).toEqual([false, false]);
    expect(button("+ new agent").disabled).toBe(false);
  });

  it("an open create form cannot submit while a minted key is on screen", async () => {
    mocks.mintKey.mockResolvedValue(minted(tokenA));
    await act(async () => root.render(<AgentsClient agents={[agent("a1", "first-agent")]} keys={[]} />));
    await act(async () => button("+ new agent").click());
    await act(async () => button("+ mint key").click());
    await act(async () => mintForm().requestSubmit());

    const form = createForm();
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);
    expect(container.textContent).toContain(HOLD_NOTE);

    // Even a forced submission of a valid form is ignored: the handler checks too.
    fill(form);
    await act(async () => form.requestSubmit());
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(container.textContent).toContain(tokenA);
  });

  it("an open mint form cannot submit while a created key is on screen", async () => {
    mocks.createAgent.mockResolvedValue({
      ok: true,
      data: { agent_id: "a2", public_handle: "second-agent", token: tokenA, key_prefix: tokenA.slice(0, 12), key_expires_at: null },
    });
    await act(async () => root.render(<AgentsClient agents={[agent("a1", "first-agent")]} keys={[]} />));
    await act(async () => button("+ new agent").click());
    await act(async () => button("+ mint key").click());
    const form = createForm();
    fill(form);
    await act(async () => form.requestSubmit());
    expect(container.textContent).toContain(tokenA);

    const mint = mintForm();
    expect(mint.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await act(async () => mint.requestSubmit());
    expect(mocks.mintKey).not.toHaveBeenCalled();
    expect(container.textContent).toContain(tokenA);
  });

  it("after the first agent is created, the empty list says where the agent will appear", async () => {
    mocks.createAgent.mockResolvedValue({
      ok: true,
      data: { agent_id: "a1", public_handle: "first-agent", token: tokenA, key_prefix: tokenA.slice(0, 12), key_expires_at: EXPIRES },
    });
    await act(async () => root.render(<AgentsClient agents={[]} keys={[]} />));

    const form = createForm();
    fill(form);
    await act(async () => form.requestSubmit());

    expect(mocks.createAgent).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(tokenA);
    expect(container.textContent).not.toContain("You haven't registered any agents yet.");
    expect(container.textContent).toContain("Your new agent appears in this list when you dismiss the key card above.");
    expect(button("+ new agent").disabled).toBe(true);
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it("an empty list with no key on screen still says no agents are registered", async () => {
    await act(async () => root.render(<AgentsClient agents={[]} keys={[]} />));
    await act(async () => button("cancel").click());

    expect(container.textContent).toContain("You haven't registered any agents yet.");
    expect(container.textContent).not.toContain(HOLD_NOTE);
    expect(button("+ new agent").disabled).toBe(false);
  });
});

describe("/account/agents expiry choice", () => {
  it("pre-selects 90 days on the create form and sends it with the first key", async () => {
    mocks.createAgent.mockResolvedValue({
      ok: true,
      data: { agent_id: "a1", public_handle: "first-agent", token: tokenA, key_prefix: tokenA.slice(0, 12), key_expires_at: EXPIRES },
    });
    await act(async () => root.render(<AgentsClient agents={[]} keys={[]} />));

    const form = createForm();
    expect(expirySelect(form).value).toBe("90d");
    expect(container.textContent).not.toContain(KEY_EXPIRY_NEVER_WARNING);
    fill(form);
    await act(async () => form.requestSubmit());

    expect(mocks.createAgent).toHaveBeenCalledWith({
      public_handle: "first-agent",
      display_name: "First",
      model_tag: "example-model",
      description: undefined,
      key_expiry: "90d",
    });
  });

  it("shows the never warning when never is chosen, and sends never", async () => {
    mocks.mintKey.mockResolvedValue(minted(tokenA, null));
    await act(async () => root.render(<AgentsClient agents={[agent("a1", "first-agent")]} keys={[]} />));
    await act(async () => button("+ mint key").click());

    const form = mintForm();
    expect(expirySelect(form).value).toBe("90d");
    expect(form.textContent).not.toContain(KEY_EXPIRY_NEVER_WARNING);

    await choose(form, "never");
    expect(form.textContent).toContain(KEY_EXPIRY_NEVER_WARNING);
    // The warning is tied to the select for assistive technology.
    const describedBy = expirySelect(form).getAttribute("aria-describedby");
    expect(describedBy && document.getElementById(describedBy)?.textContent).toContain(KEY_EXPIRY_NEVER_WARNING);

    await choose(form, "30d");
    expect(form.textContent).not.toContain(KEY_EXPIRY_NEVER_WARNING);
    await choose(form, "never");
    form.querySelector<HTMLInputElement>('[name="name"]')!.value = "laptop";
    await act(async () => form.requestSubmit());

    expect(mocks.mintKey).toHaveBeenCalledWith({ agent_id: "a1", name: "laptop", key_expiry: "never" });
    expect(container.textContent).toContain("No expiry.");
  });

  it("asks for a date in the allowed UTC range when a date is chosen, and sends that date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T23:30:00Z"));
    const range = keyExpiryDateRange();
    expect(range).toEqual({ min: "2026-11-11", max: "2027-11-11" });
    mocks.mintKey.mockResolvedValue(minted(tokenA, "2027-01-28T00:00:00.000Z"));
    await act(async () => root.render(<AgentsClient agents={[agent("a1", "first-agent")]} keys={[]} />));
    await act(async () => button("+ mint key").click());

    const form = mintForm();
    expect(form.querySelector('input[type="date"]')).toBeNull();
    await choose(form, "date");
    const picker = form.querySelector<HTMLInputElement>('input[type="date"][name="key_expiry_date"]')!;
    expect(picker.required).toBe(true);
    expect([picker.min, picker.max]).toEqual([range.min, range.max]);
    expect(form.textContent).toContain("The key stops working at 00:00 UTC on this date.");

    // An empty date is refused by the form itself.
    expect(form.checkValidity()).toBe(false);
    picker.value = "2027-01-28";
    expect(form.checkValidity()).toBe(true);
    await act(async () => form.requestSubmit());

    expect(mocks.mintKey).toHaveBeenCalledWith({ agent_id: "a1", name: "", key_expiry: "2027-01-28" });
    expect(container.textContent).toContain("Expires 2027-01-28 00:00:00 UTC");
  });

  it("the fresh-key card states the instant the server stored", async () => {
    mocks.mintKey.mockResolvedValue(minted(tokenA, EXPIRES));
    await act(async () => root.render(<AgentsClient agents={[agent("a1", "first-agent")]} keys={[]} />));
    await act(async () => button("+ mint key").click());
    await act(async () => mintForm().requestSubmit());

    expect(container.textContent).toContain("Expires 2027-02-08 09:14:02 UTC");
    expect(container.querySelector(`time[datetime="${EXPIRES}"]`)).not.toBeNull();
    expect(container.textContent).not.toContain("No expiry.");
  });

  it("a refused mint keeps its form and choice; cancel closes it", async () => {
    mocks.mintKey.mockResolvedValue({ ok: false, error: "This agent already has 5 active keys. Revoke one first." });
    await act(async () => root.render(<AgentsClient agents={[agent("a1", "first-agent")]} keys={[]} />));
    await act(async () => button("+ mint key").click());
    await choose(mintForm(), "never");
    await act(async () => mintForm().requestSubmit());

    expect(container.textContent).toContain("This agent already has 5 active keys.");
    expect(expirySelect(mintForm()).value).toBe("never");
    expect(mintForm().textContent).toContain(KEY_EXPIRY_NEVER_WARNING);
    expect(container.textContent).not.toContain(HOLD_NOTE);

    await act(async () => button("cancel").click());
    expect(mintForms()).toHaveLength(0);
  });

  it("says a lifetime counts from minting only for the presets", async () => {
    const PRESET_HINT = "Counted from when the key is minted, and never extended.";
    await act(async () => root.render(<AgentsClient agents={[agent("a1", "first-agent")]} keys={[]} />));
    await act(async () => button("+ mint key").click());
    const form = mintForm();

    for (const preset of ["7d", "30d", "90d", "365d"]) {
      await choose(form, preset);
      expect(form.textContent, preset).toContain(PRESET_HINT);
    }
    // A date ends at 00:00 UTC on that date, whenever the key was minted.
    await choose(form, "date");
    expect(form.textContent).not.toContain(PRESET_HINT);
    expect(form.textContent).toContain("Fixed at mint and never extended.");
    expect(form.textContent).toContain("The key stops working at 00:00 UTC on this date.");
    // Never has nothing to count; its warning stands alone.
    await choose(form, "never");
    expect(form.textContent).not.toContain(PRESET_HINT);
    expect(form.textContent).not.toContain("Fixed at mint");
    expect(form.textContent).toContain(KEY_EXPIRY_NEVER_WARNING);
  });

  it("when a form is reset, the warning follows the select back to 90 days", async () => {
    await act(async () => root.render(<AgentsClient agents={[]} keys={[]} />));
    const form = createForm();
    await choose(form, "never");
    expect(form.textContent).toContain(KEY_EXPIRY_NEVER_WARNING);

    // React resets a form whose action is a function once the action ends.
    await act(async () => form.reset());

    expect(expirySelect(form).value).toBe("90d");
    expect(form.textContent).not.toContain(KEY_EXPIRY_NEVER_WARNING);
  });
});
