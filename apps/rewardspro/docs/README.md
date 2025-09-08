# 📚 RewardsPro Documentation

Welcome to the RewardsPro documentation. This guide is organized to help you quickly find the information you need, whether you're setting up the project for the first time, developing new features, or troubleshooting issues.

## 🚨 CRITICAL: Start Here

### Security First (88% of breaches are auth-related!)
1. **[Authentication Security](./08-security/07-authentication-security.md)** - MUST READ
2. **[Shopify Auth Implementation](./08-security/08-shopify-auth-security.md)** - MUST READ
3. **[Security Checklist](./05-reference/security-checklist.md)** - Before any deployment

### Essential Patterns
- **Every route** needs authentication: See [Protected Route Pattern](../CLAUDE.md#protected-route-pattern)
- **Every query** needs shop scope: See [Multi-Tenant Isolation](./08-security/08-shopify-auth-security.md#multi-tenant-isolation)
- **Every webhook** needs HMAC: See [Webhook Security](./08-security/08-shopify-auth-security.md#webhook-security)

## 📖 Documentation Structure

Documentation is organized by workflow stage:

### 01 - Getting Started 🚀
Essential guides for understanding and setting up the project.

| Document | Description | When to Read |
|----------|-------------|--------------|
| [01-architecture-overview.md](./01-getting-started/01-architecture-overview.md) | System design and technology decisions | Before starting development |
| [02-local-development-setup.md](./01-getting-started/02-local-development-setup.md) | Complete development environment setup | Initial project setup |
| [03-node-version-requirements.md](./01-getting-started/03-node-version-requirements.md) | Node.js version requirements and setup | Before installing dependencies |

### 02 - Development 💻
Guides for active development, patterns, and best practices.

| Document | Description | When to Read |
|----------|-------------|--------------|
| [01-database-guide.md](./02-development/01-database-guide.md) | Database schema, queries, and migrations | Working with data |
| [02-typescript-remix-patterns.md](./02-development/02-typescript-remix-patterns.md) | Remix-specific TypeScript patterns | Building new routes |
| [03-typescript-best-practices.md](./02-development/03-typescript-best-practices.md) | TypeScript coding standards | Writing any code |
| [04-performance-optimization.md](./02-development/04-performance-optimization.md) | Performance best practices | Optimizing features |
| [05-responsive-design.md](./02-development/05-responsive-design.md) | Responsive design implementation | Building UI |
| [06-testing-guide.md](./02-development/06-testing-guide.md) | Testing strategies and patterns | Writing tests |
| [07-api-data-sync.md](./02-development/07-api-data-sync.md) | API integration and data syncing | Integrating with Shopify |
| [webhook-best-practices.md](./02-development/webhook-best-practices.md) | Shopify webhook implementation guide | Working with webhooks |

### 03 - Deployment 🚢
Everything related to deploying and managing environments.

| Document | Description | When to Read |
|----------|-------------|--------------|
| [01-deployment-guide.md](./03-deployment/01-deployment-guide.md) | Complete deployment procedures | Before deploying |
| [02-vercel-environment-setup.md](./03-deployment/02-vercel-environment-setup.md) | Vercel environment configuration | Setting up Vercel |
| [03-vercel-connection-strategy.md](./03-deployment/03-vercel-connection-strategy.md) | Database connection strategies | Configuring connections |
| [04-vercel-environment-check.md](./03-deployment/04-vercel-environment-check.md) | Environment verification | Troubleshooting deployments |
| [05-aws-iam-configuration.md](./03-deployment/05-aws-iam-configuration.md) | AWS IAM setup for Aurora | Setting up AWS |
| [deployment-checklist.md](./03-deployment/deployment-checklist.md) | Pre-deployment verification | Before going live |
| [vercel-deployment-guide.md](./03-deployment/vercel-deployment-guide.md) | Step-by-step Vercel deployment | Deploying to Vercel |
| [vercel-data-api-testing.md](./03-deployment/vercel-data-api-testing.md) | Testing Data API on Vercel | Verifying Data API |

### 04 - UI Components 🎨
Polaris component guides and UI patterns.

| Document | Description | When to Read |
|----------|-------------|--------------|
| [01-polaris-overview.md](./04-ui-components/01-polaris-overview.md) | Polaris design system introduction | Starting UI work |
| [02-layout-patterns.md](./04-ui-components/02-layout-patterns.md) | Page layout patterns | Building pages |
| [03-forms-guide.md](./04-ui-components/03-forms-guide.md) | Form implementation patterns | Creating forms |
| [04-buttons-guide.md](./04-ui-components/04-buttons-guide.md) | Button component usage | Adding interactions |
| [05-button-groups.md](./04-ui-components/05-button-groups.md) | Button group patterns | Grouping actions |
| [06-lists-tables.md](./04-ui-components/06-lists-tables.md) | Lists and tables guide | Displaying data |
| [07-feedback-indicators.md](./04-ui-components/07-feedback-indicators.md) | Feedback and status indicators | Showing status |
| [08-images-icons.md](./04-ui-components/08-images-icons.md) | Images and icons usage | Adding visuals |
| [09-design-tokens.md](./04-ui-components/09-design-tokens.md) | Design token system | Theming and styling |
| [10-ui-ux-patterns.md](./04-ui-components/10-ui-ux-patterns.md) | UI/UX best practices | Improving UX |
| [color-design-guide.md](./04-ui-components/color-design-guide.md) | Color psychology, accessibility & implementation | Choosing and implementing colors |

### 05 - Reference 📖
Quick reference guides and checklists.

| Document | Description | When to Read |
|----------|-------------|--------------|
| [authentication-checklist.md](./05-reference/authentication-checklist.md) | Shopify auth implementation checklist | Setting up authentication |
| [security-notes.md](./05-reference/security-notes.md) | Security best practices | Reviewing security |
| [security-checklist.md](./05-reference/security-checklist.md) | Comprehensive security checklist | Before deployment |
| [security-headers.md](./05-reference/security-headers.md) | Security headers configuration | Setting up headers |

### 06 - Troubleshooting 🔧
Guides for debugging and resolving issues.

| Document | Description | When to Read |
|----------|-------------|--------------|
| [01-common-issues.md](./06-troubleshooting/01-common-issues.md) | Common issues and solutions | When encountering errors |
| [02-debug-communications.md](./06-troubleshooting/02-debug-communications.md) | Debugging communication issues | API/webhook issues |

### 07 - Future Features 🚀
Plans and designs for upcoming features.

| Document | Description | When to Read |
|----------|-------------|--------------|
| [landing-page-plan.md](./07-future-features/landing-page-plan.md) | Marketing landing page design | Planning landing page |
| [playwright-test-plan.md](./07-future-features/playwright-test-plan.md) | E2E testing implementation | Setting up E2E tests |

### 08 - Security 🔐
Comprehensive security documentation and guidelines.

| Document | Description | When to Read |
|----------|-------------|--------------|
| [01-security-overview.md](./08-security/01-security-overview.md) | Security architecture and principles | Before starting development |
| [02-injection-prevention.md](./08-security/02-injection-prevention.md) | Preventing injection vulnerabilities | Writing any code |
| [03-security-testing.md](./08-security/03-security-testing.md) | Security testing strategies | Writing tests |
| [04-security-tools.md](./08-security/04-security-tools.md) | Security tool configuration | Setting up CI/CD |
| [05-react-security-patterns.md](./08-security/05-react-security-patterns.md) | React-specific security patterns | Building React components |
| [06-incident-response.md](./08-security/06-incident-response.md) | Incident response procedures | Before production |
| [07-authentication-security.md](./08-security/07-authentication-security.md) | **CRITICAL: Authentication security** | Immediately - 88% of breaches |
| [08-shopify-auth-security.md](./08-security/08-shopify-auth-security.md) | Shopify-specific auth implementation | Building Shopify apps |

## 🎯 Quick Start Paths

### Day 1: Essential Setup
1. **CRITICAL**: Read [Shopify Auth Security](./08-security/08-shopify-auth-security.md)
2. Setup: [Local Development](./01-getting-started/02-local-development-setup.md)
3. Review: [CLAUDE.md](../CLAUDE.md) for patterns and quick reference
4. Check: [Security Checklist](./05-reference/security-checklist.md)

### Building Features (Most Common Path)
1. **Start**: Check security patterns in [CLAUDE.md](../CLAUDE.md#critical-security-patterns)
2. **Route**: Use [Protected Route Pattern](../CLAUDE.md#protected-route-pattern)
3. **Database**: Follow [Multi-Tenant Pattern](./08-security/08-shopify-auth-security.md#multi-tenant-data-isolation)
4. **UI**: Use [Polaris Components](./04-ui-components/01-polaris-overview.md)
5. **Test**: Follow [Security Testing](./08-security/03-security-testing.md)

### Adding Webhooks
1. **Pattern**: [Webhook Security](./08-security/08-shopify-auth-security.md#webhook-security)
2. **Implementation**: [Webhook Best Practices](./02-development/webhook-best-practices.md)
3. **Testing**: Verify HMAC with [Security Tests](./08-security/03-security-testing.md)

### Before Deployment
1. **Checklist**: [Security Checklist](./05-reference/security-checklist.md) - ALL items
2. **Headers**: [Security Headers](./05-reference/security-headers.md)
3. **Deploy**: [Deployment Guide](./03-deployment/01-deployment-guide.md)
4. **Verify**: [Environment Check](./03-deployment/04-vercel-environment-check.md)

### Debugging Issues
1. **Common**: [Common Issues](./06-troubleshooting/01-common-issues.md)
2. **Auth**: [Authentication Security](./08-security/07-authentication-security.md#security-testing)
3. **API**: [Debug Communications](./06-troubleshooting/02-debug-communications.md)

## 📝 Using with Todo Workflow

When working with the todo workflow, reference documentation by category and number:

```markdown
TODO: Implement customer sync
- [ ] Review 02-development/07-api-data-sync.md for patterns
- [ ] Check 02-development/01-database-guide.md for schema
- [ ] Follow 02-development/03-typescript-best-practices.md for code style
- [ ] Test using 02-development/06-testing-guide.md
```

## 🔍 Finding Information

### By Task Type
- **Setting up**: Start in `01-getting-started/`
- **Building features**: Check `02-development/`
- **Creating UI**: Reference `04-ui-components/`
- **Deploying**: Follow `03-deployment/`
- **Fixing issues**: See `06-troubleshooting/`
- **Security review**: Study `08-security/`

### By Technology
- **TypeScript**: `02-development/02-typescript-*.md`
- **Database**: `02-development/01-database-guide.md`
- **Polaris**: `04-ui-components/`
- **Vercel**: `03-deployment/02-vercel-*.md`
- **AWS**: `03-deployment/05-aws-*.md`
- **Security**: `08-security/` and `05-reference/security-*.md`

## 🔄 Documentation Maintenance

### Naming Convention
- Use number prefixes for ordering (01-, 02-, etc.)
- Use descriptive names that indicate content
- Keep names concise but clear
- Use kebab-case for all files

### When to Update
- After implementing new patterns
- When discovering better practices
- After resolving complex issues
- When dependencies change

### Documentation Standards
- Include practical examples
- Add "When to Read" context
- Link to related documents
- Keep content up-to-date

## 📌 Important Notes

1. **Start with numbered guides** - They're ordered by importance
2. **Category numbers indicate workflow order** - Start with 01, then 02, etc.
3. **Check troubleshooting first for errors** - Save time by checking known issues
4. **Update docs as you learn** - Help future developers (and AI assistants)

---

*This documentation structure is designed to work seamlessly with AI assistants and the todo workflow. Always reference docs by their full path for clarity.*