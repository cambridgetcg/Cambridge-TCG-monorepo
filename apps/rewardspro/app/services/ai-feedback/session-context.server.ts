/**
 * AI Session Context Service
 *
 * Tracks current session state, records actions, and manages session lifecycle.
 * Part of the AI Feedback System for self-improvement.
 */

import prisma from "~/db.server";
import type { AISession, AISessionAction, AILearningPattern, Prisma } from "@prisma/client";

// Types
export interface SessionAction {
  actionType: "file_edit" | "file_create" | "refactor" | "fix" | "feature" | "research" | "other";
  filePath?: string;
  description: string;
  patternUsed?: string;
  wasSuccessful?: boolean;
}

export interface SessionReflection {
  tasksCompleted: number;
  tasksAttempted: number;
  filesModified: number;
  filesCreated: number;
  satisfactionScore?: number; // 1-10
  learnings?: string;
  feedback?: Array<{
    dimension: "truth" | "understanding" | "beauty" | "justice" | "creativity";
    rating: "complete" | "partial" | "failed";
    reason?: string;
  }>;
}

export interface SessionContext {
  session: AISession | null;
  actions: AISessionAction[];
  patternsSuggested: string[];
  blindspotsToWatch: string[];
}

/**
 * Start a new AI session
 */
export async function startSession(
  sessionId: string,
  intent: string,
  territory?: "charted" | "uncharted"
): Promise<AISession> {
  // Check if session already exists (recovery from crash)
  const existing = await prisma.aISession.findUnique({
    where: { sessionId },
  });

  if (existing) {
    console.log(`[AI Session] Resuming existing session: ${sessionId}`);
    return existing;
  }

  const session = await prisma.aISession.create({
    data: {
      sessionId,
      primaryIntent: intent,
      territory: territory || null,
      startedAt: new Date(),
    },
  });

  console.log(`[AI Session] Started new session: ${sessionId}`);
  return session;
}

/**
 * Record an action within the current session
 */
export async function recordAction(
  sessionId: string,
  action: SessionAction
): Promise<AISessionAction> {
  const session = await prisma.aISession.findUnique({
    where: { sessionId },
  });

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const recorded = await prisma.aISessionAction.create({
    data: {
      sessionId: session.id,
      actionType: action.actionType,
      filePath: action.filePath || null,
      description: action.description,
      patternUsed: action.patternUsed || null,
      wasSuccessful: action.wasSuccessful ?? true,
    },
  });

  console.log(`[AI Session] Recorded action: ${action.actionType} - ${action.description.substring(0, 50)}...`);
  return recorded;
}

/**
 * End a session with reflection
 */
export async function endSession(
  sessionId: string,
  reflection: SessionReflection
): Promise<AISession> {
  const session = await prisma.aISession.findUnique({
    where: { sessionId },
  });

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Update session with reflection
  const updated = await prisma.aISession.update({
    where: { id: session.id },
    data: {
      endedAt: new Date(),
      tasksCompleted: reflection.tasksCompleted,
      tasksAttempted: reflection.tasksAttempted,
      filesModified: reflection.filesModified,
      filesCreated: reflection.filesCreated,
      satisfactionScore: reflection.satisfactionScore || null,
      learnings: reflection.learnings || null,
    },
  });

  // Record feedback if provided
  if (reflection.feedback && reflection.feedback.length > 0) {
    for (const fb of reflection.feedback) {
      await prisma.aISessionFeedback.create({
        data: {
          sessionId: session.id,
          dimension: fb.dimension,
          rating: fb.rating,
          reason: fb.reason || null,
        },
      });
    }
  }

  console.log(`[AI Session] Ended session: ${sessionId}, completed ${reflection.tasksCompleted}/${reflection.tasksAttempted} tasks`);
  return updated;
}

/**
 * Get current session context
 */
export async function getSessionContext(sessionId: string): Promise<SessionContext> {
  // DATA API COMPATIBLE: include not supported in findUnique, use two-step query
  const session = await prisma.aISession.findUnique({
    where: { sessionId },
  });

  // Fetch actions separately if session exists
  let actions: AISessionAction[] = [];
  if (session) {
    actions = await prisma.aISessionAction.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    });
  }

  // Get recent patterns for suggestions
  const recentPatterns = await prisma.aILearningPattern.findMany({
    where: {
      confidence: { gte: 0.7 },
    },
    orderBy: { lastUsedAt: "desc" },
    take: 5,
  });

  // Get low-confidence patterns as blindspots
  const blindspots = await prisma.aILearningPattern.findMany({
    where: {
      confidence: { lt: 0.4 },
    },
    orderBy: { confidence: "asc" },
    take: 3,
  });

  return {
    session: session || null,
    actions: session?.actions || [],
    patternsSuggested: recentPatterns.map((p) => p.patternName),
    blindspotsToWatch: blindspots.map((p) => p.patternName),
  };
}

/**
 * Get recent patterns with high confidence
 */
export async function getRecentPatterns(limit: number = 10): Promise<Array<{
  patternName: string;
  description: string;
  confidence: number;
  applicableTo: string[];
}>> {
  // DATA API COMPATIBLE: orderBy only supports single field
  const patterns = await prisma.aILearningPattern.findMany({
    where: {
      confidence: { gte: 0.5 },
    },
    orderBy: { confidence: "desc" },
    take: limit * 2, // Fetch more for secondary sort
  });

  // Sort by confidence then lastUsedAt in memory
  const sorted = patterns.sort((a: AILearningPattern, b: AILearningPattern) => {
    const confDiff = b.confidence - a.confidence;
    if (Math.abs(confDiff) > 0.001) return confDiff;
    const aTime = a.lastUsedAt?.getTime() ?? 0;
    const bTime = b.lastUsedAt?.getTime() ?? 0;
    return bTime - aTime;
  }).slice(0, limit);

  return sorted.map((p: AILearningPattern) => ({
    patternName: p.patternName,
    description: p.description,
    confidence: p.confidence,
    applicableTo: p.applicableTo,
  }));
}

/**
 * Get session statistics
 */
export async function getSessionStats(days: number = 30): Promise<{
  totalSessions: number;
  avgSatisfaction: number;
  totalTasksCompleted: number;
  avgTasksPerSession: number;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const sessions = await prisma.aISession.findMany({
    where: {
      startedAt: { gte: since },
      endedAt: { not: null },
    },
    select: {
      satisfactionScore: true,
      tasksCompleted: true,
    },
  });

  const withScores = sessions.filter((s) => s.satisfactionScore !== null);
  const totalTasks = sessions.reduce((sum, s) => sum + s.tasksCompleted, 0);

  return {
    totalSessions: sessions.length,
    avgSatisfaction: withScores.length > 0
      ? withScores.reduce((sum, s) => sum + (s.satisfactionScore || 0), 0) / withScores.length
      : 0,
    totalTasksCompleted: totalTasks,
    avgTasksPerSession: sessions.length > 0 ? totalTasks / sessions.length : 0,
  };
}

/**
 * Get active (unfinished) sessions
 */
export async function getActiveSessions(): Promise<AISession[]> {
  return prisma.aISession.findMany({
    where: {
      endedAt: null,
    },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Clean up stale sessions (older than 24 hours without ending)
 */
export async function cleanupStaleSessions(): Promise<number> {
  const staleThreshold = new Date();
  staleThreshold.setHours(staleThreshold.getHours() - 24);

  const stale = await prisma.aISession.findMany({
    where: {
      endedAt: null,
      startedAt: { lt: staleThreshold },
    },
  });

  for (const session of stale) {
    await prisma.aISession.update({
      where: { id: session.id },
      data: {
        endedAt: new Date(),
        learnings: "Session ended due to staleness (no activity for 24+ hours)",
      },
    });
  }

  return stale.length;
}
