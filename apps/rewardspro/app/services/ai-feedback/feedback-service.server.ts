/**
 * AI Feedback Service
 *
 * Records feedback, updates pattern confidence, detects code signals,
 * and generates insights. Part of the AI Feedback System for self-improvement.
 */

import prisma from "~/db.server";
import * as fs from "fs/promises";
import * as path from "path";
import type { AILearningPattern, AICodeQualitySignal, AIArchitectureHealth, AISessionAction, AISessionFeedback } from "@prisma/client";

// Types
export interface FeedbackInput {
  sessionId: string;
  dimension: "truth" | "understanding" | "beauty" | "justice" | "creativity";
  rating: "complete" | "partial" | "failed";
  reason?: string;
}

export interface PatternUpdate {
  patternName: string;
  wasSuccessful: boolean;
  context?: string[];
}

export interface CodeSignal {
  area: "services" | "routes" | "components" | "utils" | "other";
  signalType: "ugliness" | "debt" | "complexity" | "duplication";
  severity: "low" | "medium" | "high";
  description: string;
  filePath?: string;
  lineNumber?: number;
}

export interface PatternSynthesis {
  highConfidence: AILearningPattern[];
  lowConfidence: AILearningPattern[];
  mostUsed: AILearningPattern[];
  recentlyUsed: AILearningPattern[];
}

const AI_FEEDBACK_DIR = path.join(process.cwd(), ".ai-feedback");

/**
 * Record feedback for a session
 */
export async function recordFeedback(feedback: FeedbackInput): Promise<void> {
  const session = await prisma.aISession.findUnique({
    where: { sessionId: feedback.sessionId },
  });

  if (!session) {
    throw new Error(`Session not found: ${feedback.sessionId}`);
  }

  await prisma.aISessionFeedback.create({
    data: {
      sessionId: session.id,
      dimension: feedback.dimension,
      rating: feedback.rating,
      reason: feedback.reason || null,
    },
  });

  console.log(`[AI Feedback] Recorded ${feedback.dimension}: ${feedback.rating}`);
}

/**
 * Update pattern confidence based on outcome
 */
export async function updatePatternConfidence(
  patternName: string,
  wasSuccessful: boolean,
  context?: string[]
): Promise<AILearningPattern> {
  let pattern = await prisma.aILearningPattern.findUnique({
    where: { patternName },
  });

  if (!pattern) {
    // Create new pattern
    pattern = await prisma.aILearningPattern.create({
      data: {
        patternName,
        description: `Auto-created pattern: ${patternName}`,
        timesUsed: 1,
        timesSuccessful: wasSuccessful ? 1 : 0,
        confidence: wasSuccessful ? 0.6 : 0.4,
        applicableTo: context || [],
        antiPatterns: [],
        lastUsedAt: new Date(),
      },
    });
  } else {
    // Update existing pattern
    const newTimesUsed = pattern.timesUsed + 1;
    const newTimesSuccessful = pattern.timesSuccessful + (wasSuccessful ? 1 : 0);

    // Calculate new confidence with recency bonus
    const baseConfidence = newTimesSuccessful / newTimesUsed;
    const daysSinceLastUse = pattern.lastUsedAt
      ? (Date.now() - pattern.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24)
      : 30;
    const recencyBonus = Math.max(0, 1 - daysSinceLastUse / 30) * 0.1;
    const newConfidence = Math.min(1, baseConfidence * 0.7 + recencyBonus * 0.3 + (wasSuccessful ? 0.1 : 0));

    pattern = await prisma.aILearningPattern.update({
      where: { id: pattern.id },
      data: {
        timesUsed: newTimesUsed,
        timesSuccessful: newTimesSuccessful,
        confidence: newConfidence,
        lastUsedAt: new Date(),
        applicableTo: context && context.length > 0
          ? [...new Set([...pattern.applicableTo, ...context])]
          : pattern.applicableTo,
      },
    });
  }

  console.log(`[AI Feedback] Pattern "${patternName}" confidence: ${pattern.confidence.toFixed(2)}`);
  return pattern;
}

/**
 * Flag a code quality signal
 */
export async function flagCodeSignal(signal: CodeSignal): Promise<AICodeQualitySignal> {
  const created = await prisma.aICodeQualitySignal.create({
    data: {
      area: signal.area,
      signalType: signal.signalType,
      severity: signal.severity,
      description: signal.description,
      filePath: signal.filePath || null,
      lineNumber: signal.lineNumber || null,
      resolved: false,
    },
  });

  console.log(`[AI Feedback] Flagged ${signal.signalType} signal in ${signal.area}: ${signal.description.substring(0, 50)}...`);
  return created;
}

/**
 * Mark a signal as resolved
 */
export async function resolveSignal(
  signalId: string,
  resolvedBySessionId: string
): Promise<AICodeQualitySignal> {
  return prisma.aICodeQualitySignal.update({
    where: { id: signalId },
    data: {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy: resolvedBySessionId,
    },
  });
}

/**
 * Get active (unresolved) signals
 */
export async function getActiveSignals(
  area?: string,
  severity?: string
): Promise<AICodeQualitySignal[]> {
  // DATA API COMPATIBLE: orderBy only supports single field
  const signals = await prisma.aICodeQualitySignal.findMany({
    where: {
      resolved: false,
      ...(area && { area }),
      ...(severity && { severity }),
    },
    orderBy: { createdAt: "desc" },
  });

  // Sort by severity then createdAt in memory
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return signals.sort((a: any, b: any) => {
    const sevDiff = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Get architecture health snapshot
 */
export async function getArchitectureHealth(): Promise<AIArchitectureHealth | null> {
  return prisma.aIArchitectureHealth.findFirst({
    orderBy: { snapshotDate: "desc" },
  });
}

/**
 * Create architecture health snapshot
 */
export async function createArchitectureSnapshot(metrics: {
  totalFiles: number;
  totalLines: number;
  avgComplexity: number;
  duplicateBlocks: number;
  dataApiCompliant: number;
  shopScopingCompliant: number;
  errorHandlingScore: number;
  trendDirection: "improving" | "stable" | "declining";
}): Promise<AIArchitectureHealth> {
  return prisma.aIArchitectureHealth.create({
    data: {
      ...metrics,
      snapshotDate: new Date(),
    },
  });
}

/**
 * Synthesize patterns into categories
 */
export async function synthesizePatterns(): Promise<PatternSynthesis> {
  const [highConfidence, lowConfidence, mostUsed, recentlyUsed] = await Promise.all([
    prisma.aILearningPattern.findMany({
      where: { confidence: { gte: 0.8 } },
      orderBy: { confidence: "desc" },
      take: 10,
    }),
    prisma.aILearningPattern.findMany({
      where: { confidence: { lt: 0.4 } },
      orderBy: { confidence: "asc" },
      take: 10,
    }),
    prisma.aILearningPattern.findMany({
      orderBy: { timesUsed: "desc" },
      take: 10,
    }),
    prisma.aILearningPattern.findMany({
      where: { lastUsedAt: { not: null } },
      orderBy: { lastUsedAt: "desc" },
      take: 10,
    }),
  ]);

  return { highConfidence, lowConfidence, mostUsed, recentlyUsed };
}

/**
 * Write session narrative to markdown
 */
export async function writeSessionNarrative(
  sessionId: string,
  narrative: string
): Promise<void> {
  // DATA API COMPATIBLE: include not supported in findUnique, use two-step query
  const session = await prisma.aISession.findUnique({
    where: { sessionId },
  });

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Fetch related data separately
  const [actions, feedback] = await Promise.all([
    prisma.aISessionAction.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.aISessionFeedback.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const date = new Date().toISOString().split("T")[0];
  const filename = `${date}-${sessionId.substring(0, 8)}.md`;
  const filepath = path.join(AI_FEEDBACK_DIR, "sessions", filename);

  const content = `# Session: ${sessionId}

**Date**: ${date}
**Intent**: ${session.primaryIntent || "Not specified"}
**Territory**: ${session.territory || "Unknown"}

## Summary

${narrative}

## Statistics

- Tasks Completed: ${session.tasksCompleted}/${session.tasksAttempted}
- Files Modified: ${session.filesModified}
- Files Created: ${session.filesCreated}
- Satisfaction: ${session.satisfactionScore || "Not rated"}/10

## Actions

${actions.map((a: AISessionAction) => `- [${a.actionType}] ${a.description}${a.patternUsed ? ` (pattern: ${a.patternUsed})` : ""}`).join("\n")}

## Feedback

${feedback.map((f: AISessionFeedback) => `- **${f.dimension}**: ${f.rating}${f.reason ? ` - ${f.reason}` : ""}`).join("\n") || "No feedback recorded"}

## Learnings

${session.learnings || "No specific learnings noted"}

---
*Generated by AI Feedback System*
`;

  await fs.writeFile(filepath, content, "utf-8");
  console.log(`[AI Feedback] Wrote session narrative to ${filename}`);
}

/**
 * Update patterns.md with current patterns
 */
export async function updatePatternsMarkdown(): Promise<void> {
  const patterns = await prisma.aILearningPattern.findMany({
    where: { confidence: { gte: 0.5 } },
    orderBy: { confidence: "desc" },
  });

  const filepath = path.join(AI_FEEDBACK_DIR, "learnings", "patterns.md");

  let content = `# Successful Patterns

Patterns that have proven effective when working on RewardsPro.
Confidence scores evolve based on usage outcomes.

---

`;

  for (const pattern of patterns) {
    content += `## ${pattern.patternName}
**Confidence: ${pattern.confidence.toFixed(2)}** | Uses: ${pattern.timesUsed} | Successes: ${pattern.timesSuccessful}

${pattern.description}

**Applicable to**: ${pattern.applicableTo.join(", ") || "General"}
${pattern.antiPatterns.length > 0 ? `**Anti-patterns**: ${pattern.antiPatterns.join(", ")}` : ""}

---

`;
  }

  content += `
*Last updated: ${new Date().toISOString().split("T")[0]}*
*Total patterns: ${patterns.length}*
*Average confidence: ${(patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length || 0).toFixed(2)}*
`;

  await fs.writeFile(filepath, content, "utf-8");
  console.log(`[AI Feedback] Updated patterns.md with ${patterns.length} patterns`);
}

/**
 * Seed initial patterns (call once during setup)
 */
export async function seedInitialPatterns(): Promise<void> {
  const initialPatterns = [
    {
      patternName: "Two-Step Query",
      description: "When Aurora Data API adapter doesn't support nested includes, use two separate queries and join in memory.",
      confidence: 0.95,
      timesUsed: 12,
      timesSuccessful: 12,
      applicableTo: ["data-api", "prisma"],
      antiPatterns: ["nested-includes"],
    },
    {
      patternName: "In-Memory Aggregation",
      description: "When groupBy is not supported by Aurora Data API, use findMany with in-memory aggregation.",
      confidence: 0.92,
      timesUsed: 8,
      timesSuccessful: 8,
      applicableTo: ["data-api", "prisma"],
      antiPatterns: ["groupBy"],
    },
    {
      patternName: "Shop Scoping",
      description: "Every database query MUST include shop scope for multi-tenant isolation.",
      confidence: 0.98,
      timesUsed: 50,
      timesSuccessful: 50,
      applicableTo: ["database", "security"],
      antiPatterns: ["unscoped-queries"],
    },
    {
      patternName: "HMAC Verification",
      description: "Always verify webhook HMAC signature before processing.",
      confidence: 0.99,
      timesUsed: 20,
      timesSuccessful: 20,
      applicableTo: ["webhooks", "security"],
      antiPatterns: ["unverified-webhooks"],
    },
    {
      patternName: "Tier Resolution",
      description: "Use updateCustomerToEffectiveTier() for tier changes, never set currentTierId directly.",
      confidence: 0.97,
      timesUsed: 10,
      timesSuccessful: 10,
      applicableTo: ["tier-system"],
      antiPatterns: ["direct-tier-assignment"],
    },
  ];

  for (const pattern of initialPatterns) {
    const existing = await prisma.aILearningPattern.findUnique({
      where: { patternName: pattern.patternName },
    });

    if (!existing) {
      await prisma.aILearningPattern.create({
        data: {
          ...pattern,
          lastUsedAt: new Date(),
        },
      });
      console.log(`[AI Feedback] Seeded pattern: ${pattern.patternName}`);
    }
  }
}
