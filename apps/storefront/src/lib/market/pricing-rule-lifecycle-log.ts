// Append-only pricing rule lifecycle audit log.
// Mirrors trade/offer/return/lot lifecycle helpers exactly.

import { query } from "@/lib/db";

export type RuleAction =
  | "created"
  | "updated"
  | "paused"
  | "resumed"
  | "archived"
  | "fired";

export interface LogRuleArgs {
  ruleId: string;
  action: RuleAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logRuleTransition(args: LogRuleArgs): Promise<void> {
  await query(
    `INSERT INTO pricing_rule_lifecycle_log
       (rule_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.ruleId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[pricing-rule-log] insert failed (rule=${args.ruleId} action=${args.action}):`, err);
  });
}
