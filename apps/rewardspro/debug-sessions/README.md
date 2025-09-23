# Debug Sessions - Principal Debug Engineer Framework

## 📋 Overview
Structured debugging workspace for systematic issue resolution using the Principal Debug Engineer methodology.

## 🗂️ Directory Structure

```
debug-sessions/
├── templates/          # Reusable debug templates
├── active/            # Current debugging sessions
├── resolved/          # Completed sessions with solutions
└── tools/            # Debug utilities and scripts
```

## 🎯 Debug Session Format

Each debug session follows this structure:

### 1) Minimal Repro
- Minimal reproducible example (5-20 lines)
- Exact run command
- Environment details

### 2) Root-Cause Hypotheses
- Top 3 ranked hypotheses
- Quick test for each

### 3) Micro-Projects
- Bite-sized, ordered tasks
- Research plans
- Clear deliverables

### 4) Patch Proposals
- Code diffs
- New files

### 5) Validation
- Tests to add/update
- Metrics & thresholds
- Edge cases

### 6) Teach-Back
- What broke
- Why fix works
- Prevention

### 7) Missing Info
- Unknowns
- Assumptions

## 🚀 Quick Start

1. **New Issue**: Copy template to `active/YYYY-MM-DD-issue-name.md`
2. **Fill Template**: Follow structured format
3. **Execute**: Work through micro-projects
4. **Validate**: Run tests and checks
5. **Archive**: Move to `resolved/` with solution

## 📝 Template Usage

```bash
# Start new debug session
cp templates/debug-template.md active/2025-01-23-analytics-build-error.md

# Work on session
code active/2025-01-23-analytics-build-error.md

# After resolution
mv active/2025-01-23-analytics-build-error.md resolved/
```

## 🔧 Parameter Checklist

Always collect:
- [ ] OS/shell
- [ ] Language & version
- [ ] Package manager/lockfile
- [ ] Dependencies@versions
- [ ] Build tool/flags
- [ ] Environment variables
- [ ] API scopes/quotas
- [ ] File paths/permissions
- [ ] Timeouts/retries
- [ ] Random seeds
- [ ] CPU/GPU & memory

## 📊 Success Metrics

- **MTTR**: Mean time to resolution
- **First-fix rate**: % issues resolved without regression
- **Documentation quality**: Teach-back clarity

## 🏷️ Session Naming Convention

`YYYY-MM-DD-component-issue-type.md`

Examples:
- `2025-01-23-analytics-build-error.md`
- `2025-01-23-webhook-hmac-failure.md`
- `2025-01-23-aurora-connection-timeout.md`

## 🔍 Search Past Sessions

```bash
# Find all Aurora-related issues
grep -r "aurora" resolved/

# Find timeout issues
grep -r "timeout" resolved/

# Find specific error codes
grep -r "TS2307" resolved/
```

## 📈 Common Patterns

### Build Errors
→ Check: Dependencies, TypeScript config, import paths

### Runtime Errors
→ Check: Environment variables, permissions, network

### Performance Issues
→ Check: Query optimization, caching, connection pooling

### Security Issues
→ Check: HMAC validation, token expiry, multi-tenant isolation

---

*Principal Debug Engineer Framework v1.0*