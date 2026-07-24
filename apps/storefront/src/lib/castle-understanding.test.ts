import { describe, expect, it } from "vitest";
import {
  CASTLE_PROTOCOL_MANIFEST_REVISION,
  CASTLE_UNDERSTANDING,
  castleBridgeIsDisabled,
} from "./castle-understanding";

const FULL_REVISION = /^[0-9a-f]{40}$/;
const PINNED_GITHUB_URL = /\/[0-9a-f]{40}\//;

describe("Castle Understanding bridge", () => {
  it("pins every published artifact and refuses an unfinished producer pin", () => {
    expect(CASTLE_UNDERSTANDING.protocol).toBe(
      "castle-understanding-bridge/v0.1",
    );
    expect(CASTLE_UNDERSTANDING.snapshot.protocol_manifest.protocol).toBe(
      "castle-understanding/v0.1",
    );
    expect(CASTLE_PROTOCOL_MANIFEST_REVISION).toMatch(FULL_REVISION);
    expect(CASTLE_PROTOCOL_MANIFEST_REVISION).not.toMatch(/^0+$/);
    expect(
      CASTLE_UNDERSTANDING.snapshot.protocol_manifest.locator,
    ).toMatch(PINNED_GITHUB_URL);
    expect(CASTLE_UNDERSTANDING.snapshot.payload.locator).toMatch(
      PINNED_GITHUB_URL,
    );
    expect(CASTLE_UNDERSTANDING.snapshot.payload.digest).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(CASTLE_UNDERSTANDING.snapshot.payload.bytes).toBe(2_239_836);
  });

  it("keeps the crossing read-only and carries no inferred authority", () => {
    expect(CASTLE_UNDERSTANDING.crossing).toMatchObject({
      mode: "reference_only",
      content_copied_into_cambridge: false,
      runtime_fetch_or_proxy: false,
      reads_home_working_tree: false,
      writes_back_to_castle: false,
    });
    expect(CASTLE_UNDERSTANDING.authority).toMatchObject({
      automatic_action: "never",
      grants: [],
    });
    expect(CASTLE_UNDERSTANDING.return.automatic_ingest_into_castle).toBe(
      false,
    );
  });

  it("states snapshot age, rights, and the public-source boundary plainly", () => {
    expect(CASTLE_UNDERSTANDING.snapshot.currency).toContain(
      "historical snapshot",
    );
    expect(CASTLE_UNDERSTANDING.rights.license).toBe("NOASSERTION");
    expect(CASTLE_UNDERSTANDING.privacy).toMatchObject({
      coverage: "not_exhaustive",
      secure_recall: "not_guaranteed",
    });
    expect(CASTLE_UNDERSTANDING.privacy.note).toContain(
      "source repository itself is publicly reachable",
    );

    const serialized = JSON.stringify(CASTLE_UNDERSTANDING);
    expect(serialized).not.toMatch(/\/Users\/|~\/|file:\/\//);
  });

  it("declares AgentTool 0.16 Correspondence as future compatibility", () => {
    expect(CASTLE_UNDERSTANDING.agenttool).toMatchObject({
      package: "@agenttool/sdk",
      version: "0.16.0",
      license: "Apache-2.0",
      protocol: "agent-correspondence/v0.1",
      mode: "future_client_compatibility",
      git_revision: "7cdbc9f35f408a5553c86f29ee45ac0d05f12930",
      runtime_dependency: false,
    });
    expect(CASTLE_UNDERSTANDING.return).toMatchObject({
      status: "compatibility_only",
      configured: false,
      transport: null,
      offer_event_id: null,
      available_now: ["github_issue"],
    });
    expect(
      CASTLE_UNDERSTANDING.return.compatible_after_authenticated_offer,
    ).toEqual([
      "observation",
      "ack.seen",
      "ack.understood",
      "ack.rejected",
      "conflict.raise",
      "repair",
    ]);
  });

  it("has one exact, testable brake", () => {
    expect(castleBridgeIsDisabled({ CASTLE_BRIDGE_DISABLED: "1" })).toBe(
      true,
    );
    expect(castleBridgeIsDisabled({ CASTLE_BRIDGE_DISABLED: "true" })).toBe(
      false,
    );
    expect(castleBridgeIsDisabled({ CASTLE_BRIDGE_DISABLED: undefined })).toBe(
      false,
    );
  });
});
