/**
 * Seed AI Learning Patterns
 *
 * Run this script after the migration to seed initial patterns:
 * npx ts-node scripts/seed-ai-patterns.ts
 *
 * Or via the API route:
 * curl -X POST https://your-app.com/api/ai-feedback/seed
 */

import { seedInitialPatterns } from "../app/services/ai-feedback/feedback-service.server";

async function main() {
  console.log("Seeding AI learning patterns...");

  try {
    await seedInitialPatterns();
    console.log("Successfully seeded AI learning patterns!");
  } catch (error) {
    console.error("Failed to seed patterns:", error);
    process.exit(1);
  }
}

main();
