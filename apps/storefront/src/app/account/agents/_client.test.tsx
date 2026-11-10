import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/agents/operator-actions", () => ({
  createAgent: vi.fn(),
  mintKey: vi.fn(),
  revokeKey: vi.fn(),
  archiveAgent: vi.fn(),
}));
vi.mock("@/lib/agents/signing-key-actions", () => ({
  bindSigningKey: vi.fn(),
  removeSigningKey: vi.fn(),
  listSigningKeys: vi.fn(),
}));

import { AgentsClient } from "./_client";
import type { AgentRow, KeyRow } from "./page";
import type { SigningKeyRow } from "@/lib/agents/signing-key-actions";

const source = readFileSync(resolve(process.cwd(), "src/app/account/agents/_client.tsx"), "utf8");

function agent(overrides: Partial<AgentRow>): AgentRow {
  return {
    id: "agent-1",
    public_handle: "quiet-agent",
    display_name: "Quiet Agent",
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
    ...overrides,
  };
}

function key(overrides: Partial<KeyRow>): KeyRow {
  return {
    id: "key-1",
    agent_id: "agent-1",
    key_prefix: "ctcg_agt_abc",
    name: "laptop",
    rate_limit_tier: "free",
    last_used_at: null,
    revoked_at: null,
    revoked_by: null,
    expires_at: null,
    expired: false,
    minted_by_signed_act: false,
    created_at: "2026-10-29T10:00:00Z",
    ...overrides,
  };
}

describe("/account/agents client", () => {
  it("never reloads the page, which would discard the show-once key", () => {
    expect(source).not.toMatch(/location\.reload/);
    expect(source).toContain("router.refresh()");
  });

  it("shows who ended a revoked key as the category the server sent", () => {
    const html = renderToStaticMarkup(
      <AgentsClient
        agents={[agent({})]}
        keys={[
          key({ id: "k1", revoked_at: "2026-10-29T11:00:00Z", revoked_by: "revoked by the key holder" }),
          key({ id: "k2", revoked_at: "2026-10-29T11:00:00Z", revoked_by: "revoked by Cambridge TCG staff" }),
          key({ id: "k3" }),
        ]}
      />,
    );

    expect(html).toContain("revoked by the key holder");
    expect(html).toContain("revoked by Cambridge TCG staff");
    expect(html).toContain("1 live");
    expect(html).toContain("never used");
  });

  it("words each key's end, marks expired keys and offers no revoke on them", () => {
    const html = renderToStaticMarkup(
      <AgentsClient
        agents={[agent({})]}
        keys={[
          key({ id: "k1", name: "dated", expires_at: "2027-01-28T15:04:07.000Z" }),
          key({ id: "k2", name: "endless", expires_at: null }),
          key({ id: "k3", name: "ran-out", expires_at: "2026-11-01T00:00:00.000Z", expired: true, last_used_at: "2026-10-31T09:00:00Z" }),
          key({
            id: "k4",
            name: "ended",
            expires_at: "2026-12-01T00:00:00.000Z",
            revoked_at: "2026-10-30T11:00:00Z",
            revoked_by: "revoked from this page",
          }),
        ]}
      />,
    );
    const text = html.replace(/<[^>]+>/g, "");

    expect(text).toContain("2 live, 1 expired, 1 revoked");
    expect(text).toContain("· expires 2027-01-28 15:04:07 UTC");
    expect(html).toContain('<time dateTime="2027-01-28T15:04:07.000Z">');
    expect(text).toContain("· no expiry");
    expect(text).toContain("expired 2026-11-01 00:00:00 UTC");
    // A revoked key's expiry is not shown; revocation is its state.
    expect(text).not.toContain("2026-12-01");
    expect(text).toContain("revoked from this page");
    // An expired key keeps its last use (for rotation) but has no revoke button.
    expect(text).toContain("last used");
    expect(html.match(/>revoke</g)).toHaveLength(2);
  });

  it("mints through a form, not a prompt, and shows no mint form until asked", () => {
    expect(source).not.toMatch(/prompt\([^)]*[Nn]ame for this key/);
    expect(source).toContain("mintKey({");
    const html = renderToStaticMarkup(<AgentsClient agents={[agent({})]} keys={[]} />);
    expect(html).toContain("+ mint key");
    expect(html).not.toContain('aria-label="Mint a key');
  });

  it("pre-selects 90 days on the create form, with no warning until never is chosen", () => {
    const html = renderToStaticMarkup(<AgentsClient agents={[]} keys={[]} />);

    expect(html).toMatch(/<option value="90d" selected="">90 days<\/option>/);
    for (const label of ["7 days", "30 days", "1 year", "On a date (UTC)", "Never"]) {
      expect(html).toContain(`>${label}</option>`);
    }
    expect(html).not.toContain("If a copy leaks");
    expect(html).not.toContain('type="date"');
  });

  it("offers minting only for active operator-managed agents", () => {
    const operator = renderToStaticMarkup(<AgentsClient agents={[agent({})]} keys={[]} />);
    const selfServe = renderToStaticMarkup(
      <AgentsClient agents={[agent({ registered_via: "self-serve" })]} keys={[]} />,
    );
    const suspended = renderToStaticMarkup(
      <AgentsClient agents={[agent({ status: "suspended" })]} keys={[]} />,
    );

    expect(operator).toContain("+ mint key");
    expect(selfServe).not.toContain("+ mint key");
    expect(selfServe).toContain("self-serve agent: no new keys");
    expect(selfServe).toContain("archive");
    expect(suspended).not.toContain("+ mint key");
  });

  it("shows the signing-key form disabled while signed acts are closed, and says why", () => {
    const html = renderToStaticMarkup(<AgentsClient agents={[agent({})]} keys={[]} />);
    const text = html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

    expect(text).toContain("Signing keys");
    expect(text).toContain("Agent-held signing keys are closed on this deployment, so no key can be bound here");
    expect(html).toContain('href="/methodology/agents#signed-acts"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Bind a signing key<\/button>/);
    expect(html).not.toContain(`name="public_jwk"`);
    // Self-serve agents never take a signing key, open or not.
    const selfServe = renderToStaticMarkup(
      <AgentsClient agents={[agent({ registered_via: "self-serve" })]} keys={[]} signedActs={{ open: true }} signingKeys={{}} />,
    );
    expect(selfServe).not.toContain("Signing keys");
  });

  it("lists each signing key with its state, and offers removal only on a live one", () => {
    const html = renderToStaticMarkup(
      <AgentsClient
        agents={[agent({})]}
        keys={[]}
        signedActs={{ open: true }}
        signingKeys={{
          "agent-1": [
            signingKey({ id: "s1", kid: "A".repeat(43), state: "confirmed", confirmed_at: "2026-11-10T12:00:01.000Z", not_after: "2027-02-08T12:00:00.000Z", pending_until: null }),
            signingKey({ id: "s2", kid: "B".repeat(43), state: "pending", pending_until: "2026-11-17T12:00:00.000Z", not_after: null }),
            signingKey({ id: "s3", kid: "C".repeat(43), state: "retired", revoked_at: "2026-11-10T13:00:00.000Z", pending_until: null }),
          ],
        }}
      />,
    );
    const text = html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

    expect(text).toContain("1 confirmed, 1 pending, 1 ended");
    expect(text).toContain("A".repeat(43));
    expect(text).toContain("confirmed · confirmed 2026-11-10 12:00:01 UTC · expires 2027-02-08 12:00:00 UTC");
    expect(text).toContain("pending · lapses 2026-11-17 12:00:00 UTC unless the agent signs an act first · no expiry");
    expect(text).toContain("retired by its holder 2026-11-10 13:00:00 UTC");
    expect(html.match(/>Remove</g)).toHaveLength(2);
    // Two live keys: the cap, so binding a third waits for a removal.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Bind a signing key<\/button>/);
    expect(text).toContain("This agent has 2 live signing keys. Remove one to bind another.");
  });

  it("gives the signing-key controls the app's 16px text and 44px targets, and ties a disabled button to its reason", () => {
    const closed = renderToStaticMarkup(<AgentsClient agents={[agent({})]} keys={[]} />);
    const atCap = renderToStaticMarkup(
      <AgentsClient
        agents={[agent({})]}
        keys={[]}
        signedActs={{ open: true }}
        signingKeys={{ "agent-1": [signingKey({ id: "s1", kid: "A".repeat(43) }), signingKey({ id: "s2", kid: "B".repeat(43), state: "pending", pending_until: "2026-11-17T12:00:00.000Z" })] }}
      />,
    );
    for (const html of [closed, atCap]) {
      const start = html.lastIndexOf("<section", html.indexOf(">Signing keys"));
      const section = html.slice(start, html.indexOf("</section>", start));
      const buttons = section.match(/<button[^>]*>/g) ?? [];
      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(button).toContain("min-h-11");
        expect(button).toContain("text-base");
        expect(button).not.toContain("text-sm");
      }
      // A heading size and a text colour the page's other sections use.
      expect(section.match(/<h4[^>]*>/)?.[0]).toContain("text-sm font-semibold text-ink");
      expect(section).not.toContain("text-[11px]");
      expect(section).not.toContain("text-border-strong");
      // The disabled button names the paragraph that says why.
      const disabled = section.match(/<button[^>]*disabled=""[^>]*>Bind a signing key/)?.[0] ?? "";
      const reason = disabled.match(/aria-describedby="([^"]+)"/)?.[1];
      expect(reason, disabled).toBeTruthy();
      expect(section).toContain(`id="${reason}"`);
    }
  });

  it("says when an agent's signing keys could not be read, rather than showing none", () => {
    const html = renderToStaticMarkup(
      <AgentsClient agents={[agent({})]} keys={[]} signedActs={{ open: true }} signingKeys={{ "agent-1": null }} />,
    );
    expect(html.replace(/&#x27;/g, "'")).toContain("This agent's signing keys could not be read just now.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Bind a signing key<\/button>/);
  });

  it("marks a usage key that a signed act minted, and no other", () => {
    const html = renderToStaticMarkup(
      <AgentsClient
        agents={[agent({})]}
        keys={[key({ id: "k1", name: "signed", minted_by_signed_act: true }), key({ id: "k2", name: "paged" })]}
        signedActs={{ open: true }}
        signingKeys={{ "agent-1": [] }}
      />,
    );
    expect(html.match(/minted by a signed act/g)).toHaveLength(1);
  });
});

function signingKey(overrides: Partial<SigningKeyRow>): SigningKeyRow {
  return {
    id: "s1",
    kid: "A".repeat(43),
    state: "pending",
    created_at: "2026-11-10T12:00:00.000Z",
    not_after: null,
    confirmed_at: null,
    pending_until: "2026-11-17T12:00:00.000Z",
    revoked_at: null,
    ...overrides,
  };
}
