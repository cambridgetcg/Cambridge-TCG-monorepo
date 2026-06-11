# AI Feedback System

This directory contains the narrative layer of Claude's self-improvement system for RewardsPro.

## Purpose

Enable Claude to:
1. **Track what works** - Document successful patterns
2. **Avoid blindspots** - Acknowledge and work around limitations
3. **Guide future sessions** - Use accumulated wisdom
4. **Understand the product** - Maintain deep context about RewardsPro

## Structure

```
.ai-feedback/
├── README.md                    # This file
├── current-session.md           # Active session narrative (ephemeral)
├── learnings/
│   ├── patterns.md              # Successful patterns with confidence scores
│   ├── antipatterns.md          # What to avoid and why
│   └── blindspots.md            # Known AI limitations for this codebase
├── product-health/
│   ├── architecture.md          # Current architecture state
│   ├── debt-registry.md         # Known technical debt
│   └── roadmap-alignment.md     # Product vision alignment
├── sessions/
│   └── YYYY-MM-DD-{id}.md       # Historical session narratives
└── insights/
    ├── tier-system.md           # Domain: tier resolution, subscriptions
    ├── data-api.md              # Aurora Data API patterns
    └── shopify-integration.md   # Shopify GraphQL, webhooks, auth
```

## Session Protocol

### At Session Start
1. Read `current-session.md` (if exists from interrupted session)
2. Read `learnings/patterns.md` for relevant patterns
3. Read `learnings/blindspots.md` for areas requiring extra care
4. Check relevant `insights/*.md` for domain context

### During Session
1. Log significant actions to the database
2. Note new insights as they emerge
3. Flag code quality signals when detected
4. Update current-session.md with narrative

### At Session End
1. Write session reflection to `sessions/YYYY-MM-DD-{id}.md`
2. Update `learnings/patterns.md` if new patterns confirmed
3. Update `learnings/blindspots.md` if new limitations discovered
4. Clear `current-session.md`

## Confidence Scoring

Patterns evolve confidence based on outcomes:
- **High confidence (>0.8)**: Documented as reliable pattern
- **Medium confidence (0.4-0.8)**: Use with verification
- **Low confidence (<0.4)**: Flagged as potential blindspot

Formula: `confidence = (successes / uses) * 0.7 + recency_bonus * 0.3`

## Integration

This system integrates with:
- **Database**: `AISession`, `AILearningPattern`, `AICodeQualitySignal` models
- **Services**: `ai-feedback/*.server.ts` for programmatic access
- **CLAUDE.md**: References this system for session guidance
