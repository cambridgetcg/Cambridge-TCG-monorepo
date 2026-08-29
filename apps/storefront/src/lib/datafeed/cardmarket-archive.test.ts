import { createHash } from "node:crypto";

import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import type { CardmarketPublicFileArtifact } from "@cambridge-tcg/data-ingest/cardmarket";
import {
  archiveCardmarketPublicFile,
  buildCardmarketArchiveKeys,
  CARDMARKET_ARCHIVE_MANIFEST_SCHEMA,
  inspectCardmarketArtifactEnvelope,
  type CardmarketArchiveS3Port,
} from "./cardmarket-archive";

function artifact(url: string, retrievedAt = "2026-08-29T09:37:43.000Z"): CardmarketPublicFileArtifact {
  const bytes = new TextEncoder().encode('{"version":1,"createdAt":"2026-08-29T02:42:18+0200","priceGuides":[]}');
  return {
    kind: url.includes("price_guide") ? "price-guide" : "product-list",
    source_url: url,
    final_url: url,
    bytes,
    byte_length: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    retrieved_at: retrievedAt,
    headers: {
      content_type: "application/json",
      content_length: bytes.byteLength,
      content_encoding: null,
      etag: '"source-etag"',
      last_modified: "Sat, 29 Aug 2026 00:42:20 GMT",
      cache_control: "public, max-age=3600",
    },
    provenance: {
      source: "cardmarket",
      as_of: retrievedAt,
      retrieved_at: retrievedAt,
      via_proxy: null,
    },
  };
}

const PRICE_URL = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json";

describe("Cardmarket private evidence archive", () => {
  it("builds content-addressed raw and observation-specific manifest keys", () => {
    const a = artifact(PRICE_URL);
    expect(buildCardmarketArchiveKeys({ artifact: a, game_slug: "one-piece" })).toEqual({
      artifact_kind: "price-guide",
      raw_key: `raw/cardmarket/one-piece/price-guide/2026/08/29/${a.sha256}.json`,
      manifest_key: `manifests/cardmarket/one-piece/price-guide/2026/08/29/20260829T093743000Z-${a.sha256}.json`,
    });
  });

  it("inspects the source-stated clock and row count without treating them as retrieval time", () => {
    expect(inspectCardmarketArtifactEnvelope(artifact(PRICE_URL))).toEqual({
      version: 1,
      source_stated_at: "2026-08-29T02:42:18+0200",
      row_count: 0,
    });
  });

  it("stores raw bytes and a withheld-rights manifest without any public ACL", async () => {
    const sends: Array<HeadObjectCommand | PutObjectCommand> = [];
    let version = 0;
    const s3: CardmarketArchiveS3Port = {
      send: vi.fn(async (command) => {
        sends.push(command);
        if (command instanceof PutObjectCommand) {
          version += 1;
          return { VersionId: `v${version}` };
        }
        return {};
      }),
    };
    const result = await archiveCardmarketPublicFile(
      {
        artifact: artifact(PRICE_URL),
        bucket: "private-evidence",
        game_slug: "one-piece",
        cardmarket_game_id: 18,
      },
      { s3 },
    );

    expect(result.raw.created).toBe(true);
    expect(result.manifest.created).toBe(true);
    expect(result.publication_state).toBe("withheld");
    const puts = sends.filter((c): c is PutObjectCommand => c instanceof PutObjectCommand);
    expect(puts).toHaveLength(2);
    for (const put of puts) {
      expect(put.input.ACL).toBeUndefined();
      expect(put.input.IfNoneMatch).toBe("*");
      expect(put.input.ServerSideEncryption).toBe("AES256");
      expect(put.input.Tagging).toContain("publication-state=withheld");
      expect(put.input.Metadata?.["publication-state"]).toBe("withheld");
    }
    const manifestBody = JSON.parse(
      new TextDecoder().decode(puts[1].input.Body as Uint8Array),
    ) as Record<string, unknown>;
    expect(manifestBody.schema).toBe(CARDMARKET_ARCHIVE_MANIFEST_SCHEMA);
    expect(manifestBody.rights).toMatchObject({
      allow_subscriber_display: false,
      allow_raw_export: false,
      publication_state: "withheld",
    });
  });

  it("treats conditional-put races as exact replays only when stored digests match", async () => {
    const a = artifact(PRICE_URL);
    const manifestBodies: Uint8Array[] = [];
    const s3: CardmarketArchiveS3Port = {
      send: vi.fn(async (command) => {
        if (command instanceof PutObjectCommand) {
          const body = command.input.Body as Uint8Array;
          if (command.input.Key?.startsWith("manifests/")) manifestBodies.push(body);
          throw { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } };
        }
        if (command instanceof HeadObjectCommand) {
          const key = command.input.Key ?? "";
          if (key.startsWith("raw/")) {
            return { VersionId: "raw-existing", Metadata: { sha256: a.sha256 } };
          }
          const manifestSha = createHash("sha256")
            .update(manifestBodies.at(-1) ?? new Uint8Array())
            .digest("hex");
          return { VersionId: "manifest-existing", Metadata: { sha256: manifestSha } };
        }
        return {};
      }),
    };
    const result = await archiveCardmarketPublicFile(
      {
        artifact: a,
        bucket: "private-evidence",
        game_slug: "one-piece",
        cardmarket_game_id: 18,
      },
      { s3 },
    );
    expect(result.raw).toMatchObject({ created: false, version_id: "raw-existing" });
    expect(result.manifest).toMatchObject({ created: false, version_id: "manifest-existing" });
  });

  it("rejects tampered bytes and existing-key digest collisions", async () => {
    const a = artifact(PRICE_URL);
    const tampered = { ...a, bytes: new TextEncoder().encode("{}") };
    await expect(
      archiveCardmarketPublicFile({
        artifact: tampered,
        bucket: "private-evidence",
        game_slug: "one-piece",
        cardmarket_game_id: 18,
      }),
    ).rejects.toThrow("cardmarket_archive_byte_length_mismatch");

    const s3: CardmarketArchiveS3Port = {
      send: vi.fn(async (command) => {
        if (command instanceof PutObjectCommand) {
          throw { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } };
        }
        return { Metadata: { sha256: "0".repeat(64) } };
      }),
    };
    await expect(
      archiveCardmarketPublicFile(
        {
          artifact: a,
          bucket: "private-evidence",
          game_slug: "one-piece",
          cardmarket_game_id: 18,
        },
        { s3 },
      ),
    ).rejects.toThrow("cardmarket_archive_existing_object_digest_conflict");
  });

  it("refuses a forged origin or a mismatched Cardmarket game id before S3", async () => {
    const s3: CardmarketArchiveS3Port = { send: vi.fn() };
    const forged = artifact(PRICE_URL);
    forged.final_url = PRICE_URL.replace(
      "downloads.s3.cardmarket.com",
      "attacker.example",
    );
    await expect(
      archiveCardmarketPublicFile(
        {
          artifact: forged,
          bucket: "private-evidence",
          game_slug: "one-piece",
          cardmarket_game_id: 18,
        },
        { s3 },
      ),
    ).rejects.toThrow();

    await expect(
      archiveCardmarketPublicFile(
        {
          artifact: artifact(PRICE_URL),
          bucket: "private-evidence",
          game_slug: "one-piece",
          cardmarket_game_id: 17,
        },
        { s3 },
      ),
    ).rejects.toThrow("cardmarket_archive_artifact_identity_mismatch");
    expect(s3.send).not.toHaveBeenCalled();
  });
});
