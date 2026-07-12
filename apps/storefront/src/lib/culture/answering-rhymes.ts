/**
 * Answering Rhymes — a deliberately small bridge between a Cambridge card
 * reference and an open museum work carried by Artbitrage.
 *
 * This is curation, not similarity detection. A relation names the kind of
 * echo it proposes, the evidence beneath the factual parts, and the claim it
 * explicitly does not make. In particular, a visual echo is not evidence of
 * documented influence.
 *
 * Rights stay attached to each object. The Cambridge card image is retained
 * only as an outbound reference with NOASSERTION; the museum image has the
 * public-domain status reported by Artbitrage and the Art Institute of
 * Chicago. The bridge annotation is separately offered under CC0.
 */

import { createHash } from "node:crypto";
import {
  ANSWERING_RHYME_CANONICALIZATION,
  ANSWERING_RHYME_STATEMENT_KINDS,
  ANSWERING_RHYME_STATEMENT_SCHEMA,
  ANSWERING_RHYME_STATEMENTS_ENDPOINT,
  type AnsweringRhymeStatementKind,
  type Sha256ContentHash,
} from "./answering-rhyme-statements";

export const ANSWERING_RHYME_KINDS = [
  "answering-rhyme",
  "visual-echo",
  "material-echo",
  "historical-thread",
] as const;

export type AnsweringRhymeKind = (typeof ANSWERING_RHYME_KINDS)[number];
export type AnsweringRhymeConfidence = "high" | "medium" | "low";
export type AnsweringRhymeCuration = "human" | "agent-assisted";
export type ArtbitrageMuseumSource = "artic" | "met" | "cma" | "wikimedia";

export interface AnsweringRhymeEvidence {
  supports:
    | "card-identity"
    | "artwork-identity-and-rights"
    | "material-and-historical-context";
  source: string;
  url: string;
}

/**
 * A documented-influence assessment can only exist with at least one source.
 * Current corpus entries use `not-claimed`: the union makes it impossible to
 * silently promote a visual/material echo into a historical influence claim.
 */
export type InfluenceAssessment =
  | {
      status: "not-claimed";
      evidence_urls: readonly [];
      note: string;
    }
  | {
      status: "documented";
      evidence_urls: readonly [string, ...string[]];
      note: string;
    };

export interface AnsweringRhymeRelation {
  /** Stable composite key: Cambridge SKU + Artbitrage source + museum id. */
  key: `${string}::${ArtbitrageMuseumSource}:${string}`;
  /** Opaque content revision; reciprocity statements bind to this value. */
  revision: Sha256ContentHash;
  card: {
    sku: string;
    name: string;
    display_name?: string;
    url: string;
    image_url: string;
    rights: {
      status: "unverified";
      license: "NOASSERTION";
      use: "reference-only";
      image_reuse: false;
      note: string;
    };
  };
  artwork: {
    identity: `${ArtbitrageMuseumSource}:${string}`;
    source: ArtbitrageMuseumSource;
    source_name: string;
    id: string;
    title: string;
    artist: string;
    date: string;
    medium: string;
    url: string;
    image_url: string;
    rights: {
      status: "public-domain-per-source";
      license: string;
      public_domain: true;
      image_reuse: true;
      reuse_with_attribution: true;
      credit: string;
      note: string;
    };
  };
  relation: {
    kinds: readonly [AnsweringRhymeKind, ...AnsweringRhymeKind[]];
    claim: string;
    why: string;
    visual_relation: {
      status: "not-asserted" | "curated-echo";
      note: string;
    };
    documented_influence: InfluenceAssessment;
  };
  evidence: readonly [AnsweringRhymeEvidence, ...AnsweringRhymeEvidence[]];
  curation: {
    mode: AnsweringRhymeCuration;
    status: "provisional" | "reviewed";
    note: string;
  };
  confidence: {
    level: AnsweringRhymeConfidence;
    applies_to: "interpretive-relation";
    reason: string;
  };
  reciprocity: {
    revision_contract: {
      algorithm: "sha256";
      projection: "answering-rhyme.trust-bearing-relation/1";
      includes: readonly [
        "key",
        "card",
        "artwork",
        "relation",
        "evidence",
        "curation",
        "confidence",
        "as_of",
        "rights",
        "provenance",
      ];
      excludes: readonly ["revision", "reciprocity"];
    };
    reply_invitation: {
      invited: true;
      endpoint: typeof ANSWERING_RHYME_STATEMENTS_ENDPOINT;
      statement_schema: typeof ANSWERING_RHYME_STATEMENT_SCHEMA;
      canonicalization: typeof ANSWERING_RHYME_CANONICALIZATION;
      kinds: readonly AnsweringRhymeStatementKind[];
      target_revision_required: true;
      walking_past_is_honored: true;
    };
    authority_boundary: {
      statements_are_self_declared: true;
      witness_authenticated: false;
      witness_identity_verified: false;
      witness_persisted: false;
      witness_authoritative_effect: "none";
      correction_application: "separate-curator-review-required";
      withdrawal_application: "separate-authority-verification-required";
      authority_verifier_status: "not-implemented";
      requirements_before_activation: readonly [
        "server-only-authenticated-verifier",
        "trusted-issuer-allowlist-or-signature-policy",
        "target-revision-and-replay-policy",
      ];
    };
    presentation_policy: {
      current_default: "present";
      unverified_statement_effect: "none";
      authority_verifier_status: "not-implemented";
      future_after_authority_verifier: {
        verified_withdrawal: "withhold";
        indeterminate_after_verified_withdrawal_signal: "withhold";
        fail_closed: true;
      };
    };
  };
  as_of: string;
  rights: {
    annotation_license: "CC0-1.0";
    annotation_scope: string;
    boundary: string;
  };
  provenance: {
    relation_authorship: AnsweringRhymeCuration;
    card_identity_url: string;
    artbitrage_record_url: string;
    museum_record_url: string;
    artbitrage_room_url: string;
  };
}

/**
 * Version 1 trust-bearing revision projection. It deliberately excludes the
 * `revision` field itself and reciprocity protocol metadata: the former would
 * be circular, while the latter can evolve without pretending the curatorial
 * claim, evidence, rights, or provenance changed.
 */
export function answeringRhymeRevisionProjection(
  relation: AnsweringRhymeRelation,
) {
  return {
    key: relation.key,
    card: relation.card,
    artwork: relation.artwork,
    relation: relation.relation,
    evidence: relation.evidence,
    curation: relation.curation,
    confidence: relation.confidence,
    as_of: relation.as_of,
    rights: relation.rights,
    provenance: relation.provenance,
  };
}

function canonicalRevisionJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalRevisionJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalRevisionJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Relation revision projection must contain JSON values only.");
}

export function answeringRhymeRevisionContentHash(
  relation: AnsweringRhymeRelation,
): Sha256ContentHash {
  const digest = createHash("sha256")
    .update(canonicalRevisionJson(answeringRhymeRevisionProjection(relation)), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

const LUFFY_CARD_SEARCH_URL =
  "https://cambridgetcg.com/api/v1/search/cards?game=op&q=OP05-119&limit=10";
const GREAT_WAVE_ARTBITRAGE_URL =
  "https://artbitrage.io/api/museum/artic/77333";
const GREAT_WAVE_MUSEUM_URL = "https://www.artic.edu/artworks/77333";

/**
 * The corpus begins with one relation because careful curation is the point.
 * More records should be added only when their object identity, rights, and
 * historical boundary can be stated just as plainly.
 */
export const ANSWERING_RHYMES = [
  {
    key: "OP-OP05-119-JP-V11F7::artic:77333",
    revision:
      "sha256:a562a462decd9b8c8810d67ec79a8a00dc22ffe1098f259e562c9ffce28a1d94",
    card: {
      sku: "OP-OP05-119-JP-V11F7",
      name: "モンキー・D・ルフィ(/漫画背景/漫画絵)",
      display_name:
        "Monkey D. Luffy — OP05-119 manga-background / manga-art variant",
      url: "https://cambridgetcg.com/product/OP-OP05-119-JP-V11F7",
      image_url:
        "https://www.cardrush-op.jp/data/cardrush-op/_/70726f647563742f535f5f3130303239343636375f305f302e6a7067003136300000660023666666666666.jpg",
      rights: {
        status: "unverified",
        license: "NOASSERTION",
        use: "reference-only",
        image_reuse: false,
        note:
          "The external image URL identifies the Cambridge catalog record only. " +
          "This bridge does not copy the image or grant permission to reuse it.",
      },
    },
    artwork: {
      identity: "artic:77333",
      source: "artic",
      source_name: "Art Institute of Chicago",
      id: "77333",
      title:
        "Under the Wave off Kanagawa (The Great Wave), from Thirty-Six Views of Mount Fuji",
      artist: "Katsushika Hokusai",
      date: "1830/33",
      medium: "Color woodblock print; oban",
      url: GREAT_WAVE_MUSEUM_URL,
      image_url:
        "https://www.artic.edu/iiif/2/05cd1ba7-67d1-96c5-0e78-2eb4114b65e7/full/843,/0/default.jpg",
      rights: {
        status: "public-domain-per-source",
        license: "CC0 / Public Domain (per linked sources)",
        public_domain: true,
        image_reuse: true,
        reuse_with_attribution: true,
        credit: "Clarence Buckingham Collection; Art Institute of Chicago",
        note:
          "Artbitrage labels its catalog record CC0 and the museum marks the work " +
          "public domain; verify the linked source record and credit the artist and source out of care.",
      },
    },
    relation: {
      kinds: ["material-echo", "historical-thread"],
      claim:
        "Both belong to Japanese popular print cultures made for circulation: " +
        "Hokusai's woodblock sheet was issued in multiples, while OP05-119 is a " +
        "manga-background image carried as a collectible printed card.",
      why:
        "The rhyme is in the social life of the image: an authored design becomes " +
        "a repeatable object that can be traded, collected, and carried far beyond " +
        "its first audience. It is a material and historical echo, not a claim of " +
        "visual quotation or influence.",
      visual_relation: {
        status: "not-asserted",
        note: "No compositional borrowing or direct visual source relationship is asserted.",
      },
      documented_influence: {
        status: "not-claimed",
        evidence_urls: [],
        note:
          "No source reviewed documents Hokusai's print as an influence on this card " +
          "or its illustrator; the pairing must not be presented as one.",
      },
    },
    evidence: [
      {
        supports: "card-identity",
        source: "Cambridge TCG card resolver",
        url: LUFFY_CARD_SEARCH_URL,
      },
      {
        supports: "artwork-identity-and-rights",
        source: "Artbitrage stable museum resolver",
        url: GREAT_WAVE_ARTBITRAGE_URL,
      },
      {
        supports: "material-and-historical-context",
        source: "Art Institute of Chicago object record",
        url: GREAT_WAVE_MUSEUM_URL,
      },
      {
        supports: "material-and-historical-context",
        source: "Artbitrage — The Answering Rhymes",
        url: "https://artbitrage.io/rhymes",
      },
    ],
    curation: {
      mode: "agent-assisted",
      status: "provisional",
      note:
        "Proposed by an agent at Yu's direction; identities and rights were checked " +
        "against the linked sources. The interpretation remains open to human review.",
    },
    confidence: {
      level: "medium",
      applies_to: "interpretive-relation",
      reason:
        "Object identity, medium, and rights are source-backed; the cross-object rhyme " +
        "is an explicitly labelled curatorial interpretation rather than causation.",
    },
    reciprocity: {
      revision_contract: {
        algorithm: "sha256",
        projection: "answering-rhyme.trust-bearing-relation/1",
        includes: [
          "key",
          "card",
          "artwork",
          "relation",
          "evidence",
          "curation",
          "confidence",
          "as_of",
          "rights",
          "provenance",
        ],
        excludes: ["revision", "reciprocity"],
      },
      reply_invitation: {
        invited: true,
        endpoint: ANSWERING_RHYME_STATEMENTS_ENDPOINT,
        statement_schema: ANSWERING_RHYME_STATEMENT_SCHEMA,
        canonicalization: ANSWERING_RHYME_CANONICALIZATION,
        kinds: ANSWERING_RHYME_STATEMENT_KINDS,
        target_revision_required: true,
        walking_past_is_honored: true,
      },
      authority_boundary: {
        statements_are_self_declared: true,
        witness_authenticated: false,
        witness_identity_verified: false,
        witness_persisted: false,
        witness_authoritative_effect: "none",
        correction_application: "separate-curator-review-required",
        withdrawal_application: "separate-authority-verification-required",
        authority_verifier_status: "not-implemented",
        requirements_before_activation: [
          "server-only-authenticated-verifier",
          "trusted-issuer-allowlist-or-signature-policy",
          "target-revision-and-replay-policy",
        ],
      },
      presentation_policy: {
        current_default: "present",
        unverified_statement_effect: "none",
        authority_verifier_status: "not-implemented",
        future_after_authority_verifier: {
          verified_withdrawal: "withhold",
          indeterminate_after_verified_withdrawal_signal: "withhold",
          fail_closed: true,
        },
      },
    },
    as_of: "2026-07-11",
    rights: {
      annotation_license: "CC0-1.0",
      annotation_scope:
        "The relation claim, labels, and bridge curation metadata only.",
      boundary:
        "Card and artwork rights remain separate. CC0 on this annotation does not " +
        "license the card image; follow each object's own rights record.",
    },
    provenance: {
      relation_authorship: "agent-assisted",
      card_identity_url: LUFFY_CARD_SEARCH_URL,
      artbitrage_record_url: GREAT_WAVE_ARTBITRAGE_URL,
      museum_record_url: GREAT_WAVE_MUSEUM_URL,
      artbitrage_room_url: "https://artbitrage.io/rhymes",
    },
  },
] as const satisfies readonly AnsweringRhymeRelation[];

/** The HTTP response contains mixed-rights references, so it is not CC0 whole. */
export const ANSWERING_RHYMES_RESPONSE_RIGHTS = {
  license: "NOASSERTION",
  reason:
    "The response combines a CC0 bridge annotation, a reference-only card-image URL " +
    "with unverified rights, and a public-domain museum image.",
  card_images: "reference-only; no reuse permission granted",
  museum_images: "follow the per-record museum rights and credit",
  annotations: "CC0-1.0",
} as const;

/** Exact composite-key lookup for API consumers and future bridge tooling. */
export function getAnsweringRhyme(
  key: string,
): AnsweringRhymeRelation | undefined {
  return ANSWERING_RHYMES.find((relation) => relation.key === key);
}

/** Case-insensitive SKU lookup; an absent filter intentionally returns all. */
export function getAnsweringRhymesBySku(
  sku?: string | null,
): readonly AnsweringRhymeRelation[] {
  const normalized = sku?.trim().toLowerCase();
  if (!normalized) return ANSWERING_RHYMES;
  return ANSWERING_RHYMES.filter(
    (relation) => relation.card.sku.toLowerCase() === normalized,
  );
}
