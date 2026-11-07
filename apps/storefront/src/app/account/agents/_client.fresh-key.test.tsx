// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { AgentsClient } from "./_client";
import type { AgentRow } from "./page";

const HOLD_NOTE = "Copy or dismiss the key above first.";
// Placeholder-shaped tokens, built at runtime.
const tokenA = "ctcg_agt_" + "a".repeat(22);
const tokenB = "ctcg_agt_" + "b".repeat(22);

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

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  vi.spyOn(window, "prompt").mockReturnValue("laptop");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const buttons = (label: string) =>
  Array.from(container.querySelectorAll("button")).filter((b) => b.textContent?.trim() === label);
const button = (label: string) => {
  const [found] = buttons(label);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
};
/** Fills the create form's required fields so HTML validation passes. */
function fill(form: HTMLFormElement) {
  for (const [name, value] of [["public_handle", "first-agent"], ["display_name", "First"], ["model_tag", "example-model"]]) {
    form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value;
  }
  expect(form.checkValidity()).toBe(true);
}

describe("/account/agents fresh key card", () => {
  it("holds create and mint while a key is on screen, so no second key can replace it", async () => {
    mocks.mintKey.mockResolvedValue({ ok: true, data: { key_id: "k1", token: tokenA, key_prefix: tokenA.slice(0, 12) } });
    await act(async () =>
      root.render(<AgentsClient agents={[agent("a1", "first-agent"), agent("a2", "second-agent")]} keys={[]} />),
    );
    expect(container.textContent).not.toContain(HOLD_NOTE);
    expect(buttons("+ mint key").map((b) => b.disabled)).toEqual([false, false]);

    await act(async () => button("+ mint key").click());

    expect(container.textContent).toContain(tokenA);
    expect(container.textContent).toContain(HOLD_NOTE);
    expect(buttons("+ mint key").map((b) => b.disabled)).toEqual([true, true]);
    expect(button("+ new agent").disabled).toBe(true);

    // A second mint does nothing while the first key is up.
    mocks.mintKey.mockResolvedValue({ ok: true, data: { key_id: "k2", token: tokenB, key_prefix: tokenB.slice(0, 12) } });
    await act(async () => buttons("+ mint key")[1].click());
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
    mocks.mintKey.mockResolvedValue({ ok: true, data: { key_id: "k1", token: tokenA, key_prefix: tokenA.slice(0, 12) } });
    await act(async () => root.render(<AgentsClient agents={[agent("a1", "first-agent")]} keys={[]} />));
    await act(async () => button("+ new agent").click());
    await act(async () => button("+ mint key").click());

    const form = container.querySelector("form")!;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);
    expect(container.textContent).toContain(HOLD_NOTE);

    // Even a forced submission of a valid form is ignored: the handler checks too.
    fill(form);
    await act(async () => form.requestSubmit());
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(container.textContent).toContain(tokenA);
  });

  it("after the first agent is created, the empty list says where the agent will appear", async () => {
    mocks.createAgent.mockResolvedValue({
      ok: true,
      data: { agent_id: "a1", public_handle: "first-agent", token: tokenA, key_prefix: tokenA.slice(0, 12) },
    });
    await act(async () => root.render(<AgentsClient agents={[]} keys={[]} />));

    const form = container.querySelector("form")!;
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
