/**
 * AI Learning Loop Service
 *
 * Evolves pattern confidence, identifies blindspots, and generates
 * guidance for future sessions. Part of the AI Feedback System.
 */

import prisma from "~/db.server";
import type { AILearningPattern, AICodeQualitySignal, AISessionFeedback } from "@prisma/client";

// Types
export interface LearningCycleResult {
  patternsUpdated: number;
  blindspotsIdentified: number;
  signalsAnalyzed: number;
  recommendations: string[];
}

export interface Blindspot {
  patternName: string;
  confidence: number;
  failureRate: number;
  lastFailure?: Date;
  recommendation: string;
}

export interface Improvement {
  area: string;
  type: "pattern" | "process" | "knowledge";
  description: string;
  priority: "high" | "medium" | "low";
}

export interface Guidance {
  patternsToUse: string[];
  blindspotsToWatch: string[];
  relevantSignals: AICodeQualitySignal[];
  recentLearnings: string[];
}

/**
 * Run a complete learning cycle
 * Analyzes recent sessions, updates confidence, identifies patterns
 */
export async function runLearningCycle(): Promise<LearningCycleResult> {
  const result: LearningCycleResult = {
    patternsUpdated: 0,
    blindspotsIdentified: 0,
    signalsAnalyzed: 0,
    recommendations: [],
  };

  // 1. Analyze recent session feedback
  const recentFeedback = await prisma.aISessionFeedback.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
    },
    include: {
      session: true,
    },
  });

  // Group feedback by dimension
  const feedbackByDimension: Record<string, AISessionFeedback[]> = {};
  for (const fb of recentFeedback) {
    if (!feedbackByDimension[fb.dimension]) {
      feedbackByDimension[fb.dimension] = [];
    }
    feedbackByDimension[fb.dimension].push(fb);
  }

  // Analyze each dimension
  for (const [dimension, feedback] of Object.entries(feedbackByDimension)) {
    const total = feedback.length;
    const complete = feedback.filter((f) => f.rating === "complete").length;
    const failed = feedback.filter((f) => f.rating === "failed").length;

    const successRate = total > 0 ? complete / total : 0;

    if (successRate < 0.5 && total >= 3) {
      result.recommendations.push(
        `${dimension} dimension has low success rate (${(successRate * 100).toFixed(0)}%). Review recent failures and update patterns.`
      );
    }
  }

  // 2. Update pattern confidence based on recent actions
  const recentActions = await prisma.aISessionAction.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      patternUsed: { not: null },
    },
  });

  // Group by pattern
  const actionsByPattern: Record<string, { total: number; successful: number }> = {};
  for (const action of recentActions) {
    if (!action.patternUsed) continue;
    if (!actionsByPattern[action.patternUsed]) {
      actionsByPattern[action.patternUsed] = { total: 0, successful: 0 };
    }
    actionsByPattern[action.patternUsed].total++;
    if (action.wasSuccessful) {
      actionsByPattern[action.patternUsed].successful++;
    }
  }

  // Update patterns
  for (const [patternName, stats] of Object.entries(actionsByPattern)) {
    const pattern = await prisma.aILearningPattern.findUnique({
      where: { patternName },
    });

    if (pattern) {
      const newTimesUsed = pattern.timesUsed + stats.total;
      const newTimesSuccessful = pattern.timesSuccessful + stats.successful;
      const newConfidence = newTimesUsed > 0 ? newTimesSuccessful / newTimesUsed : 0.5;

      await prisma.aILearningPattern.update({
        where: { id: pattern.id },
        data: {
          timesUsed: newTimesUsed,
          timesSuccessful: newTimesSuccessful,
          confidence: newConfidence * 0.9 + pattern.confidence * 0.1, // Smooth update
          lastUsedAt: new Date(),
        },
      });

      result.patternsUpdated++;
    }
  }

  // 3. Identify blindspots (low confidence patterns)
  const lowConfidencePatterns = await prisma.aILearningPattern.findMany({
    where: {
      confidence: { lt: 0.4 },
      timesUsed: { gte: 3 },
    },
  });

  result.blindspotsIdentified = lowConfidencePatterns.length;

  for (const pattern of lowConfidencePatterns) {
    result.recommendations.push(
      `Pattern "${pattern.patternName}" has low confidence (${(pattern.confidence * 100).toFixed(0)}%). Consider reviewing or updating the approach.`
    );
  }

  // 4. Analyze unresolved signals
  const unresolvedSignals = await prisma.aICodeQualitySignal.findMany({
    where: { resolved: false },
    orderBy: { createdAt: "asc" },
  });

  result.signalsAnalyzed = unresolvedSignals.length;

  const highSeverity = unresolvedSignals.filter((s) => s.severity === "high");
  if (highSeverity.length > 0) {
    result.recommendations.push(
      `${highSeverity.length} high-severity signals remain unresolved. Prioritize addressing these.`
    );
  }

  const oldSignals = unresolvedSignals.filter(
    (s) => Date.now() - s.createdAt.getTime() > 14 * 24 * 60 * 60 * 1000
  );
  if (oldSignals.length > 0) {
    result.recommendations.push(
      `${oldSignals.length} signals are older than 2 weeks. Consider addressing or dismissing.`
    );
  }

  console.log(`[AI Learning] Cycle complete: ${JSON.stringify(result)}`);
  return result;
}

/**
 * Identify specific blindspots with recommendations
 */
export async function identifyBlindspots(): Promise<Blindspot[]> {
  const patterns = await prisma.aILearningPattern.findMany({
    where: {
      timesUsed: { gte: 2 },
    },
  });

  const blindspots: Blindspot[] = [];

  for (const pattern of patterns) {
    const failureRate = pattern.timesUsed > 0
      ? 1 - pattern.timesSuccessful / pattern.timesUsed
      : 0;

    if (pattern.confidence < 0.4 || failureRate > 0.3) {
      blindspots.push({
        patternName: pattern.patternName,
        confidence: pattern.confidence,
        failureRate,
        lastFailure: pattern.lastUsedAt || undefined,
        recommendation: getBlindspotRecommendation(pattern, failureRate),
      });
    }
  }

  return blindspots.sort((a, b) => a.confidence - b.confidence);
}

function getBlindspotRecommendation(
  pattern: AILearningPattern,
  failureRate: number
): string {
  if (failureRate > 0.5) {
    return `Pattern "${pattern.patternName}" fails more than half the time. Consider revising the approach or documenting when it doesn't apply.`;
  }
  if (pattern.confidence < 0.3) {
    return `Pattern "${pattern.patternName}" has very low confidence. Gather more context about when and how to apply it correctly.`;
  }
  if (pattern.timesUsed > 10 && failureRate > 0.2) {
    return `Pattern "${pattern.patternName}" has been used often but still has notable failures. Review failure cases for common factors.`;
  }
  return `Monitor pattern "${pattern.patternName}" for improvement opportunities.`;
}

/**
 * Suggest improvements based on analysis
 */
export async function suggestImprovements(): Promise<Improvement[]> {
  const improvements: Improvement[] = [];

  // Check session satisfaction trends
  const recentSessions = await prisma.aISession.findMany({
    where: {
      endedAt: { not: null },
      satisfactionScore: { not: null },
    },
    orderBy: { endedAt: "desc" },
    take: 10,
  });

  if (recentSessions.length >= 5) {
    const avgSatisfaction = recentSessions.reduce(
      (sum, s) => sum + (s.satisfactionScore || 0),
      0
    ) / recentSessions.length;

    if (avgSatisfaction < 6) {
      improvements.push({
        area: "Session Quality",
        type: "process",
        description: `Average satisfaction is ${avgSatisfaction.toFixed(1)}/10. Review recent sessions for common issues.`,
        priority: "high",
      });
    }
  }

  // Check for unused patterns
  const unusedPatterns = await prisma.aILearningPattern.findMany({
    where: {
      OR: [
        { lastUsedAt: null },
        { lastUsedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  if (unusedPatterns.length > 3) {
    improvements.push({
      area: "Pattern Usage",
      type: "knowledge",
      description: `${unusedPatterns.length} patterns haven't been used in 30+ days. Review if they're still relevant or need updates.`,
      priority: "low",
    });
  }

  // Check unresolved signal count
  const unresolvedCount = await prisma.aICodeQualitySignal.count({
    where: { resolved: false },
  });

  if (unresolvedCount > 10) {
    improvements.push({
      area: "Code Quality",
      type: "process",
      description: `${unresolvedCount} unresolved code signals. Schedule time to address technical debt.`,
      priority: "medium",
    });
  }

  return improvements.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Get guidance for a specific task type
 */
export async function getGuidanceForTask(
  taskType: string,
  context?: string[]
): Promise<Guidance> {
  // Get patterns applicable to this task
  const applicablePatterns = await prisma.aILearningPattern.findMany({
    where: {
      confidence: { gte: 0.6 },
      ...(context && context.length > 0 && {
        applicableTo: { hasSome: context },
      }),
    },
    orderBy: { confidence: "desc" },
    take: 5,
  });

  // Get blindspots to watch
  const blindspots = await prisma.aILearningPattern.findMany({
    where: {
      confidence: { lt: 0.5 },
      ...(context && context.length > 0 && {
        applicableTo: { hasSome: context },
      }),
    },
    take: 3,
  });

  // Get relevant signals
  const relevantSignals = await prisma.aICodeQualitySignal.findMany({
    where: {
      resolved: false,
      ...(context && context.length > 0 && {
        area: { in: context.filter((c) =>
          ["services", "routes", "components", "utils"].includes(c)
        ) as any },
      }),
    },
    orderBy: { severity: "desc" },
    take: 5,
  });

  // Get recent learnings from sessions
  const recentSessions = await prisma.aISession.findMany({
    where: {
      learnings: { not: null },
    },
    orderBy: { endedAt: "desc" },
    take: 3,
  });

  return {
    patternsToUse: applicablePatterns.map((p) => p.patternName),
    blindspotsToWatch: blindspots.map((p) => p.patternName),
    relevantSignals,
    recentLearnings: recentSessions
      .map((s) => s.learnings)
      .filter((l): l is string => l !== null),
  };
}

/**
 * Calculate overall learning health score
 */
export async function getLearningHealthScore(): Promise<{
  score: number;
  breakdown: Record<string, number>;
  recommendations: string[];
}> {
  const [
    totalPatterns,
    highConfidencePatterns,
    unresolvedSignals,
    recentSessions,
  ] = await Promise.all([
    prisma.aILearningPattern.count(),
    prisma.aILearningPattern.count({ where: { confidence: { gte: 0.7 } } }),
    prisma.aICodeQualitySignal.count({ where: { resolved: false } }),
    prisma.aISession.findMany({
      where: {
        endedAt: { not: null },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { satisfactionScore: true, tasksCompleted: true, tasksAttempted: true },
    }),
  ]);

  // Calculate sub-scores
  const patternScore = totalPatterns > 0
    ? (highConfidencePatterns / totalPatterns) * 100
    : 50;

  const signalScore = Math.max(0, 100 - unresolvedSignals * 5);

  const sessionScore = recentSessions.length > 0
    ? recentSessions.reduce((sum, s) => sum + ((s.satisfactionScore || 5) * 10), 0) / recentSessions.length
    : 50;

  const completionScore = recentSessions.length > 0
    ? recentSessions.reduce((sum, s) => {
        const rate = s.tasksAttempted > 0 ? s.tasksCompleted / s.tasksAttempted : 1;
        return sum + rate * 100;
      }, 0) / recentSessions.length
    : 50;

  const overallScore = (patternScore + signalScore + sessionScore + completionScore) / 4;

  const recommendations: string[] = [];
  if (patternScore < 60) {
    recommendations.push("Improve pattern documentation and usage tracking");
  }
  if (signalScore < 60) {
    recommendations.push("Address outstanding code quality signals");
  }
  if (sessionScore < 60) {
    recommendations.push("Review recent sessions for quality improvement opportunities");
  }
  if (completionScore < 80) {
    recommendations.push("Focus on completing attempted tasks");
  }

  return {
    score: Math.round(overallScore),
    breakdown: {
      patterns: Math.round(patternScore),
      signals: Math.round(signalScore),
      satisfaction: Math.round(sessionScore),
      completion: Math.round(completionScore),
    },
    recommendations,
  };
}
