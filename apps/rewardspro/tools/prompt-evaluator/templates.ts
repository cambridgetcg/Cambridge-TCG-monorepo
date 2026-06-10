/**
 * Prompt Evaluator - Prompt Templates Library
 *
 * Pre-built, high-scoring prompt templates for common
 * codebase exploration scenarios.
 */

import type { PromptCategory, PromptTemplate } from './types.js';

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // Architecture Templates
  {
    id: 'arch-overview',
    name: 'Architecture Overview',
    category: 'architecture',
    template: `What is the overall architecture of this {{codebase}} application?

Identify and document:
1. Main entry points ({{entryPoints}})
2. Route/controller organization
3. Service layer structure in {{servicePath}}
4. Data access patterns
5. Key configuration files

For each layer, explain:
- Its responsibility
- How it interacts with adjacent layers
- Critical files to understand`,
    variables: ['codebase', 'entryPoints', 'servicePath'],
    targetScore: 4.5,
    bestPractices: [
      'Name specific directories to examine',
      'Ask for inter-layer interactions',
      'Request critical files identification',
    ],
  },
  {
    id: 'arch-entry-points',
    name: 'Entry Points & Request Flow',
    category: 'architecture',
    template: `Trace the complete request lifecycle in this {{framework}} application.

Starting from {{entryFile}}:
1. How is the application bootstrapped?
2. What middleware/interceptors process requests?
3. How is authentication/authorization handled?
4. What is the route → handler → response flow?
5. Where do cross-cutting concerns (logging, errors) integrate?

Provide a timeline showing each step with file locations.`,
    variables: ['framework', 'entryFile'],
    targetScore: 4.8,
    bestPractices: [
      'Specify the framework for context',
      'Name the entry file explicitly',
      'Request timeline format for clarity',
    ],
  },

  // Data Model Templates
  {
    id: 'data-model-complete',
    name: 'Complete Data Model Mapping',
    category: 'data-model',
    template: `Map the complete data model for this {{domain}} application.

Using {{schemaFile}}:
1. Identify all entities and their purposes
2. Document relationships (1:1, 1:M, M:M)
3. Note important enums and their values
4. Identify the "single source of truth" patterns
5. Document audit/history tables

Group entities by domain area:
{{domainAreas}}

For key entities, explain the business logic they encode.`,
    variables: ['domain', 'schemaFile', 'domainAreas'],
    targetScore: 4.6,
    bestPractices: [
      'Reference the schema file directly',
      'List expected domain areas',
      'Ask for business logic interpretation',
    ],
  },
  {
    id: 'data-relationships',
    name: 'Entity Relationships Deep Dive',
    category: 'data-model',
    template: `Analyze the relationships around {{entityName}} in {{schemaFile}}.

Document:
1. All direct relationships (what it references, what references it)
2. Cascade behavior on delete/update
3. Optional vs required relationships
4. Indexes that support these relationships
5. Common query patterns these relationships enable

Include an entity relationship diagram in text format.`,
    variables: ['entityName', 'schemaFile'],
    targetScore: 4.4,
    bestPractices: [
      'Focus on one entity for depth',
      'Request cascade behavior',
      'Ask for query pattern implications',
    ],
  },

  // Feature Tracing Templates
  {
    id: 'feature-trace-complete',
    name: 'Complete Feature Trace',
    category: 'feature-trace',
    template: `Trace the complete implementation of {{featureName}} from {{startPoint}} to {{endPoint}}.

For each step in the flow:
1. File path and function/method name
2. Input data received
3. Transformations applied
4. Output data produced
5. Error handling at this step
6. Side effects (database, external APIs, events)

Include:
- Data flow diagram
- Decision points where behavior branches
- How to debug issues at each step
- How to extend this flow`,
    variables: ['featureName', 'startPoint', 'endPoint'],
    targetScore: 4.9,
    bestPractices: [
      'Name the feature with domain terminology',
      'Specify clear start and end points',
      'Request debugging guidance',
      'Ask for extension points',
    ],
  },
  {
    id: 'feature-trace-quick',
    name: 'Quick Feature Trace',
    category: 'feature-trace',
    template: `How does {{featureName}} work in this codebase?

Trace from user action to database and back:
1. Entry point (route/endpoint)
2. Business logic (service)
3. Data access (repository/model)
4. External integrations (if any)

Focus on the happy path. Note where errors could occur.`,
    variables: ['featureName'],
    targetScore: 4.2,
    bestPractices: [
      'Good for initial exploration',
      'Specify "happy path" for efficiency',
    ],
  },

  // Pattern Recognition Templates
  {
    id: 'patterns-all',
    name: 'Design Patterns Analysis',
    category: 'pattern-recognition',
    template: `Identify design patterns used in this {{codebase}} application.

For each pattern found:
1. Pattern name and classification
2. File(s) where implemented
3. Code example showing the pattern
4. Why this pattern was chosen (inferred)
5. Benefits and tradeoffs in this context

Look specifically for:
- Structural patterns (Adapter, Facade, Repository)
- Behavioral patterns (Strategy, Observer, State Machine)
- Creational patterns (Factory, Builder)
- {{domainSpecificPatterns}}`,
    variables: ['codebase', 'domainSpecificPatterns'],
    targetScore: 4.5,
    bestPractices: [
      'List pattern categories to look for',
      'Add domain-specific patterns',
      'Request code examples',
    ],
  },

  // Cross-Cutting Concerns Templates
  {
    id: 'cross-cutting-all',
    name: 'Cross-Cutting Concerns Analysis',
    category: 'cross-cutting',
    template: `How does this codebase handle cross-cutting concerns?

Analyze each area:

1. LOGGING
   - Logger implementation ({{loggerPath}})
   - Log levels and when each is used
   - Structured vs unstructured logging
   - Correlation ID tracking

2. ERROR HANDLING
   - Error boundary patterns
   - Custom error types
   - Recovery strategies
   - User-facing error messages

3. AUTHENTICATION/AUTHORIZATION
   - Auth flow ({{authPath}})
   - Session management
   - Permission/role checking
   - Token handling

4. CACHING
   - Cache layers ({{cachePath}})
   - TTL strategies
   - Invalidation patterns
   - Cache key conventions

Show how these integrate together in a typical request.`,
    variables: ['loggerPath', 'authPath', 'cachePath'],
    targetScore: 4.7,
    bestPractices: [
      'Reference actual file paths',
      'Request integration example',
      'Cover all four areas',
    ],
  },

  // Debugging Templates
  {
    id: 'debug-feature',
    name: 'Debug Feature Not Working',
    category: 'debugging',
    template: `{{featureName}} is not working correctly.
Expected: {{expectedBehavior}}
Actual: {{actualBehavior}}

Help me debug by tracing:
1. The entry point for this feature
2. Key checkpoints where state changes
3. External dependencies that could fail
4. Common failure modes for this flow
5. Logging/monitoring that captures this flow

What data would I need to inspect at each checkpoint?`,
    variables: ['featureName', 'expectedBehavior', 'actualBehavior'],
    targetScore: 4.6,
    bestPractices: [
      'Clearly state expected vs actual',
      'Request checkpoint inspection data',
      'Ask for common failure modes',
    ],
  },
  {
    id: 'debug-performance',
    name: 'Debug Performance Issue',
    category: 'debugging',
    template: `{{component}} is slow/has performance issues.

Analyze potential bottlenecks:
1. Database queries (N+1, missing indexes, large scans)
2. External API calls (latency, rate limits)
3. Computation (CPU-intensive operations)
4. Memory (large objects, leaks)
5. Caching opportunities missed

For each bottleneck found:
- File and line number
- Why it's a problem
- How to measure it
- How to fix it`,
    variables: ['component'],
    targetScore: 4.5,
    bestPractices: [
      'Name the specific component',
      'Request measurement guidance',
      'Ask for fix recommendations',
    ],
  },

  // Integration Templates
  {
    id: 'integration-external',
    name: 'External Integration Analysis',
    category: 'integration',
    template: `Analyze how this application integrates with {{externalService}}.

Document:
1. Integration entry points ({{integrationPath}})
2. Authentication mechanism (OAuth, API key, etc.)
3. Request/response formats
4. Error handling and retry logic
5. Rate limiting and backoff
6. Webhook handling (if applicable)
7. Data transformation between systems

What happens when {{externalService}} is unavailable?`,
    variables: ['externalService', 'integrationPath'],
    targetScore: 4.5,
    bestPractices: [
      'Name the external service',
      'Reference integration code location',
      'Ask about failure scenarios',
    ],
  },

  // Security Templates
  {
    id: 'security-audit',
    name: 'Security Quick Audit',
    category: 'security',
    template: `Perform a security-focused review of this codebase.

Check for:
1. Input validation (user input, API payloads)
2. Authentication implementation
3. Authorization/permission checks
4. Sensitive data handling (PII, credentials)
5. HMAC/signature verification
6. SQL injection prevention
7. XSS prevention
8. CSRF protection

For each area:
- Where is it implemented?
- Are there gaps?
- What are the risks?`,
    variables: [],
    targetScore: 4.3,
    bestPractices: [
      'Cover OWASP top 10',
      'Request gap identification',
      'Ask for risk assessment',
    ],
  },
];

/**
 * Get template by ID
 */
export function getTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: PromptCategory): PromptTemplate[] {
  return PROMPT_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Interpolate template with variables
 */
export function interpolateTemplate(
  template: PromptTemplate,
  variables: Record<string, string>
): string {
  let result = template.template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/**
 * List all templates with summaries
 */
export function listTemplates(): Array<{
  id: string;
  name: string;
  category: PromptCategory;
  targetScore: number;
  variables: string[];
}> {
  return PROMPT_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    targetScore: t.targetScore,
    variables: t.variables,
  }));
}

/**
 * Get best practices for a category
 */
export function getCategoryBestPractices(category: PromptCategory): string[] {
  const templates = getTemplatesByCategory(category);
  const practices = new Set<string>();
  for (const t of templates) {
    for (const p of t.bestPractices) {
      practices.add(p);
    }
  }
  return Array.from(practices);
}
