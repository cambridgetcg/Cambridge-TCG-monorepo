#!/usr/bin/env npx ts-node

/**
 * Prompt Evaluator - CLI Interface
 *
 * Command-line interface for evaluating prompts,
 * viewing templates, and generating reports.
 *
 * Usage:
 *   npx ts-node tools/prompt-evaluator/cli.ts evaluate
 *   npx ts-node tools/prompt-evaluator/cli.ts templates
 *   npx ts-node tools/prompt-evaluator/cli.ts template arch-overview
 *   npx ts-node tools/prompt-evaluator/cli.ts report
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import type {
  DimensionKey,
  DimensionRating,
  EvaluationContext,
  PromptCategory,
  PromptEvaluation,
  RatingScore,
} from './types.js';

import { DIMENSIONS, getAllDimensionKeys } from './dimensions.js';
import {
  createEvaluation,
  formatEvaluation,
  generateReport,
  quickEvaluate,
} from './evaluator.js';
import {
  getTemplate,
  listTemplates,
  PROMPT_TEMPLATES,
} from './templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EVALUATIONS_FILE = path.join(__dirname, 'evaluations.json');

// Colors for terminal
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function printHeader(text: string): void {
  console.log(`\n${colors.cyan}${colors.bold}═══ ${text} ═══${colors.reset}\n`);
}

function printSubHeader(text: string): void {
  console.log(`${colors.blue}▸ ${text}${colors.reset}`);
}

function printSuccess(text: string): void {
  console.log(`${colors.green}✓ ${text}${colors.reset}`);
}

function printWarning(text: string): void {
  console.log(`${colors.yellow}⚠ ${text}${colors.reset}`);
}

function printError(text: string): void {
  console.log(`${colors.red}✗ ${text}${colors.reset}`);
}

/**
 * Interactive evaluation mode
 */
async function runInteractiveEvaluation(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  printHeader('PROMPT EVALUATOR - Interactive Mode');

  // Get prompt
  console.log('Enter the prompt you want to evaluate (press Enter twice to finish):');
  let prompt = '';
  let emptyLines = 0;
  while (emptyLines < 1) {
    const line = await question('');
    if (line === '') {
      emptyLines++;
    } else {
      emptyLines = 0;
      prompt += (prompt ? '\n' : '') + line;
    }
  }

  if (!prompt.trim()) {
    printError('No prompt entered. Exiting.');
    rl.close();
    return;
  }

  // Get category
  printSubHeader('Select category:');
  const categories: PromptCategory[] = [
    'architecture', 'data-model', 'feature-trace', 'pattern-recognition',
    'cross-cutting', 'debugging', 'integration', 'performance', 'security', 'custom',
  ];
  categories.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
  const catChoice = parseInt(await question('Enter number: '), 10);
  const category = categories[catChoice - 1] || 'custom';

  // Get context
  printSubHeader('Context:');
  const codebase = await question('Codebase name: ');
  const domain = await question('Domain (e.g., e-commerce, loyalty, fintech): ');
  const depthChoice = await question('Exploration depth (1=quick, 2=medium, 3=thorough): ');
  const depth = ['quick', 'medium', 'thorough'][parseInt(depthChoice, 10) - 1] || 'medium';

  const context: EvaluationContext = {
    codebase: codebase || 'unknown',
    domain: domain || 'software',
    targetAudience: 'self',
    explorationDepth: depth as 'quick' | 'medium' | 'thorough',
  };

  // Rate each dimension
  printSubHeader('Rate each dimension (1-5):');
  const ratings: DimensionRating[] = [];

  for (const dim of DIMENSIONS) {
    console.log(`\n${colors.bold}${dim.key} - ${dim.name}${colors.reset}`);
    console.log(`${colors.dim}${dim.description}${colors.reset}`);
    console.log(`${colors.dim}Criteria:${colors.reset}`);
    for (let i = 5; i >= 1; i--) {
      console.log(`  ${i}: ${dim.criteria[i as RatingScore]}`);
    }

    const scoreStr = await question(`Score for ${dim.key}: `);
    const score = Math.min(5, Math.max(1, parseInt(scoreStr, 10) || 3)) as RatingScore;

    const evidence = await question(`Evidence/notes (optional): `);

    ratings.push({
      dimension: dim.key,
      score,
      evidence: evidence || `Scored ${score}/5`,
    });
  }

  // Create evaluation
  const evaluation = createEvaluation(prompt, category, context, ratings);

  // Display result
  console.log(formatEvaluation(evaluation));

  // Save option
  const saveChoice = await question('\nSave this evaluation? (y/n): ');
  if (saveChoice.toLowerCase() === 'y') {
    saveEvaluation(evaluation);
    printSuccess('Evaluation saved!');
  }

  rl.close();
}

/**
 * Quick evaluation from command line
 */
function runQuickEvaluation(args: string[]): void {
  // Format: quick "prompt" UG:4 COV:4 BC:5 CLR:4 ACT:4 EFF:4 DA:5 REP:4
  if (args.length < 2) {
    printError('Usage: cli.ts quick "prompt" UG:4 COV:4 ...');
    return;
  }

  const prompt = args[0];
  const scores: Partial<Record<DimensionKey, RatingScore>> = {};
  const evidence: Partial<Record<DimensionKey, string>> = {};

  for (let i = 1; i < args.length; i++) {
    const [dim, scoreStr] = args[i].split(':');
    if (getAllDimensionKeys().includes(dim as DimensionKey)) {
      scores[dim as DimensionKey] = parseInt(scoreStr, 10) as RatingScore;
      evidence[dim as DimensionKey] = `Quick eval: ${scoreStr}/5`;
    }
  }

  // Fill in missing dimensions with 3
  for (const dim of getAllDimensionKeys()) {
    if (!scores[dim]) {
      scores[dim] = 3;
      evidence[dim] = 'Default score';
    }
  }

  const evaluation = quickEvaluate(
    prompt,
    scores as Record<DimensionKey, RatingScore>,
    evidence as Record<DimensionKey, string>
  );

  console.log(formatEvaluation(evaluation));
}

/**
 * List all templates
 */
function showTemplates(): void {
  printHeader('PROMPT TEMPLATES');

  const byCategory = new Map<PromptCategory, typeof PROMPT_TEMPLATES>();
  for (const t of PROMPT_TEMPLATES) {
    if (!byCategory.has(t.category)) {
      byCategory.set(t.category, []);
    }
    byCategory.get(t.category)!.push(t);
  }

  for (const [category, templates] of byCategory) {
    printSubHeader(category.toUpperCase());
    for (const t of templates) {
      console.log(`  ${colors.bold}${t.id}${colors.reset}`);
      console.log(`    ${t.name} (target: ${t.targetScore})`);
      console.log(`    Variables: ${t.variables.join(', ') || 'none'}`);
    }
    console.log();
  }
}

/**
 * Show a specific template
 */
function showTemplate(templateId: string): void {
  const template = getTemplate(templateId);

  if (!template) {
    printError(`Template not found: ${templateId}`);
    console.log('Available templates:');
    listTemplates().forEach((t) => console.log(`  - ${t.id}`));
    return;
  }

  printHeader(`TEMPLATE: ${template.name}`);

  console.log(`${colors.bold}ID:${colors.reset} ${template.id}`);
  console.log(`${colors.bold}Category:${colors.reset} ${template.category}`);
  console.log(`${colors.bold}Target Score:${colors.reset} ${template.targetScore}`);
  console.log(`${colors.bold}Variables:${colors.reset} ${template.variables.join(', ') || 'none'}`);

  console.log(`\n${colors.bold}Template:${colors.reset}`);
  console.log(`${colors.dim}─────────${colors.reset}`);
  console.log(template.template);
  console.log(`${colors.dim}─────────${colors.reset}`);

  console.log(`\n${colors.bold}Best Practices:${colors.reset}`);
  template.bestPractices.forEach((p) => console.log(`  • ${p}`));
}

/**
 * Generate report from saved evaluations
 */
function showReport(): void {
  const evaluations = loadEvaluations();

  if (evaluations.length === 0) {
    printWarning('No evaluations found. Run some evaluations first!');
    return;
  }

  const report = generateReport(evaluations);

  printHeader('EVALUATION REPORT');

  console.log(`${colors.bold}Summary${colors.reset}`);
  console.log(`  Total Prompts Evaluated: ${report.summary.totalPrompts}`);
  console.log(`  Average Score: ${report.summary.averageScore.toFixed(2)}`);

  console.log(`\n${colors.bold}Score Distribution${colors.reset}`);
  for (const [rating, count] of Object.entries(report.summary.scoreDistribution)) {
    if (count > 0) {
      const bar = '█'.repeat(count) + '░'.repeat(10 - count);
      console.log(`  ${rating.padEnd(12)} ${bar} ${count}`);
    }
  }

  console.log(`\n${colors.bold}Dimension Performance${colors.reset}`);
  console.log(`  Strongest: ${report.summary.strongestDimensions.join(', ')}`);
  console.log(`  Weakest: ${report.summary.weakestDimensions.join(', ')}`);

  console.log(`\n${colors.bold}Category Performance${colors.reset}`);
  for (const [cat, score] of Object.entries(report.summary.categoryPerformance)) {
    console.log(`  ${cat.padEnd(20)} ${score.toFixed(2)}`);
  }

  console.log(`\n${colors.bold}Recommendations${colors.reset}`);
  report.recommendations.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));

  console.log(`\n${colors.dim}Generated: ${report.generatedAt}${colors.reset}`);
}

/**
 * Save evaluation to file
 */
function saveEvaluation(evaluation: PromptEvaluation): void {
  const evaluations = loadEvaluations();
  evaluations.push(evaluation);
  fs.writeFileSync(EVALUATIONS_FILE, JSON.stringify(evaluations, null, 2));
}

/**
 * Load evaluations from file
 */
function loadEvaluations(): PromptEvaluation[] {
  try {
    if (fs.existsSync(EVALUATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(EVALUATIONS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading evaluations:', e);
  }
  return [];
}

/**
 * Show help
 */
function showHelp(): void {
  printHeader('PROMPT EVALUATOR - Help');

  console.log(`${colors.bold}Commands:${colors.reset}

  ${colors.cyan}evaluate${colors.reset}
    Start interactive evaluation mode

  ${colors.cyan}quick "prompt" UG:4 COV:4 BC:5 CLR:4 ACT:4 EFF:4 DA:5 REP:4${colors.reset}
    Quick evaluate with scores on command line

  ${colors.cyan}templates${colors.reset}
    List all available prompt templates

  ${colors.cyan}template <id>${colors.reset}
    Show a specific template

  ${colors.cyan}report${colors.reset}
    Generate report from saved evaluations

  ${colors.cyan}dimensions${colors.reset}
    Show all dimension definitions

  ${colors.cyan}help${colors.reset}
    Show this help message

${colors.bold}Examples:${colors.reset}

  # Interactive evaluation
  npx ts-node tools/prompt-evaluator/cli.ts evaluate

  # Quick evaluation
  npx ts-node tools/prompt-evaluator/cli.ts quick "What is the architecture?" UG:4 COV:5 BC:4 CLR:4 ACT:3 EFF:4 DA:4 REP:5

  # View feature-trace template
  npx ts-node tools/prompt-evaluator/cli.ts template feature-trace-complete
`);
}

/**
 * Show dimension definitions
 */
function showDimensions(): void {
  printHeader('EVALUATION DIMENSIONS');

  for (const dim of DIMENSIONS) {
    console.log(`\n${colors.bold}${dim.key} - ${dim.name}${colors.reset} (weight: ${dim.weight}x)`);
    console.log(`${colors.dim}${dim.description}${colors.reset}\n`);
    console.log('Scoring criteria:');
    for (let i = 5; i >= 1; i--) {
      console.log(`  ${i}: ${dim.criteria[i as RatingScore]}`);
    }
  }
}

/**
 * Main entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'evaluate':
      runInteractiveEvaluation();
      break;
    case 'quick':
      runQuickEvaluation(args.slice(1));
      break;
    case 'templates':
      showTemplates();
      break;
    case 'template':
      showTemplate(args[1]);
      break;
    case 'report':
      showReport();
      break;
    case 'dimensions':
      showDimensions();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

main();
