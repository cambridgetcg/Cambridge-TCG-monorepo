import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../../../drizzle/0130_evm_wallet_links.sql", import.meta.url),
  ),
  "utf8",
);

describe("EVM wallet-link migration", () => {
  it("binds both proof references to the challenge owner, chain, and address", () => {
    expect(migration).toMatch(
      /UNIQUE\s*\(\s*id,\s*user_id,\s*chain_id,\s*address_key\s*\)/i,
    );

    const provenanceReferences = migration.match(
      /FOREIGN KEY\s*\(\s*(?:initial_challenge_id|last_verified_challenge_id),\s*user_id,\s*chain_id,\s*address_key\s*\)\s*REFERENCES evm_wallet_link_challenges\s*\(\s*id,\s*user_id,\s*chain_id,\s*address_key\s*\)\s*ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED/gi,
    );

    expect(provenanceReferences).toHaveLength(2);
  });

  it("constrains the verification vocabulary and proof scope", () => {
    expect(migration).toContain("'viem_eoa_local'");
    expect(migration).toContain("'viem_base_sepolia_public_client'");
    expect(migration).toMatch(/proof_scope_version\s*=\s*'wallet-control-v1'/i);
  });

  it("bounds and timestamps the atomic verification-attempt budget", () => {
    expect(migration).toMatch(
      /verification_attempt_count\s+BETWEEN\s+0\s+AND\s+5/i,
    );
    expect(migration).toMatch(
      /verification_attempt_count\s*=\s*0\s+AND\s+verification_last_attempt_at\s+IS NULL/i,
    );
    expect(migration).toMatch(
      /verification_attempt_count\s*>\s*0[\s\S]*verification_last_attempt_at\s+IS NOT NULL[\s\S]*verification_last_attempt_at\s*>=\s*issued_at/i,
    );
    expect(migration).toMatch(
      /ON evm_wallet_link_challenges\s*\(user_id,\s*issued_at DESC\)/i,
    );
  });

  it("keeps exact rolling user budgets in a proof-free attempt ledger", () => {
    const attemptTable = migration.match(
      /CREATE TABLE IF NOT EXISTS evm_wallet_link_verification_attempts\s*\(([\s\S]*?)\n\);/i,
    )?.[1];

    expect(attemptTable).toBeDefined();
    expect(attemptTable).toMatch(
      /attempted_at\s+TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp\(\)/i,
    );
    expect(attemptTable).toMatch(
      /FOREIGN KEY\s*\(\s*challenge_id,\s*user_id,\s*chain_id,\s*address_key\s*\)\s*REFERENCES evm_wallet_link_challenges\s*\(\s*id,\s*user_id,\s*chain_id,\s*address_key\s*\)\s*ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED/i,
    );
    expect(attemptTable).not.toMatch(/\b(?:signature|proof|message|nonce)\b/i);
    expect(migration).toMatch(
      /ON evm_wallet_link_verification_attempts\s*\(user_id,\s*attempted_at DESC\)/i,
    );
  });
});
