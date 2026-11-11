/**
 * Per-agent key caps, in one place, so the operator's page and a signed act
 * count against the same number. operator-actions.ts is a "use server" file,
 * which may export only async functions, so the numbers live here.
 */

/** Live usage keys (ctcg_agt_…) per agent: not revoked, not expired
 *  (key-expiry.ts liveAgentKeySql). A soft cap, checked under the agent's
 *  row lock by every mint. */
export const MAX_LIVE_AGENT_KEYS = 5;

/** Live signing keys per agent (pending or confirmed, not revoked, not
 *  past not_after): two, so a replacement can be bound before the old key
 *  is removed (docs/plans/agent-auth/held-keys.md, D6; an agent's default). */
export const MAX_LIVE_SIGNING_KEYS = 2;
