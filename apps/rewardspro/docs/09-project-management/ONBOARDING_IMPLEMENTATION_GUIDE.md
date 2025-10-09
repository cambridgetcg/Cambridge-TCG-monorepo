# RewardsPro Onboarding Flow Implementation Guide

**Status**: Planning Phase
**Last Updated**: January 2025
**Based On**: Research from Appcues, Intercom, ProductLed, Userflow, Nebulab

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Database Schema](#database-schema)
4. [Phase 1: MVP Implementation](#phase-1-mvp-implementation)
5. [Phase 2: Enhanced Personalization](#phase-2-enhanced-personalization)
6. [Phase 3: Advanced Features](#phase-3-advanced-features)
7. [UI/UX Patterns & Components](#uiux-patterns--components)
8. [Analytics & Instrumentation](#analytics--instrumentation)
9. [Testing Strategy](#testing-strategy)
10. [Performance Considerations](#performance-considerations)
11. [Open Questions & Risks](#open-questions--risks)

---

## Executive Summary

### Research Insights

RewardsPro's onboarding must deliver value quickly, minimize friction, personalize experiences, and embed seamlessly within Shopify. Key findings:

- **70% of top companies** use gamification in onboarding
- **Interactive guides** can increase activation by **10%**
- **Poor onboarding** loses **75% of mobile users within 3 days**
- **At least 30% of form fields** are unnecessary
- **Time-to-value** should be **≤7 minutes** for first value delivery
- **Activation rate at maturity**: 2-10%

### Goals

1. **Reduce time-to-first-value (TTFV)** to < 5 minutes
2. **Increase activation rate** from baseline to 8-10%
3. **Improve 30-day retention** by delivering early wins
4. **Personalize** based on merchant type and goals
5. **Instrument** every step for continuous optimization

### Three-Phase Approach

| Phase | Description | Timeline | Key Deliverables |
|-------|-------------|----------|------------------|
| **MVP** | Essential 4-step wizard with checklist | Sprint 1-2 | Embedded wizard, progress tracking, basic analytics |
| **Enhanced** | Personalization + hybrid data sync | Sprint 3-4 | Goal selection, adaptive flows, webhook sync |
| **Advanced** | Gamification + ML-driven recommendations | Sprint 5+ | Badges, resource center, predictive next actions |

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Shopify Admin                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          RewardsPro Embedded App (App Bridge)        │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │          Onboarding Wizard (Modal/Page)        │  │  │
│  │  │  • Step 1: Welcome & Value Proposition         │  │  │
│  │  │  • Step 2: Create First Reward Program         │  │  │
│  │  │  • Step 3: Preview & Customize                 │  │  │
│  │  │  • Step 4: Publish & Activate                  │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │     Persistent Onboarding Checklist            │  │  │
│  │  │  [▓▓▓▓░░░░] 50% Complete                       │  │  │
│  │  │  ✓ Sync customers                              │  │  │
│  │  │  ✓ Create tiers                                │  │  │
│  │  │  ○ Configure rewards                           │  │  │
│  │  │  ○ Test on storefront                          │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                   RewardsPro Backend                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Onboarding  │  │   Analytics  │  │  Shopify API    │  │
│  │   Service    │  │   Events     │  │   (GraphQL)     │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│           ↕                ↕                    ↕           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │            Aurora PostgreSQL (Data API)               │ │
│  │  • ShopSettings (onboarding flags)                    │ │
│  │  • OnboardingEvent (analytics)                        │ │
│  │  • Customer, Tier, Order (synced data)                │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Installation** → Create `ShopSettings` with all `onboarding*` flags = `false`
2. **First Load** → Check flags, show wizard if `onboardingCompleted = false`
3. **Step Completion** → Update flag, emit analytics event, show celebration
4. **Skip/Dismiss** → Set `onboardingDismissed = true`, allow resuming later
5. **Completion** → Set `onboardingCompleted = true`, show confetti 🎉

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

## Analytics & Instrumentation

### Key Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Time to First Value (TTFV)** | Time from install to first program created | < 5 min |
| **Activation Rate** | % of installs completing onboarding | 8-10% |
| **Step Completion Rate** | % completing each step | > 80% |
| **Dismiss Rate** | % dismissing wizard | < 30% |
| **30-Day Retention** | % active after 30 days | > 60% |

### Event Taxonomy

```typescript
// Standard format: onboarding_<action>_<object>
{
  "onboarding_started_wizard": { shop, timestamp },
  "onboarding_viewed_step": { shop, stepName, timestamp },
  "onboarding_completed_step": { shop, stepName, completionTimeMs, timestamp },
  "onboarding_skipped_step": { shop, stepName, reason, timestamp },
  "onboarding_dismissed_wizard": { shop, currentStep, reason, timestamp },
  "onboarding_completed_wizard": { shop, totalTimeMs, stepsCompleted, timestamp },
  "onboarding_clicked_checklist_item": { shop, itemId, completed, timestamp },
  "onboarding_shown_tooltip": { shop, tooltipId, timestamp },
}
```

### Analytics Dashboard

Create dedicated route: `app/routes/app.analytics.onboarding.tsx`

**Metrics to display:**
- Funnel visualization (step 1 → step 2 → ... → complete)
- Median TTFV by cohort
- Drop-off points (heatmap)
- Comparison: dismissed vs completed merchants (retention)

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

1. [Appcues: Product Tour UI/UX Best Practices](https://www.appcues.com/blog/product-tours-ui-patterns)
2. [Intercom: User Onboarding First Impressions](https://www.intercom.com/blog/product-tours-first-use-onboarding/)
3. [ProductLed: SaaS Onboarding Checklist](https://productled.com/blog/5-best-practices-for-better-saas-user-onboarding)
4. [Nebulab: Shopify Data Architecture](https://nebulab.com/blog/shopify-data-architecture)
5. [Shopify: App Bridge Documentation](https://shopify.dev/docs/apps/build/integrating-with-shopify)
6. [Amplitude: Analytics Instrumentation Guide](https://amplitude.com/blog/analytics-instrumentation)

---

**Next Steps**: Review this guide with product team, prioritize Phase 1 tasks, and create sprint backlog.
