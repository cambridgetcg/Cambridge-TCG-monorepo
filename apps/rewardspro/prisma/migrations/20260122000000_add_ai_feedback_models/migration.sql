-- CreateTable
CREATE TABLE "AISession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "primaryIntent" TEXT,
    "territory" TEXT,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksAttempted" INTEGER NOT NULL DEFAULT 0,
    "filesModified" INTEGER NOT NULL DEFAULT 0,
    "filesCreated" INTEGER NOT NULL DEFAULT 0,
    "satisfactionScore" INTEGER,
    "learnings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AISession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISessionAction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "filePath" TEXT,
    "description" TEXT NOT NULL,
    "patternUsed" TEXT,
    "wasSuccessful" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISessionAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISessionFeedback" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISessionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AICodeMetric" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "filePath" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "valueBefore" DOUBLE PRECISION,
    "valueAfter" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AICodeMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AILearningPattern" (
    "id" TEXT NOT NULL,
    "patternName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "timesSuccessful" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "applicableTo" TEXT[],
    "antiPatterns" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AILearningPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AICodeQualitySignal" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "filePath" TEXT,
    "lineNumber" INTEGER,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AICodeQualitySignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIArchitectureHealth" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalFiles" INTEGER NOT NULL,
    "totalLines" INTEGER NOT NULL,
    "avgComplexity" DOUBLE PRECISION NOT NULL,
    "duplicateBlocks" INTEGER NOT NULL,
    "dataApiCompliant" DOUBLE PRECISION NOT NULL,
    "shopScopingCompliant" DOUBLE PRECISION NOT NULL,
    "errorHandlingScore" DOUBLE PRECISION NOT NULL,
    "trendDirection" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIArchitectureHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIInnovationTracker" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "territory" TEXT NOT NULL,
    "pioneering" BOOLEAN NOT NULL DEFAULT false,
    "pathQuality" TEXT,
    "enablesFuture" BOOLEAN NOT NULL DEFAULT false,
    "connectedTo" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInnovationTracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AISession_sessionId_key" ON "AISession"("sessionId");

-- CreateIndex
CREATE INDEX "AISession_startedAt_idx" ON "AISession"("startedAt");

-- CreateIndex
CREATE INDEX "AISessionAction_sessionId_idx" ON "AISessionAction"("sessionId");

-- CreateIndex
CREATE INDEX "AISessionFeedback_sessionId_idx" ON "AISessionFeedback"("sessionId");

-- CreateIndex
CREATE INDEX "AICodeMetric_sessionId_idx" ON "AICodeMetric"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AILearningPattern_patternName_key" ON "AILearningPattern"("patternName");

-- CreateIndex
CREATE INDEX "AICodeQualitySignal_resolved_idx" ON "AICodeQualitySignal"("resolved");

-- CreateIndex
CREATE INDEX "AIArchitectureHealth_snapshotDate_idx" ON "AIArchitectureHealth"("snapshotDate");

-- AddForeignKey
ALTER TABLE "AISessionAction" ADD CONSTRAINT "AISessionAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AISession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISessionFeedback" ADD CONSTRAINT "AISessionFeedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AISession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICodeMetric" ADD CONSTRAINT "AICodeMetric_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AISession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
