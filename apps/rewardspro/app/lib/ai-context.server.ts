/**
 * AI Context - Unified Interface
 *
 * Single entry point for Claude to interact with the AI Feedback System.
 * Provides read/write access to product health, session data, and learning.
 */

import * as sessionService from "~/services/ai-feedback/session-context.server";
import * as feedbackService from "~/services/ai-feedback/feedback-service.server";
import * as learningService from "~/services/ai-feedback/learning-loop.server";
import prisma from "~/db.server";
import type { AICodeQualitySignal, AIArchitectureHealth } from "@prisma/client";

// Types
export interface ProductHealth {
  architectureScore: number;
  unresolvedSignals: number;
  recentTrend: "improving" | "stable" | "declining";
  lastSnapshot?: AIArchitectureHealth;
}

export interface Change {
  date: Date;
  sessionId: string;
  filesModified: number;
  filesCreated: number;
  tasksCompleted: number;
}

export interface Action {
  type: "file_edit" | "file_create" | "refactor" | "fix" | "feature" | "research" | "other";
  file?: string;
  description: string;
  pattern?: string;
  success?: boolean;
}

export interface Outcome {
  pattern: string;
  success: boolean;
  context?: string[];
}

/**
 * Unified AI Context Interface
 *
 * Usage in Claude sessions:
 * - At start: call getProductHealth() and getGuidance()
 * - During: call logAction() for significant actions
 * - On issues: call flagSignal()
 * - At end: call recordOutcome() for patterns used
 */
export const aiContext = {
  // =====================
  // READ OPERATIONS
  // =====================

  /**
   * Get current product health metrics
   */
  async getProductHealth(): Promise<ProductHealth> {
    const [latestSnapshot, unresolvedSignals] = await Promise.all([
      feedbackService.getArchitectureHealth(),
      feedbackService.getActiveSignals(),
    ]);

    // Calculate score from snapshot or default
    const score = latestSnapshot
      ? (latestSnapshot.dataApiCompliant +
          latestSnapshot.shopScopingCompliant +
          latestSnapshot.errorHandlingScore) / 3
      : 70;

    return {
      architectureScore: Math.round(score),
      unresolvedSignals: unresolvedSignals.length,
      recentTrend: latestSnapshot?.trendDirection as ProductHealth["recentTrend"] || "stable",
      lastSnapshot: latestSnapshot || undefined,
    };
  },

  /**
   * Get recent changes across sessions
   */
  async getRecentChanges(days: number = 7): Promise<Change[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sessions = await prisma.aISession.findMany({
      where: {
        endedAt: { not: null },
        startedAt: { gte: since },
      },
      orderBy: { startedAt: "desc" },
    });

    return sessions.map((s) => ({
      date: s.startedAt,
      sessionId: s.sessionId,
      filesModified: s.filesModified,
      filesCreated: s.filesCreated,
      tasksCompleted: s.tasksCompleted,
    }));
  },

  /**
   * Get active code quality signals
   */
  async getActiveSignals(
    area?: string,
    severity?: string
  ): Promise<AICodeQualitySignal[]> {
    return feedbackService.getActiveSignals(area, severity);
  },

  /**
   * Get guidance for current task
   */
  async getGuidance(
    taskType: string,
    context?: string[]
  ): Promise<{
    patternsToUse: string[];
    blindspotsToWatch: string[];
    relevantSignals: AICodeQualitySignal[];
    recentLearnings: string[];
  }> {
    return learningService.getGuidanceForTask(taskType, context);
  },

  /**
   * Get learning health score
   */
  async getLearningHealth(): Promise<{
    score: number;
    breakdown: Record<string, number>;
    recommendations: string[];
  }> {
    return learningService.getLearningHealthScore();
  },

  /**
   * Get recent patterns
   */
  async getPatterns(limit?: number): Promise<Array<{
    patternName: string;
    description: string;
    confidence: number;
    applicableTo: string[];
  }>> {
    return sessionService.getRecentPatterns(limit);
  },

  /**
   * Get session statistics
   */
  async getSessionStats(days?: number): Promise<{
    totalSessions: number;
    avgSatisfaction: number;
    totalTasksCompleted: number;
    avgTasksPerSession: number;
  }> {
    return sessionService.getSessionStats(days);
  },

  // =====================
  // WRITE OPERATIONS
  // =====================

  /**
   * Start a new session
   */
  async startSession(
    sessionId: string,
    intent: string,
    territory?: "charted" | "uncharted"
  ) {
    return sessionService.startSession(sessionId, intent, territory);
  },

  /**
   * Log an action within current session
   */
  async logAction(sessionId: string, action: Action): Promise<void> {
    await sessionService.recordAction(sessionId, {
      actionType: action.type,
      filePath: action.file,
      description: action.description,
      patternUsed: action.pattern,
      wasSuccessful: action.success,
    });
  },

  /**
   * Log an insight discovered during work
   */
  async logInsight(insight: string): Promise<void> {
    // For now, just log - could be stored in a dedicated table later
    console.log(`[AI Insight] ${insight}`);
  },

  /**
   * Flag a code quality signal
   */
  async flagSignal(signal: {
    area: "services" | "routes" | "components" | "utils" | "other";
    type: "ugliness" | "debt" | "complexity" | "duplication";
    severity: "low" | "medium" | "high";
    description: string;
    file?: string;
    line?: number;
  }): Promise<AICodeQualitySignal> {
    return feedbackService.flagCodeSignal({
      area: signal.area,
      signalType: signal.type,
      severity: signal.severity,
      description: signal.description,
      filePath: signal.file,
      lineNumber: signal.line,
    });
  },

  /**
   * Record outcome for a pattern
   */
  async recordOutcome(outcome: Outcome): Promise<void> {
    await feedbackService.updatePatternConfidence(
      outcome.pattern,
      outcome.success,
      outcome.context
    );
  },

  /**
   * End session with reflection
   */
  async endSession(
    sessionId: string,
    reflection: {
      tasksCompleted: number;
      tasksAttempted: number;
      filesModified: number;
      filesCreated: number;
      satisfaction?: number;
      learnings?: string;
      feedback?: Array<{
        dimension: "truth" | "understanding" | "beauty" | "justice" | "creativity";
        rating: "complete" | "partial" | "failed";
        reason?: string;
      }>;
    }
  ) {
    return sessionService.endSession(sessionId, {
      ...reflection,
      satisfactionScore: reflection.satisfaction,
    });
  },

  /**
   * Write session narrative to markdown
   */
  async writeNarrative(sessionId: string, narrative: string): Promise<void> {
    await feedbackService.writeSessionNarrative(sessionId, narrative);
  },

  // =====================
  // MAINTENANCE
  // =====================

  /**
   * Run learning cycle (call periodically)
   */
  async runLearningCycle() {
    return learningService.runLearningCycle();
  },

  /**
   * Seed initial patterns (call once during setup)
   */
  async seedPatterns(): Promise<void> {
    await feedbackService.seedInitialPatterns();
  },

  /**
   * Clean up stale sessions
   */
  async cleanup(): Promise<{ sessionsCleaned: number }> {
    const cleaned = await sessionService.cleanupStaleSessions();
    return { sessionsCleaned: cleaned };
  },

  /**
   * Update patterns.md from database
   */
  async updatePatternsDoc(): Promise<void> {
    await feedbackService.updatePatternsMarkdown();
  },
};

// Export type for the aiContext
export type AIContext = typeof aiContext;
