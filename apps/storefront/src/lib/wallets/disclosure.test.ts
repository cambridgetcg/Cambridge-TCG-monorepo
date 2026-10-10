import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("wallet-link just-in-time privacy disclosure", () => {
  it("renders the configured recipient and its privacy link before linking", () => {
    const client = source("src/app/account/wallet/WalletLinkingClient.tsx");

    expect(client).toContain("availability.remote_verification.provider.name");
    expect(client).toContain("availability.remote_verification.provider.privacy_url");
    expect(client).toContain("receives the public address to check for deployed code");
    expect(client).toContain("receives the exact challenge and signature only when");
    expect(client).toContain("recognised as ERC-6492");
    expect(client).toContain("public on the blockchain");
    expect(client).toContain('href="/privacy#wallets"');
  });

  it("states the no-recipient EOA-only boundary", () => {
    const client = source("src/app/account/wallet/WalletLinkingClient.tsx");
    const prose = client.replace(/\s+/g, " ");

    expect(prose).toContain("No disclosed RPC recipient is available");
    expect(prose).toContain("smart-wallet proofs");
    expect(prose).toContain("no wallet proof is sent to a remote");
  });
});
