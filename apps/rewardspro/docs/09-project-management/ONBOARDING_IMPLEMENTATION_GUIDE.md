# RewardsPro Onboarding Flow Implementation Guide

**Status**: Planning Phase
**Last Updated**: January 2025
**Based On**: Research from Appcues, Intercom, ProductLed, Userflow, Nebulab, Box, Productboard, FullStory, Airtable, Help Scout

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Benchmark Analysis: B2B SaaS Examples](#benchmark-analysis-b2b-saas-examples)
3. [Presentation Modalities Deep Dive](#presentation-modalities-deep-dive)
4. [Architecture Overview](#architecture-overview)
5. [Database Schema](#database-schema)
6. [Phase 1: MVP Implementation](#phase-1-mvp-implementation)
7. [Phase 2: Enhanced Personalization](#phase-2-enhanced-personalization)
8. [Phase 3: Advanced Features](#phase-3-advanced-features)
9. [UI/UX Patterns & Components](#uiux-patterns--components)
10. [Analytics & Instrumentation](#analytics--instrumentation)
11. [A/B Testing Plan](#ab-testing-plan)
12. [Accessibility & Responsive Design](#accessibility--responsive-design)
13. [Email Onboarding Sequences](#email-onboarding-sequences)
14. [Testing Strategy](#testing-strategy)
15. [Performance Considerations](#performance-considerations)
16. [Open Questions & Risks](#open-questions--risks)

---

## Executive Summary

### Critical Research Insights

RewardsPro's onboarding must deliver value quickly, minimize friction, personalize experiences, and embed seamlessly within Shopify. Research across 10+ sources and 5 B2B SaaS benchmarks reveals:

#### User Behavior Statistics
- **74% of customers switch providers** if onboarding is complicated
- **9 out of 10 users abandon** difficult sign-up processes
- **75% of mobile users churn within 3 days** of poor onboarding
- **70% of top companies** use gamification in onboarding
- **Interactive guides** increase activation by **10%**
- **Structured checklists** reduce stalled projects by **67%**

#### Design Principles
- **At least 30% of form fields** are unnecessary - use progressive disclosure
- **Time-to-value** should be **≤7 minutes** for first value delivery
- **Activation rate at maturity**: 2-10% industry standard
- **Micro-actions and early wins** significantly reduce churn
- **Milestone-based checklists** act as guideposts and improve completion

### Goals

1. **Reduce time-to-first-value (TTFV)** to < 5 minutes
2. **Increase activation rate** from baseline to 8-10%
3. **Improve 30-day retention** by delivering early wins
4. **Personalize** based on merchant type and goals
5. **Instrument** every step for continuous optimization

### Three-Phase Approach

| Phase | Description | Timeline | Key Deliverables |
|-------|-------------|----------|------------------|
| **MVP** | 3-5 step wizard + dashboard checklist + soft gating | Sprint 1-2 | Wizard, checklist, email sequence, analytics |
| **Enhanced** | Personalization + interactive guides + A/B testing | Sprint 3-4 | Persona questions, adaptive flows, experiments |
| **Advanced** | Gamification + ML + resource center | Sprint 5+ | Badges, AI recommendations, self-service help |

### Recommended Initial Strategy (Based on Benchmark Analysis)

**Modality**: Multi-step wizard + Dashboard checklist + Soft gating + Email sequence

**Rationale**:
- Multi-step wizards reduce cognitive load and improve conversion (proven by Box, Productboard)
- Soft gating balances data collection with minimal friction (74% abandon if too complex)
- Dashboard checklists provide visible progress and foster accomplishment (Help Scout model)
- Email sequences re-engage merchants who drop off (behavior-driven triggers)
- Accessibility ensures 1B+ people with disabilities can complete onboarding

---

## Benchmark Analysis: B2B SaaS Examples

Five high-performing SaaS products with comparable onboarding complexity were analyzed for presentation patterns, gating mechanisms, incentives, and communication channels.

### Comparative Summary

| Product | Presentation Pattern | Gating | Key Strengths | Notable Weaknesses |
|---------|---------------------|--------|---------------|-------------------|
| **Box** (file sharing) | Dashboard checklist with tooltips | Soft-gated (trial extension upon completion) | Gamified completion extends trial; progress bar motivates | May be ignored by experienced users; feels manipulative if unclear |
| **Productboard** (product mgmt) | Multi-step wizard with optional email verification | Soft-gated (verification can be skipped) | Minimal friction; persona survey personalizes; checklist guides | Personalization questions add initial effort; soft gating may defer setup |
| **FullStory** (analytics) | Guided setup wizard with immediate script installation | Hard-gated (value locked behind install) | Forces high-intent engagement; fast activation | Deters busy users or those without dev privileges |
| **Airtable** (database) | Empty state-driven with clear CTAs | Ungated (immediate full access) | Frictionless exploration; persona questions after value demo | Risk of incomplete setup; lacks progress indicators |
| **Help Scout** (support) | Checklists + interactive guides with tooltips | Soft-gated (reminders for skipped tasks) | Clear multi-step checklist; interactive guides reduce load | Constant prompts may feel intrusive |

### Key Takeaways for RewardsPro

1. **Soft gating wins**: Products using soft gating (Box, Productboard, Help Scout) balance lead qualification with low friction
2. **Checklists drive completion**: Visible progress trackers and task lists reduce abandonment by 67%
3. **Personalization early**: Collecting minimal persona info (industry, business size) improves relevance without adding burden
4. **Interactive guides help**: Context-sensitive tooltips and step-by-step overlays reduce confusion for complex UIs
5. **Hard gating risky**: FullStory's hard-gating filters for quality but loses volume - not ideal for RewardsPro's self-serve model

---

## Presentation Modalities Deep Dive

### 1. Multi-Step Wizard (Progressive Disclosure)

**Description**: Sequential onboarding flow with discrete steps and progress indicator. Uses progressive disclosure to reduce cognitive load.

**Research Evidence**:
- Breaking forms into small steps with progress bar lowers abandonment (Webstacks)
- Progressive disclosure improves UX, enables conditional logic, provides immediate feedback (Userpilot)
- 30% of form fields are unnecessary - wizards allow hiding optional fields (Hopscotch)

**Pros**:
- Clear direction and focus
- Reduces overwhelm with single-task screens
- Enables personalized branching (e.g., "Choose industry" → show relevant templates)
- Mobile-friendly with swipe navigation
- Progress bar motivates completion

**Cons**:
- Too many steps lengthen time-to-value
- Mandatory steps (hard gating) increase abandonment risk
- Requires robust state management to save progress

**Use When**:
- Onboarding tasks are sequential and dependent (e.g., set currency before adding rewards)
- Personalization based on role/industry is valuable
- Users need guided hand-holding through complex setup

**Implementation Notes**:
- Keep to 3-5 steps maximum
- Allow skip/save for later (soft gating)
- Show clear progress indicator (e.g., "Step 2 of 4")
- Use branching logic for persona-based flows
- Validate inputs in real-time
- Provide "Back" button to allow corrections

---

### 2. Dashboard Checklist / Milestone Tracker

**Description**: Task list visible within the product dashboard, showing required and optional actions with completion tracking.

**Research Evidence**:
- Milestone-based checklists break journeys into guideposts and reduce stalled projects by 67% (ContentSnare)
- Checklists foster sense of accomplishment and clarity (Appcues)
- Psychology of completion (Zeigarnik effect) motivates finishing incomplete tasks (ProductLed)

**Pros**:
- High visibility without being intrusive
- Users can self-pace completion
- Fosters sense of progress and achievement
- Works alongside dashboard functions
- Can be collapsed/expanded to reduce clutter

**Cons**:
- Tasks may be ignored if not incentivized
- Can clutter interface if too prominent
- Lacks sequential guidance for novice users
- Doesn't prevent users from skipping critical steps

**Use When**:
- Tasks can be completed in any order
- Users may return multiple times over days/weeks
- Ideal for post-registration continuous adoption
- Want to encourage exploration without forcing linear flow

**Implementation Notes**:
- Prioritize 4-6 high-impact tasks
- Use visual checkmarks and progress percentage
- Celebrate completion with confetti/badges
- Allow dismissing checklist (but track event)
- Consider gamification (e.g., unlock analytics after 3 tasks)

---

### 3. Interactive Guides & Tooltips

**Description**: Step-by-step overlays that guide users through in-product actions with contextual help bubbles.

**Research Evidence**:
- Interactive guides reduce cognitive load and help users become competent (Appcues)
- Context-sensitive tooltips deliver help on demand without clutter (Userpilot)
- Best combined with checklists or wizards for complex UIs (Help Scout example)

**Pros**:
- Directly embedded in workflow
- Encourages hands-on learning by doing
- Reduces confusion with just-in-time help
- Can be segmented by role or context
- Tooltips avoid clutter by appearing only when needed

**Cons**:
- Overuse can annoy users ("tooltip fatigue")
- Requires instrumentation investment
- Must be responsive and accessible (keyboard navigation, screen readers)
- Can feel patronizing to experienced users

**Use When**:
- Users need to perform sequence of in-product actions
- Explaining complex features (e.g., tier configuration, campaign creation)
- Offering optional deeper dives without forcing
- New feature announcements

**Implementation Notes**:
- Limit to 3-5 tooltip steps per guide
- Make skippable and dismissible
- Use visual anchors (arrows, highlights)
- Track which users skip vs complete
- Ensure WCAG AA compliance (high contrast, keyboard nav)

---

### 4. Modal Overlays & Pre-Access Pages

**Description**: Pop-up windows or dedicated landing pages that block main UI until critical task is completed.

**Research Evidence**:
- High-friction modality but ensures critical steps aren't missed (Canden)
- Effective for legal agreements or mandatory configuration (Userpilot)
- Should be used sparingly to avoid abandonment (74% switch if too complicated - Hopscotch)

**Pros**:
- Commands undivided attention
- Ensures important steps are completed
- Prevents users from missing critical tasks
- Good for one-time legal/compliance requirements

**Cons**:
- Highly interruptive and adds friction
- May trigger abandonment if overused
- Accessibility issues if not keyboard navigable
- Can feel aggressive or pushy

**Use When**:
- Legal agreements must be accepted
- Critical configuration prevents product from working (e.g., currency selection)
- GDPR consent required
- One-time onboarding survey (use sparingly)

**Implementation Notes**:
- Use only for truly critical tasks
- Allow escape key to close (but track dismissal)
- Ensure modal is keyboard accessible
- Provide clear value proposition for why info is needed
- Never nest modals (modal within modal)

---

### 5. Gating Strategies

#### Hard Gating

**Description**: Full product access withheld until tasks are completed.

**Research Evidence**:
- Filters for high-intent users but loses casual traffic (Chameleon)
- Increases friction and encourages fake data entry (Chameleon)
- Best for high ACV or sales-led products where quality > quantity

**Pros**:
- Qualifies leads effectively
- Ensures setup completion before use
- Good for enterprise/sales-led products

**Cons**:
- High abandonment rate (9 in 10 abandon difficult sign-ups - Cieden)
- Loses potential advocates who might share
- Users may enter fake data to bypass

**Use When**: High ACV products ($10K+ annual), complex B2B sales, legal requirements

#### Soft Gating

**Description**: Partial exploration allowed; gating occurs after a few steps or actions.

**Research Evidence**:
- Builds curiosity and qualifies interest based on behavior (Chameleon)
- Reduces friction while still collecting data
- Suits mid-market products with complexity

**Pros**:
- Balances lead qualification with low friction
- Qualifies based on behavior (e.g., "viewed 3 pages")
- Reduces fake sign-ups vs hard gating

**Cons**:
- Users may drop off after gating moment
- May attract some unqualified traffic
- Requires tracking engagement to trigger gate

**Use When**: Mid-market products, complex value propositions, need for personalization data

**✅ RECOMMENDED FOR REWARDSPRO**

#### Ungated

**Description**: Full product access with no barriers.

**Research Evidence**:
- Maximizes volume and exploration (Chameleon)
- Builds trust and good for product-led growth
- Effective for top-of-funnel awareness

**Pros**:
- Frictionless experience
- Builds trust quickly
- Good for viral/word-of-mouth growth
- Demonstrates value before asking for commitment

**Cons**:
- May lead to low-quality sign-ups
- Risk of incomplete setups
- Harder to personalize experience
- May lose potential for early data collection

**Use When**: Top-of-funnel marketing, self-serve products, freemium models

---

### 6. Onboarding Email Sequences

**Description**: Series of behavior-triggered emails that complement in-app onboarding and re-engage merchants.

**Research Evidence**:
- Email sequences re-engage users who leave product and reduce churn (Userpilot)
- Behavior-driven sequences with single CTA are most effective (Howdygo)
- Examples: Clay's 6-part series, ActiveCampaign's layered approach (Howdygo)

**Effective Email Patterns**:
1. **Welcome email** (immediate): Greet merchant, introduce value, link to getting started
2. **Setup reminder** (Day 1, if incomplete): "Complete your reward catalog" with tutorial video
3. **Feature introduction** (Day 3): Highlight one advanced feature with use case
4. **Success story** (Day 5): Social proof from similar merchant
5. **Offer help** (Day 7): "Need assistance?" with human support option
6. **Re-engagement** (Day 14, if inactive): "We noticed you haven't logged in..." with incentive

**Email Best Practices**:
- Clear subject lines (e.g., "Next step: Add your first reward tier")
- Short copy (< 100 words)
- Single call-to-action button
- Visual or GIF showing the feature
- Mobile-responsive design
- Personalization tokens (merchant name, store name)

**Metrics to Track**:
- Open rate (target: 20-30%)
- Click-through rate (target: 5-10%)
- Conversion to in-app action (target: 3-5%)

---

### 7. Accessibility & Device Responsiveness

**Research Evidence**:
- Over 1 billion people live with disabilities - neglecting accessibility excludes significant market (Reciteme)
- Accessible design is legally required (ADA, WCAG) and improves UX for all users (Reciteme)
- Extensions like `rewardspro-customer-account-ui` already implement responsive patterns

**Accessibility Requirements** (WCAG AA):

1. **Keyboard Navigation**:
   - All interactive elements reachable via Tab/Shift+Tab
   - No keyboard traps (can escape from modals)
   - Focus indicators visible and high contrast

2. **Screen Readers**:
   - Semantic HTML (`<button>`, `<nav>`, `<main>`)
   - Alt text for all icons and images
   - ARIA labels for complex interactions
   - Announce dynamic content changes

3. **Visual Design**:
   - Color contrast ratio ≥ 4.5:1 for text
   - Don't rely on color alone to convey information
   - Text resizable to 200% without loss of function
   - Clear focus states

4. **Forms**:
   - Labels associated with inputs
   - Error messages descriptive and actionable
   - Real-time validation with clear feedback

5. **Multimedia**:
   - Captions for videos
   - Transcripts for audio
   - Pause/stop controls for animations

6. **Responsive Design**:
   - Large touch targets (min 44x44px)
   - Readable text without zooming
   - Horizontal scrolling avoided
   - Test on iPhone, Android, iPad

**Implementation**:
- Use Shopify Polaris components (built-in accessibility)
- Run automated tests (axe-core, WAVE)
- Manual testing with screen readers (VoiceOver, NVDA)
- Offer dark mode, text size controls

---

### Comparative Matrix: Presentation Options

| Option | Pros | Cons | Ideal For | RewardsPro Fit |
|--------|------|------|-----------|----------------|
| **Multi-step wizard** | Clear direction, reduces cognitive load, mobile-friendly, personalizable | Too many steps lengthen TTV, state management required | Sequential setups, personalization needed | ✅ **Phase 1 MVP** |
| **Dashboard checklist** | Self-paced, fosters accomplishment, non-intrusive | May be ignored, lacks guidance | Independent tasks, repeat visits | ✅ **Phase 1 MVP** |
| **Interactive guides** | Hands-on learning, context-sensitive, reduces confusion | Can annoy if overused, dev overhead | Complex features, optional deep dives | ✅ **Phase 2** |
| **Modal overlay** | Ensures completion, grabs attention | High friction, accessibility challenges | Legal requirements, critical steps | ⚠️ **Sparingly** |
| **Hard gating** | Filters high-intent users, qualifies leads | Loses volume, encourages fake data | High ACV, sales-led | ❌ **Not recommended** |
| **Soft gating** | Balances data collection with low friction | May lose some after gating | Mid-market, complex products | ✅ **Phase 1 MVP** |
| **Ungated** | Frictionless, builds trust | Low-quality sign-ups, incomplete setups | Top-of-funnel, freemium | ❌ **Not recommended** |
| **Email sequence** | Re-engages absent users, reduces churn | Requires marketing coordination | Complementing in-app | ✅ **Phase 1 MVP** |

---

## Shopify Integration Considerations

### Critical Platform Requirements

RewardsPro must align with Shopify's technical requirements, API constraints, and compliance standards to pass app review and deliver seamless merchant experience.

#### Built for Shopify Requirements

**Mandatory Requirements** (Source: [Shopify Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements)):

1. **Embedded Experience**: All primary workflows must use Shopify App Bridge and remain inside Shopify admin - no external dashboards
2. **Session Token Authentication**: Use session tokens (not OAuth tokens) for embedded requests
3. **One-Click Install**: Seamless installation using merchant's Shopify credentials - no separate account creation
4. **Polaris UI**: Use Shopify Polaris components for consistent interface
5. **Responsive Design**: Must work on desktop, tablet, and mobile admin

**Onboarding Guidelines** (Source: [Shopify Onboarding UX](https://shopify.dev/docs/apps/design/user-experience/onboarding)):
- Limit to **< 5 essential steps**
- Provide **progress indicators**
- Allow **skipping optional steps**
- Use **clear value propositions**
- Offer **contextual help** at each step

---

### GraphQL Admin API Requirements

**CRITICAL**: Apps released after **April 2025** must use GraphQL Admin API - REST is legacy.

#### Required API Scopes

| Scope | Purpose | Priority | Notes |
|-------|---------|----------|-------|
| `read_customers` | Fetch customer data for loyalty calculations | **Required** | Level 1 protected data |
| `read_orders` | Access orders from last 60 days | **Required** | For recent purchase history |
| `read_all_orders` | Access orders > 60 days old | **Recommended** | Needed for historical loyalty points |
| `write_discounts` | Create discount codes as rewards | **Required** | Core loyalty feature |
| `read_products` | Customize discount eligibility | Optional | For product-specific rewards |
| `write_customers` | Update customer metafields with points | Optional | For storing loyalty data in Shopify |
| `write_gift_cards` | Issue gift card rewards | Optional | Advanced reward type |

**Scope Request Strategy**:
1. Request minimal scopes initially (`read_customers`, `read_orders`, `write_discounts`)
2. Clearly explain why each scope is needed during OAuth
3. Detect missing scopes and degrade gracefully (e.g., disable auto-discounts if `write_discounts` not granted)
4. Provide messaging to guide merchants on granting additional scopes

---

### Rate Limits & Throttling

#### GraphQL Rate Limits

**Cost-Based System**:
- Each query field has a **cost** (simple fields: 0-1, complex fields: 10-100)
- Shop has a **throttle budget** (refills over time)
- Exceeding budget returns `THROTTLED` error with cost details in headers

**Mitigation Strategies**:
```typescript
// app/utils/shopify-graphql.ts
export class ShopifyGraphQLClient {

  async query<T>(query: string, variables?: any): Promise<T> {
    try {
      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      const data = await response.json();

      // Check for throttling
      if (data.errors?.some(e => e.extensions?.code === 'THROTTLED')) {
        const throttleStatus = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
        console.warn('[GraphQL] Throttled:', throttleStatus);

        // Exponential backoff
        await this.sleep(2000);
        return this.query(query, variables); // Retry
      }

      // Check cost and log for optimization
      const cost = data.extensions?.cost;
      if (cost?.actualQueryCost > 50) {
        console.warn('[GraphQL] High-cost query:', cost);
      }

      return data.data;
    } catch (error) {
      console.error('[GraphQL] Query failed:', error);
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**Best Practices**:
- Use **pagination** (`first: 50`, `after: cursor`) instead of large queries
- **Batch operations** where possible (e.g., `customerUpdate` with multiple IDs)
- **Schedule background jobs** for heavy operations (historical point calculations)
- **Cache reference data** (products, collections) to avoid repeated queries
- **Monitor cost headers** and optimize expensive queries

#### REST Rate Limits (Legacy - Avoid)

- **40 requests/minute** per app per store (standard)
- **10× higher** for Shopify Plus stores
- **2 req/sec refill rate**
- Returns `Retry-After` header when exceeded

---

### Protected Customer Data Compliance

#### Level 1 vs Level 2 Data

| Level | Data Types | Requirements |
|-------|-----------|-------------|
| **Level 1** | General customer info (excluding PII) | Minimize collection, encrypt in transit/at rest, limit staff access, retention periods |
| **Level 2** | Names, addresses, phone, email | **Level 1 +** encrypted backups, test/prod separation, strong password policies, incident response |

**RewardsPro Data Classification**:
- **Level 1**: Customer IDs, order totals, loyalty points, tier assignments
- **Level 2**: Email (if sending referral links), name (if personalizing emails)

**Recommendation**: Request Level 2 **only if necessary** for email features. Otherwise, use Level 1 and store email references (encrypted customer ID).

#### Mandatory GDPR Webhooks

```typescript
// app/routes/webhooks.customers.data-request.tsx
export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.text();
  if (!verifyWebhookHMAC(request, rawBody)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { shop_domain, customer } = JSON.parse(rawBody);

  // Log data request for merchant to fulfill
  await db.dataRequest.create({
    data: {
      id: uuidv4(),
      shop: shop_domain,
      customerId: customer.id,
      requestType: 'DATA_REQUEST',
      createdAt: new Date(),
    }
  });

  return json({ success: true });
}

// app/routes/webhooks.customers.redact.tsx
export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.text();
  if (!verifyWebhookHMAC(request, rawBody)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { shop_domain, customer } = JSON.parse(rawBody);

  // Delete all customer loyalty data
  await db.$transaction([
    db.storeCreditLedger.deleteMany({ where: { customerId: customer.id } }),
    db.customer.deleteMany({ where: { shopifyCustomerId: customer.id.toString() } }),
  ]);

  return json({ success: true });
}

// app/routes/webhooks.shop.redact.tsx
export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.text();
  if (!verifyWebhookHMAC(request, rawBody)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { shop_domain } = JSON.parse(rawBody);

  // Delete all shop data (48 hours after uninstall)
  await db.$transaction([
    db.storeCreditLedger.deleteMany({ where: { shop: shop_domain } }),
    db.customer.deleteMany({ where: { shop: shop_domain } }),
    db.tier.deleteMany({ where: { shop: shop_domain } }),
    db.order.deleteMany({ where: { shop: shop_domain } }),
    db.shopSettings.deleteMany({ where: { shop: shop_domain } }),
  ]);

  return json({ success: true });
}
```

---

### Theme App Extension Requirements

#### App Blocks for Customer Accounts

**CRITICAL**: Must use **theme app extension** with app blocks - merchants should NOT edit theme code.

**Configuration** (`extensions/rewardspro-customer-account-ui/shopify.extension.toml`):
```toml
api_version = "2025-01"

[[extensions]]
type = "customer_account_ui_extension"
name = "RewardsPro Loyalty Widget"
handle = "rewardspro-loyalty-widget"

[[extensions.targeting]]
target = "customer-account.profile.block.render"

[[extensions.targeting]]
target = "customer-account.order-status.block.render"
```

**App Block Implementation** (`src/LoyaltyWidget.tsx`):
```tsx
import { CustomerAccountUIExtensionAPI } from '@shopify/customer-account-ui-extensions';

export default function LoyaltyWidget({ api }: { api: CustomerAccountUIExtensionAPI }) {
  const [loyaltyData, setLoyaltyData] = useState(null);

  useEffect(() => {
    // Fetch loyalty data from RewardsPro API
    fetch(`/apps/rewardspro/membership?shop=${api.shop}`)
      .then(res => res.json())
      .then(setLoyaltyData);
  }, [api.shop]);

  if (!loyaltyData) return <SkeletonText lines={3} />;

  return (
    <BlockStack spacing="tight">
      <Heading level={2}>Your Loyalty Status</Heading>
      <Text>Tier: {loyaltyData.tier}</Text>
      <Text>Points: {loyaltyData.points}</Text>
      <ProgressBar progress={loyaltyData.progress} />
    </BlockStack>
  );
}
```

**Onboarding Integration**:
- Include step: "Add loyalty widget to customer account"
- Provide deep link: `https://admin.shopify.com/store/{shop}/themes/current/editor?context=apps`
- Detect if block installed via theme API
- Show reminder if not installed

---

### Risk Assessment & Mitigation

| Risk Scenario | Impact | Probability | Mitigation Strategy |
|---------------|--------|-------------|---------------------|
| **Missing customer segments** | Can't target loyalty campaigns | High (new stores) | Provide default segments using `customers` query filters (e.g., "All Customers", "Recent Purchasers"). Allow skipping segmentation. |
| **Limited order history** | Can't calculate historical loyalty | Medium | Request `read_all_orders` scope. If denied, inform merchant and use recent orders only. Offer to backfill when scope granted. |
| **Permission denied** | Features don't work (e.g., no discounts without `write_discounts`) | Medium | Detect missing scopes, show actionable error message, guide merchant to reinstall with additional scopes. Disable affected features gracefully. |
| **GraphQL throttling** | Data sync failures, slow onboarding | High (heavy queries) | Implement exponential backoff, check cost headers, use pagination, schedule background jobs for historical processing. |
| **Theme block not installed** | Loyalty widget doesn't appear on storefront | High (requires manual step) | Include in onboarding checklist, provide deep link to theme editor, detect installation status, send reminder email if skipped. |
| **GDPR webhook failures** | Data not deleted, compliance violation | Low | Log webhook failures, implement retry queue, alert engineering team. Test deletion flows in dev environment. |
| **Data breach (Level 2 data)** | Legal liability, app removal | Low | Encrypt all PII at rest (AES-256-GCM), use TLS 1.3 for transit, implement audit logging, conduct security review before requesting Level 2 scopes. |
| **Multi-store merchants** | Confusion about cross-store data | Low | Install per store (standard Shopify model). Do not share data across stores unless explicit merchant consent. |
| **Shopify Plus rate limits** | Higher allowance may mask issues | Low | Don't rely on Plus rates - design for standard limits. Test with non-Plus dev store. |

---

### Shopify Integration Checklist

#### Authentication & Embedding
- [ ] Use Shopify App Bridge 4.x (`@shopify/app-bridge-react`)
- [ ] Session token authentication for all embedded requests
- [ ] All primary workflows inside Shopify admin (no external dashboard)
- [ ] One-click OAuth install (no separate sign-up form)
- [ ] Support both online and offline access tokens

#### API Scopes & Queries
- [ ] Request minimal scopes: `read_customers`, `read_orders`, `write_discounts`
- [ ] Request `read_all_orders` with clear justification (optional)
- [ ] Use GraphQL `customers` query with pagination
- [ ] Use GraphQL `orders` query with date filters
- [ ] Implement rate limit handling (check `THROTTLED` errors)
- [ ] Log query costs for optimization

#### Data Protection & Compliance
- [ ] Publish privacy policy (link in app listing)
- [ ] Document data use for Level 1/2 classification
- [ ] Encrypt customer data at rest (AES-256-GCM)
- [ ] Use TLS 1.3 for all API requests
- [ ] Subscribe to mandatory webhooks: `customers/data_request`, `customers/redact`, `shop/redact`
- [ ] Implement data deletion within 48 hours of `shop/redact`
- [ ] Store minimal PII (avoid Level 2 if possible)

#### Theme Extension
- [ ] Build theme app extension with app blocks
- [ ] Support both customer account and order status pages
- [ ] Use Polaris components for consistent UI
- [ ] Test responsive design (desktop, tablet, mobile)
- [ ] Provide merchant customization options (colors, text)

#### Onboarding Flow
- [ ] Limit to 3-5 essential steps
- [ ] Show progress indicator (stepper or percentage)
- [ ] Allow skipping optional steps (soft gating)
- [ ] Provide contextual help (tooltips, docs links)
- [ ] Collect minimal info (points name/value, tier config)
- [ ] Detect missing data (no customers/orders) and provide guidance
- [ ] Include step to add theme app block
- [ ] Detect scope denials and show actionable messages

#### Error Handling
- [ ] Catch `THROTTLED` GraphQL errors and retry with backoff
- [ ] Handle `ACCESS_DENIED` errors (missing scopes)
- [ ] Log errors to monitoring service (Sentry, Datadog)
- [ ] Display user-friendly error messages (not raw errors)
- [ ] Implement circuit breaker for external API calls

#### App Store Listing
- [ ] Accurate description of features
- [ ] Transparent pricing (all tiers disclosed)
- [ ] Clear data usage statement
- [ ] Contact information and support resources
- [ ] Privacy policy link
- [ ] Screenshots showing onboarding flow

---

### Competitor Onboarding Analysis

#### Growave
**Strengths**:
- Comprehensive onboarding covering loyalty, reviews, wishlists, referrals
- Easy to follow despite being multi-component
- Intuitive dashboard post-setup

**Lessons**: Multi-step onboarding acceptable if flow is guided and demonstrates value at each step.

#### Rivo
**Strengths**:
- Simple, clean dashboard
- Fast setup

**Weaknesses**:
- Full-screen mode in admin felt inflexible

**Lessons**: Ensure responsiveness and give merchants UI control (e.g., collapsible panels).

#### LoyaltyLion
**Strengths**:
- Incentivizes customer onboarding (points for account creation, first purchase)
- Aligns user onboarding with loyalty mechanics

**Lessons**: Consider rewarding merchant's customers during initial setup to drive adoption.

---

### Recommended Onboarding Strategy for Shopify

**Step 1: Welcome & Scope Request (1 min)**
- Show value proposition (increase repeat purchases)
- Request scopes: `read_customers`, `read_orders`, `write_discounts`
- Optional: `read_all_orders` (explain historical points)
- Clear explanations for each scope

**Step 2: Connect Data & Create Segments (2 mins)**
- Fetch customers using GraphQL `customers` query
- If no segments exist, create defaults:
  - "All Customers" (no filter)
  - "Recent Purchasers" (filter: `created_at > 30 days ago`)
  - "VIP" (filter: `total_spent > $500`)
- Allow skipping segmentation

**Step 3: Configure Points & Rewards (2 mins)**
- Set points name ("Stars", "Points", etc.)
- Set points value (e.g., 100 points = $1)
- Configure cashback rate (e.g., 5% of order total)
- Set expiration (optional)
- Create first discount reward template

**Step 4: Add Theme App Block (1 min)**
- Provide deep link to theme editor: `https://admin.shopify.com/store/{shop}/themes/current/editor?context=apps&template=customers/account`
- Show video/GIF of adding block
- Detect if block added (poll theme API)
- Allow skipping with reminder

**Step 5: Launch & Dashboard (< 1 min)**
- Celebrate with confetti 🎉
- Show dashboard: total customers, points issued, active tiers
- Offer next actions: customize emails, create campaigns
- Link to help docs

**Total Time**: < 7 minutes (meets TTFV goal)

---

## Architecture Overview

### Executive Summary

RewardsPro's onboarding system requires a stateful, extensible architecture that:
1. **Persists progress** across sessions and devices using Aurora PostgreSQL
2. **Integrates** with RewardsPro services and Shopify APIs (GraphQL + webhooks)
3. **Scales reliably** using event-driven architecture with async processing
4. **Maintains state** using finite state machines for predictable task flow
5. **Enables flexibility** through feature flags and A/B testing infrastructure

### Current State Audit

#### Existing Architecture

**Frontend**:
- Embedded Shopify app (Remix + React + App Bridge)
- Runs in iframe within Shopify Admin
- Obtains short-lived session token (~1 min expiry) for each request
- Session tokens sent in `Authorization: Bearer` header

**Backend**:
- Remix server on Node.js with Prisma (Aurora Data API)
- Validates session tokens and extracts shop ID
- Uses permanent OAuth access token for Shopify GraphQL calls
- ShopSettings stores boolean flags (`onboardingCompleted`) but no per-task state

**RewardsPro Services**:
- Existing routes for loyalty accrual, redemption, notifications
- Must be invoked as merchants complete onboarding tasks

**Shopify Integration**:
- GraphQL Admin API with `X-Shopify-Access-Token` header
- Webhooks for app lifecycle (APP_UNINSTALLED, GDPR topics)
- Optional webhooks for products/orders sync

#### Identified Gaps

1. **No per-task data model**: Single boolean flag prevents tracking individual task progress, timestamps, or metadata
2. **No dedicated onboarding API**: Frontend coupled to internal implementation details
3. **Missing event infrastructure**: No unified queue for reminders, sync tasks, or analytics
4. **Ad-hoc feature gating**: Lacks structured feature flag service for rollouts and A/B tests
5. **No cross-device persistence**: Progress not explicitly maintained across sessions/devices

### Proposed System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Shopify Admin (Browser)                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │          RewardsPro Embedded App (Shopify App Bridge)             │  │
│  │  ┌────────────────────┐  ┌───────────────────────────────────┐   │  │
│  │  │  Onboarding Wizard │  │  Persistent Checklist Dashboard   │   │  │
│  │  │  • Step 1: Welcome │  │  [▓▓▓▓░░░░] 50% Complete         │   │  │
│  │  │  • Step 2: Program │  │  ✓ Sync orders                    │   │  │
│  │  │  • Step 3: Preview │  │  ✓ Create tiers                   │   │  │
│  │  │  • Step 4: Publish │  │  ○ Sync customers                 │   │  │
│  │  └────────────────────┘  │  ○ Configure settings             │   │  │
│  │                           └───────────────────────────────────┘   │  │
│  │              ↓ Session Token (1-min expiry)                       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         Remix Backend (Node.js)                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Authentication Layer                                             │  │
│  │  • Validate session token (JWT, 1-min expiry)                     │  │
│  │  • Extract shop ID + user context                                 │  │
│  │  • Use OAuth access token for Shopify GraphQL                     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌────────────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│  │ Onboarding API │  │ State Machine    │  │ Feature Flag Service   │  │
│  │ • GET /tasks   │  │ • XState FSM     │  │ • Unleash/LaunchDarkly │  │
│  │ • POST /complete│ │ • Task states    │  │ • Server-side eval     │  │
│  │ • GET /progress│  │ • Transitions    │  │ • Gradual rollouts     │  │
│  └────────────────┘  └──────────────────┘  └────────────────────────┘  │
│          ↓                    ↓                        ↓                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │             Event Queue (Bull + Redis / AWS EventBridge)          │  │
│  │  Producers: API routes, webhooks, state machine actions           │  │
│  │  Events: TASK_COMPLETED, SEND_REMINDER, SYNC_SHOPIFY              │  │
│  │  Consumers: Workers for emails, RewardsPro calls, analytics       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│          ↓                                                                │
│  ┌────────────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│  │ RewardsPro     │  │ Shopify GraphQL  │  │ Shopify Webhooks       │  │
│  │ Services       │  │ API Client       │  │ • APP_UNINSTALLED      │  │
│  │ • Loyalty      │  │ • Query shop     │  │ • products/update      │  │
│  │ • Redemption   │  │ • Mutations      │  │ • orders/create        │  │
│  │ • Notifications│  │                  │  │ • GDPR topics          │  │
│  └────────────────┘  └──────────────────┘  └────────────────────────┘  │
│                                      ↓                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    Aurora PostgreSQL (Data API Only)                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  ShopSettings          OnboardingTask          OnboardingEvent    │  │
│  │  • id (shop domain)    • id (task UUID)        • id (event UUID)  │  │
│  │  • onboardingEnabled   • shopId (FK)           • shopId           │  │
│  │  • onboardingCompleted • taskId (enum)         • eventType        │  │
│  │  • flags...            • state (FSM state)     • payload (JSON)   │  │
│  │                        • metadata (JSON)       • processingStatus │  │
│  │                        • completedAt           • timestamp        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Customer, Tier, Order, StoreCreditLedger (existing models)       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    Analytics & Telemetry Pipeline                       │
│  • Mixpanel / Amplitude                                                 │
│  • AWS Firehose / Segment                                               │
│  • 12-month retention, then purged                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Sequence

#### 1. Installation & First Load

```
1. Merchant installs app → OAuth flow completes
2. Backend creates ShopSettings with onboardingEnabled = true, onboardingCompleted = false
3. Seed default OnboardingTask records (state = 'pending')
4. Merchant visits app → Frontend fetches session token via App Bridge
5. GET /api/onboarding/tasks → Returns task list with current states
6. If onboardingCompleted = false → Show wizard or checklist
```

#### 2. Task Completion Flow

```
1. Merchant completes action (e.g., creates tier via UI)
2. Frontend → POST /api/onboarding/tasks/:taskId/complete
3. Backend validates session token, extracts shop ID
4. Update OnboardingTask.state = 'completed', set completedAt timestamp
5. Publish TASK_COMPLETED event to queue with event-outbox pattern
6. Check if all tasks complete → Update ShopSettings.onboardingCompleted = true
7. Event consumer processes:
   - Call RewardsPro service if needed (e.g., activate loyalty program)
   - Send celebration email
   - Log analytics event to pipeline
8. Return updated progress to frontend → Show confetti 🎉
```

#### 3. Webhook Integration Flow

```
1. Shopify sends webhook (e.g., script_tag/create when widget installed)
2. Backend validates HMAC signature
3. Log event in OnboardingEvent table
4. Check if webhook relates to onboarding task (e.g., "Install widget")
5. Trigger state machine transition → Update OnboardingTask.state
6. Publish event to queue for async processing
7. Return 200 OK immediately (webhook must respond <5s)
```

#### 4. Cross-Device Persistence

```
1. Merchant starts onboarding on desktop → Completes Step 1
2. OnboardingTask.state persisted in Aurora
3. Merchant switches to mobile device
4. Mobile app fetches session token, calls GET /api/onboarding/tasks
5. Returns current state from database → Shows Step 2 (continuity maintained)
```

#### 5. Reminder & Re-engagement

```
1. Cron job runs daily → Queries OnboardingTask where state != 'completed' and createdAt < 3 days ago
2. Publish SEND_REMINDER event to queue
3. Event consumer sends email with task-specific CTA
4. Track email open/click events → Update OnboardingEvent for analytics
```

### State Machine Design

Each onboarding task is a node in a finite state machine (FSM). Using XState or similar library:

**Task States**:
- `pending`: Task not started
- `in_progress`: Merchant actively working on task
- `completed`: Task finished successfully
- `skipped`: Merchant chose to skip
- `failed`: Task encountered error (retry or escalate)

**Example Task: "Install Storefront Widget"**

```typescript
import { createMachine } from 'xstate';

const installWidgetMachine = createMachine({
  id: 'installWidget',
  initial: 'pending',
  states: {
    pending: {
      on: {
        START: 'in_progress'
      }
    },
    in_progress: {
      on: {
        WEBHOOK_RECEIVED: 'verifying',
        SKIP: 'skipped',
        TIMEOUT: 'failed'
      }
    },
    verifying: {
      invoke: {
        src: 'checkShopifyGraphQL',
        onDone: 'completed',
        onError: 'failed'
      }
    },
    completed: { type: 'final' },
    skipped: { type: 'final' },
    failed: {
      on: {
        RETRY: 'in_progress',
        SKIP: 'skipped'
      }
    }
  }
});
```

**Actions on Transitions**:
- `START`: Log event, show instructions
- `WEBHOOK_RECEIVED`: Validate webhook payload, update metadata
- `checkShopifyGraphQL`: Query Shopify to confirm widget installed
- `TIMEOUT`: Merchant took >72h, send reminder or mark failed
- `RETRY`: Reset state, allow merchant to try again
- `SKIP`: Mark skipped, proceed to next task

### Integration Patterns

#### Shopify Authentication

**Session Tokens** (Frontend → Backend):
```typescript
// Frontend: Obtain session token via App Bridge
const app = createApp({
  apiKey: SHOPIFY_API_KEY,
  host: new URLSearchParams(location.search).get('host')
});

const sessionToken = await app.idToken();

// Send with API request
fetch('/api/onboarding/tasks', {
  headers: {
    'Authorization': `Bearer ${sessionToken}`
  }
});
```

**Backend Token Validation**:
```typescript
// Backend: Validate and extract shop
import { authenticate } from '@shopify/shopify-app-remix/server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // session.shop = "example.myshopify.com"
  // session.accessToken = permanent OAuth token for GraphQL

  // Fetch onboarding tasks for this shop
  const tasks = await db.onboardingTask.findMany({
    where: { shopId: session.shop }
  });

  return json({ tasks });
}
```

#### Shopify GraphQL Queries

```typescript
// Use authenticated admin client
const { admin } = await authenticate.admin(request);

// Query shop data
const shopQuery = await admin.graphql(`
  query {
    shop {
      name
      email
      plan {
        displayName
      }
    }
  }
`);

const shopData = await shopQuery.json();

// Check if app extension installed
const extensionQuery = await admin.graphql(`
  query {
    app {
      installation {
        activeSubscriptions {
          name
          status
        }
      }
    }
  }
`);
```

#### Webhook Handling with Idempotency

```typescript
// app/routes/webhooks.script-tag-create.tsx
export async function action({ request }: ActionFunctionArgs) {
  // Get raw body for HMAC validation
  const rawBody = await request.text();

  // CRITICAL: Verify HMAC signature
  if (!verifyWebhookHMAC(request, rawBody)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const webhookData = JSON.parse(rawBody);
  const shop = request.headers.get('X-Shopify-Shop-Domain');
  const webhookId = request.headers.get('X-Shopify-Webhook-Id');

  // Idempotency check: Have we processed this webhook before?
  const existingEvent = await db.onboardingEvent.findFirst({
    where: {
      shopId: shop,
      eventType: 'WEBHOOK_RECEIVED',
      metadata: {
        path: ['webhookId'],
        equals: webhookId
      }
    }
  });

  if (existingEvent) {
    console.log('[Webhook] Already processed, skipping');
    return json({ success: true, duplicate: true });
  }

  // Log event
  await db.onboardingEvent.create({
    data: {
      id: uuidv4(),
      shopId: shop,
      eventType: 'WEBHOOK_RECEIVED',
      payload: { webhook: webhookData, webhookId },
      processingStatus: 'pending',
      timestamp: new Date()
    }
  });

  // Find related onboarding task
  const task = await db.onboardingTask.findFirst({
    where: {
      shopId: shop,
      taskId: 'install_widget',
      state: { in: ['pending', 'in_progress'] }
    }
  });

  if (task) {
    // Trigger state machine transition
    await transitionTask(task.id, 'WEBHOOK_RECEIVED', {
      scriptTagId: webhookData.script_tag.id
    });
  }

  // Respond quickly (<5s)
  return json({ success: true });
}
```

### Infrastructure Components

#### Event Queue Architecture

**Option 1: Bull + Redis** (Medium scale, self-hosted)

```typescript
// app/queues/onboarding.queue.ts
import Bull from 'bull';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export const onboardingQueue = new Bull('onboarding', {
  redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500      // Keep last 500 failed jobs
  }
});

// Producer: Publish event
export async function publishTaskCompleted(shop: string, taskId: string, metadata: any) {
  await onboardingQueue.add('task_completed', {
    shop,
    taskId,
    metadata,
    timestamp: new Date().toISOString()
  }, {
    jobId: `${shop}-${taskId}-${Date.now()}`, // Unique job ID for deduplication
    priority: 1 // Higher priority = processed first
  });
}

// Consumer: Process events
onboardingQueue.process('task_completed', async (job) => {
  const { shop, taskId, metadata } = job.data;

  console.log(`[Queue] Processing task_completed for ${shop}, task ${taskId}`);

  // Call RewardsPro service
  await activateLoyaltyProgram(shop, metadata);

  // Send celebration email
  await sendEmail(shop, 'onboarding_task_complete', { taskId });

  // Log to analytics
  await trackEvent('onboarding_task_completed', { shop, taskId });

  return { success: true };
});

// Dead-letter queue for failed jobs
onboardingQueue.on('failed', (job, err) => {
  console.error(`[Queue] Job ${job.id} failed:`, err);

  // After 3 attempts, move to dead-letter queue
  if (job.attemptsMade >= 3) {
    deadLetterQueue.add('failed_job', {
      originalJob: job.data,
      error: err.message,
      timestamp: new Date()
    });
  }
});
```

**Option 2: AWS EventBridge** (High scale, managed)

```typescript
// app/events/eventbridge.client.ts
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const client = new EventBridgeClient({ region: 'us-east-1' });

export async function publishEvent(eventType: string, detail: any) {
  const command = new PutEventsCommand({
    Entries: [
      {
        Source: 'rewardspro.onboarding',
        DetailType: eventType,
        Detail: JSON.stringify(detail),
        EventBusName: 'rewardspro-onboarding-bus'
      }
    ]
  });

  const response = await client.send(command);

  if (response.FailedEntryCount > 0) {
    throw new Error(`EventBridge publish failed: ${JSON.stringify(response.Entries)}`);
  }

  return response;
}

// Lambda consumer (separate function)
export const handler = async (event) => {
  const { shop, taskId, metadata } = JSON.parse(event.detail);

  // Process event...

  return { statusCode: 200, body: 'Event processed' };
};
```

#### Feature Flag Service

**Unleash Integration** (Self-hosted or cloud):

```typescript
// app/services/feature-flags.service.ts
import { Unleash } from 'unleash-client';

const unleash = new Unleash({
  url: process.env.UNLEASH_API_URL,
  appName: 'rewardspro',
  instanceId: process.env.INSTANCE_ID || 'default',
  customHeaders: {
    Authorization: process.env.UNLEASH_API_TOKEN
  }
});

export function isOnboardingEnabled(shop: string, userId?: string): boolean {
  return unleash.isEnabled('onboarding_flow_v2', {
    shopId: shop,
    userId,
    properties: {
      plan: getShopPlan(shop) // 'free', 'pro', 'max', etc.
    }
  });
}

export function getOnboardingVariant(shop: string): 'control' | 'variant_a' | 'variant_b' {
  const variant = unleash.getVariant('onboarding_experiment_1', {
    shopId: shop
  });

  return variant.name as any;
}

// Use in route loader
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!isOnboardingEnabled(session.shop)) {
    // Fall back to old onboarding or skip
    return redirect('/app/dashboard');
  }

  const variant = getOnboardingVariant(session.shop);

  // Load tasks based on variant
  const tasks = await getTasksForVariant(session.shop, variant);

  return json({ tasks, variant });
}
```

---

## Database Schema

### Existing Schema (Already Implemented)

```prisma
model ShopSettings {
  id    String @id @default(uuid())
  shop  String @unique

  // Onboarding tracking (EXISTING - lines 86-91 in schema.prisma)
  onboardingSyncedOrders      Boolean @default(false)  // Step 1
  onboardingCreatedTiers      Boolean @default(false)  // Step 2
  onboardingSyncedCustomers   Boolean @default(false)  // Step 3
  onboardingConfiguredSettings Boolean @default(false) // Step 4
  onboardingCompleted         Boolean @default(false)  // All complete
  onboardingDismissed         Boolean @default(false)  // User dismissed

  // ... other fields
}
```

### Required New Models

#### 1. OnboardingEvent (Analytics)

```prisma
model OnboardingEvent {
  id            String   @id @default(uuid())
  shop          String
  eventType     OnboardingEventType
  stepName      String?  // e.g., "welcome", "create_program", "preview"
  metadata      Json?    // Extra context (e.g., program type chosen)
  createdAt     DateTime @default(now())

  @@index([shop, createdAt])
  @@index([eventType])
}

enum OnboardingEventType {
  ONBOARDING_STARTED
  STEP_VIEWED
  STEP_COMPLETED
  STEP_SKIPPED
  ONBOARDING_DISMISSED
  ONBOARDING_COMPLETED
  CHECKLIST_ITEM_COMPLETED
  TOUR_TOOLTIP_SHOWN
  TOUR_TOOLTIP_CLICKED
}
```

#### 2. OnboardingProfile (Personalization - Phase 2)

```prisma
model OnboardingProfile {
  id                 String   @id @default(uuid())
  shop               String   @unique

  // Merchant context
  merchantType       MerchantType?     // SMB, ENTERPRISE, AGENCY
  primaryGoal        OnboardingGoal?   // LOYALTY, REFERRAL, VIP_TIERS
  industry           String?           // e.g., "Fashion", "Electronics"
  monthlyOrderVolume String?           // "0-100", "100-1000", "1000+"

  // Preferences
  hasExistingLoyalty Boolean @default(false)
  preferredRewardType String?          // "CASHBACK", "POINTS", "DISCOUNTS"

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([shop])
}

enum MerchantType {
  SMB              // Small/Medium Business
  ENTERPRISE       // Large enterprise
  AGENCY           // Agency managing multiple stores
}

enum OnboardingGoal {
  LOYALTY          // Build customer loyalty program
  REFERRAL         // Focus on referrals
  VIP_TIERS        // Exclusive VIP tier system
  RETENTION        // Reduce churn
  AOV_INCREASE     // Increase average order value
}
```

#### 3. OnboardingTask (Enhanced State Machine Model)

```prisma
model OnboardingTask {
  id            String            @id @default(uuid())
  shopId        String            // FK to ShopSettings.shop
  taskId        OnboardingTaskId  // Enum of predefined tasks
  state         TaskState         @default(PENDING)
  metadata      Json?             // Task-specific data (e.g., Shopify resource IDs)
  completedAt   DateTime?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@unique([shopId, taskId])  // One task per shop
  @@index([shopId, state])
  @@index([state, createdAt]) // For reminder queries
}

enum OnboardingTaskId {
  SYNC_ORDERS              // Import historical orders
  CREATE_TIERS             // Set up loyalty tiers
  SYNC_CUSTOMERS           // Import customer data
  CONFIGURE_SETTINGS       // Configure store settings
  INSTALL_WIDGET           // Install storefront widget
  CREATE_EARNING_RULE      // Set up first earning rule
  TEST_STOREFRONT          // Verify widget on live storefront
}

enum TaskState {
  PENDING       // Not started
  IN_PROGRESS   // Merchant actively working
  VERIFYING     // System checking completion (e.g., webhook received)
  COMPLETED     // Finished successfully
  SKIPPED       // Merchant chose to skip
  FAILED        // Encountered error, can retry
}
```

#### 4. OnboardingEvent (Enhanced with Processing Status)

```prisma
model OnboardingEvent {
  id                String    @id @default(uuid())
  shopId            String
  taskId            String?   // Optional: link to OnboardingTask.id
  eventType         OnboardingEventType
  payload           Json?     // Event data (webhook body, user action, etc.)
  processingStatus  EventProcessingStatus @default(PENDING)
  processedAt       DateTime?
  errorMessage      String?
  retryCount        Int       @default(0)
  createdAt         DateTime  @default(now())

  @@index([shopId, createdAt])
  @@index([eventType])
  @@index([processingStatus, createdAt]) // For queue reconciliation
}

enum OnboardingEventType {
  ONBOARDING_STARTED
  TASK_STARTED
  TASK_COMPLETED
  TASK_SKIPPED
  TASK_FAILED
  REMINDER_SENT
  WEBHOOK_RECEIVED
  ONBOARDING_COMPLETED
  ONBOARDING_DISMISSED
}

enum EventProcessingStatus {
  PENDING     // In queue, not processed yet
  PROCESSING  // Currently being processed
  PROCESSED   // Successfully completed
  FAILED      // Failed after retries, needs manual intervention
}
```

### API Endpoints

**Onboarding API Routes** (Remix loaders & actions):

| Route | Method | Description | Authentication |
|-------|--------|-------------|----------------|
| `/api/onboarding/tasks` | GET | Returns list of tasks with current state for authenticated shop. Uses session token to look up shop. | Session token (App Bridge) |
| `/api/onboarding/tasks/:taskId/start` | POST | Marks task as `IN_PROGRESS`. Logs event, returns updated task state. | Session token |
| `/api/onboarding/tasks/:taskId/complete` | POST | Marks task as `COMPLETED` or `SKIPPED`. Updates `completedAt`, publishes `TASK_COMPLETED` event to queue, calls RewardsPro services if needed, re-computes `onboardingCompleted` on `ShopSettings`. | Session token |
| `/api/onboarding/tasks/:taskId/retry` | POST | Resets task from `FAILED` to `IN_PROGRESS` for retry. | Session token |
| `/api/onboarding/progress` | GET | Returns overall progress (% complete, current step, next action). | Session token |
| `/api/onboarding/feature-gate` | GET | Checks feature flag (via Unleash) and returns whether onboarding v2 is enabled for shop. | Session token |
| `/webhooks/onboarding/*` | POST | Receives Shopify webhooks (script_tag/create, app/uninstalled, etc.). Validates HMAC, logs in `OnboardingEvent`, triggers state machine transitions. | HMAC signature |

### Event-Outbox Pattern for Reliability

To ensure transactional consistency between database updates and event publishing:

```typescript
// app/services/onboarding.service.ts
export async function completeTask(
  shopId: string,
  taskId: string,
  metadata?: any
): Promise<OnboardingTask> {
  return await db.$transaction(async (tx) => {
    // 1. Update task state
    const task = await tx.onboardingTask.update({
      where: { shopId_taskId: { shopId, taskId } },
      data: {
        state: 'COMPLETED',
        completedAt: new Date(),
        metadata
      }
    });

    // 2. Log event in database (outbox)
    await tx.onboardingEvent.create({
      data: {
        id: uuidv4(),
        shopId,
        taskId: task.id,
        eventType: 'TASK_COMPLETED',
        payload: { taskId, metadata },
        processingStatus: 'PENDING',
        createdAt: new Date()
      }
    });

    // 3. Check if all tasks complete
    const allTasks = await tx.onboardingTask.findMany({
      where: { shopId }
    });

    const allComplete = allTasks.every(t =>
      t.state === 'COMPLETED' || t.state === 'SKIPPED'
    );

    if (allComplete) {
      await tx.shopSettings.update({
        where: { shop: shopId },
        data: { onboardingCompleted: true }
      });

      await tx.onboardingEvent.create({
        data: {
          id: uuidv4(),
          shopId,
          eventType: 'ONBOARDING_COMPLETED',
          processingStatus: 'PENDING',
          createdAt: new Date()
        }
      });
    }

    return task;
  });

  // 4. After transaction commits, publish to queue asynchronously
  // (Worker polls OnboardingEvent table for PENDING events)
}
```

---

## Risk Assessment & Mitigation

| Risk | Impact | Likelihood | Mitigation Strategy |
|------|--------|------------|---------------------|
| **Transactional Consistency** <br> Task marked complete but event not published or RewardsPro service call fails | High | Medium | Use event-outbox pattern: persist events in database within transaction, then publish asynchronously. Implement reconciliation job to retry failed events. |
| **Event Queue Saturation** <br> Self-hosted Redis queue overwhelmed during promotional spikes | High | Medium | Start with Bull+Redis for MVP, monitor queue depth. Upgrade to AWS EventBridge for high-scale production. Set up auto-scaling for worker processes. |
| **Feature Flag Complexity** <br> Too many flags lead to flag debt, confusion, and maintenance burden | Medium | High | Adopt flag lifecycle management: short-lived flags, clear ownership, monthly cleanup schedule. Use naming convention: `<feature>_<variant>_<version>`. |
| **Data Model Migration** <br> Adding new tables breaks existing shops, requires backfill scripts | Medium | Low | Write careful Prisma migrations with expand-and-contract pattern. Seed default tasks for new shops on install. Backfill existing shops with script (mark onboarding complete if shop has tiers/customers). |
| **Privacy Compliance** <br> Retaining onboarding data longer than necessary violates GDPR/CCPA | High | Medium | Implement 12-month retention policy with automated purge job. Provide merchant-facing "Delete my data" API. Log retention period in privacy policy. |
| **State Machine Complexity** <br> As tasks evolve, state machine becomes unwieldy with many states/transitions | Medium | Medium | Start simple with 5 core states. Document state diagrams clearly. If flows become highly branched (>10 tasks), consider upgrading to workflow engine like Temporal. |
| **Webhook Reliability** <br> Shopify webhooks delayed, duplicated, or missed entirely | High | High | Implement idempotency checks using `X-Shopify-Webhook-Id`. Run daily reconciliation job to query Shopify GraphQL for missing data (e.g., check if widget still installed). Handle webhook processing <5s to avoid timeouts. |
| **Cross-Service Dependencies** <br> Onboarding task requires calling RewardsPro service that is down or slow | Medium | Medium | Use circuit breaker pattern to fail fast. Retry failed service calls via queue. Provide manual override in admin UI to mark task complete if service is unavailable. |
| **Session Persistence** <br> Merchant switches devices or browsers, loses onboarding progress | Medium | Low | Store all state in Aurora database (not client localStorage). Use shared session store (Redis) or JWTs for horizontal scaling. Test cross-device scenarios in QA. |

---

## Prioritized Backlog of Technical Enablers

### Phase 0: Foundation (Pre-MVP, 1-2 sprints)

| Priority | Enabler | Description | Effort | Dependencies |
|----------|---------|-------------|--------|--------------|
| **P0** | **Data Model & Migration** | Design and add `OnboardingTask`, `OnboardingEvent`, enhanced `OnboardingEventType` enums to Prisma schema. Write migration scripts. Seed default tasks on shop creation. Backfill existing shops. | 5 days | None |
| **P0** | **API Endpoints** | Implement secure Remix routes for fetching tasks, updating task status, checking progress. Validate session tokens. Scope queries to authenticated shop. | 3 days | Data model |
| **P0** | **State Machine Foundation** | Choose library (XState or bespoke). Define 5 core states (pending, in_progress, verifying, completed, failed). Implement `transitionTask()` function. Persist state in Aurora. | 3 days | Data model |

### Phase 1: MVP (2-3 sprints)

| Priority | Enabler | Description | Effort | Dependencies |
|----------|---------|-------------|--------|--------------|
| **P1** | **Event Queue Infrastructure** | Deploy Bull + Redis queue. Write producer logic (publish from API routes). Write consumer workers (process TASK_COMPLETED, SEND_REMINDER). Implement dead-letter queue. | 5 days | API endpoints |
| **P1** | **Webhook Integration** | Register mandatory webhooks (APP_UNINSTALLED, GDPR). Add optional webhooks (script_tag/create, products/update). Implement HMAC validation. Add idempotency checks. Link webhook events to task state machine. | 4 days | State machine, event queue |
| **P1** | **Frontend Wizard & Checklist** | Build React components for 4-step wizard and persistent checklist. Connect to API endpoints. Show progress bar, confetti on completion. Implement skip/dismiss functionality. | 5 days | API endpoints |
| **P1** | **Event-Outbox Pattern** | Wrap task updates in Prisma transactions. Persist events in database before publishing. Implement worker that polls `processingStatus=PENDING` events and publishes to queue. | 3 days | Event queue |

### Phase 2: Production-Ready (2 sprints)

| Priority | Enabler | Description | Effort | Dependencies |
|----------|---------|-------------|--------|--------------|
| **P2** | **Feature Flag Integration** | Integrate Unleash (self-hosted) or LaunchDarkly. Create flags for onboarding v2, task variants. Implement server-side evaluation with shop context. | 3 days | None (parallel with Phase 1) |
| **P2** | **Admin & Monitoring Tools** | Build internal admin UI for viewing onboarding progress per shop. Manual override controls. Set up DataDog dashboards for queue depth, job failures, completion rates. Configure alerts. | 4 days | MVP complete |
| **P2** | **Authentication & Session Enhancements** | Move to shared Redis session store or JWT-based tokens for horizontal scaling. Implement cross-device continuity tests. | 3 days | None (parallel) |
| **P2** | **Telemetry Pipeline** | Hook onboarding events into Mixpanel/Amplitude. Define metrics (TTFV, drop-off rate, completion rate). Create onboarding analytics dashboard. | 3 days | MVP complete |

### Phase 3: Optimization (Ongoing)

| Priority | Enabler | Description | Effort | Dependencies |
|----------|---------|-------------|--------|--------------|
| **P3** | **Reconciliation & Cron Jobs** | Implement daily cron to reconcile Shopify data (query GraphQL for widget status, product configs). Purge onboarding events older than 12 months. Send reminders for incomplete tasks >3 days old. | 3 days | MVP complete |
| **P3** | **Circuit Breaker for External Services** | Wrap RewardsPro service calls in circuit breaker (fail fast after N failures). Implement retry logic with exponential backoff. | 2 days | MVP complete |
| **P3** | **Upgrade Event Queue (if needed)** | Migrate from Bull+Redis to AWS EventBridge or Google Pub/Sub for higher scale and managed reliability. | 5 days | Production data on queue saturation |
| **P3** | **Documentation & Training** | Write architecture docs with state machine diagrams, event flows, admin procedures. Train developers and support staff on how to operate and debug onboarding system. | 3 days | Production deployment |

---

## Phase 1: MVP Implementation

**Timeline**: Sprint 1-2 (2 weeks)
**Goal**: Ship working onboarding wizard with tracking

### Files to Create

```
app/
├── routes/
│   ├── app.onboarding.wizard.tsx        # Main wizard route
│   └── app.onboarding.api.tsx           # API endpoints for step updates
├── components/
│   ├── OnboardingWizard/
│   │   ├── index.tsx                    # Wizard container
│   │   ├── WizardStep.tsx              # Individual step wrapper
│   │   ├── StepWelcome.tsx             # Step 1: Welcome
│   │   ├── StepCreateProgram.tsx       # Step 2: Template selection
│   │   ├── StepPreview.tsx             # Step 3: Preview & customize
│   │   ├── StepPublish.tsx             # Step 4: Activate
│   │   └── WizardProgress.tsx          # Progress bar component
│   ├── OnboardingChecklist/
│   │   ├── index.tsx                    # Checklist component
│   │   ├── ChecklistItem.tsx           # Individual task
│   │   └── ProgressIndicator.tsx       # Visual progress
│   └── OnboardingCelebration/
│       ├── index.tsx                    # Confetti + completion modal
│       └── ConfettiAnimation.tsx       # Canvas-based confetti
├── services/
│   └── onboarding.service.ts           # Business logic
└── utils/
    └── onboarding-analytics.ts         # Analytics helpers
```

### Step-by-Step Implementation

#### 1. Create Onboarding Service

**File**: `app/services/onboarding.service.ts`

```typescript
import { db } from "~/db.server";
import { v4 as uuidv4 } from "uuid";

export interface OnboardingStatus {
  completed: boolean;
  dismissed: boolean;
  currentStep: number;
  steps: {
    syncedOrders: boolean;
    createdTiers: boolean;
    syncedCustomers: boolean;
    configuredSettings: boolean;
  };
  progress: number; // 0-100
}

export class OnboardingService {

  /**
   * Get onboarding status for a shop
   */
  static async getStatus(shop: string): Promise<OnboardingStatus> {
    const settings = await db.shopSettings.findUnique({
      where: { shop },
      select: {
        onboardingCompleted: true,
        onboardingDismissed: true,
        onboardingSyncedOrders: true,
        onboardingCreatedTiers: true,
        onboardingSyncedCustomers: true,
        onboardingConfiguredSettings: true,
      }
    });

    if (!settings) {
      throw new Error(`Shop settings not found for ${shop}`);
    }

    const steps = {
      syncedOrders: settings.onboardingSyncedOrders,
      createdTiers: settings.onboardingCreatedTiers,
      syncedCustomers: settings.onboardingSyncedCustomers,
      configuredSettings: settings.onboardingConfiguredSettings,
    };

    const completedSteps = Object.values(steps).filter(Boolean).length;
    const totalSteps = Object.keys(steps).length;
    const progress = Math.round((completedSteps / totalSteps) * 100);

    const currentStep = settings.onboardingCompleted ? 4 :
                       settings.onboardingConfiguredSettings ? 3 :
                       settings.onboardingSyncedCustomers ? 2 :
                       settings.onboardingCreatedTiers ? 1 : 0;

    return {
      completed: settings.onboardingCompleted,
      dismissed: settings.onboardingDismissed,
      currentStep,
      steps,
      progress,
    };
  }

  /**
   * Mark a step as complete
   */
  static async completeStep(
    shop: string,
    step: keyof OnboardingStatus['steps']
  ): Promise<void> {
    const fieldMap = {
      syncedOrders: 'onboardingSyncedOrders',
      createdTiers: 'onboardingCreatedTiers',
      syncedCustomers: 'onboardingSyncedCustomers',
      configuredSettings: 'onboardingConfiguredSettings',
    };

    await db.shopSettings.update({
      where: { shop },
      data: { [fieldMap[step]]: true }
    });

    // Track analytics event
    await this.trackEvent(shop, 'STEP_COMPLETED', step);

    // Check if all steps complete
    const status = await this.getStatus(shop);
    if (status.progress === 100 && !status.completed) {
      await this.completeOnboarding(shop);
    }
  }

  /**
   * Mark entire onboarding as complete
   */
  static async completeOnboarding(shop: string): Promise<void> {
    await db.shopSettings.update({
      where: { shop },
      data: {
        onboardingCompleted: true,
        onboardingDismissed: false,
      }
    });

    await this.trackEvent(shop, 'ONBOARDING_COMPLETED');
  }

  /**
   * Dismiss onboarding (allow resume later)
   */
  static async dismissOnboarding(shop: string): Promise<void> {
    await db.shopSettings.update({
      where: { shop },
      data: { onboardingDismissed: true }
    });

    await this.trackEvent(shop, 'ONBOARDING_DISMISSED');
  }

  /**
   * Resume dismissed onboarding
   */
  static async resumeOnboarding(shop: string): Promise<void> {
    await db.shopSettings.update({
      where: { shop },
      data: { onboardingDismissed: false }
    });

    await this.trackEvent(shop, 'ONBOARDING_STARTED');
  }

  /**
   * Track analytics event
   */
  static async trackEvent(
    shop: string,
    eventType: string,
    stepName?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await db.onboardingEvent.create({
      data: {
        id: uuidv4(),
        shop,
        eventType,
        stepName,
        metadata: metadata ? JSON.stringify(metadata) : null,
        createdAt: new Date(),
      }
    });
  }
}
```

#### 2. Create Wizard Components

**File**: `app/components/OnboardingWizard/index.tsx`

```typescript
import { useState, useCallback } from "react";
import { Modal, ProgressBar } from "@shopify/polaris";
import { StepWelcome } from "./StepWelcome";
import { StepCreateProgram } from "./StepCreateProgram";
import { StepPreview } from "./StepPreview";
import { StepPublish } from "./StepPublish";
import { WizardProgress } from "./WizardProgress";

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  initialStep?: number;
}

export function OnboardingWizard({
  open,
  onClose,
  onComplete,
  initialStep = 0
}: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [programData, setProgramData] = useState({});

  const totalSteps = 4;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const handleNext = useCallback((data?: any) => {
    if (data) {
      setProgramData(prev => ({ ...prev, ...data }));
    }

    if (currentStep === totalSteps - 1) {
      // Last step - complete onboarding
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, totalSteps, onComplete]);

  const handleBack = useCallback(() => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  }, []);

  const handleSkip = useCallback(() => {
    onClose();
  }, [onClose]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <StepWelcome onNext={handleNext} onSkip={handleSkip} />;
      case 1:
        return <StepCreateProgram onNext={handleNext} onBack={handleBack} />;
      case 2:
        return <StepPreview programData={programData} onNext={handleNext} onBack={handleBack} />;
      case 3:
        return <StepPublish programData={programData} onNext={handleNext} onBack={handleBack} />;
      default:
        return null;
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Welcome to RewardsPro"
      large
    >
      <Modal.Section>
        <WizardProgress currentStep={currentStep} totalSteps={totalSteps} />
        {renderStep()}
      </Modal.Section>
    </Modal>
  );
}
```

**File**: `app/components/OnboardingWizard/StepWelcome.tsx`

```typescript
import { BlockStack, Text, Button, InlineStack, Icon, Box } from "@shopify/polaris";
import { RewardIcon, ChartVerticalIcon, PersonIcon } from "~/utils/polaris-icons";

interface StepWelcomeProps {
  onNext: () => void;
  onSkip: () => void;
}

export function StepWelcome({ onNext, onSkip }: StepWelcomeProps) {
  return (
    <BlockStack gap="600">
      <BlockStack gap="400">
        <Text variant="headingLg" as="h2">
          Turn Customers Into Loyal Fans
        </Text>
        <Text variant="bodyMd" as="p" tone="subdued">
          RewardsPro helps you create a powerful loyalty program in minutes.
          Reward customers with store credit, track their progress, and watch
          your repeat purchase rate soar.
        </Text>
      </BlockStack>

      <BlockStack gap="400">
        <Box paddingBlock="300">
          <InlineStack gap="400" blockAlign="start">
            <Icon source={RewardIcon} tone="success" />
            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">Automated Cashback</Text>
              <Text variant="bodyMd" as="p" tone="subdued">
                Customers earn store credit automatically with every purchase
              </Text>
            </BlockStack>
          </InlineStack>
        </Box>

        <Box paddingBlock="300">
          <InlineStack gap="400" blockAlign="start">
            <Icon source={PersonIcon} tone="success" />
            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">Tiered Rewards</Text>
              <Text variant="bodyMd" as="p" tone="subdued">
                Create VIP tiers that reward your best customers with higher cashback
              </Text>
            </BlockStack>
          </InlineStack>
        </Box>

        <Box paddingBlock="300">
          <InlineStack gap="400" blockAlign="start">
            <Icon source={ChartVerticalIcon} tone="success" />
            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">Analytics Dashboard</Text>
              <Text variant="bodyMd" as="p" tone="subdued">
                Track program performance with detailed metrics and insights
              </Text>
            </BlockStack>
          </InlineStack>
        </Box>
      </BlockStack>

      <InlineStack gap="300" align="end">
        <Button onClick={onSkip}>Skip for now</Button>
        <Button variant="primary" onClick={onNext}>Get Started</Button>
      </InlineStack>
    </BlockStack>
  );
}
```

#### 3. Create Persistent Checklist

**File**: `app/components/OnboardingChecklist/index.tsx`

```typescript
import { useState } from "react";
import { Card, BlockStack, Text, InlineStack, Icon, Button, ProgressBar, Box, Collapsible } from "@shopify/polaris";
import { CheckCircleIcon, ChevronDownIcon, ChevronUpIcon } from "~/utils/polaris-icons";
import { ChecklistItem } from "./ChecklistItem";

interface OnboardingChecklistProps {
  status: {
    steps: {
      syncedOrders: boolean;
      createdTiers: boolean;
      syncedCustomers: boolean;
      configuredSettings: boolean;
    };
    progress: number;
    completed: boolean;
  };
  onActionClick: (action: string) => void;
}

export function OnboardingChecklist({ status, onActionClick }: OnboardingChecklistProps) {
  const [expanded, setExpanded] = useState(!status.completed);

  if (status.completed) {
    return null; // Hide checklist when onboarding complete
  }

  const tasks = [
    {
      id: 'syncedOrders',
      title: 'Sync your order history',
      description: 'Import past orders to calculate customer tiers',
      completed: status.steps.syncedOrders,
      action: () => onActionClick('sync-orders'),
      actionLabel: 'Sync Orders'
    },
    {
      id: 'createdTiers',
      title: 'Create reward tiers',
      description: 'Set up Bronze, Silver, Gold tiers with cashback rates',
      completed: status.steps.createdTiers,
      action: () => onActionClick('create-tiers'),
      actionLabel: 'Create Tiers'
    },
    {
      id: 'syncedCustomers',
      title: 'Sync customer data',
      description: 'Import customers and assign them to tiers',
      completed: status.steps.syncedCustomers,
      action: () => onActionClick('sync-customers'),
      actionLabel: 'Sync Customers'
    },
    {
      id: 'configuredSettings',
      title: 'Configure store settings',
      description: 'Set currency, timezone, and email preferences',
      completed: status.steps.configuredSettings,
      action: () => onActionClick('configure-settings'),
      actionLabel: 'Configure'
    },
  ];

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Setup Progress</Text>
              <Text variant="bodySm" as="p" tone="subdued">
                {status.progress}% complete
              </Text>
            </BlockStack>
            <Button
              icon={expanded ? ChevronUpIcon : ChevronDownIcon}
              onClick={() => setExpanded(!expanded)}
              variant="plain"
            />
          </InlineStack>

          <ProgressBar progress={status.progress} size="small" tone="primary" />

          <Collapsible
            open={expanded}
            id="checklist-items"
            transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}
          >
            <BlockStack gap="300">
              {tasks.map(task => (
                <ChecklistItem
                  key={task.id}
                  {...task}
                />
              ))}
            </BlockStack>
          </Collapsible>
        </BlockStack>
      </Box>
    </Card>
  );
}
```

#### 4. Create Analytics Utilities

**File**: `app/utils/onboarding-analytics.ts`

```typescript
/**
 * Onboarding Analytics Utilities
 *
 * Event naming convention: onboarding_<action>_<object>
 * Example: onboarding_completed_wizard, onboarding_clicked_step
 */

export interface OnboardingAnalyticsEvent {
  eventType: string;
  stepName?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export class OnboardingAnalytics {

  /**
   * Track wizard opened
   */
  static wizardOpened(metadata?: Record<string, any>): OnboardingAnalyticsEvent {
    return {
      eventType: 'ONBOARDING_STARTED',
      stepName: 'welcome',
      metadata,
      timestamp: new Date(),
    };
  }

  /**
   * Track step viewed
   */
  static stepViewed(stepName: string, metadata?: Record<string, any>): OnboardingAnalyticsEvent {
    return {
      eventType: 'STEP_VIEWED',
      stepName,
      metadata,
      timestamp: new Date(),
    };
  }

  /**
   * Track step completed
   */
  static stepCompleted(stepName: string, metadata?: Record<string, any>): OnboardingAnalyticsEvent {
    return {
      eventType: 'STEP_COMPLETED',
      stepName,
      metadata: {
        ...metadata,
        completionTime: Date.now(), // for TTFV calculation
      },
      timestamp: new Date(),
    };
  }

  /**
   * Track checklist item clicked
   */
  static checklistItemClicked(itemId: string, completed: boolean): OnboardingAnalyticsEvent {
    return {
      eventType: 'CHECKLIST_ITEM_COMPLETED',
      stepName: itemId,
      metadata: { completed },
      timestamp: new Date(),
    };
  }

  /**
   * Track onboarding dismissed
   */
  static onboardingDismissed(reason?: string): OnboardingAnalyticsEvent {
    return {
      eventType: 'ONBOARDING_DISMISSED',
      metadata: { reason },
      timestamp: new Date(),
    };
  }

  /**
   * Track onboarding completed
   */
  static onboardingCompleted(
    totalTimeMs: number,
    stepsCompleted: number
  ): OnboardingAnalyticsEvent {
    return {
      eventType: 'ONBOARDING_COMPLETED',
      metadata: {
        totalTimeMs,
        stepsCompleted,
        ttfv: totalTimeMs, // Time to first value
      },
      timestamp: new Date(),
    };
  }
}
```

#### 5. Create Main Route

**File**: `app/routes/app.onboarding.wizard.tsx`

```typescript
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { useState, useEffect } from "react";
import { Page, Frame } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { OnboardingWizard } from "~/components/OnboardingWizard";
import { OnboardingCelebration } from "~/components/OnboardingCelebration";
import { OnboardingService } from "~/services/onboarding.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!session?.shop) throw new Response("Unauthorized", { status: 401 });

  const status = await OnboardingService.getStatus(session.shop);

  return json({ status });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!session?.shop) throw new Response("Unauthorized", { status: 401 });

  const formData = await request.formData();
  const action = formData.get('action') as string;
  const step = formData.get('step') as string;

  switch (action) {
    case 'complete-step':
      await OnboardingService.completeStep(session.shop, step as any);
      break;
    case 'complete-onboarding':
      await OnboardingService.completeOnboarding(session.shop);
      break;
    case 'dismiss':
      await OnboardingService.dismissOnboarding(session.shop);
      break;
    case 'resume':
      await OnboardingService.resumeOnboarding(session.shop);
      break;
  }

  const status = await OnboardingService.getStatus(session.shop);
  return json({ status });
};

export default function OnboardingWizardRoute() {
  const { status } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [showWizard, setShowWizard] = useState(!status.completed && !status.dismissed);
  const [showCelebration, setShowCelebration] = useState(false);

  const handleComplete = () => {
    fetcher.submit(
      { action: 'complete-onboarding' },
      { method: 'post' }
    );
    setShowWizard(false);
    setShowCelebration(true);
  };

  const handleDismiss = () => {
    fetcher.submit(
      { action: 'dismiss' },
      { method: 'post' }
    );
    setShowWizard(false);
    navigate('/app');
  };

  return (
    <Page>
      <OnboardingWizard
        open={showWizard}
        onClose={handleDismiss}
        onComplete={handleComplete}
        initialStep={status.currentStep}
      />

      {showCelebration && (
        <OnboardingCelebration
          onDismiss={() => {
            setShowCelebration(false);
            navigate('/app');
          }}
        />
      )}
    </Page>
  );
}
```

### Analytics Instrumentation Checklist

- [ ] Define event taxonomy in central document
- [ ] Instrument wizard open event
- [ ] Instrument each step view event
- [ ] Instrument step completion events
- [ ] Instrument skip/dismiss events
- [ ] Instrument checklist item clicks
- [ ] Instrument onboarding completion with TTFV
- [ ] Add error tracking for failed API calls
- [ ] Add performance monitoring (step load times)
- [ ] QA all events in dev environment

---

## Phase 2: Enhanced Personalization

**Timeline**: Sprint 3-4 (2 weeks)
**Goal**: Adaptive flows based on merchant goals

### Implementation Steps

1. **Add goal selection to welcome step**
   - Radio buttons: Loyalty | Referrals | VIP Tiers | Retention
   - Store selection in `OnboardingProfile`

2. **Conditional wizard paths**
   - Loyalty → Template: Bronze/Silver/Gold
   - Referrals → Template: Friend rewards
   - VIP Tiers → Template: Exclusive benefits

3. **Hybrid data sync**
   - Sync customers on install (webhook: `customers/create`)
   - Sync orders incrementally (webhook: `orders/paid`)
   - Reconciliation job nightly

4. **Advanced checklist**
   - Dynamic tasks based on goal
   - "Next best action" recommendations

---

## Phase 3: Advanced Features

**Timeline**: Sprint 5+ (ongoing)
**Goal**: Gamification, ML, optimization

### Features

1. **Gamification**
   - Badges for completing tasks
   - Streaks for daily logins
   - Leaderboard (optional, for agencies)

2. **Resource Center**
   - Video tutorials
   - Knowledge base
   - Community forum link

3. **Predictive Next Actions**
   - ML model predicts churn risk
   - Recommends interventions

4. **A/B Testing Framework**
   - Test wizard variations
   - Optimize microcopy
   - Measure impact on activation

---

## UI/UX Patterns & Components

### Design Principles

1. **Simplicity**: 3-5 steps max, progressive disclosure
2. **Clarity**: Clear labels, avoid jargon
3. **Action-oriented**: Every step requires user action
4. **Celebratory**: Confetti on completion 🎉
5. **Accessible**: WCAG AA compliance, keyboard navigation

### Reusable Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `WizardProgress` | Show step indicator | `currentStep`, `totalSteps` |
| `ChecklistItem` | Task with checkbox | `title`, `completed`, `action` |
| `ProgressBar` | Visual progress meter | `progress`, `tone` |
| `ConfettiAnimation` | Canvas-based celebration | `duration`, `colors` |
| `TooltipTour` | Contextual help bubble | `content`, `target`, `position` |
| `EmptyStateTemplate` | Prefilled program samples | `type`, `data` |

---

## A/B Testing Plan

### Phase 1 MVP Experiments

#### Experiment 1: Gating Level

**Hypothesis**: Soft gating (skip allowed) increases completion rate and reduces drop-off while still driving essential setup.

**Variants**:
- **Control**: Soft gating - merchants can skip steps, reminded later
- **Variant A**: Moderate hard gating - first 3 steps mandatory
- **Variant B**: Full ungated - all steps skippable

**Metrics**:
- Primary: Activation rate (% completing onboarding)
- Secondary: TTFV, drop-off rate, 7-day retention

**Sample Size**: 300 merchants per variant (900 total)
**Duration**: 2 weeks
**Success Criteria**: Control or Variant A achieves >8% activation with <30% drop-off

---

#### Experiment 2: Checklist Incentive

**Hypothesis**: Gamified checklist with incentives increases completion rate and feature adoption.

**Variants**:
- **Control**: Standard checklist with visual checkmarks
- **Variant A**: Gamified checklist (unlock analytics after 3 tasks)
- **Variant B**: Trial extension checklist (extend trial by 7 days for completion)

**Metrics**:
- Primary: Checklist completion rate
- Secondary: Feature adoption rate, engagement score

**Sample Size**: 250 merchants per variant
**Duration**: 2 weeks
**Success Criteria**: Variant achieves >15% increase in checklist completion vs control

---

#### Experiment 3: Email Sequence Intensity

**Hypothesis**: Structured 6-email sequence with targeted content improves user return rates compared to minimal 3-email sequence.

**Variants**:
- **Control**: 3-email sequence (welcome, reminder Day 1, re-engagement Day 7)
- **Variant**: 6-email sequence (welcome, setup reminder Day 1, feature intro Day 3, success story Day 5, offer help Day 7, re-engagement Day 14)

**Metrics**:
- Primary: Re-engagement rate (return to app after email)
- Secondary: Email open rate, click-through rate, conversion to in-app action

**Sample Size**: 400 merchants per variant
**Duration**: 3 weeks
**Success Criteria**: Variant achieves >20% improvement in re-engagement rate

---

#### Experiment 4: Persona Personalization

**Hypothesis**: Collecting minimal persona information (industry, business size) increases activation and satisfaction by tailoring guidance.

**Variants**:
- **Control**: Default flow without initial persona questions
- **Variant**: Wizard includes Step 0 with 2 persona questions, then adapts checklist

**Metrics**:
- Primary: Activation rate, task completion rate
- Secondary: User satisfaction (NPS survey), support tickets

**Sample Size**: 300 merchants per variant
**Duration**: 2 weeks
**Success Criteria**: Variant achieves >10% increase in activation without increasing support tickets

---

### Phase 2 Enhanced Experiments

#### Experiment 5: Interactive Guide Overlay

**Hypothesis**: Context-sensitive tooltips reduce confusion and improve feature adoption for complex features.

**Variants**:
- **Control**: No interactive guides, only static documentation
- **Variant A**: Tooltips for tier configuration
- **Variant B**: Full interactive guide (5 steps) for tier configuration

**Metrics**:
- Primary: Feature adoption rate (tier configuration)
- Secondary: Error rate, support tickets, time on feature

---

### Experiment Tracking Implementation

```typescript
// app/utils/ab-testing.ts
export class ABTestingService {

  static async assignVariant(
    shop: string,
    experimentName: string,
    variants: string[]
  ): Promise<string> {
    // Check if shop already assigned to variant
    const existing = await db.abTestAssignment.findFirst({
      where: { shop, experimentName }
    });

    if (existing) return existing.variant;

    // Randomly assign variant
    const variant = variants[Math.floor(Math.random() * variants.length)];

    await db.abTestAssignment.create({
      data: {
        id: uuidv4(),
        shop,
        experimentName,
        variant,
        assignedAt: new Date(),
      }
    });

    return variant;
  }

  static async trackExperimentEvent(
    shop: string,
    experimentName: string,
    eventType: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const assignment = await db.abTestAssignment.findFirst({
      where: { shop, experimentName }
    });

    if (!assignment) return;

    await db.onboardingEvent.create({
      data: {
        id: uuidv4(),
        shop,
        eventType,
        stepName: experimentName,
        metadata: {
          variant: assignment.variant,
          ...metadata
        },
        createdAt: new Date(),
      }
    });
  }
}
```

**Database Schema Addition**:

```prisma
model ABTestAssignment {
  id              String   @id @default(uuid())
  shop            String
  experimentName  String   // e.g., "gating_level_v1"
  variant         String   // e.g., "control", "variant_a"
  assignedAt      DateTime @default(now())

  @@unique([shop, experimentName])
  @@index([experimentName])
}
```

---

## Experimentation Framework

RewardsPro should adopt a structured experimentation framework to test onboarding variations and identify which interventions drive better metrics. The framework combines guidance from Amplitude's 7-step process and Statsig's B2B experimentation best practices.

### 7-Step Experimentation Process

#### 1. Define Growth Lever & Problem

**Purpose**: Clarify whether the experiment aims to improve activation, retention, or monetization.

**Action**: Articulate the customer problem from the merchant's viewpoint.

**Example**:
- Problem: "Merchants are unclear about loyalty tier benefits"
- Growth lever: Activation (onboarding completion)

#### 2. Develop Hypothesis

**Format**: "We believe that [change] will cause [impact] for [merchant segment] because [reasoning]."

**Examples**:
- "We believe that embedding a progress indicator will increase completion rate for small merchants by 12% because it provides a sense of progress and reduces uncertainty."
- "We believe that adding a 60-second explainer video in Step 1 will increase activation rate by 15% for self-serve merchants because it clarifies value proposition quickly."

#### 3. Ideate Solutions & Associate KPIs

**Process**:
- Brainstorm possible solutions (video walkthrough, interactive checklist, in-app chat support)
- Associate each idea with primary KPIs (completion rate, activation rate, CES)
- Consider implementation cost and expected impact

**Example Solutions**:
| Solution | Primary KPI | Expected Impact | Implementation Cost |
|----------|-------------|-----------------|---------------------|
| Progress indicator | Completion rate | +12% | Low (CSS/JS) |
| Video in Step 1 | Activation rate | +15% | Medium (video production) |
| Self-triggered tour | Feature adoption | +50% engagement | Medium (tour platform) |
| Embedded GIFs in tooltips | Support ticket reduction | -20% tickets | Low (screen recording) |

#### 4. Prioritize Experiments

**Evaluation Criteria**:
- **Expected Impact**: High/Medium/Low
- **Confidence**: Based on research evidence
- **Development Cost**: Engineering hours required

**Prioritization Matrix**:
```
High Impact + High Confidence + Low Cost = Priority 1 (do immediately)
High Impact + Medium Confidence + Medium Cost = Priority 2 (plan for next sprint)
Low Impact or High Cost = Deprioritize
```

**Statsig Guidance**: Focus on high-impact changes (major workflow redesigns) rather than trivial tweaks (button colors), especially when sample sizes are small in B2B.

#### 5. Design & Implement

**Tools**:
- **Feature Flagging**: LaunchDarkly or Statsig for controlled rollouts
- **Analytics**: Mixpanel or Amplitude for event tracking
- **Error Tracking**: Sentry for reliability monitoring

**Feature Flag Best Practices**:
- Use clear naming: `onboarding_progress_indicator_v1`
- Monitor flag usage with platform analytics
- Schedule periodic cleanup to avoid technical debt

**Implementation Checklist**:
- [ ] Create feature flag in LaunchDarkly
- [ ] Implement variant logic in code
- [ ] Add tracking events for both control and treatment
- [ ] QA both variants in dev environment
- [ ] Document experiment in tracking plan
- [ ] Set rollout percentage (e.g., 50/50 split)

#### 6. Run & Analyze

**Execution**:
- Randomize merchants into control and treatment groups
- Track relevant events with proper identity resolution
- Monitor for statistical significance AND practical significance

**Statsig Warning**: Don't focus solely on p-values. Consider:
- **Directionality**: Is the change moving metric in expected direction?
- **Practical significance**: Is a 0.5% increase worth the development cost?
- **Sample size**: B2B products need longer run times due to smaller cohorts

**Monitoring During Experiment**:
- Daily check on sample size per variant
- Weekly review of early indicators
- Alert if error rates spike in treatment group

#### 7. Learn & Iterate

**Decision Framework**:
| Outcome | Action |
|---------|--------|
| Clear winner (>10% improvement, p<0.05) | Roll out to 100% |
| Marginal win (2-10% improvement) | Consider trade-offs, may ship |
| No significant difference | Deprecate experiment, try alternative |
| Negative impact | Immediately stop, roll back |

**Documentation**:
- Record results in experiment log
- Update hypothesis based on learnings
- Share insights with team in bi-weekly review

**Iteration**:
- Use outcomes to refine hypothesis
- Stop experiments when business priority changes or diminishing returns are evident
- Archive inactive feature flags quarterly

---

### Quick-Win Experiments (Based on Research)

These experiments are backed by industry research and have high probability of success:

#### 1. Progress Indicators & Shorter Tours

**Evidence**: Chameleon's 2025 benchmarks show progress indicators increase completion by **12%**, and tours with <5 steps have substantially higher completion.

**Implementation**:
- Add progress bar to wizard (e.g., "Step 2 of 4")
- Split any steps >5 minutes into smaller sub-steps
- Show % complete in checklist

**Expected Impact**: +12% completion rate
**Effort**: Low (1-2 days dev)
**Priority**: 1

#### 2. Self-Triggered Help Tour

**Evidence**: Chameleon found self-triggered tours **double engagement** vs. auto-triggered.

**Implementation**:
- Add "?" icon next to tier configuration section
- Merchant can click to start optional 3-step tour
- Tour explains cashback %, min spend, tier progression

**Expected Impact**: +50% engagement with tier feature
**Effort**: Medium (3-5 days with tour platform integration)
**Priority**: 2

#### 3. Multimedia in Tooltips

**Evidence**: >80% of companies with activation >50% use videos, GIFs, or animations.

**Implementation**:
- Embed 15-second GIF in tooltip explaining "How cashback tiers work"
- Add 30-second video in Step 1 showing end-to-end customer experience
- Use animated illustrations for complex concepts

**Expected Impact**: +20% activation rate, -15% support tickets
**Effort**: Medium (video production 2-3 days, implementation 1 day)
**Priority**: 1

#### 4. Early NPS/CES Survey Placement

**Evidence**: Userpilot found surveying after 5th login yields higher response rates.

**Implementation**:
- Test A: Survey after completing onboarding (current)
- Test B: Survey after 5th login
- Test C: Survey after first reward issuance

**Expected Impact**: +15% response rate, better predictive power
**Effort**: Low (1 day dev, survey platform integration)
**Priority**: 2

---

## Governance & Operational Playbook

Effective onboarding requires clear governance, documentation standards, and regular review cadences to ensure data quality and continuous improvement.

### Data & Experimentation Governance

#### Central Data Ownership

**Role**: Data Governor (Analytics Lead or Product Manager)

**Responsibilities**:
- Maintain tracking plan and event taxonomy
- Enforce naming conventions (`object_action`, snake_case)
- Review data quality weekly
- Conduct quarterly audits of events and properties
- Approve new events before implementation

**Process**:
1. Engineer/PM proposes new event
2. Data Governor reviews against naming standards
3. Governor checks for duplicates or alternatives
4. Approved events added to tracking plan with documentation
5. QA validates event fires correctly in dev

#### Feature Flag Lifecycle Management

**Register of Active Flags**: Maintain spreadsheet or dashboard with:
- Flag name
- Owner (engineer or PM)
- Purpose (brief description)
- Rollout date
- Expiry date (default: 90 days after 100% rollout)
- Status (planning, active, deprecated)

**Flag Naming Convention**: `<feature>_<variant>_<version>`
- Example: `onboarding_progress_indicator_v1`
- Example: `checklist_gamification_trial_extension_v2`

**Cleanup Schedule**:
- **Monthly**: Review flags >90 days old, archive if unused
- **Quarterly**: Audit all flags, remove technical debt
- **Best Practice**: LaunchDarkly analytics show flag usage; delete flags with 0% or 100% allocation for >30 days

**Flag Deprecation Process**:
1. Flag reaches 100% rollout (or 0% if experiment failed)
2. Wait 30 days to ensure no issues
3. Remove flag from code, keep logic
4. Archive flag in LaunchDarkly
5. Update tracking plan to mark experiment complete

#### Documentation & Versioning

**Central Repository**: GitHub `/docs/` or Confluence space

**Required Documents**:
- **Tracking Plan**: Living document with all events, properties, owners
- **Experiment Log**: Record of all A/B tests with results
- **Onboarding Changelog**: Updates to wizard, checklist, or flows
- **Governance Playbook**: This document

**Version Control**:
- Use semantic versioning for tracking plan (v1.0, v1.1, v2.0)
- Major version bump when events are deprecated or schema changes
- Minor version bump when new events added

**Update Cadence**:
- Update tracking plan within 24h of adding/removing events
- Update experiment log immediately after experiment concludes
- Review and refresh governance playbook quarterly

#### Review Cadence

**Bi-Weekly Onboarding Review (1 hour)**

**Attendees**: Product, Engineering, Customer Success, Marketing

**Agenda**:
1. Review KPI dashboard (completion rate, activation, TTFV, NPS, CES)
2. Analyze funnel drop-offs and identify friction points
3. Review support tickets categorized by onboarding stage
4. Discuss active experiments and early signals
5. Decide on new experiments or improvements
6. Assign action items

**Quarterly Deep-Dive (2-3 hours)**

**Attendees**: Leadership, Product, Engineering, Customer Success, Data

**Agenda**:
1. Assess Onboarding Success Score trend (70+ target)
2. Compare cohorts (e.g., Q4 2024 vs Q1 2025)
3. Review major experiments and cumulative impact
4. Refresh event taxonomy and deprecate unused events
5. Conduct feature flag cleanup
6. Set priorities for next quarter

**Monthly Leadership Report**

**Format**: One-page summary or dashboard

**Contents**:
- **Onboarding Success Score**: Current score + trend
- **Key Metrics**: Completion rate, activation rate, TTFV, NPS, churn
- **Experiments**: Active tests, completed tests, planned tests
- **Insights**: Top 3 opportunities and top 3 risks
- **Actions**: Decisions needed from leadership

---

### Operational Practices for Continuous Improvement

#### Monitoring & Alerting

**Tools**: DataDog (infrastructure), Sentry (errors), Mixpanel (product analytics)

**Alert Rules**:
| Alert | Trigger | Channel | Owner | Response Time |
|-------|---------|---------|-------|---------------|
| Onboarding completion <15% | 2 consecutive days | Slack #rewardspro-alerts | Product Manager | 4 hours |
| TTFV >36h | 10+ merchants in 24h | Slack #rewardspro-alerts | Engineering Lead | 8 hours |
| Error rate >5% on step | 5+ errors in 1h | PagerDuty + Slack | On-call Engineer | 30 minutes |
| NPS <20 | 3+ responses in 7 days | Email to PM & CSM | Customer Success | 24 hours |
| Shopify API failures | 10+ failures in 5 min | PagerDuty | On-call Engineer | 15 minutes |

**Monitoring Best Practices**:
- Use DataDog APM to track P95 latency for each onboarding step
- Set SLOs: 95% of API calls <1s, 99.5% uptime
- Monitor Shopify webhook delivery rates (should be >98%)

#### Customer Support Integration

**Feedback Loop**:
1. Support team tags tickets with onboarding stage (e.g., `onboarding_step_2_tier_creation`)
2. Weekly report shows ticket count and categories by stage
3. Product team reviews high-volume categories for UI improvements
4. CES/NPS survey responses linked to support tickets for context

**Support Ticket Categories**:
- Authentication/access issues
- Data sync problems (orders, customers)
- Configuration questions (tiers, rewards)
- Theme app block installation
- Feature requests

**Escalation Path**:
- Merchant reports onboarding blocker → CSM logs ticket
- If blocker affects >5 merchants → Escalate to Product Manager
- PM determines if quick fix or requires experiment
- Resolution tracked and documented in changelog

#### Education & Training

**Internal Onboarding for Team Members**:
- New engineers: Read tracking plan, review past experiments, shadow bi-weekly review
- New PMs: Complete onboarding wizard as merchant, analyze funnel, propose improvement
- New CSMs: Watch onboarding recordings, practice support scenarios

**Merchant Education**:
- Help center articles for each onboarding step
- Video library (embedded in wizard and accessible from dashboard)
- Monthly webinar: "Maximize Your Loyalty Program" (post-onboarding training)

**Continuous Learning**:
- Quarterly training on new analytics tools or experimentation best practices
- Share industry benchmarks and competitor analysis in team meetings
- Celebrate wins: When experiment succeeds, share results company-wide

---

## Conclusion

RewardsPro's onboarding success depends on evidence-based metrics, robust instrumentation, and disciplined experimentation. By setting ambitious yet realistic targets—**25-30% onboarding completion**, **40% activation**, and **TTFV under 24 hours**—and by continuously testing features like progress indicators and multimedia guidance, the app can significantly improve merchant satisfaction and retention.

A structured tracking plan and governance process ensure data remains accurate and actionable, while regular review cadences and feature flag management prevent technical debt. Adopting these practices will help RewardsPro deliver a world-class onboarding experience that drives long-term merchant loyalty and positions the app competitively in the Shopify ecosystem.

**Key Takeaways**:
1. **Benchmark against industry**: Use Userpilot, Chameleon, and Gartner benchmarks to set realistic targets
2. **Composite metrics matter**: Onboarding Success Score (weighted index) provides holistic view
3. **Experiment systematically**: Follow 7-step framework, prioritize high-impact changes
4. **Govern rigorously**: Appoint Data Governor, maintain tracking plan, clean up feature flags quarterly
5. **Learn continuously**: Bi-weekly reviews, quarterly deep-dives, monthly leadership reports

**Next Actions**:
- [ ] Appoint Data Governor and establish governance structure
- [ ] Create tracking plan document in GitHub `/docs/analytics/tracking-plan.md`
- [ ] Set up KPI dashboard in Mixpanel/Amplitude
- [ ] Configure DataDog alerts for onboarding metrics
- [ ] Schedule bi-weekly onboarding review meetings
- [ ] Prioritize and implement Quick-Win Experiments 1-3
- [ ] Instrument all onboarding events according to taxonomy

---

## Accessibility & Responsive Design

### WCAG AA Compliance Checklist

#### Keyboard Navigation
- [ ] All interactive elements reachable via Tab/Shift+Tab
- [ ] Focus order follows logical reading order
- [ ] No keyboard traps (can escape modals with Esc)
- [ ] Focus indicators visible (2px outline, high contrast)
- [ ] Skip links provided for long content

#### Screen Reader Support
- [ ] Semantic HTML used (`<button>`, `<nav>`, `<main>`, `<article>`)
- [ ] Alt text for all images and icons (descriptive, not redundant)
- [ ] ARIA labels for complex interactions (e.g., `aria-label="Close wizard"`)
- [ ] ARIA live regions announce dynamic changes (`aria-live="polite"`)
- [ ] Form inputs have associated labels (`<label for="email">`)

#### Visual Design
- [ ] Color contrast ≥ 4.5:1 for normal text
- [ ] Color contrast ≥ 3:1 for large text (18pt+)
- [ ] Don't rely on color alone (use icons + text)
- [ ] Text resizable to 200% without horizontal scrolling
- [ ] Focus states clearly visible
- [ ] Animations can be paused/stopped

#### Form Accessibility
- [ ] Labels visible and associated with inputs
- [ ] Error messages descriptive ("Email required" not "Error")
- [ ] Errors announced to screen readers (`aria-describedby`)
- [ ] Required fields marked (`aria-required="true"` or asterisk + explanation)
- [ ] Real-time validation with clear feedback

#### Responsive Design (Mobile, Tablet, Desktop)
- [ ] Touch targets ≥ 44x44px (Fitts's Law)
- [ ] Text readable without zooming (min 16px body text)
- [ ] No horizontal scrolling on mobile
- [ ] Images responsive with `srcset` for retina
- [ ] Test on iPhone SE, iPhone 14, iPad, Android (Samsung Galaxy)

#### Multimedia & Animations
- [ ] Videos have captions (WebVTT format)
- [ ] Audio content has transcripts
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Autoplay videos muted and pauseable
- [ ] Confetti animation can be disabled

### Testing Tools

**Automated Testing**:
```bash
# Install axe-core
npm install --save-dev @axe-core/react

# Run in test
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

it('should have no accessibility violations', async () => {
  const { container } = render(<OnboardingWizard />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

**Manual Testing**:
- VoiceOver (macOS): Cmd+F5, navigate with VO+arrows
- NVDA (Windows): Free screen reader, test with Tab/arrows
- Keyboard only: Unplug mouse, navigate with Tab/Enter/Esc
- Color blindness simulator: Use browser extensions (Colorblind Web Page Filter)
- Mobile screen readers: TalkBack (Android), VoiceOver (iOS)

**Browser DevTools**:
- Chrome Lighthouse: Accessibility audit (target score: >90)
- Firefox Accessibility Inspector: Contrast checker
- WAVE browser extension: Visual feedback on violations

---

## Email Onboarding Sequences

### Behavior-Driven Email Strategy

Emails complement in-app onboarding by re-engaging merchants who leave the product and guiding them through milestones.

### Email Sequence Architecture

#### Email 1: Welcome (Immediate - Trigger: Account created)

**Subject**: Welcome to RewardsPro - Let's Build Your Loyalty Program 🎉

**Content**:
```
Hi [MerchantName],

Welcome to RewardsPro! You're about to transform your customers into loyal fans.

We've made it easy to get started. Here's what's next:

1. Create your first reward tier (2 mins)
2. Customize your rewards (3 mins)
3. Preview on your storefront (1 min)

[Get Started →]

Need help? Our support team is standing by.

Best,
The RewardsPro Team
```

**Metrics**:
- Open rate target: 40-50% (welcome emails have highest open rates)
- CTA click: 15-20%

---

#### Email 2: Setup Reminder (Day 1 - Trigger: Onboarding not completed)

**Subject**: [MerchantName], Complete Your Reward Program in 3 Steps

**Content**:
```
Hi [MerchantName],

We noticed you started setting up your loyalty program yesterday. You're almost there!

Here's what's left to do:
✓ Account created
○ Create reward tiers [Complete this step →]
○ Customize settings
○ Launch program

[Watch 2-Min Tutorial →]

80% of merchants who complete setup see their first reward redemption within 7 days.

Questions? Reply to this email or chat with us.

Best,
[SupportName] from RewardsPro
```

**Personalization**:
- Show completed vs pending steps
- Include progress percentage

---

#### Email 3: Feature Introduction (Day 3 - Trigger: Setup complete, low engagement)

**Subject**: Boost Retention with VIP Tiers

**Content**:
```
Hi [MerchantName],

Great job setting up your loyalty program!

Here's a pro tip: Merchants who use tiered rewards see 2x higher repeat purchase rates.

[GIF showing tier configuration]

Create Bronze, Silver, Gold tiers in under 5 minutes:

[Set Up Tiers →]

Not sure how? Check out how [ExampleStore] increased retention by 45% with tiers.

[Read Case Study →]

Best,
The RewardsPro Team
```

---

#### Email 4: Success Story (Day 5 - Trigger: Feature usage < 50%)

**Subject**: How [SimilarStore] Increased Repeat Purchases 67%

**Content**:
```
Hi [MerchantName],

We thought you'd find this inspiring:

[SimilarStore], a [Industry] business like yours, used RewardsPro to increase repeat purchases by 67% in 90 days.

Their secret?
- 3 simple reward tiers
- Automated cashback on every order
- Customer dashboard widget

[See Their Full Story →]

You can replicate their setup in under 10 minutes.

[Copy Their Strategy →]

Best,
The RewardsPro Team
```

---

#### Email 5: Offer Help (Day 7 - Trigger: Low engagement)

**Subject**: Need help setting up? Let's hop on a call

**Content**:
```
Hi [MerchantName],

We noticed you haven't fully launched your loyalty program yet.

No worries - we're here to help!

Common questions we answer:
- "How do I set the right cashback percentage?"
- "Should I use points or store credit?"
- "How do I customize the widget?"

[Book 15-Min Setup Call →]

Or reply to this email with your questions.

Best,
[SupportName] from RewardsPro
```

---

#### Email 6: Re-Engagement (Day 14 - Trigger: Inactive for 7+ days)

**Subject**: We miss you! Here's $50 in free rewards to get started

**Content**:
```
Hi [MerchantName],

We noticed it's been a while since you logged into RewardsPro.

To help you get started, we're giving you $50 in free rewards to distribute to your customers.

[Claim $50 Credit →]

This is enough to reward ~25-50 customers and see the power of loyalty programs firsthand.

Offer expires in 48 hours.

Not interested? [Unsubscribe preferences →]

Best,
The RewardsPro Team
```

---

### Email Implementation Checklist

**Technical Setup**:
- [ ] Email service provider configured (SendGrid, Mailchimp, Customer.io)
- [ ] Behavior triggers defined in onboarding service
- [ ] Personalization tokens working (merchant name, store name, progress)
- [ ] Unsubscribe link in footer (CAN-SPAM compliance)
- [ ] Mobile-responsive templates (60% of emails opened on mobile)
- [ ] Plain text version for accessibility
- [ ] A/B test subject lines

**Content Guidelines**:
- Maximum 100 words per email
- Single call-to-action (one button, one goal)
- Include visual (GIF, screenshot) for context
- Personal tone (from named team member, not generic "Team")
- Clear value proposition in first sentence
- Escape hatch (unsubscribe, preferences)

**Metrics to Track**:
| Email | Open Rate Target | CTR Target | Conversion Target |
|-------|-----------------|-----------|------------------|
| Welcome | 40-50% | 15-20% | 5-8% |
| Setup Reminder | 25-35% | 8-12% | 4-6% |
| Feature Intro | 20-30% | 5-10% | 2-4% |
| Success Story | 20-30% | 5-10% | 2-4% |
| Offer Help | 25-35% | 10-15% | 3-5% |
| Re-Engagement | 15-25% | 8-12% | 3-5% |

---

## Analytics & Instrumentation

### Industry Benchmarks & Context

RewardsPro's onboarding metrics should be evaluated against industry standards to set realistic targets and identify areas for improvement.

#### Onboarding Completion Benchmarks

**Industry Data (Userpilot 2024, 188 companies)**:
- Average completion rate: **19.2%** (median 10.1%)
- FinTech & Insurance: **~24.5%**
- MarTech: **~12.5%**
- By revenue:
  - $1-5M: **27.1%**
  - $10-50M: **~15%**

**B2B SaaS Best Practice (Userlist)**:
- Good completion rate: **40-60%**
- B2C target: **30-50%**

**RewardsPro Target**: **25-30%** within 14 days (higher than industry average due to sales-assisted model)

#### Activation Rate Benchmarks

**Industry Data (Userpilot 2024, 62 B2B companies)**:
- Average activation: **37.5%** (median 37%)
- By industry:
  - AI & ML: **54.8%**
  - CRM & Sales: **42.6%**
  - MarTech: **24%**
  - Healthcare: **23.8%**
  - HR: **8.3%**
  - FinTech & Insurance: **5%**
- By GTM motion:
  - Sales-led: **41.6%**
  - Product-led: **34.6%**

**RewardsPro Target**: **40%** (above SaaS average, leveraging sales-assisted onboarding)

#### Time-to-First-Value (TTFV) Benchmarks

**Industry Data**:
- Sales-led companies: **1 day 11h**
- Product-led companies: **1 day 12h**
- **60% of SaaS companies** actively measure TTFV
- Customer expectation: **hours to days** (not weeks)

**Research Insight**: Long TTFV drives churn; focus should be on delivering early value without feature overload.

**RewardsPro Target**: **≤24 hours** (median time from install to first cashback redemption or store credit issuance)

#### NPS & Customer Effort Score (CES) Benchmarks

**NPS Benchmarks (CustomerGauge 2024)**:
- SaaS average: **+36**
- Good score: **>20**
- Best-in-class: **>50**
- By revenue:
  - $5-10M: **23.3**
  - $10-50M: **37.5**
  - $50M+: **39.1**
  - $1-5M: **34.5** (higher due to agility)

**Best Practice**: Survey after 5th login or ~10 minutes in-app for higher response rates.

**RewardsPro Target**: **40+** (above industry average)

**CES Benchmarks (Gartner via Dock)**:
- SaaS average: **5.4**
- Below 3: Poor ease of use
- 4-5: Good
- 6-7: Excellent
- **40% more accurate** at predicting loyalty than CSAT

**RewardsPro Target**: **≥5** (aim for 6-7 excellent range)

#### Churn & Retention Indicators

**Industry Data (Dock)**:
- SaaS monthly churn: **10-14%**

**RewardsPro Target**: **<10% churn within 60 days**

#### Best Practice Insights

**Multimedia & Interactivity**:
- **>80%** of companies with activation >50% use videos, GIFs, or animations
- Self-triggered product tours **double engagement** (Chameleon 2025)
- Tours with **<5 steps** have substantially higher completion
- Progress indicators boost completion by **12%**
- Embedded cards drive **1.5× more actions** than pop-ups

**User Empowerment**:
- **80% of customers** uninstall apps because they don't understand how to use them
- Sales-led firms have higher activation due to commitment and hands-on guidance

---

### KPI Framework for RewardsPro

The following KPI framework translates industry benchmarks into actionable metrics tailored to RewardsPro's mid-market Shopify merchant audience with sales-assisted onboarding.

| Metric & Definition | Baseline Target | Alert Threshold | Owner & Notes |
|---------------------|----------------|-----------------|---------------|
| **Onboarding Completion Rate** <br> % of merchants completing all 4 stages (order sync, tier setup, customer sync, settings) within 14 days | **25-30%** <br> Higher than industry avg (~19%) yet attainable for mid-market app | **<15%** or sustained drop of ≥10% WoW | Product Manager & CSM <br> Benchmark vs. Userpilot average; adjust target upward to 40% as onboarding is refined |
| **Activation Rate** <br> % of merchants who actively use core features (issue reward or create campaign) within 30 days of installation | **40%** <br> Slightly above SaaS average (37.5%) | **<25%** or decline >15% after changes | Product & Growth teams <br> Use segmentation to compare PLG vs. sales-assisted cohorts |
| **Time-to-First-Value (TTFV)** <br> Median hours from install to first cashback redemption or store credit issuance | **≤24h** <br> Aligns with best practice (1-1.5 days for sales-led) | **>36h** or continuous increase | Engineering & CSM <br> If TTFV rises, audit step durations and ensure syncing processes are performant |
| **Onboarding Completion Time** <br> Average time from install to completing all 4 steps | **≤48h** <br> Should be short for Shopify merchants | **>72h** | Product & Support <br> Compare time across steps to identify friction points; use targeted messaging |
| **Net Promoter Score (NPS)** <br> Survey merchants after completing setup or after 5th login | **40+** <br> Above industry average of 36 | **<20** | Customer Success <br> Use NPS as outcome metric; pair with qualitative feedback to prioritize improvements |
| **Customer Effort Score (CES)** <br> Merchant rating of ease of onboarding tasks | **≥5** (good; aim for 6-7 excellent) | **<4** | Product & UX <br> Lower scores trigger usability reviews or additional guidance |
| **Churn Rate (60-day)** <br> % of merchants uninstalling within 60 days | **<10%** <br> Align with SaaS churn benchmarks | **>15%** | Product & Growth <br> Monitor segments (store size, plan) and follow up with at-risk merchants |
| **Onboarding Success Score** <br> Composite weighted index: <br> • Activation (35%) <br> • Product adoption (30%) <br> • NPS (20%) <br> • Completion rate (15%) | **≥70/100** <br> Use this composite to report onboarding health | **<60/100** | Leadership <br> Provides holistic KPI and reduces reliance on single metric |

---

### Analytics Strategy & Data Sources

#### 1. Product Analytics Platform

**Recommended**: Mixpanel or Amplitude

**Implementation**:
- Track each onboarding step as discrete event
- User properties: `store_plan`, `merchant_segment` (small/medium/enterprise), `sales_assisted` (boolean), `install_date`
- Event properties: `step_name`, `duration_seconds`, `method` (api/app), `error_code`

**Key Events**:
```typescript
// Event naming convention: object_action format, snake_case
{
  "onboarding_started": {
    shop: string,
    timestamp: Date,
    source: "wizard" | "checklist",
    merchant_segment: "small" | "medium" | "enterprise"
  },

  "onboarding_step_viewed": {
    shop: string,
    step_name: string,
    step_number: number,
    timestamp: Date
  },

  "onboarding_step_completed": {
    shop: string,
    step_name: string,
    step_number: number,
    duration_seconds: number,
    timestamp: Date
  },

  "onboarding_step_skipped": {
    shop: string,
    step_name: string,
    reason: string | null,
    timestamp: Date
  },

  "onboarding_dismissed": {
    shop: string,
    current_step: string,
    reason: string | null,
    timestamp: Date
  },

  "onboarding_completed": {
    shop: string,
    total_duration_seconds: number,
    steps_completed: number,
    timestamp: Date
  },

  "onboarding_checklist_item_clicked": {
    shop: string,
    item_id: string,
    item_name: string,
    already_completed: boolean,
    timestamp: Date
  },

  "onboarding_tooltip_shown": {
    shop: string,
    tooltip_id: string,
    context: string,
    timestamp: Date
  },

  "onboarding_tooltip_interacted": {
    shop: string,
    tooltip_id: string,
    action: "clicked" | "dismissed" | "completed",
    timestamp: Date
  },

  "reward_issued": {
    shop: string,
    reward_type: "cashback" | "store_credit" | "discount",
    amount: number,
    customer_id: string,
    is_first_reward: boolean,
    timestamp: Date
  },

  "program_activated": {
    shop: string,
    program_type: "tier" | "referral" | "vip",
    timestamp: Date
  }
}
```

#### 2. Shopify Analytics & Backend Logs

**Data Sources**:
- Shopify built-in analytics for orders and customer events
- Node/React codebase logging to DataDog
- Aurora Data API query logs

**Integration**: Supplement product analytics with Shopify events to validate data accuracy

#### 3. Customer Success & CRM Integration

**Data Sources**:
- Support tickets categorized by onboarding stage
- Onboarding call notes and outcomes
- NPS and CES survey responses

**Purpose**: Correlate qualitative feedback with quantitative metrics to identify friction points

#### 4. Support/Chat Systems

**Tracked Data**:
- Number of support contacts during onboarding
- Support ticket categories (authentication, data sync, configuration, etc.)
- Resolution time by category

**Purpose**: Identify friction points requiring UI improvements or better documentation

---

### Event Taxonomy & Tracking Plan

A tracking plan is a central document that defines what to track, where to implement events in code, and why the data matters. This prevents redundant events and enables consistent analytics across teams.

#### Tracking Plan Best Practices

1. **Standardize Naming Conventions**
   - Format: `object_action` (e.g., `tier_create`, `reward_issue`)
   - Use lower_case snake_case
   - Define standard event properties: `method` (api/app), `duration_seconds`, `error_code`
   - Store naming standards in accessible repository or wiki

2. **Define Success Questions Before Building**
   - Determine business questions each event will answer
   - Define key success metrics (e.g., "Which step has highest drop-off?")
   - Form hypotheses (e.g., "Which acquisition channels produce merchants who complete onboarding?")

3. **Collaborate with Engineers & Appoint Data Governor**
   - Product managers work with engineers to finalize taxonomy
   - Ensure events are technically feasible
   - Appoint a Data Governor to maintain standards and reduce duplication
   - Engineers involved from outset so instrumentation becomes part of development workflow

4. **Document and Centralize**
   - Store tracking plan in shared location (Confluence, GitHub)
   - Update whenever new events added or deprecated
   - Clarify event's location in code, description, and justification

5. **Validate and QA**
   - Product managers and engineers validate events fire correctly
   - Verify properties have correct types and values
   - Test in dev environment before production deployment

#### Tracking Plan Template

| Event Name | Description | Location in Code | Properties | Success Question | Owner | Status |
|------------|-------------|------------------|------------|------------------|-------|--------|
| `onboarding_started` | Merchant opens onboarding wizard | `app/routes/app.onboarding.wizard.tsx` | `shop`, `timestamp`, `source`, `merchant_segment` | What % of new installs start onboarding? | Product | Implemented |
| `onboarding_step_completed` | Merchant completes an onboarding step | `app/services/onboarding.service.ts` | `shop`, `step_name`, `step_number`, `duration_seconds`, `timestamp` | What is completion rate per step? What is average time per step? | Product | Implemented |
| `reward_issued` | First reward issued to customer | `app/routes/webhooks.orders.paid.tsx` | `shop`, `reward_type`, `amount`, `customer_id`, `is_first_reward`, `timestamp` | What is TTFV (time to first reward)? | Engineering | Planned |

---

### Dashboard & Reporting

#### 1. Onboarding Funnel Dashboard

**Route**: `app/routes/app.analytics.onboarding.tsx`

**Visualizations**:
- Funnel chart showing conversion through each of 4 stages
- Completion rate segmented by:
  - Store size (small/medium/enterprise)
  - Subscription plan (Free/Pro/Max/Ultra)
  - Acquisition channel (Shopify App Store, direct, referral)
  - Sales-assisted vs. self-serve
- Median time per step with percentile distribution (P50, P75, P95)

**Example Funnel**:
```
Install → Step 1 → Step 2 → Step 3 → Step 4 → Complete
100%      85%      70%      60%      55%      50%
```

#### 2. Activation & Adoption Dashboard

**Metrics**:
- Activation rate over time (weekly cohort analysis)
- Time to first reward issuance (TTFV histogram)
- Time to first credit redemption
- Time to first campaign creation
- Retention curves (Day 1, Day 7, Day 30, Day 60)
- Cohort analysis comparing merchants who completed onboarding vs. those who didn't

**Implementation**: Use Mixpanel's retention curves and cohort analysis features

#### 3. Experience Metrics Dashboard

**Metrics**:
- NPS scores segmented by:
  - Merchant type (SMB/Enterprise/Agency)
  - Survey trigger point (5th login vs. post-completion)
  - Time since install
- CES scores by onboarding step
- Open-ended feedback categories:
  - Clarity issues
  - Technical friction
  - Missing features
  - Positive feedback

**Visualization**: Sentiment analysis word cloud from qualitative responses

#### 4. Alerting & Monitoring

**Tools**: DataDog + Slack integration

**Alert Triggers**:
- Completion rate <15% for 2 consecutive days
- TTFV >36h for 10+ merchants in 24h period
- Error rate >5% on any onboarding step
- NPS <20 with 3+ responses
- Shopify API failures during order/customer sync

**Integration**: Alerts posted to `#rewardspro-alerts` Slack channel with context and suggested actions

**Error Tracking**: Use Sentry to capture errors during onboarding with full context (merchant segment, step, stack trace)

---

### Event Taxonomy

```typescript
// Standard format: onboarding_<action>_<object>
{
  "onboarding_started_wizard": { shop, timestamp, source, merchant_segment },
  "onboarding_viewed_step": { shop, stepName, stepNumber, timestamp },
  "onboarding_completed_step": { shop, stepName, stepNumber, durationSeconds, timestamp },
  "onboarding_skipped_step": { shop, stepName, reason, timestamp },
  "onboarding_dismissed_wizard": { shop, currentStep, reason, timestamp },
  "onboarding_completed_wizard": { shop, totalDurationSeconds, stepsCompleted, timestamp },
  "onboarding_clicked_checklist_item": { shop, itemId, itemName, alreadyCompleted, timestamp },
  "onboarding_shown_tooltip": { shop, tooltipId, context, timestamp },
  "onboarding_tooltip_interacted": { shop, tooltipId, action, timestamp },
  "reward_issued": { shop, rewardType, amount, customerId, isFirstReward, timestamp },
  "program_activated": { shop, programType, timestamp },
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// Example: OnboardingService.test.ts
describe('OnboardingService', () => {
  it('should calculate progress correctly', async () => {
    const status = await OnboardingService.getStatus('test-shop.myshopify.com');
    expect(status.progress).toBe(50); // 2 of 4 steps complete
  });

  it('should mark onboarding complete when all steps done', async () => {
    await OnboardingService.completeStep('test-shop.myshopify.com', 'configuredSettings');
    const status = await OnboardingService.getStatus('test-shop.myshopify.com');
    expect(status.completed).toBe(true);
  });
});
```

### Integration Tests

```typescript
// Example: OnboardingWizard.test.tsx
describe('OnboardingWizard', () => {
  it('should navigate through all steps', async () => {
    render(<OnboardingWizard open onClose={jest.fn()} onComplete={jest.fn()} />);

    // Step 1: Welcome
    expect(screen.getByText(/Turn Customers Into Loyal Fans/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Get Started'));

    // Step 2: Create Program
    await waitFor(() => {
      expect(screen.getByText(/Choose a template/i)).toBeInTheDocument();
    });
  });
});
```

### E2E Tests (Playwright)

```typescript
// Example: onboarding.spec.ts
test('complete onboarding flow', async ({ page }) => {
  await page.goto('/app/onboarding/wizard');

  // Step 1
  await expect(page.locator('text=Welcome to RewardsPro')).toBeVisible();
  await page.click('button:has-text("Get Started")');

  // Step 2
  await page.click('[data-testid="template-loyalty"]');
  await page.click('button:has-text("Next")');

  // Step 3
  await page.fill('[name="program-name"]', 'My Loyalty Program');
  await page.click('button:has-text("Preview")');

  // Step 4
  await page.click('button:has-text("Publish")');

  // Celebration
  await expect(page.locator('text=Congratulations')).toBeVisible();
});
```

---

## Performance Considerations

### Optimization Strategies

1. **Lazy load wizard steps**: Only render current step
2. **Prefetch Shopify data**: Load customer/product counts before step 2
3. **Optimistic UI**: Update checklist immediately, sync in background
4. **Cache GraphQL queries**: Use App Bridge caching for reference data
5. **Progressive loading**: Show skeleton screens during API calls

### Benchmarks

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Wizard initial load** | < 500ms | Time to interactive |
| **Step transition** | < 200ms | Animation complete |
| **API call latency** | < 1s | P95 response time |
| **Total wizard size** | < 150KB | Gzipped bundle |

---

## Open Questions & Risks

### Assumptions to Validate

1. **Merchant diversity**: Single wizard suits all segments?
   - **Test**: Survey 20 beta merchants for feedback
2. **Mobile usage**: How many manage stores on mobile?
   - **Test**: Analytics on device types
3. **Gamification appeal**: Do badges increase engagement?
   - **Test**: A/B test with/without badges

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Rate limits** (Shopify API) | High | Hybrid sync, caching, queue webhooks |
| **Low activation** (< 2%) | High | A/B test messaging, reduce steps |
| **High dismiss rate** (> 50%) | Medium | Make skippable, allow resume |
| **Data privacy** (GDPR) | High | Explicit consent, audit logs |
| **Mobile UX** (unresponsive) | Medium | Test on iPhone/Android, use Polaris responsive components |

### Open Questions

1. What % of merchants use Shopify POS vs admin?
2. Should we support multi-language onboarding?
3. How to handle agencies managing multiple stores?
4. What's the churn rate after 7 days without completing onboarding?

---

## Migration Plan (Database)

### Step 1: Add OnboardingEvent model

```bash
npx prisma migrate dev --name add-onboarding-event
```

### Step 2: Add OnboardingProfile model (Phase 2)

```bash
npx prisma migrate dev --name add-onboarding-profile
```

### Step 3: Backfill existing shops

```typescript
// scripts/backfill-onboarding-status.ts
import { db } from '~/db.server';

async function backfillOnboardingStatus() {
  const shops = await db.shopSettings.findMany({
    where: { onboardingCompleted: null }
  });

  for (const shop of shops) {
    // Check if shop has tiers/customers
    const hasTiers = await db.tier.count({ where: { shop: shop.shop } }) > 0;
    const hasCustomers = await db.customer.count({ where: { shop: shop.shop } }) > 0;

    await db.shopSettings.update({
      where: { id: shop.id },
      data: {
        onboardingCreatedTiers: hasTiers,
        onboardingSyncedCustomers: hasCustomers,
        onboardingCompleted: hasTiers && hasCustomers,
      }
    });
  }
}

backfillOnboardingStatus();
```

---

## Success Criteria

### MVP Launch Criteria

- [ ] Wizard accessible from `/app/onboarding/wizard`
- [ ] All 4 steps functional and tested
- [ ] Checklist shows on dashboard when incomplete
- [ ] Analytics events tracked in database
- [ ] Confetti celebration on completion
- [ ] Mobile responsive (iPhone 12, Pixel 5)
- [ ] WCAG AA compliant
- [ ] E2E tests passing
- [ ] Documentation updated

### Phase 2 Launch Criteria

- [ ] Goal selection implemented
- [ ] Conditional wizard paths working
- [ ] Hybrid data sync operational
- [ ] Webhook subscriptions active
- [ ] Reconciliation job scheduled

### Phase 3 Launch Criteria

- [ ] Gamification badges awarded
- [ ] Resource center accessible
- [ ] ML model predicting next actions
- [ ] A/B testing framework deployed

---

## References

### Original Research Sources

1. [Appcues: Product Tour UI/UX Best Practices](https://www.appcues.com/blog/product-tours-ui-patterns)
2. [Intercom: User Onboarding First Impressions](https://www.intercom.com/blog/product-tours-first-use-onboarding/)
3. [ProductLed: SaaS Onboarding Checklist](https://productled.com/blog/5-best-practices-for-better-saas-user-onboarding)
4. [Nebulab: Shopify Data Architecture](https://nebulab.com/blog/shopify-data-architecture)
5. [Shopify: App Bridge Documentation](https://shopify.dev/docs/apps/build/integrating-with-shopify)
6. [Amplitude: Analytics Instrumentation Guide](https://amplitude.com/blog/analytics-instrumentation)

### Industry Benchmarks & KPIs

7. [Userpilot: Customer Onboarding Checklist Completion Rate 2024 Benchmark Report](https://userpilot.com/blog/onboarding-checklist-completion-rate-benchmarks/) - Completion rate benchmarks across 188 companies
8. [Userpilot: User Activation Rate Benchmark Report 2024](https://userpilot.com/blog/user-activation-rate-benchmark-report-2024/) - Activation rates by industry and GTM motion
9. [Userpilot: Product Metrics Benchmark Report 2024](https://userpilot.com/blog/product-metrics-benchmark-report/) - NPS, multimedia usage, and time-to-value insights
10. [Baremetrics: Time to Value (TTV)](https://baremetrics.com/academy/time-to-value-ttv) - TTFV best practices and churn reduction
11. [Databox: 5 Customer Onboarding Metrics Every SaaS Should Monitor](https://databox.com/customer-onboarding-metrics) - TTFV measurement and industry insights
12. [CustomerGauge: 38 SaaS NPS Benchmarks & Top SaaS eNPS scores](https://customergauge.com/benchmarks/blog/nps-saas-net-promoter-score-benchmarks) - NPS by revenue and industry
13. [Dock: Customer Onboarding Metrics - 14 metrics, KPIs & benchmarks](https://www.dock.us/library/customer-onboarding-metrics) - CES, churn, and comprehensive metric definitions
14. [GetCensus: Customer Onboarding Metrics: Measuring Success](https://www.getcensus.com/ops_glossary/customer-onboarding-metrics-measuring-success) - Onboarding Success Score framework
15. [Chameleon: Benchmark Report 2025](https://www.chameleon.io/benchmark-report) - Progress indicators, self-triggered tours, embedded cards
16. [Custify: The Power of Time to Value (TTV): From Sign-up to Success](https://www.custify.com/blog/measure-time-to-value/) - App uninstall statistics (80% due to lack of understanding)

### Analytics & Instrumentation

17. [Amplitude: How To Create a Tracking Plan? - The Definitive Guide](https://amplitude.com/blog/create-tracking-plan) - Tracking plan creation and best practices
18. [Amplitude: A 5 Step Guide to Sustainable Analytics Instrumentation](https://amplitude.com/blog/analytics-instrumentation) - Naming conventions, collaboration, validation
19. [Segment: Collecting the right data - How to create a tracking plan](https://segment.com/academy/collecting-data/how-to-create-a-tracking-plan/) - Taxonomy and documentation standards
20. [Mixpanel: Retention Analysis Methodology](https://mixpanel.com/topics/retention-analysis/) - Cohort analysis and TTFV tracking

### Experimentation & A/B Testing

21. [Amplitude: Change the Way You Approach Experiments with This 7-Step Framework - Elena Verna](https://amplitude.com/blog/7-step-experimentation-framework) - Comprehensive experimentation process
22. [Statsig: A/B Testing for B2B Products: Best Practices](https://www.statsig.com/perspectives/ab-testing-b2b-best-practices) - B2B-specific guidance, sample sizes, practical significance
23. [LaunchDarkly: Feature Flags 101: Use Cases, Benefits, and Best Practices](https://launchdarkly.com/blog/what-are-feature-flags/) - Feature flag management and technical debt prevention

---

**Next Steps**: Review this guide with product team, prioritize Phase 1 tasks, and create sprint backlog.
