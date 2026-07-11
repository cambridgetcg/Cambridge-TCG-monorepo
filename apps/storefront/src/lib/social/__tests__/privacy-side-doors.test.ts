import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

import {
  sha256,
  toPublicDrawProof,
  verifyPublicDraw,
  type DrawProof,
} from "@/lib/rewards/provable-fair";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public privacy side doors", () => {
  it("keeps raffle math public without publishing participant identity", () => {
    const serverSeed = "revealed-server-seed";
    const entryHash = sha256("entry-a:user-a:1|entry-b:user-b:2");
    const combinedHash = sha256(serverSeed + entryHash);
    const winnerIndex = Number(BigInt("0x" + combinedHash) % BigInt(3));
    const internalProof = {
      raffle_id: "raffle-private-id",
      seed_commitment: sha256(serverSeed),
      server_seed: serverSeed,
      entry_hash: entryHash,
      combined_hash: combinedHash,
      winner_index: winnerIndex,
      total_weighted_entries: 3,
      entries: [
        { id: "entry-a", user_id: "user-a", user_name: "Asha", entry_count: 1 },
        { id: "entry-b", user_id: "user-b", user_name: "Bo", entry_count: 2 },
      ],
      winner: { user_id: winnerIndex === 0 ? "user-a" : "user-b", entry_count: winnerIndex === 0 ? 1 : 2 },
    } as unknown as DrawProof;

    const publicProof = toPublicDrawProof(internalProof);
    const serialized = JSON.stringify(publicProof);
    expect(serialized).not.toContain("raffle-private-id");
    expect(serialized).not.toContain("entry-a");
    expect(serialized).not.toContain("entry-b");
    expect(serialized).not.toContain("user-a");
    expect(serialized).not.toContain("user-b");
    expect(serialized).not.toContain("Asha");
    expect(serialized).not.toContain("Bo");
    expect(publicProof.entry_records).toBe(2);
    expect(publicProof).not.toHaveProperty("entries");
    expect(publicProof).not.toHaveProperty("selected_entry_position");

    const verification = verifyPublicDraw(publicProof);
    expect(verification.public_checks_passed).toBe(true);
    expect(verification.complete_draw_verification).toBe(false);
    expect(verification.participant_identifiers_withheld).toBe(true);
    expect(verification.entry_manifest_publicly_recomputable).toBe(false);
    expect(JSON.stringify(verification)).not.toContain("user-");

    const route = source("src/app/api/rewards/raffles/[id]/proof/route.ts");
    const publicGet = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
    expect(publicGet).toContain("toPublicDrawProof(proof)");
    expect(publicGet).toContain("verifyPublicDraw(publicProof)");
    expect(publicGet).not.toContain("proof.entries");
    expect(publicGet).not.toContain("winner:");

    const rewardsDb = source("src/lib/rewards/db.ts");
    const publicList = rewardsDb.slice(
      rewardsDb.indexOf("export async function listPublicRaffles"),
      rewardsDb.indexOf("export async function getRaffle"),
    );
    expect(publicList).not.toContain("r.*");
    expect(publicList).not.toContain("server_seed");
    expect(publicList).not.toContain("winner_user_id");
    expect(publicList).not.toContain("winner_name");
  });

  it("projects public lots without seller ids, profiles, or raw rows", () => {
    const lots = source("src/lib/market/lots.ts");
    const listProjection = lots.slice(
      lots.indexOf("async function listProjectedLots"),
      lots.indexOf("export async function listPublicLots"),
    );
    expect(listProjection).toContain("SELECT l.id, l.title, l.description");
    expect(listProjection).not.toContain("SELECT l.*");
    expect(listProjection).not.toContain("seller_username");
    expect(listProjection).not.toContain("seller_name");
    expect(listProjection).not.toContain("seller_trust_score");
    expect(listProjection).not.toContain("JOIN users");

    const publicDetail = lots.slice(
      lots.indexOf("export async function getPublicLot"),
      lots.indexOf("export async function cancelLot"),
    );
    expect(publicDetail).toContain("SELECT l.id, l.title, l.description");
    expect(publicDetail).not.toContain("SELECT l.*");
    expect(publicDetail).not.toContain("JOIN users");

    const route = source("src/app/api/market/lots/route.ts");
    expect(route).not.toContain('searchParams.get("seller")');
    expect(route).toContain("listOwnLots(session.user.id, filters)");
    expect(route).toContain("listPublicLots(filters)");

    const detailRoute = source("src/app/api/market/lots/[id]/route.ts");
    expect(detailRoute).toContain("getPublicLot(id)");
    expect(detailRoute).not.toContain("getLot(id)");
  });

  it("keeps open asks useful without publishing a seller dossier", () => {
    const route = source("src/app/api/market/offers/asks/route.ts");
    expect(route).toContain("o.id, o.price, o.quantity, o.filled_quantity");
    expect(route).toContain("contact_available: true");
    expect(route).toContain("row.owner_user_id === viewerId");
    expect(route).not.toContain("seller_id");
    expect(route).not.toContain("seller_username");
    expect(route).not.toContain("trust_score");
    expect(route).not.toContain("avg_rating");
    expect(route).not.toContain("total_reviews");
    expect(route).not.toContain("getTrustTier");
    expect(route).not.toContain("JOIN users");
  });

  it("publishes deck artifacts without publishing their authors", () => {
    const db = source("src/lib/decks/db.ts");
    const bySlug = db.slice(
      db.indexOf("export async function getPublicDeckBySlug"),
      db.indexOf("export interface SaveDeckArgs"),
    );
    expect(bySlug).toContain("SELECT id, slug, name, leader_sku");
    expect(bySlug).not.toContain("SELECT *");
    expect(bySlug).not.toContain("user_id");

    const list = db.slice(db.indexOf("export async function listPublicDecks"));
    expect(list).toContain("SELECT d.id, d.slug, d.name, d.leader_sku");
    expect(list).not.toContain("d.*");
    expect(list).not.toContain("JOIN users");
    expect(list).not.toContain("user_name");

    for (const path of [
      "src/app/api/decks/public/route.ts",
      "src/app/api/decks/public/[slug]/route.ts",
    ]) {
      const route = source(path);
      expect(route).not.toContain("user_name");
      expect(route).not.toContain('from "@/lib/db"');
    }
  });
});
