# Prompt Evaluator

A standardized tool for evaluating the effectiveness of prompts used for codebase exploration across Claude Code instances.

## Overview

The Prompt Evaluator provides:

- **8 Evaluation Dimensions** with weighted scoring
- **Pre-built Templates** for common exploration tasks
- **CLI Interface** for interactive and quick evaluations
- **Report Generation** for tracking improvement over time
- **TypeScript API** for programmatic use

## Installation

The tool is already integrated into the project. No additional installation needed.

```bash
# Run CLI from project root
npx tsx tools/prompt-evaluator/cli.ts help
```

## Quick Start

### CLI Usage

```bash
# Interactive evaluation
npx tsx tools/prompt-evaluator/cli.ts evaluate

# Quick evaluation with scores
npx tsx tools/prompt-evaluator/cli.ts quick "What is the architecture?" UG:4 COV:5 BC:4 CLR:4 ACT:3 EFF:4 DA:4 REP:5

# View templates
npx tsx tools/prompt-evaluator/cli.ts templates

# View specific template
npx tsx tools/prompt-evaluator/cli.ts template feature-trace-complete

# Generate report
npx tsx tools/prompt-evaluator/cli.ts report

# Show dimensions
npx tsx tools/prompt-evaluator/cli.ts dimensions
```

### Programmatic Usage

```typescript
import {
  quickEvaluate,
  formatEvaluation,
  getTemplate,
  interpolateTemplate,
} from './tools/prompt-evaluator';

// Quick evaluation
const evaluation = quickEvaluate(
  'Trace cashback from order to customer credit',
  { UG: 5, COV: 5, BC: 5, CLR: 5, ACT: 5, EFF: 4, DA: 5, REP: 5 },
  { UG: 'Deep architectural insight', COV: 'Complete flow coverage', ... },
  'feature-trace',
  'rewardspro'
);

console.log(formatEvaluation(evaluation));
// Output: Composite 4.91 (Exceptional)

// Use template
const template = getTemplate('feature-trace-complete');
const prompt = interpolateTemplate(template, {
  featureName: 'tier progression',
  startPoint: 'order webhook',
  endPoint: 'customer tier state',
});
```

## Evaluation Dimensions

| Dimension | Weight | Description |
|-----------|--------|-------------|
| **UG** (Understanding) | 2.0x | Does the prompt lead to genuine comprehension? |
| **COV** (Coverage) | 1.5x | Does it explore appropriate breadth and depth? |
| **BC** (Bridging) | 1.5x | Does it connect concepts across the codebase? |
| **CLR** (Clarity) | 1.0x | Is the prompt unambiguous and output structured? |
| **ACT** (Actionability) | 2.0x | Can you do something concrete with the output? |
| **EFF** (Efficiency) | 1.0x | Does it achieve results without excess exploration? |
| **DA** (Domain Alignment) | 1.5x | Does it leverage domain-specific knowledge? |
| **REP** (Reproducibility) | 0.5x | Would the same prompt yield consistent results? |

### Scoring Scale (1-5)

- **5**: Exceptional - Ideal implementation
- **4**: Strong - Minor gaps
- **3**: Adequate - Room for improvement
- **2**: Weak - Significant issues
- **1**: Poor - Fundamental problems

### Composite Score Interpretation

- **4.5-5.0**: Exceptional - Use as template
- **4.0-4.4**: Strong - Minor refinements
- **3.5-3.9**: Good - Solid foundation
- **3.0-3.4**: Adequate - Needs work
- **2.5-2.9**: Weak - Major rework
- **<2.5**: Poor - Redesign

## Templates

### Categories

- **architecture**: System structure and entry points
- **data-model**: Database schema and relationships
- **feature-trace**: Business logic flow tracing
- **pattern-recognition**: Design pattern identification
- **cross-cutting**: Logging, auth, caching, errors
- **debugging**: Issue investigation
- **integration**: External service analysis
- **security**: Security audit

### Example Templates

#### Feature Trace (Target: 4.9)
```
Trace the complete implementation of {{featureName}}
from {{startPoint}} to {{endPoint}}.

For each step:
1. File path and function name
2. Input data received
3. Transformations applied
4. Error handling
5. Side effects

Include:
- Data flow diagram
- Decision points
- Debugging guidance
- Extension points
```

#### Architecture Overview (Target: 4.5)
```
What is the overall architecture of this {{codebase}} application?

Identify and document:
1. Main entry points ({{entryPoints}})
2. Route/controller organization
3. Service layer structure
4. Data access patterns
5. Key configuration files

For each layer, explain:
- Its responsibility
- How it interacts with adjacent layers
- Critical files to understand
```

## File Structure

```
tools/prompt-evaluator/
├── index.ts          # Main entry point, exports
├── types.ts          # TypeScript type definitions
├── dimensions.ts     # Dimension definitions and weights
├── evaluator.ts      # Core evaluation engine
├── templates.ts      # Pre-built prompt templates
├── cli.ts            # Command-line interface
├── CLAUDE.md         # Claude Code integration guide
├── README.md         # This file
├── package.json      # Package configuration
└── evaluations.json  # Saved evaluations storage
```

## Integration with Claude Code

See [CLAUDE.md](./CLAUDE.md) for detailed integration instructions.

### Recommended Workflow

1. **Identify Goal** - What do I need to understand?
2. **Select Template** - Check for pre-built templates
3. **Customize** - Add domain terms, specific files
4. **Execute** - Run the prompt
5. **Evaluate** - Score against 8 dimensions
6. **Iterate** - Refine if score < 4.0

## API Reference

### Core Functions

```typescript
// Create evaluation
createEvaluation(prompt, category, context, ratings): PromptEvaluation

// Quick evaluate with minimal input
quickEvaluate(prompt, scores, evidence, category?, codebase?): PromptEvaluation

// Calculate composite score
calculateCompositeScore(ratings): number

// Get overall rating from score
getOverallRating(compositeScore): OverallRating

// Format for display
formatEvaluation(evaluation): string

// Generate report from evaluations
generateReport(evaluations): EvaluationReport
```

### Template Functions

```typescript
// Get template by ID
getTemplate(id): PromptTemplate | undefined

// Get templates by category
getTemplatesByCategory(category): PromptTemplate[]

// Interpolate variables
interpolateTemplate(template, variables): string

// List all templates
listTemplates(): TemplateSummary[]
```

## Contributing

To add a new template:

1. Add to `PROMPT_TEMPLATES` array in `templates.ts`
2. Include: id, name, category, template, variables, targetScore, bestPractices
3. Test with real codebase exploration
4. Target score should be 4.0+ when used correctly

## License

MIT

---

*Prompt Evaluator v1.0.0 - Standardized for Claude Code*
