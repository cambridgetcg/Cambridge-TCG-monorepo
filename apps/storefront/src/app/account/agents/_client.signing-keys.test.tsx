// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn() },
  bindSigningKey: vi.fn(),
  removeSigningKey: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/agents/operator-actions", () => ({
  createAgent: vi.fn(),
  mintKey: vi.fn(),
  revokeKey: vi.fn(),
  archiveAgent: vi.fn(),
}));
vi.mock("@/lib/agents/signing-key-actions", () => ({
  bindSigningKey: mocks.bindSigningKey,
  removeSigningKey: mocks.removeSigningKey,
  listSigningKeys: vi.fn(),
}));

import { AgentsClient } from "./_client";
import { PRIVATE_KEY_PASTE_ERROR, SIGNING_KEY_NEVER_WARNING } from "./signing-key-ui";
import type { AgentRow } from "./page";
import type { SigningKeyRow } from "@/lib/agents/signing-key-actions";

// Shapes only: no real key, public or private, is in this file.
const X = "x".repeat(43);
const PUBLIC_JWK = `{"kty":"OKP","crv":"Ed25519","x":"${X}"}`;
const PRIVATE_JWK = `{"kty":"OKP","crv":"Ed25519","x":"${X}","d":"${"d".repeat(43)}"}`;
const KID = "k".repeat(43);

const AGENT: AgentRow = {
  id: "a1",
  public_handle: "signer-agent",
  display_name: "Signer",
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

const CONFIRMED: SigningKeyRow = {
  id: "s1",
  kid: KID,
  state: "confirmed",
  created_at: "2026-11-10T12:00:00.000Z",
  not_after: null,
  confirmed_at: "2026-11-10T12:00:01.000Z",
  pending_until: null,
  revoked_at: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const button = (label: string) => {
  const found = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
};
const bindForm = () => {
  const form = container.querySelector<HTMLFormElement>('form[aria-label^="Bind a signing key"]');
  if (!form) throw new Error("no bind form");
  return form;
};
const jwkField = () => bindForm().querySelector<HTMLTextAreaElement>('textarea[name="public_jwk"]')!;

async function render(keys: SigningKeyRow[] = []) {
  await act(async () =>
    root.render(<AgentsClient agents={[AGENT]} keys={[]} signedActs={{ open: true }} signingKeys={{ a1: keys }} />),
  );
}

async function openForm() {
  await act(async () => button("Bind a signing key").click());
}

describe("/account/agents signing-key paste form", () => {
  it("refuses a private key in the browser: nothing is sent, and the field is cleared", async () => {
    await render();
    await openForm();
    jwkField().value = PRIVATE_JWK;
    await act(async () => bindForm().requestSubmit());

    expect(mocks.bindSigningKey).not.toHaveBeenCalled();
    expect(jwkField().value).toBe("");
    expect(container.textContent).toContain(PRIVATE_KEY_PASTE_ERROR);
    expect(container.innerHTML).not.toContain("d".repeat(43));
  });

  it("binds a public key with the chosen expiry and shows the thumbprint to compare", async () => {
    mocks.bindSigningKey.mockResolvedValue({
      ok: true,
      data: { signing_key_id: "s9", kid: KID, state: "pending", not_after: null, pending_until: "2026-11-17T12:00:00.000Z" },
    });
    await render();
    await openForm();
    // The same choices as usage keys, 90 days pre-selected.
    const select = bindForm().querySelector<HTMLSelectElement>('select[name="key_expiry_choice"]')!;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      "7 days", "30 days", "90 days", "1 year", "On a date (UTC)", "Never",
    ]);
    expect(select.value).toBe("90d");
    await act(async () => {
      select.value = "never";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain(SIGNING_KEY_NEVER_WARNING);

    jwkField().value = PUBLIC_JWK;
    await act(async () => bindForm().requestSubmit());

    expect(mocks.bindSigningKey).toHaveBeenCalledWith({ agent_id: "a1", public_jwk: PUBLIC_JWK, key_expiry: "never" });
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(`Thumbprint (kid): ${KID}`);
    expect(container.textContent).toContain("2026-11-17 12:00:00 UTC");
    expect(container.querySelector('form[aria-label^="Bind a signing key"]')).toBeNull();
  });

  it("shows the server's refusal beside the form", async () => {
    mocks.bindSigningKey.mockResolvedValue({ ok: false, error: '"x" must be 32 bytes in unpadded base64url (43 characters).' });
    await render();
    await openForm();
    jwkField().value = `{"kty":"OKP","crv":"Ed25519","x":"short"}`;
    await act(async () => bindForm().requestSubmit());

    expect(container.textContent).toContain('"x" must be 32 bytes');
    expect(bindForm()).toBeTruthy();
  });

  it("removes a signing key only after the operator confirms", async () => {
    mocks.removeSigningKey.mockResolvedValue({ ok: true, data: { removed: true, already_removed: false } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await render([CONFIRMED]);

    await act(async () => button("Remove").click());
    expect(mocks.removeSigningKey).not.toHaveBeenCalled();
    await act(async () => button("Remove").click());

    expect(confirm.mock.calls[1]?.[0]).toContain("Usage keys it minted keep working");
    expect(mocks.removeSigningKey).toHaveBeenCalledWith({ signing_key_id: "s1" });
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });
});
