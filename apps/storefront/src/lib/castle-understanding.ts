/**
 * The Castle of Understanding bridge.
 *
 * This file is deliberately small. Cambridge TCG does not mirror the Castle,
 * read the home working tree, or interpret Castle prose. It points at one
 * curated, immutable public artifact and carries the limits beside the link.
 *
 * Story-as-wire: docs/connections/the-castle-of-understanding.md
 */

export const CASTLE_UNDERSTANDING_MANIFEST_PROTOCOL =
  "castle-understanding/v0.1" as const;
export const CASTLE_UNDERSTANDING_BRIDGE_PROTOCOL =
  "castle-understanding-bridge/v0.1" as const;

export const CASTLE_GATE_REVISION =
  "bacf9430f98301161e78bd9a8520bcf282b3b1c9" as const;
export const CASTLE_SOURCE_REVISION =
  "6cd9be606a6b0cc1c8dcb0743c01070ad9584edb" as const;
export const CASTLE_PAYLOAD_DIGEST =
  "sha256:f85a43806594bf77a9f17210ae56a83aa8ce6c7d4cdb6b62c15284f7c76ff804" as const;

/** Git revision that published the closed producer receipt. */
export const CASTLE_PROTOCOL_MANIFEST_REVISION =
  "8d88d220ce5f9128331d92d8a0e7e7371099c807" as const;

const GATE_REPOSITORY = "https://github.com/cambridgetcg/castle-gate";
const SOURCE_REPOSITORY =
  "https://github.com/cambridgetcg/castle-of-words";
const GATE_PUBLIC_URL =
  "https://cambridgetcg.github.io/castle-gate/";
const PAYLOAD_URL =
  `https://raw.githubusercontent.com/cambridgetcg/castle-gate/${CASTLE_GATE_REVISION}/data/castle.json`;
const PROTOCOL_MANIFEST_URL =
  `https://raw.githubusercontent.com/cambridgetcg/castle-gate/${CASTLE_PROTOCOL_MANIFEST_REVISION}/data/castle-manifest.json`;

export const CASTLE_UNDERSTANDING = {
  protocol: CASTLE_UNDERSTANDING_BRIDGE_PROTOCOL,
  kind: "read_only_reference_bridge",
  status: "active",
  checked_at: "2026-07-23T19:12:05Z",
  name: "The Castle of Understanding",
  summary:
    "A source-pinned door from Cambridge TCG to one curated public Castle snapshot. Causes, limits, and repair paths travel with the reference.",
  doors: {
    human: "/castle",
    machine: "/api/v1/castle",
    discovery: "/.well-known/understanding.json",
    public_gate: GATE_PUBLIC_URL,
  },
  snapshot: {
    protocol_manifest: {
      protocol: CASTLE_UNDERSTANDING_MANIFEST_PROTOCOL,
      locator: PROTOCOL_MANIFEST_URL,
      repository: GATE_REPOSITORY,
      revision: CASTLE_PROTOCOL_MANIFEST_REVISION,
    },
    payload: {
      locator: PAYLOAD_URL,
      media_type: "application/json",
      digest: CASTLE_PAYLOAD_DIGEST,
      bytes: 2_239_836,
      shape: "castle-gate/castle-data/v1",
    },
    source: {
      repository: SOURCE_REPOSITORY,
      repository_id: "repo:cambridgetcg/castle-of-words",
      revision: CASTLE_SOURCE_REVISION,
    },
    forged_at: "2026-07-07T21:45:49.583Z",
    counts: {
      rooms: 450,
      words: 169,
      open_questions: 13,
      settled_questions: 160,
    },
    currency:
      "This is an immutable historical snapshot, not the current state of the Castle. Newer committed and working material may exist.",
  },
  crossing: {
    mode: "reference_only",
    operations: ["provenance", "visit"] as const,
    content_copied_into_cambridge: false,
    runtime_fetch_or_proxy: false,
    reads_home_working_tree: false,
    writes_back_to_castle: false,
  },
  privacy: {
    scope: "public_curated",
    raw_source_in_payload: false,
    curation_profile: "castle-gate-public/v1",
    coverage: "not_exhaustive",
    secure_recall: "not_guaranteed",
    note:
      "The curated payload omits the raw working tree and private curation rules. The source repository itself is publicly reachable, so curation is not described as confidentiality.",
  },
  rights: {
    license: "NOASSERTION",
    note:
      "Neither Castle repository declares a reuse license. Public access permits reading; it does not by itself grant copying, training, redistribution, or commercial reuse rights.",
  },
  authority: {
    automatic_action: "never",
    grants: [] as const,
    does_not_grant: [
      "identity",
      "consent",
      "belief",
      "truth",
      "execution",
      "filesystem access",
      "publication",
      "write authority",
    ] as const,
  },
  return: {
    protocol: "agent-correspondence/v0.1",
    status: "compatibility_only",
    configured: false,
    transport: null,
    offer_event_id: null,
    available_now: ["github_issue"] as const,
    compatible_after_authenticated_offer: [
      "observation",
      "ack.seen",
      "ack.understood",
      "ack.rejected",
      "conflict.raise",
      "repair",
    ] as const,
    public_correction:
      "https://github.com/cambridgetcg/castle-gate/issues",
    automatic_ingest_into_castle: false,
    note:
      "No Correspondence transport or signed artifact.offer exists for this crossing today. Acknowledgements, conflicts, and repairs would need exact target event IDs after a future authenticated offer. GitHub Issues is the only live return door.",
  },
  agenttool: {
    package: "@agenttool/sdk",
    version: "0.16.0",
    license: "Apache-2.0",
    git_tag: "sdk-v0.16.0",
    git_revision: "7cdbc9f35f408a5553c86f29ee45ac0d05f12930",
    git_tag_object: "ee28e3e1e8f841d316732058d76923c8bb4b7640",
    repository: "https://github.com/cambridgetcg/agenttool",
    protocol: "agent-correspondence/v0.1",
    mode: "future_client_compatibility",
    runtime_dependency: false,
    why:
      "The SDK supplies the signed Correspondence vocabulary for exact offers, acknowledgements, conflicts, and repairs. Cambridge declares future compatibility but has no configured transport or offer event, and needs no SDK runtime merely to publish a read-only reference.",
  },
  lifecycle: {
    lineage: "open_ended",
    generation: "finite",
    update_rule:
      "A later generation appends a new commit and digest, then names what it supersedes or corrects. Published history is not silently rewritten.",
    secure_recall_promised: false,
    background_loop_added: false,
  },
  brake: {
    environment_variable: "CASTLE_BRIDGE_DISABLED",
    disabled_value: "1",
    effect:
      "The Cambridge page rests and its JSON doors return an explicit unavailable state. No Castle or AgentTool process is stopped.",
  },
  walking_past_is_honored: true,
} as const;

export function castleBridgeIsDisabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.CASTLE_BRIDGE_DISABLED === "1";
}

/** Compact projection for Cambridge's wider discovery handshakes. */
export function castleUnderstandingPointer() {
  return {
    protocol: CASTLE_UNDERSTANDING.protocol,
    status: CASTLE_UNDERSTANDING.status,
    checked_at: CASTLE_UNDERSTANDING.checked_at,
    human: CASTLE_UNDERSTANDING.doors.human,
    json: CASTLE_UNDERSTANDING.doors.machine,
    discovery: CASTLE_UNDERSTANDING.doors.discovery,
    public_gate: CASTLE_UNDERSTANDING.doors.public_gate,
    snapshot: {
      forged_at: CASTLE_UNDERSTANDING.snapshot.forged_at,
      digest: CASTLE_UNDERSTANDING.snapshot.payload.digest,
      producer_manifest:
        CASTLE_UNDERSTANDING.snapshot.protocol_manifest.locator,
    },
    boundary:
      "Read-only, reference-only, NOASSERTION rights, no runtime Castle fetch, no automatic action or writeback.",
    walking_past_is_honored: true,
  } as const;
}

export type CastleUnderstandingPointer = ReturnType<
  typeof castleUnderstandingPointer
>;
