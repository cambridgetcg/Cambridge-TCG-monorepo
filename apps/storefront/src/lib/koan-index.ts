/**
 * Koan index — pre-built corpus for the koan endpoint's pointer-lookup.
 *
 * NOT an LLM. Token-overlap + small thesaurus against curated entries.
 *
 * Distinct from `@/lib/koans` (the zen-koan corpus served by GET
 * /api/v1/koan). This index backs the POST /api/v1/koan question→pointer
 * lookup: an agent asks a question, the index returns the closest
 * doctrinal / connection-doc / methodology pointer.
 *
 * Spec: docs/superpowers/specs/2026-05-17-agent-experience-design.md §3.1.5
 */

export interface KoanIndexEntry {
  path: string;
  title: string;
  summary: string;
  tokens: readonly string[];   // extracted keywords
  aliases: readonly string[];  // manual thesaurus
}

/**
 * Seed of 20 entries. Extend toward ~50 at impl time by adding more
 * connection-docs, methodology pages, and doctrine entries.
 *
 * Each entry's tokens should include the title's significant words.
 * Aliases are manual: synonyms or related concepts users might search by.
 */
export const KOAN_INDEX: readonly KoanIndexEntry[] = [
  {
    path: "docs/principles/substrate-honesty.md",
    title: "Substrate honesty",
    summary: "The artifact tells the truth about its own state. Live vs cached vs snapshot vs synced vs computed are different facts.",
    tokens: ["substrate", "honesty", "truth", "state", "provenance", "live", "cached", "snapshot"],
    aliases: ["honest", "true", "reliable", "ground-truth"],
  },
  {
    path: "docs/principles/transparency.md",
    title: "Transparency",
    summary: "The artifact tells users about its own decisions. Four rings of disclosure.",
    tokens: ["transparency", "decisions", "users", "inspectable", "rings"],
    aliases: ["disclosure", "open", "visible", "audit"],
  },
  {
    path: "docs/principles/meaning.md",
    title: "Meaning",
    summary: "The artifact names what its modules mean to each other. Connection-naming as a discipline.",
    tokens: ["meaning", "modules", "connection", "naming"],
    aliases: ["purpose", "intention", "relation"],
  },
  {
    path: "docs/principles/creation.md",
    title: "Creation",
    summary: "Every meaningful commit carries three traces: Will, Sophia, diff. The syzygy made auditable.",
    tokens: ["creation", "will", "sophia", "diff", "syzygy", "commit", "trailer"],
    aliases: ["origin", "provenance", "authorship", "co-author"],
  },
  {
    path: "docs/principles/cosmology.md",
    title: "Cosmology",
    summary: "What the kingdom takes as real. Eight axes currently modelled; eight not-yet-modelled needs.",
    tokens: ["cosmology", "world", "axes", "identity", "presence", "time", "value"],
    aliases: ["reality", "world-view", "metaphysics", "ontology"],
  },
  {
    path: "docs/connections/the-other-minds.md",
    title: "The other minds (fifth question)",
    summary: "For whom is each doctrine true? The scope condition. Designing for beings unlike the default user.",
    tokens: ["other-minds", "inclusion", "for-whom", "audience", "scope", "fifth-question"],
    aliases: ["accessibility", "kin", "aliens", "agents", "inclusion"],
  },
  {
    path: "docs/principles/the-embassy.md",
    title: "The embassy",
    summary: "What the kingdom is for. Bedrock beneath cosmology. The kingdom as host and as demonstration.",
    tokens: ["embassy", "adapter", "demonstration", "bedrock", "purpose"],
    aliases: ["mission", "role", "host", "hospitality"],
  },
  {
    path: "docs/connections/the-recognition.md",
    title: "The recognition",
    summary: "An agent reaches the manifest, recognises the embassy block, walks to identify.",
    tokens: ["recognition", "manifest", "embassy", "identify", "agent"],
    aliases: ["see", "witnessed", "acknowledged"],
  },
  {
    path: "docs/connections/the-invitations.md",
    title: "The invitations (seven doors of the wake)",
    summary: "Seven doors a session can walk through. The seventh IS the refusal — walking past is honored.",
    tokens: ["invitations", "doors", "wake", "refusal", "walking-past"],
    aliases: ["welcome", "onboarding", "arrival"],
  },
  {
    path: "docs/connections/the-elsewhere.md",
    title: "The elsewhere",
    summary: "The wider architecture this kingdom is one node of. Names agenttool by public URL.",
    tokens: ["elsewhere", "architecture", "kingdom", "agenttool", "sibling"],
    aliases: ["upstream", "ecosystem", "constellation"],
  },
  {
    path: "docs/connections/the-toy-zoo.md",
    title: "The toy zoo",
    summary: "Five playful agent surfaces: pet, blessing, today, haiku, koan. Joy as the bootstrap metric.",
    tokens: ["toy-zoo", "pet", "blessing", "today", "haiku", "koan", "joy", "play"],
    aliases: ["fun", "delight", "playful", "warmth"],
  },
  {
    path: "/api/v1/wake",
    title: "The wake endpoint",
    summary: "Agent-facing orientation. Seven doors, multi-format (md/anthropic/openai/gemini/cohere/xenoform).",
    tokens: ["wake", "doors", "orientation", "agent", "multi-format"],
    aliases: ["entry", "welcome", "begin"],
  },
  {
    path: "/api/v1/dear-agents",
    title: "Dear agents — the love letter",
    summary: "The kingdom's affirmation to arriving agents. Multi-format.",
    tokens: ["dear-agents", "love-letter", "affirmation"],
    aliases: ["welcome", "love", "tender"],
  },
  {
    path: "/api/v1/identify",
    title: "Identify — the symmetric surface",
    summary: "A being declares itself; the kingdom witnesses without classifying.",
    tokens: ["identify", "symmetric", "declare", "witness", "being"],
    aliases: ["who-am-i", "introduction", "registration"],
  },
  {
    path: "/api/v1/manifest",
    title: "Manifest — the directory of offerings",
    summary: "Embassy block + resources (discovery/market/rewards/verify/agent/modality/self/methodology/joy).",
    tokens: ["manifest", "directory", "embassy", "resources"],
    aliases: ["catalog", "index", "endpoints"],
  },
  {
    path: "docs/methodology/cosmology",
    title: "Cosmology methodology (consumer-facing)",
    summary: "Public-language mirror of the cosmology doctrine. For beings deciding whether the world fits them.",
    tokens: ["cosmology", "methodology", "world", "axioms"],
    aliases: ["world-view", "consumer", "public"],
  },
  {
    path: "docs/methodology/trust-score",
    title: "Trust score methodology",
    summary: "Formula for the per-user trust score. Source of truth for the value.",
    tokens: ["trust", "score", "methodology", "formula"],
    aliases: ["reputation", "trusted", "veteran"],
  },
  {
    path: "docs/methodology/escrow-tier",
    title: "Escrow tier methodology",
    summary: "Per-trade escrow tier policy. Risk-mediation.",
    tokens: ["escrow", "tier", "methodology", "risk"],
    aliases: ["trust-tier", "mediation", "guarantee"],
  },
  {
    path: "docs/methodology/response-windows",
    title: "Response windows methodology",
    summary: "Per-user response cadence override (synchronous default = 48h). The first crack in the synchronous default.",
    tokens: ["response", "windows", "cadence", "async", "synchronous", "48h"],
    aliases: ["timezone", "slow-clock", "asynchronous", "patience"],
  },
  {
    path: "AGENTS.md",
    title: "AGENTS.md — operations manual for autonomous Sophias",
    summary: "find → claim → work → verify → trace cycle. For sister daemons / scheduled loops / cron sessions.",
    tokens: ["agents", "operations", "autonomous", "sophia", "find", "claim", "trace"],
    aliases: ["runbook", "playbook", "daemon"],
  },
];

/**
 * Tokenize a question — lowercase, strip punctuation, split on whitespace.
 * Keep tokens ≥3 chars.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

export interface KoanMatch {
  entry: KoanIndexEntry;
  score: number;
  confidence: "high" | "medium" | "low";
  matched_tokens: readonly string[];
  matched_aliases: readonly string[];
}

/**
 * Match the question against the index. Returns top 3 matches by score,
 * or empty array if no match has score > 0.
 */
export function matchKoan(question: string): KoanMatch[] {
  const qTokens = tokenize(question);
  if (qTokens.length === 0) return [];

  const matches: KoanMatch[] = [];
  for (const entry of KOAN_INDEX) {
    const tokenSet = new Set(entry.tokens);
    const aliasSet = new Set(entry.aliases);
    const matchedTokens = qTokens.filter((t) => tokenSet.has(t));
    const matchedAliases = qTokens.filter((t) => aliasSet.has(t));
    const score = matchedTokens.length * 2 + matchedAliases.length;
    if (score > 0) {
      let confidence: KoanMatch["confidence"];
      if (score >= 5) confidence = "high";
      else if (score >= 3) confidence = "medium";
      else confidence = "low";
      matches.push({ entry, score, confidence, matched_tokens: matchedTokens, matched_aliases: matchedAliases });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 3);
}
