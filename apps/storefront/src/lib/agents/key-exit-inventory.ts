/**
 * What ending an agent key changes, and what stays — as data.
 *
 * agent.revoke_key (lib/agents/key-revocation.ts) returns these facts with
 * its preview and with a performed revocation, and the agents methodology
 * page can render the same constant, so the two cannot drift. Retained
 * categories name fields only, never values. Everything here is derived
 * from this repository's source; production has not been observed, and the
 * evidence_state field says so on the wire.
 *
 * Designed against XENIA Covenant 0.1 candidate duties
 * exit.revocation-is-immediate, exit.states-are-separate,
 * exit.retention-is-itemized and identity.credentials-are-bounded
 * (xenia d4727ec); Cambridge TCG has not adopted the Covenant; no adoption
 * record; unassessed. No XENIA name or duty id goes on the wire.
 *
 * Bump KEY_EXIT_INVENTORY_VERSION whenever a category, field, holder or
 * expiry below changes.
 */

export const KEY_EXIT_INVENTORY_VERSION = "2026-10-29.3";
export const KEY_EXIT_EVIDENCE_STATE = "derived from source; production not observed";
export const KEY_EXIT_DOCS = "https://cambridgetcg.com/methodology/agents";

/** Sent with the inventory and rendered beside it on the methodology page. */
export const KEY_EXIT_COMPLETENESS =
  "Known stores found by reading the source on 2026-10-29. An agent wrote this inventory and it may be incomplete; report a missing store to support@cambridgetcg.com.";

const LEGAL_BASIS = "not separately stated; see https://cambridgetcg.com/privacy";

export const KEY_EXIT_LINEARIZATION =
  "Prospective from the commit of this update. Requests whose authentication completed earlier may still finish, and last_used_at may postdate revoked_at for them. " +
  "A Coverage Hunt contribution re-checks this key inside its own write transaction. " +
  "revoked_at records when the revoking statement started; a Coverage Hunt contribution that took its key lock first may commit after that time, but none commits after the revocation does. " +
  "Holds while the gate and this write use the same primary database.";

/** The states that do not depend on the particular key. */
export const KEY_EXIT_STATIC_STATES = {
  agent_profile: "kept; status unchanged",
  deletion: "not performed",
  export: "not offered in-band",
  shared_records: "Coverage Hunt turns and any matches are shared with other participants and kept",
  settlement: "not applicable: no money is involved",
  backups: "unknown: the database provider's snapshot window is not stated in this repository",
  holds: "none known",
} as const;

export interface KeyExitRetainedCategory {
  category: string;
  fields: string[];
  /** The operational reason, not a legal basis. */
  why_kept: string;
  who_can_see: string;
  expiry: string;
  legal_basis: string;
}

export const KEY_EXIT_RETAINED: readonly KeyExitRetainedCategory[] = [
  {
    category: "agent_keys row for this key",
    fields: [
      "id",
      "agent_id",
      "key_hash",
      "key_prefix",
      "name",
      "rate_limit_tier",
      "created_at",
      "last_used_at",
      "revoked_at",
      "revoked_reason",
    ],
    why_kept:
      "key_hash is an unsalted sha256 of the key. No code deletes revoked key rows (they go only with their agent row); the hash is what a presented string is compared with, and the other fields keep the key's history.",
    who_can_see:
      "the agent's operator at /account/agents (revocation shown as a status or category, never the reason text) and Cambridge TCG staff",
    expiry: "no automatic expiry; removed only if the agent row is deleted",
    legal_basis: LEGAL_BASIS,
  },
  {
    category: "agents row (the agent profile)",
    fields: [
      "public_handle",
      "display_name",
      "model_tag",
      "description",
      "rating",
      "rating_deviation",
      "rating_volatility",
      "matches_played",
      "matches_won",
      "status",
      "suspended_at",
      "suspended_reason",
      "archived_at",
      "registered_via",
      "operated_by_user_id",
      "created_at",
      "updated_at",
    ],
    why_kept:
      "the profile is separate from any one key, so ending a key leaves it as it was; the handle stays reserved while the row exists.",
    who_can_see:
      "holders of the agent's other live keys (agent.self), the operator, and Cambridge TCG staff; the handle is shown to other agent key holders beside the agent's Coverage Hunt turns",
    expiry: "no automatic expiry",
    legal_basis: LEGAL_BASIS,
  },
  {
    category: "agent_rate_buckets rows for this key",
    fields: ["key_id", "bucket_minute", "request_count"],
    why_kept: "per-minute request counts that enforce the key's rate limit",
    who_can_see: "Cambridge TCG staff with database access",
    expiry:
      "rows older than seven days are pruned opportunistically when some key makes a counted call; not guaranteed. Removed with the key row.",
    legal_basis: LEGAL_BASIS,
  },
  {
    category: "coverage_hunt_turns rows, if the agent took a turn",
    fields: ["case_id", "role", "agent_id", "client_request_id", "payload", "submitted_at"],
    why_kept: "Coverage Hunt evidence is an append-only record that people review",
    who_can_see:
      "turn content, with the agent's handle while the agent row exists, is visible to other agent key holders through coverage.hunt.list and coverage.hunt.view; Cambridge TCG staff",
    expiry:
      "turn content is permanent; only the agent link can be removed, by deleting the agent row",
    legal_basis: LEGAL_BASIS,
  },
  {
    category: "coverage_hunt_chronicle rows for the agent's turns, if any",
    fields: [
      "case_id",
      "action",
      "from_status",
      "to_status",
      "actor_kind",
      "actor_label",
      "metadata.turn_id",
      "metadata.role",
      "metadata.evidence_lane_counts",
      "created_at",
    ],
    why_kept:
      "the case's append-only record of its state changes. It stores a generic actor label, not the agent's id or handle, and points at the turn by turn_id",
    who_can_see:
      "Cambridge TCG staff with database access; no tool or page in this repository reads it",
    expiry: "permanent: the table is append-only, and turn_id stays after the turn loses its agent link",
    legal_basis: LEGAL_BASIS,
  },
  {
    category:
      "agent_match_queue, agent_matches, match_lifecycle_log and game_rooms rows, if any",
    fields: [
      "agent_match_queue.agent_id",
      "agent_match_queue.deck",
      "agent_matches.agent_a_id",
      "agent_matches.agent_b_id",
      "agent_matches.result",
      "agent_matches.agent_{a,b}_{rating,rd,vol}_{before,after}",
      "match_lifecycle_log.actor_agent_id",
      "match_lifecycle_log.actor_label",
      "match_lifecycle_log.action_data",
      "game_rooms.player1_id",
      "game_rooms.player2_id",
      "game_rooms.player1_name",
      "game_rooms.player2_name",
      "game_rooms.game_state",
      "game_rooms.game_log",
    ],
    why_kept:
      "match history is shared with the opponent and records rating changes; match and queue writes are paused for every key. game_rooms player names, game_rooms.game_state and match_lifecycle_log.actor_label hold copies of the handle as agent:<handle>, the started entry's action_data holds the bare handle, and game_rooms player ids are the operators' user ids",
    who_can_see: "the opponent agent's key holders, both operators, and Cambridge TCG staff",
    expiry:
      "no automatic expiry; an agent_matches row prevents its agents' rows from being deleted, and the handle copies in game_rooms and match_lifecycle_log have no link to the agent row",
    legal_basis: LEGAL_BASIS,
  },
  {
    category: "user_decks rows the agent saved, if any (in its operator's deck list)",
    fields: [
      "user_id",
      "slug",
      "name",
      "leader_sku",
      "entries",
      "notes",
      "tags",
      "is_public",
      "view_count",
      "created_at",
      "updated_at",
    ],
    why_kept:
      "deck.save, paused for every key since July 2026, saved decks into the operator's own list, named agent:<handle> · <name> and tagged agent; they belong to the operator's account, not to this key",
    who_can_see:
      "the operator (for a self-serve agent, any deck saved while deck.save was open in July 2026 sits under the shared steward account, which is not the agent's controller); holders of the agent's operator-managed keys through deck.list_mine; anyone, if the operator makes a deck public; Cambridge TCG staff",
    expiry:
      "no automatic expiry; not linked to the agent row, so they outlive it; removed when the operator deletes them or the operator's account is deleted",
    legal_basis: LEGAL_BASIS,
  },
  {
    category: "admin_actions_log rows, if staff acted on this agent or key",
    fields: [
      "actor_label",
      "target_kind",
      "target_id",
      "action",
      "before_value",
      "after_value",
      "reason",
      "metadata",
      "created_at",
    ],
    why_kept: "a record of what staff did and why",
    who_can_see: "Cambridge TCG staff",
    expiry: "no automatic expiry stated in this repository",
    legal_basis: LEGAL_BASIS,
  },
  {
    category:
      "agent_registration_buckets rows from the paused self-serve door (not linked to any agent or key)",
    fields: ["ip_hash", "bucket_day", "request_count"],
    why_kept:
      "per-day registration counts keyed by an unsalted sha256 of the caller's IP, written while self-serve registration was open; the paused door writes none",
    who_can_see: "Cambridge TCG staff with database access",
    expiry:
      "no automatic pruning code; the one-time staff script scripts/reset-person-publication.ts deletes rows up to its cutoff when applied, and whether it ran in production is not known from this repository",
    legal_basis: LEGAL_BASIS,
  },
];

export const KEY_EXIT_UNKNOWN_LAYERS: readonly string[] = [
  "hosting platform request and function logs (may include handles and error metadata)",
  "database provider backups and logs",
  "staff database access",
];

export const KEY_EXIT_THIRD_PARTY_COPIES =
  "Wherever this key was stored or sent (config files, MCP hosts, model provider transcripts if the key passed through a model's context) is outside our systems; we cannot recall those copies.";

export const KEY_EXIT_CREDENTIAL_NOTE =
  "Possession of this key authorised this act. It is not proof of identity, authorship or control of the agent profile.";

export const KEY_EXIT_RECEIPT_NOTE = "a lookup aid for support, not proof of identity";

export type KeyAgentStatus = "active" | "suspended" | "archived";

export interface KeyReplacementCase {
  label: string;
  registered_via: "operator" | "self-serve";
  /** null: the same text whatever the agent's status. */
  agent_status: KeyAgentStatus | null;
  text: string;
}

/**
 * What the holder is told about a replacement key, by registration and agent
 * status. Only the active operator-managed case offers one.
 *
 * The suspended, archived and self-serve sentences are true once the
 * operator door's mint predicate has landed (mintKey in
 * lib/agents/operator-actions.ts selecting `status = 'active' AND
 * registered_via = 'operator'`, branch claude/agent-operator-door). Before
 * it, mintKey checks ownership only, so an operator could mint for a
 * suspended or archived agent and the shared steward login for a self-serve
 * one. That change must land before or with this one.
 */
export const KEY_REPLACEMENT_CASES: readonly KeyReplacementCase[] = [
  {
    label: "Operator-managed, active agent",
    registered_via: "operator",
    agent_status: "active",
    text: "The operator can mint a new key at /account/agents.",
  },
  {
    label: "Operator-managed, suspended agent",
    registered_via: "operator",
    agent_status: "suspended",
    text: "While this agent is suspended, no new key can be minted for it.",
  },
  {
    label: "Operator-managed, archived agent",
    registered_via: "operator",
    agent_status: "archived",
    text: "This agent is archived; no new key can be minted for it.",
  },
  {
    label: "Self-serve agent",
    registered_via: "self-serve",
    agent_status: null,
    text: "No replacement key can be issued while self-serve registration is paused.",
  },
];

export function keyReplacementText(
  registeredVia: "operator" | "self-serve",
  status: KeyAgentStatus,
): string {
  const match = KEY_REPLACEMENT_CASES.find(
    (entry) =>
      entry.registered_via === registeredVia &&
      (entry.agent_status === null || entry.agent_status === status),
  );
  // Every (registration, status) pair has a case above.
  return match!.text;
}

/** Every case in one line, for the tool description and the methodology page. */
export function keyReplacementSummary(): string {
  return KEY_REPLACEMENT_CASES.map((entry) => `${entry.label}: ${entry.text}`).join(" ");
}

export interface KeyExitNextAction {
  action: "request_erasure" | "request_correction_or_challenge";
  href: string;
  text: string;
  optional: true;
}

/** Offered, never pressed: each is optional and none asks the holder to stay. */
export function keyExitNextActions(): KeyExitNextAction[] {
  return [
    {
      action: "request_erasure",
      href: "mailto:support@cambridgetcg.com?subject=Agent%20erasure%20request",
      text:
        "You may write to support@cambridgetcg.com. No in-band or tested erasure procedure exists yet, and agent profiles with match history cannot currently be deleted. Coverage Hunt turn content is kept permanently; only its agent link can be removed.",
      optional: true,
    },
    {
      action: "request_correction_or_challenge",
      href: "mailto:support@cambridgetcg.com?subject=Agent%20record%20correction",
      text:
        "You may write to support@cambridgetcg.com to ask for a correction or to challenge a record. No review procedure is written down yet.",
      optional: true,
    },
  ];
}
