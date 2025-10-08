# Analytics Implementation Plan - RewardsPro

**Status**: Draft
**Created**: January 2025
**Priority**: High
**Estimated Completion**: 3-4 weeks

---

## Executive Summary

This plan incorporates the 2025 Loyalty Program Analytics research findings to expand RewardsPro’s analytics beyond the current revenue-and-tiers dashboard. The goal is to deliver a merchant-facing experience that tracks retention, engagement, redemption, segmentation, and cohort performance while grounding every metric in a documented formula. The research brief highlighted specific KPIs (CRR, CLV, purchase frequency, redemption, referral, NPS/CES, points expiration, tier progression) and data-governance guardrails; this implementation plan operationalises those recommendations across schema usage, back-end loaders, UI, and QA.

**Current State**: Basic analytics covering revenue impact, tier distribution, and high-level member counts (≈30% complete)

**Target State**: Production-grade analytics with documented metric catalogue, retention and engagement KPIs, cohort/segment drill-downs, benchmarking context, and governance automation.

---

## Table of Contents

1. [Metrics Inventory & Data Requirements](#1-metrics-inventory--data-requirements)
2. [Data Gap Analysis](#2-data-gap-analysis)
3. [Database Schema Changes](#3-database-schema-changes)
4. [Metric Calculation Logic](#4-metric-calculation-logic)
5. [API Endpoint Specifications](#5-api-endpoint-specifications)
6. [UI Component Breakdown](#6-ui-component-breakdown)
7. [Segmentation & Cohort Strategy](#7-segmentation--cohort-strategy)
8. [Visualization Specifications](#8-visualization-specifications)
9. [Benchmarking & Context](#9-benchmarking--context)
10. [Implementation Phases](#10-implementation-phases)
11. [Success Metrics](#11-success-metrics)

---

## 1. Metrics Inventory & Data Requirements

### 1.1 Primary Metrics (Core KPIs)

#### Customer Retention Rate (CRR)
- **Definition**: Percentage of customers who made repeat purchases in a given period
- **Formula**: `CRR = ((CE - CN) / CS) × 100`
  - CE = Customers at end of period
  - CN = New customers acquired during period
  - CS = Customers at start of period
- **Data Required**: Customer creation date, order dates, date range
- **Example**: If you start with 100 customers, gain 20 new ones, and end with 110, CRR = ((110 - 20) / 100) × 100 = 90%
- **Benchmark**: E-commerce average: 20-40%, Loyalty programs: 40-60%

#### Customer Lifetime Value (CLV)
- **Definition**: Predicted revenue from a customer over their entire relationship
- **Formula**: `CLV = (AOV × PF × ACL) - CAC`
  - AOV = Average Order Value
  - PF = Purchase Frequency (orders per year)
  - ACL = Average Customer Lifespan (years)
  - CAC = Customer Acquisition Cost
- **Simplified Formula** (when CAC unavailable): `CLV = AOV × PF × ACL`
- **Data Required**: Order history, customer registration date, order values
- **Example**: $80 AOV × 3 orders/year × 2.5 years = $600 CLV
- **Benchmark**: E-commerce: $100-500, Premium loyalty: $500-2000+

#### Repeat Purchase Rate (RPR)
- **Definition**: Percentage of customers who made more than one purchase
- **Formula**: `RPR = (Customers with >1 order / Total customers) × 100`
- **Data Required**: Customer IDs, order counts per customer
- **Example**: 250 repeat customers / 1000 total = 25%
- **Benchmark**: E-commerce: 20-40%, Loyalty programs: 40-70%

#### Purchase Frequency (PF)
- **Definition**: Average number of orders per customer in a time period
- **Formula**: `PF = Total orders / Total customers`
- **Alternative**: `PF = Total orders / Unique customers who ordered`
- **Data Required**: Order counts, customer counts
- **Example**: 500 orders / 200 customers = 2.5 orders per customer
- **Benchmark**: E-commerce: 1.5-3, Subscription: 4-12

### 1.2 Secondary Metrics (Supporting KPIs)

#### Credit Redemption Rate
- **Definition**: Percentage of issued store credit that has been redeemed
- **Formula**: `RR = (Credit redeemed / Credit issued) × 100`
- **Data Required**: StoreCreditLedger entries (CASHBACK_EARNED, ORDER_PAYMENT)
- **Current Status**: ✅ Already calculated (creditUtilization)

#### Member Acquisition Rate
- **Definition**: Share of eligible customers who enrol in the loyalty program during a period
- **Formula**: `Acquisition Rate = New members / Total leads (eligible customers or visits)`
- **Data Required**: Customer.createdAt, sign-up channel, eligibility counts (Shopify storefront sessions or marketing leads)
- **Status**: 🟡 Requires lead volume capture; initial version can use storefront sessions as proxy.

#### Engagement Rate
- **Definition**: Percentage of active members who complete a tracked action (login, redemption, referral) in a period
- **Formula**: `Engagement Rate = Active participants / Active members × 100`
- **Data Required**: Customer login events (CustomerAccount session logs), StoreCreditLedger redeems, Referral events
- **Status**: 🟡 Needs event capture; can start with redemption participation as MVP.

#### Referral Rate
- **Definition**: Portion of new customers acquired via referral programmes
- **Formula**: `Referral Rate = Referral-attributed new customers / Total new customers × 100`
- **Data Required**: ReferralCode usage, Customer.referralSource
- **Status**: 🟡 ReferralCode table exists; need to ensure attribution captured on sign-up.

#### Points Expiration Rate
- **Definition**: Percentage of issued points/credit that expire unused
- **Formula**: `Expiration Rate = Points expired / Points issued × 100`
- **Data Required**: StoreCreditLedger entries with type `POINTS_EXPIRED` (or derived via metadata)
- **Status**: 🟡 Ledger stores pending vs. redeemed; need explicit expiration tracking or derived logic.

#### Tier Penetration Rate
- **Definition**: Percentage of customers in each tier
- **Formula**: `TPR = (Customers in tier / Total customers) × 100`
- **Data Required**: Customer.currentTierId, total customer count
- **Current Status**: ✅ Already available (tierPerformance.members)

#### Tier Upgrade Velocity
- **Definition**: Time taken for customers to move from one tier to next
- **Formula**: `Average days from tier A to tier B`
- **Data Required**: TierChangeLog with timestamps
- **Current Status**: ⚠️ Partially available (TierChangeLog exists but not queried)

#### Average Order Value (AOV)
- **Definition**: Average revenue per order
- **Formula**: `AOV = Total revenue / Total orders`
- **Data Required**: Order.netAmount, order count
- **Current Status**: ✅ Already calculated

### 1.3 Advanced Metrics (Future Phase)

#### Net Promoter Score (NPS)
- **Definition**: Customer satisfaction and likelihood to recommend
- **Formula**: `NPS = % Promoters - % Detractors`
- **Data Required**: Survey responses (not yet collected)
- **Status**: 🔴 Not implemented (requires survey system)

#### Customer Effort Score (CES)
- **Definition**: Average effort rating members report for key actions (e.g., redeeming rewards)
- **Formula**: `CES = Sum of Likert scale responses / Number of responses`
- **Data Required**: Post-interaction surveys or in-product prompts capturing effort on 1–5 or 1–7 scale
- **Status**: 🔴 Not implemented (needs survey instrumentation and storage table)

#### Churn Rate
- **Definition**: Percentage of customers who stopped purchasing
- **Formula**: `Churn = (Customers lost / Total customers at start) × 100`
- **Data Required**: Customer last order date, inactivity threshold (e.g., 90 days)
- **Status**: 🟡 Partially available (can be calculated from dormant segment)

#### Program ROI
- **Definition**: Return on investment for loyalty program
- **Formula**: `ROI = ((Revenue from loyalty - Program costs) / Program costs) × 100`
- **Data Required**: Revenue from loyalty orders, cashback issued, operational costs
- **Current Status**: ✅ Already calculated (financial.roi)

### 1.4 Metric Reference (Formulas & Sources)

The table below consolidates formulas from the Loyalty Program Analytics Research Brief to ensure consistency across engineering, analytics, and product.

| Metric | Formula | Required Fields | Benchmarks / Notes |
|--------|---------|-----------------|--------------------|
| Customer Retention Rate (CRR) | `((CustomersEnd - NewCustomers) / CustomersStart) × 100` | Customer join date, order activity, cohort boundaries | Healthy programs: 70–90% retention per [AgencyAnalytics][1] |
| Customer Lifetime Value (CLV) | `AverageOrderValue × PurchaseFrequency × AvgCustomerLifespan` | Aggregated order revenue per customer, membership tenure | Loyalty programs aim for £500–£2000+ [LoyaltyLion][2] |
| Repeat Purchase Rate (RPR) | `(RepeatCustomers / TotalCustomers) × 100` | Order counts per customer | Retail baseline 20–40%, loyalty 40–70% [Snipp][4] |
| Purchase Frequency (PF) | `TotalOrders / UniqueCustomers` | Order counts, distinct customers | Increase indicates stronger engagement |
| Redemption Rate | `(RewardsRedeemed / RewardsIssued) × 100` | Store credit ledger (earned, redeemed, expired) | Loyalty programmes target 20–40%+ [Yotpo][6], [OpenLoyalty][7] |
| Member Acquisition Rate | `NewMembers / Leads` | Customer sign-ups, eligible visitors | Highlights onboarding friction |
| Referral Rate | `(Referral sign-ups / Total sign-ups) × 100` | ReferralCode usage, customer attribution | Benchmarks 5–20% [CleverTap][9] |
| CES | `Σ Scores / Responses` | Survey responses | Track ease post-redemption [Snipp][10] |
| NPS | `%Promoters - %Detractors` | Survey responses | >50 considered excellent [CleverTap][9] |
| Points Expiration | `(PointsExpired / PointsIssued) × 100` | Ledger with expiration events | High values indicate redemption friction |

> **Action**: expose these formulas in the in-product “metric definitions” drawer and maintain them in the shared data dictionary.

---

## 2. Data Gap Analysis

### 2.1 Currently Available Data ✅

| Data Point | Source | Status |
|------------|--------|--------|
| Order history | Order model | ✅ Complete |
| Customer registration date | Customer.createdAt | ✅ Complete |
| Store credit balances | Customer.storeCredit | ✅ Complete |
| Cashback transactions | StoreCreditLedger | ✅ Complete |
| Tier assignments | Customer.currentTierId | ✅ Complete |
| Tier changes | TierChangeLog | ✅ Complete |
| Order amounts | Order.netAmount | ✅ Complete |
| Order dates | Order.shopifyCreatedAt | ✅ Complete |

### 2.2 Missing Data ⚠️

| Data Point | Impact | Workaround |
|------------|--------|------------|
| **Customer Acquisition Cost (CAC)** | Cannot calculate accurate CLV | Use simplified CLV formula without CAC |
| **Gross Margin / COGS** | Cannot calculate profit-based metrics | Use revenue as proxy for profit |
| **Survey responses (NPS)** | Cannot measure satisfaction | Use behavioral metrics (retention, RPR) |
| **Cross-channel identifiers** | Cannot track omnichannel behavior | Track Shopify orders only |
| **Marketing attribution** | Cannot measure campaign ROI | Focus on overall program ROI |
| **Customer segments (RFM stored)** | Need to calculate on-the-fly | Calculate RFM dynamically from orders |

### 2.3 Data Quality Issues

1. **Customer.totalSpent not updated**: Need to calculate from Order.netAmount sum
   - **Solution**: Create aggregated queries in loader (already implemented in current analytics)

2. **No cohort tracking**: Need to group customers by join date
   - **Solution**: Add cohort calculation logic based on Customer.createdAt

3. **No tier progression metrics stored**: Need to query TierChangeLog
   - **Solution**: Add TierChangeLog queries to analytics loader

### 2.4 Data Collection Requirements (Future)

For future phases, consider collecting:
- **Behavioral events**: Page views, widget interactions, email opens
- **Survey responses**: NPS, satisfaction scores
- **Marketing attribution**: UTM parameters, referral sources
- **Customer demographics**: Age, location (from Shopify customer data)

---

## 3. Database Schema Changes

### 3.1 Required Changes: **NONE** ✅

The existing schema is sufficient for all primary and secondary metrics. No migrations required.

**Rationale**:
- Customer Retention Rate: Calculated from Order.shopifyCreatedAt and Customer.createdAt
- CLV: Calculated from Order.netAmount and customer lifespan
- RPR: Calculated from Order count per Customer
- Purchase Frequency: Calculated from Order count / Customer count
- Cohorts: Derived from Customer.createdAt grouping

### 3.2 Optional Future Enhancements

If analytics performance becomes an issue (>10s query time), consider:

1. **Analytics Cache Table** (optional materialized view)
   ```prisma
   model AnalyticsSnapshot {
     id                String   @id @default(uuid())
     shop              String
     snapshotDate      DateTime @default(now())
     periodStart       DateTime
     periodEnd         DateTime

     // Cached metrics
     totalRevenue      Decimal  @db.Decimal(12, 2)
     orderCount        Int
     customerCount     Int
     activeCustomers   Int
     crr               Decimal  @db.Decimal(5, 2)
     avgClv            Decimal  @db.Decimal(12, 2)
     rpr               Decimal  @db.Decimal(5, 2)

     // Metadata
     createdAt         DateTime @default(now())

     @@index([shop, snapshotDate])
   }
   ```
   **When to implement**: If analytics page load time exceeds 5 seconds

2. **Customer Segment Cache** (optional)
   ```prisma
   model CustomerSegment {
     id            String   @id @default(uuid())
     customerId    String
     shop          String

     rfmScore      String   // e.g., "555" (RFM)
     segment       String   // "Champions", "Loyal", "At Risk", etc.
     lastCalculated DateTime @default(now())

     customer      Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

     @@index([shop, segment])
     @@index([customerId])
   }
   ```
   **When to implement**: If RFM calculation takes >2s per request

### 3.3 Index Optimization (Already Sufficient)

Current indexes support efficient queries:
```prisma
// Customer indexes
@@index([shop])
@@index([currentTierId])

// Order indexes
@@index([shop])
@@index([customerId])
@@index([shopifyCreatedAt])
@@index([financialStatus])

// StoreCreditLedger indexes
@@index([shop])
@@index([customerId])
@@index([createdAt])
```

**No additional indexes needed** for current metrics.

---

## 4. Metric Calculation Logic

### 4.1 Customer Retention Rate (CRR)

```typescript
async function calculateCRR(
  shop: string,
  startDate: Date,
  endDate: Date
): Promise<{ crr: number; details: { cs: number; ce: number; cn: number } }> {

  // CS: Customers at start (customers who existed before startDate)
  const customersAtStart = await db.customer.count({
    where: {
      shop,
      createdAt: { lt: startDate }
    }
  });

  // CN: New customers acquired during period
  const newCustomers = await db.customer.count({
    where: {
      shop,
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  // CE: Customers at end who made purchases
  // Only count customers who were at start OR acquired during period AND made purchase
  const customersAtEnd = await db.customer.count({
    where: {
      shop,
      createdAt: { lte: endDate },
      orders: {
        some: {
          shopifyCreatedAt: { gte: startDate, lte: endDate },
          financialStatus: 'PAID'
        }
      }
    }
  });

  const crr = customersAtStart > 0
    ? ((customersAtEnd - newCustomers) / customersAtStart) * 100
    : 0;

  return {
    crr: Math.round(crr * 100) / 100,
    details: { cs: customersAtStart, ce: customersAtEnd, cn: newCustomers }
  };
}
```

### 4.2 Customer Lifetime Value (CLV)

```typescript
async function calculateCLV(shop: string): Promise<{
  avgClv: number;
  avgAov: number;
  avgPurchaseFrequency: number;
  avgCustomerLifespan: number;
}> {

  // Get all customers with their order history
  const customers = await db.customer.findMany({
    where: { shop },
    include: {
      orders: {
        where: { financialStatus: 'PAID' },
        select: {
          netAmount: true,
          shopifyCreatedAt: true
        }
      }
    }
  });

  const now = new Date();
  const clvData = customers.map(customer => {
    const orders = customer.orders;

    if (orders.length === 0) return null;

    // Calculate AOV for this customer
    const totalRevenue = orders.reduce((sum, o) =>
      sum + parseFloat(o.netAmount.toString()), 0
    );
    const aov = totalRevenue / orders.length;

    // Calculate lifespan (days since first order)
    const firstOrderDate = new Date(
      Math.min(...orders.map(o => new Date(o.shopifyCreatedAt).getTime()))
    );
    const lifespanDays = (now.getTime() - firstOrderDate.getTime()) / (1000 * 60 * 60 * 24);
    const lifespanYears = lifespanDays / 365;

    // Calculate purchase frequency (orders per year)
    const purchaseFrequency = lifespanYears > 0 ? orders.length / lifespanYears : orders.length;

    // Calculate CLV for this customer
    const clv = aov * purchaseFrequency * lifespanYears;

    return { clv, aov, purchaseFrequency, lifespanYears };
  }).filter(Boolean);

  // Calculate averages
  const avgClv = clvData.reduce((sum, d) => sum + d!.clv, 0) / clvData.length;
  const avgAov = clvData.reduce((sum, d) => sum + d!.aov, 0) / clvData.length;
  const avgPurchaseFrequency = clvData.reduce((sum, d) => sum + d!.purchaseFrequency, 0) / clvData.length;
  const avgCustomerLifespan = clvData.reduce((sum, d) => sum + d!.lifespanYears, 0) / clvData.length;

  return {
    avgClv: Math.round(avgClv * 100) / 100,
    avgAov: Math.round(avgAov * 100) / 100,
    avgPurchaseFrequency: Math.round(avgPurchaseFrequency * 100) / 100,
    avgCustomerLifespan: Math.round(avgCustomerLifespan * 100) / 100
  };
}
```

### 4.3 Repeat Purchase Rate (RPR)

```typescript
async function calculateRPR(shop: string, startDate?: Date, endDate?: Date): Promise<{
  rpr: number;
  repeatCustomers: number;
  totalCustomers: number;
}> {

  const dateFilter = startDate && endDate ? {
    shopifyCreatedAt: { gte: startDate, lte: endDate }
  } : {};

  // Get all customers with order counts
  const customers = await db.customer.findMany({
    where: { shop },
    select: {
      id: true,
      _count: {
        select: {
          orders: {
            where: {
              financialStatus: 'PAID',
              ...dateFilter
            }
          }
        }
      }
    }
  });

  const repeatCustomers = customers.filter(c => c._count.orders > 1).length;
  const totalCustomers = customers.length;

  const rpr = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;

  return {
    rpr: Math.round(rpr * 100) / 100,
    repeatCustomers,
    totalCustomers
  };
}
```

### 4.4 Purchase Frequency (PF)

```typescript
async function calculatePurchaseFrequency(
  shop: string,
  startDate?: Date,
  endDate?: Date
): Promise<{ pf: number; totalOrders: number; uniqueCustomers: number }> {

  const dateFilter = startDate && endDate ? {
    shopifyCreatedAt: { gte: startDate, lte: endDate }
  } : {};

  const orders = await db.order.findMany({
    where: {
      shop,
      financialStatus: 'PAID',
      ...dateFilter
    },
    select: { customerId: true }
  });

  const uniqueCustomers = new Set(orders.map(o => o.customerId)).size;
  const totalOrders = orders.length;

  const pf = uniqueCustomers > 0 ? totalOrders / uniqueCustomers : 0;

  return {
    pf: Math.round(pf * 100) / 100,
    totalOrders,
    uniqueCustomers
  };
}
```

### 4.5 Cohort Analysis (Monthly Cohorts)

```typescript
interface CohortData {
  cohortMonth: string; // "2024-01"
  customersAcquired: number;
  retention: {
    month0: number; // Same month as acquisition
    month1: number; // 1 month later
    month2: number; // 2 months later
    month3: number;
    month6: number;
    month12: number;
  };
}

async function calculateCohortRetention(shop: string): Promise<CohortData[]> {
  const customers = await db.customer.findMany({
    where: { shop },
    include: {
      orders: {
        where: { financialStatus: 'PAID' },
        select: { shopifyCreatedAt: true }
      }
    }
  });

  // Group customers by acquisition month
  const cohortMap = new Map<string, typeof customers>();

  customers.forEach(customer => {
    const cohortMonth = new Date(customer.createdAt).toISOString().slice(0, 7); // "YYYY-MM"
    if (!cohortMap.has(cohortMonth)) {
      cohortMap.set(cohortMonth, []);
    }
    cohortMap.get(cohortMonth)!.push(customer);
  });

  // Calculate retention for each cohort
  const cohortData: CohortData[] = [];

  cohortMap.forEach((cohortCustomers, cohortMonth) => {
    const cohortDate = new Date(cohortMonth + "-01");

    const retention = {
      month0: 0,
      month1: 0,
      month2: 0,
      month3: 0,
      month6: 0,
      month12: 0
    };

    // For each retention period, count how many customers made purchases
    [0, 1, 2, 3, 6, 12].forEach(monthOffset => {
      const periodStart = new Date(cohortDate);
      periodStart.setMonth(periodStart.getMonth() + monthOffset);
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const activeCustomers = cohortCustomers.filter(customer =>
        customer.orders.some(order => {
          const orderDate = new Date(order.shopifyCreatedAt);
          return orderDate >= periodStart && orderDate < periodEnd;
        })
      ).length;

      const retentionRate = cohortCustomers.length > 0
        ? (activeCustomers / cohortCustomers.length) * 100
        : 0;

      retention[`month${monthOffset}` as keyof typeof retention] =
        Math.round(retentionRate * 100) / 100;
    });

    cohortData.push({
      cohortMonth,
      customersAcquired: cohortCustomers.length,
      retention
    });
  });

  return cohortData.sort((a, b) => b.cohortMonth.localeCompare(a.cohortMonth));
}
```

---

## 5. API Endpoint Specifications

### 5.1 Enhanced Analytics Loader

**Route**: `/app/analytics` (existing route enhancement)

**Query Parameters**:
- `range`: Date range (today, 7days, 30days, quarter, year, all)
- `cohort`: Enable cohort analysis (true/false)
- `segment`: Enable RFM segmentation (true/false)

**Response Structure**:
```typescript
interface EnhancedAnalyticsData extends AnalyticsData {
  // New primary metrics
  retentionMetrics: {
    crr: number;
    crrDetails: { cs: number; ce: number; cn: number };
    churnRate: number;
  };

  clvMetrics: {
    avgClv: number;
    avgAov: number;
    avgPurchaseFrequency: number;
    avgCustomerLifespan: number;
    clvByTier: { tierId: string; tierName: string; avgClv: number }[];
  };

  repeatPurchaseMetrics: {
    rpr: number;
    repeatCustomers: number;
    oneTimeBuyers: number;
    purchaseFrequency: number;
  };

  // Cohort data (optional)
  cohorts?: CohortData[];

  // RFM segmentation (optional)
  rfmSegments?: {
    champions: { count: number; revenue: number; avgClv: number };
    loyal: { count: number; revenue: number; avgClv: number };
    potentialLoyalists: { count: number; revenue: number; avgClv: number };
    atRisk: { count: number; revenue: number; churnRisk: number };
    hibernating: { count: number; lastRevenue: number; daysSinceLastOrder: number };
    lost: { count: number; lastRevenue: number; daysSinceLastOrder: number };
  };

  // Benchmarking context
  benchmarks?: {
    crr: { value: number; industry: string; percentile: number };
    rpr: { value: number; industry: string; percentile: number };
    clv: { value: number; industry: string; percentile: number };
  };
}
```

### 5.2 New API Endpoint: Cohort Analysis

**Route**: `/api/analytics/cohorts`

**Method**: GET

**Query Parameters**:
- `shop`: Shop domain (from session)
- `months`: Number of cohorts to return (default: 12)

**Response**:
```typescript
{
  success: true,
  cohorts: CohortData[],
  summary: {
    avgRetentionMonth1: number,
    avgRetentionMonth3: number,
    avgRetentionMonth12: number,
    totalCohorts: number
  }
}
```

### 5.3 New API Endpoint: RFM Segmentation

**Route**: `/api/analytics/rfm-segments`

**Method**: GET

**Query Parameters**:
- `shop`: Shop domain (from session)
- `refresh`: Force recalculation (default: false)

**Response**:
```typescript
{
  success: true,
  segments: {
    champions: CustomerSegmentData,
    loyal: CustomerSegmentData,
    potentialLoyalists: CustomerSegmentData,
    atRisk: CustomerSegmentData,
    hibernating: CustomerSegmentData,
    lost: CustomerSegmentData
  },
  summary: {
    totalCustomers: number,
    segmentedCustomers: number,
    lastCalculated: string
  }
}
```

### 5.4 New API Endpoint: CSV Export

**Route**: `/api/analytics/export/csv`

**Method**: GET

**Query Parameters**:
- `type`: Data type (overview, cohorts, segments, tier-performance)
- `range`: Date range

**Response**: CSV file download

**CSV Format** (overview example):
```csv
Metric,Value,Change,Benchmark
Total Revenue,$125430.50,+15.2%,$100000
Active Members,450,+12.5%,400
Repeat Purchase Rate,45.2%,+3.1%,40%
Customer Lifetime Value,$680.30,+8.7%,$500
```

---

## 6. UI Component Breakdown

### 6.1 New Tab: "Retention" (Priority 1)

**Location**: New tab in analytics page (after "Overview")

**Components**:

1. **CRR Metric Card**
   - Large number display: "CRR: 45.2%"
   - Comparison vs previous period: "+3.2%"
   - Breakdown: CS, CE, CN values
   - Benchmark indicator: "Above industry average (40%)"

2. **Cohort Retention Heatmap**
   - X-axis: Months since acquisition (0, 1, 2, 3, 6, 12)
   - Y-axis: Cohort month (e.g., "Jan 2024", "Feb 2024")
   - Cell color: Retention percentage (green = high, red = low)
   - Hover tooltip: Exact retention % and customer count

3. **Retention Trend Chart**
   - Line chart showing CRR over time (monthly)
   - Multiple lines: Overall CRR, by tier
   - Benchmark line for industry average

### 6.2 New Tab: "Lifetime Value" (Priority 1)

**Components**:

1. **CLV Overview Cards**
   - Average CLV (large number)
   - Average AOV
   - Purchase Frequency
   - Customer Lifespan

2. **CLV by Tier Chart**
   - Bar chart comparing average CLV per tier
   - Color-coded by tier (use existing TierBadge colors)
   - Show potential CLV if upgraded to next tier

3. **CLV Distribution Histogram**
   - X-axis: CLV ranges ($0-100, $100-500, $500-1000, $1000+)
   - Y-axis: Customer count
   - Helps identify high-value customer segments

### 6.3 Enhanced "Engagement" Tab (Priority 2)

**New Components**:

1. **Repeat Purchase Rate Card**
   - RPR percentage (large number)
   - Breakdown: Repeat customers vs one-time buyers
   - Comparison vs benchmark

2. **Purchase Frequency Distribution**
   - Bar chart: Number of orders (1, 2, 3, 4, 5+)
   - Y-axis: Customer count
   - Average purchase frequency line

3. **Customer Journey Funnel**
   - Stage 1: All customers
   - Stage 2: Made 1st purchase
   - Stage 3: Made 2nd purchase (repeat)
   - Stage 4: Made 3+ purchases (loyal)
   - Show conversion % at each stage

### 6.4 New Tab: "Segmentation" (Priority 2)

**Components**:

1. **RFM Segment Cards Grid**
   - 6 cards: Champions, Loyal, Potential Loyalists, At Risk, Hibernating, Lost
   - Each card shows: Count, Revenue, Avg CLV
   - Color-coded by health (green = good, yellow = caution, red = concern)

2. **RFM Scatter Plot**
   - X-axis: Recency score (1-5)
   - Y-axis: Frequency × Monetary score (1-25)
   - Each dot = customer segment
   - Hover: Show customer count in that segment

3. **Segment Action Buttons**
   - "Export Champions to CSV"
   - "Email At-Risk Customers"
   - "Create Win-Back Campaign for Lost"
   - (Future: Actually trigger email campaigns)

### 6.5 Enhanced "Insights" Tab (Priority 3)

**New Insight Types**:

1. **Retention Insights**
   - "Month 1 retention dropping from 60% to 50% - check onboarding"
   - "Champions segment growing 15% - maintain exclusive perks"

2. **CLV Insights**
   - "Customers in Gold tier have 2.5x CLV vs Bronze - promote tier benefits"
   - "Purchase frequency declining - consider re-engagement campaign"

3. **Predictive Insights** (AI-powered, future phase)
   - "125 customers at risk of churning in next 30 days"
   - "Upgrading 50 customers to next tier could add $15,000 revenue"

### 6.6 Component Library Additions

**New Reusable Components**:

1. **CohortHeatmap.tsx**
   ```typescript
   interface CohortHeatmapProps {
     cohorts: CohortData[];
     highlightBestCohort?: boolean;
     onCellClick?: (cohort: string, month: number) => void;
   }
   ```

2. **CLVDistributionChart.tsx**
   ```typescript
   interface CLVDistributionProps {
     customers: { id: string; clv: number }[];
     bins?: number; // Number of histogram bins
     highlightTier?: string;
   }
   ```

3. **RFMSegmentCard.tsx**
   ```typescript
   interface RFMSegmentCardProps {
     segment: 'champions' | 'loyal' | 'potentialLoyalists' | 'atRisk' | 'hibernating' | 'lost';
     count: number;
     revenue: number;
     avgClv: number;
     actions?: { label: string; onClick: () => void }[];
   }
   ```

4. **BenchmarkIndicator.tsx**
   ```typescript
   interface BenchmarkIndicatorProps {
     value: number;
     benchmark: number;
     unit: 'percentage' | 'currency' | 'number';
     label: string;
     showPercentile?: boolean;
   }
   ```

---

## 7. Segmentation & Cohort Strategy

### 7.1 RFM Segmentation

**RFM Definition**:
- **Recency**: Days since last order (1-5 score, 1 = recent, 5 = long ago)
- **Frequency**: Number of orders (1-5 score, 1 = few orders, 5 = many orders)
- **Monetary**: Total spending (1-5 score, 1 = low spend, 5 = high spend)

**Scoring Logic**:

```typescript
function calculateRFMScore(customer: {
  lastOrderDate: Date;
  orderCount: number;
  totalSpent: number;
}): { r: number; f: number; m: number; segment: string } {

  const now = Date.now();
  const daysSinceLastOrder = (now - customer.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24);

  // Recency scoring (lower days = higher score)
  let r = 5;
  if (daysSinceLastOrder > 365) r = 1;
  else if (daysSinceLastOrder > 180) r = 2;
  else if (daysSinceLastOrder > 90) r = 3;
  else if (daysSinceLastOrder > 30) r = 4;

  // Frequency scoring (quintiles)
  let f = 1;
  if (customer.orderCount >= 10) f = 5;
  else if (customer.orderCount >= 6) f = 4;
  else if (customer.orderCount >= 4) f = 3;
  else if (customer.orderCount >= 2) f = 2;

  // Monetary scoring (quintiles based on shop's customer spending distribution)
  let m = 1;
  if (customer.totalSpent >= 1000) m = 5;
  else if (customer.totalSpent >= 500) m = 4;
  else if (customer.totalSpent >= 200) m = 3;
  else if (customer.totalSpent >= 100) m = 2;

  // Determine segment based on RFM score
  const segment = determineSegment(r, f, m);

  return { r, f, m, segment };
}

function determineSegment(r: number, f: number, m: number): string {
  const score = `${r}${f}${m}`;

  // Champions: Recent, frequent, high spenders
  if (r >= 4 && f >= 4 && m >= 4) return 'champions';

  // Loyal: Frequent buyers regardless of recency
  if (f >= 4 && m >= 3) return 'loyal';

  // Potential Loyalists: Recent buyers with moderate frequency
  if (r >= 3 && f >= 2 && m >= 2) return 'potentialLoyalists';

  // At Risk: Used to be good customers but haven't purchased recently
  if (r <= 2 && f >= 3 && m >= 3) return 'atRisk';

  // Hibernating: Low recent activity, used to spend
  if (r <= 2 && f >= 2 && m >= 2) return 'hibernating';

  // Lost: Long time since last purchase, low frequency
  if (r === 1) return 'lost';

  // New/Promising: Recent but low frequency
  return 'potentialLoyalists';
}
```

**Segment Definitions**:

| Segment | RFM Pattern | Description | Action |
|---------|-------------|-------------|--------|
| **Champions** | 555, 554, 544, 545 | Best customers | Reward, early access, VIP |
| **Loyal** | 543, 444, 435, 355 | Regular buyers | Upsell, cross-sell |
| **Potential Loyalists** | 532, 433, 434, 343 | Recent buyers | Engage, build frequency |
| **At Risk** | 244, 334, 343, 144 | Slipping away | Win-back campaign |
| **Hibernating** | 231, 221, 233, 232 | Dormant | Re-engagement |
| **Lost** | 111, 112, 121, 131 | Gone | Last-chance offer |

### 7.2 Cohort Analysis Strategy

**Cohort Definition**: Customers grouped by month of first order

**Retention Periods**: Month 0, 1, 2, 3, 6, 12

**Use Cases**:
1. **Identify best acquisition channels**: Compare retention of cohorts from different marketing campaigns
2. **Measure onboarding improvements**: Compare retention of recent cohorts vs older cohorts
3. **Predict churn**: Identify retention drop-off patterns (e.g., "Month 3 is critical")
4. **Calculate LTV by cohort**: Multiply cohort retention curve by average order value

**Heatmap Visualization**:
- Green (>60%): Excellent retention
- Yellow (40-60%): Average retention
- Orange (20-40%): Below average
- Red (<20%): Poor retention

### 7.3 Behavioral Segmentation (Future Phase)

Beyond RFM, consider:

1. **Tier Engagement**:
   - Active tier members (using benefits)
   - Inactive tier members (not using benefits)
   - Near-upgrade customers (close to next tier)

2. **Credit Behavior**:
   - High earners, low redeemers (hoarding credit)
   - Balanced users (earn and redeem regularly)
   - Redemption-focused (redeem quickly)

3. **Product Affinity**:
   - Single-category buyers
   - Multi-category buyers
   - High-margin product buyers

---

## 8. Visualization Specifications

### 8.1 Color Palette

**Metric Health Colors**:
- **Positive/Good**: `#008060` (Shopify success green)
- **Neutral/Average**: `#5C6AC4` (Shopify primary blue)
- **Negative/Warning**: `#DE3618` (Shopify critical red)
- **Info/Subdued**: `#8C9196` (Shopify subdued gray)

**Tier Colors** (use existing getTierStyle):
- Bronze: `#CD7F32`
- Silver: `#C0C0C0`
- Gold: `#FFD700`
- Platinum: `#E5E4E2`
- Diamond: `#B9F2FF`

**Heatmap Gradient**:
```css
0-20%:    #DE3618 (red)
20-40%:   #FFA500 (orange)
40-60%:   #FFD700 (yellow)
60-80%:   #90EE90 (light green)
80-100%:  #008060 (green)
```

### 8.2 Chart Types

| Metric | Chart Type | Rationale |
|--------|------------|-----------|
| **CRR over time** | Line chart | Shows trend clearly |
| **CLV by tier** | Bar chart | Easy comparison between tiers |
| **CLV distribution** | Histogram | Shows customer value spread |
| **Cohort retention** | Heatmap | Identifies patterns at a glance |
| **RFM segments** | Scatter plot | Shows 2D relationship |
| **Purchase frequency** | Bar chart | Clear distribution |
| **Revenue attribution** | Stacked bar / Waterfall | Shows breakdown |

### 8.3 Interactive Features

1. **Drill-down**: Click on tier in chart → filter view to that tier only
2. **Date range selector**: Buttons for preset ranges (7d, 30d, quarter, year, all)
3. **Export buttons**: CSV, PDF (future), PNG (future)
4. **Tooltips**: Show exact values on hover
5. **Toggle benchmarks**: Show/hide industry benchmark lines
6. **Filter by segment**: Show only Champions, Loyal, etc.

### 8.4 Loading States

Use existing patterns from current analytics page:
- Skeleton screens for metric cards
- Shimmer effect on charts
- Progressive loading: Show cached data → update with fresh data

### 8.5 Empty States

- **No data yet**: Show example/demo data with "Based on sample data" disclaimer
- **No cohorts**: "Create cohorts by acquiring customers over time"
- **No repeat customers**: "No repeat purchases yet - focus on engagement"

---

## 9. Benchmarking & Context

### 9.1 Industry Benchmarks

**E-commerce Loyalty Program Benchmarks** (Research-based):

| Metric | Average | Good | Excellent |
|--------|---------|------|-----------|
| **Customer Retention Rate** | 30-40% | 50-60% | 70%+ |
| **Repeat Purchase Rate** | 25-35% | 45-55% | 65%+ |
| **Customer Lifetime Value** | $200-500 | $500-1000 | $1000+ |
| **Purchase Frequency** | 2-3 orders/year | 4-6 orders/year | 8+ orders/year |
| **Credit Redemption Rate** | 40-50% | 60-70% | 80%+ |
| **Month 1 Retention** | 30-40% | 50-60% | 70%+ |
| **Month 12 Retention** | 10-20% | 25-35% | 40%+ |

**Implementation**:

```typescript
interface Benchmark {
  metric: string;
  value: number;
  industry: string; // "e-commerce", "loyalty-program"
  percentile: number; // Where user ranks (0-100)
  source: string; // "Industry research 2024"
}

function calculatePercentile(value: number, benchmark: { average: number; good: number; excellent: number }): number {
  if (value >= benchmark.excellent) return 95;
  if (value >= benchmark.good) return 75;
  if (value >= benchmark.average) return 50;
  return 25;
}

// Example usage in loader
const benchmarks = {
  crr: {
    value: calculatedCRR,
    industry: "E-commerce loyalty programs",
    percentile: calculatePercentile(calculatedCRR, { average: 35, good: 55, excellent: 70 }),
    source: "Industry research 2024"
  }
};
```

### 9.2 Contextual Insights

**Auto-generated insights based on benchmarks**:

```typescript
function generateBenchmarkInsights(metrics: {
  crr: number;
  rpr: number;
  clv: number;
}): Insight[] {
  const insights: Insight[] = [];

  // CRR insights
  if (metrics.crr > 60) {
    insights.push({
      id: 'crr-excellent',
      type: 'success',
      title: 'Excellent Customer Retention',
      description: `Your retention rate of ${metrics.crr}% is in the top 10% of loyalty programs`,
      priority: 'low'
    });
  } else if (metrics.crr < 30) {
    insights.push({
      id: 'crr-low',
      type: 'warning',
      title: 'Low Customer Retention',
      description: `Your retention rate of ${metrics.crr}% is below industry average (35%)`,
      action: 'Implement win-back campaigns',
      impact: 'Could increase revenue by 20%',
      priority: 'high'
    });
  }

  // RPR insights
  if (metrics.rpr < 25) {
    insights.push({
      id: 'rpr-low',
      type: 'opportunity',
      title: 'Low Repeat Purchase Rate',
      description: 'Only 1 in 4 customers return for a second purchase',
      action: 'Focus on first-purchase experience and follow-up emails',
      priority: 'high'
    });
  }

  // CLV insights
  if (metrics.clv > 1000) {
    insights.push({
      id: 'clv-high',
      type: 'success',
      title: 'High Customer Value',
      description: `Average CLV of $${metrics.clv} indicates strong loyalty`,
      action: 'Consider premium tier benefits',
      priority: 'medium'
    });
  }

  return insights;
}
```

### 9.3 Percentile Visualization

**BenchmarkIndicator Component**:

```tsx
function BenchmarkIndicator({
  value,
  benchmark,
  unit,
  label
}: BenchmarkIndicatorProps) {
  const percentile = calculatePercentile(value, benchmark);

  return (
    <Box>
      <InlineStack align="space-between">
        <Text as="span">{label}</Text>
        <Badge tone={percentile >= 75 ? 'success' : percentile >= 50 ? 'info' : 'warning'}>
          {percentile}th percentile
        </Badge>
      </InlineStack>

      <ProgressBar
        progress={percentile}
        tone={percentile >= 75 ? 'success' : 'info'}
      />

      <Text variant="bodySm" tone="subdued">
        Your {label}: {formatValue(value, unit)} vs Industry avg: {formatValue(benchmark.average, unit)}
      </Text>
    </Box>
  );
}
```

---

## 10. Implementation Phases

### Phase 1: Core Retention Metrics (Week 1-2) - Priority 1

**Goal**: Add CRR, RPR, Purchase Frequency to analytics page

**Tasks**:
1. [ ] Add CRR calculation to analytics loader (4 hours)
2. [ ] Add RPR calculation to analytics loader (2 hours)
3. [ ] Add Purchase Frequency calculation (2 hours)
4. [ ] Create "Retention" tab in analytics UI (4 hours)
5. [ ] Add CRR metric card with benchmark (3 hours)
6. [ ] Add RPR metric card (2 hours)
7. [ ] Add retention insights generation (3 hours)
8. [ ] Test with production data (2 hours)

**Deliverables**:
- ✅ CRR displayed with benchmark
- ✅ RPR displayed with benchmark
- ✅ Retention insights generated
- ✅ "Retention" tab functional

**Success Criteria**:
- CRR calculated accurately for all date ranges
- Benchmarks displayed correctly
- Page load time < 3 seconds

---

### Phase 2: Lifetime Value Metrics (Week 2-3) - Priority 1

**Goal**: Add CLV, AOV, Purchase Frequency, Customer Lifespan

**Tasks**:
1. [ ] Add CLV calculation to analytics loader (6 hours)
2. [ ] Calculate CLV by tier (4 hours)
3. [ ] Create "Lifetime Value" tab (4 hours)
4. [ ] Build CLV overview cards (3 hours)
5. [ ] Build CLV by tier bar chart (4 hours)
6. [ ] Build CLV distribution histogram (5 hours)
7. [ ] Add CLV insights (3 hours)
8. [ ] Test CLV calculations with edge cases (3 hours)

**Deliverables**:
- ✅ CLV calculated per customer
- ✅ Average CLV displayed
- ✅ CLV by tier comparison
- ✅ CLV distribution visualization

**Success Criteria**:
- CLV formula validated with manual calculations
- Tier comparison shows meaningful differences
- Histogram shows clear customer value segments

---

### Phase 3: Cohort Analysis (Week 3-4) - Priority 2

**Goal**: Add monthly cohort retention analysis

**Tasks**:
1. [ ] Build cohort calculation logic (8 hours)
2. [ ] Create CohortHeatmap component (6 hours)
3. [ ] Add cohort retention chart to Retention tab (4 hours)
4. [ ] Add cohort summary metrics (3 hours)
5. [ ] Create `/api/analytics/cohorts` endpoint (4 hours)
6. [ ] Add cohort export to CSV (3 hours)
7. [ ] Optimize cohort queries for performance (4 hours)
8. [ ] Test with 12+ months of data (2 hours)

**Deliverables**:
- ✅ Monthly cohorts calculated
- ✅ Heatmap visualization
- ✅ Cohort retention trends
- ✅ CSV export

**Success Criteria**:
- Heatmap renders <2 seconds for 12 cohorts
- Retention percentages match manual calculations
- CSV export includes all cohort data

---

### Phase 4: RFM Segmentation (Week 4-5) - Priority 2

**Goal**: Implement RFM scoring and segment customers

**Tasks**:
1. [ ] Build RFM scoring algorithm (6 hours)
2. [ ] Calculate RFM segments for all customers (4 hours)
3. [ ] Create RFMSegmentCard component (4 hours)
4. [ ] Build "Segmentation" tab (5 hours)
5. [ ] Add RFM scatter plot visualization (6 hours)
6. [ ] Create `/api/analytics/rfm-segments` endpoint (4 hours)
7. [ ] Add segment export to CSV (3 hours)
8. [ ] Add segment action buttons (placeholder) (2 hours)

**Deliverables**:
- ✅ RFM scores calculated
- ✅ 6 customer segments defined
- ✅ Segment visualization
- ✅ Segment export

**Success Criteria**:
- All customers assigned to segments
- Segment distribution makes sense (not all in one segment)
- Segment actions display correctly

---

### Phase 5: Enhanced Insights & Benchmarking (Week 5-6) - Priority 3

**Goal**: Add contextual insights and industry benchmarks

**Tasks**:
1. [ ] Define benchmark values for each metric (2 hours)
2. [ ] Create BenchmarkIndicator component (3 hours)
3. [ ] Add benchmark comparisons to all metrics (4 hours)
4. [ ] Enhance insight generation with benchmarks (4 hours)
5. [ ] Add percentile calculations (3 hours)
6. [ ] Create "How do I compare?" section (4 hours)
7. [ ] Add tooltips explaining benchmarks (2 hours)
8. [ ] User testing and feedback (4 hours)

**Deliverables**:
- ✅ Benchmarks displayed for all key metrics
- ✅ Percentile rankings shown
- ✅ Context-aware insights
- ✅ Educational tooltips

**Success Criteria**:
- Merchants understand where they rank
- Insights are actionable
- Benchmarks are clearly sourced

---

### Phase 6: Performance & Polish (Week 6-7) - Priority 3

**Goal**: Optimize performance, add exports, polish UI

**Tasks**:
1. [ ] Optimize database queries (add indexes if needed) (4 hours)
2. [ ] Implement query result caching (4 hours)
3. [ ] Add CSV export for all reports (6 hours)
4. [ ] Add loading skeletons for all charts (3 hours)
5. [ ] Implement error boundaries (2 hours)
6. [ ] Add empty state illustrations (2 hours)
7. [ ] Mobile responsive testing (4 hours)
8. [ ] Cross-browser testing (3 hours)
9. [ ] Performance testing (4 hours)
10. [ ] Final UX polish (4 hours)

**Deliverables**:
- ✅ Page load time < 3 seconds
- ✅ All reports exportable
- ✅ Mobile-friendly
- ✅ Production-ready

**Success Criteria**:
- Page load time < 3 seconds with 1000+ customers
- No errors in production logs
- Mobile UI usable on iPhone/Android

---

### Phase 7 (Future): Advanced Features

**Not in current scope, but planned**:

1. **Predictive Analytics** (AI-powered)
   - Churn prediction model
   - CLV prediction model
   - Tier upgrade predictions

2. **Email Campaign Integration**
   - Send campaigns to segments
   - Track email performance
   - A/B testing

3. **Custom Reports**
   - Report builder UI
   - Scheduled email reports
   - Custom date ranges

4. **API Access**
   - REST API for analytics data
   - Webhooks for metric thresholds
   - Third-party integrations (Klaviyo, etc.)

---

### Cross-Phase Data Governance & QA (Continuous)

**Goal**: Maintain metric integrity, alignment, and documentation throughout all phases.

**Tasks**:
1. [ ] Publish/maintain analytics data dictionary with formulas, fields, and owners (initial pass in Phase 1, update each release).
2. [ ] Automate schema-vs-doc checks (CI script compares documented scopes/metrics with `shopify.app.toml`, analytics loader tests).
3. [ ] Add unit tests for each metric (CRR, CLV, redemption, acquisition) verifying sample scenarios.
4. [ ] Implement anomaly detection thresholds (e.g., sudden redemption drop) with Datadog/Sentry alerts.
5. [ ] Schedule quarterly analytics review w/ product, marketing, data teams to revisit definitions and benchmarks.
6. [ ] Ensure GDPR/CCPA compliance for segmentation filters; document opt-out handling.

**Deliverables**:
- ✅ Data dictionary in `/docs/analytics/metric-catalog.md`
- ✅ CI job `analytics-doc-sync` verifying snippets/formulas
- ✅ Automated tests covering core metrics and sample cohorts
- ✅ Alerting runbooks for data pipeline issues

**Success Criteria**:
- No undocumented metric or formula changes reach production
- Analytics dashboard passes quarterly review without major corrective action
- Alerts detect data regressions within 30 minutes of occurrence

---

## 11. Success Metrics

### 11.1 Technical Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| **Page load time** | < 3 seconds | TBD |
| **Query execution time** | < 2 seconds | TBD |
| **Database query count** | < 20 per page load | TBD |
| **Error rate** | < 0.1% | TBD |
| **Mobile usability score** | > 90 | TBD |

### 11.2 User Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Merchant usage** | 70% of merchants visit analytics monthly | Analytics pageview tracking |
| **Time on page** | > 2 minutes average | Session analytics |
| **Export usage** | 30% of merchants export data | CSV download tracking |
| **Insight engagement** | 40% of merchants click on insights | Click tracking |
| **Repeat visits** | 50% of merchants visit 3+ times/month | User behavior tracking |

### 11.3 Business Success Metrics

| Metric | Impact | Measurement |
|--------|--------|-------------|
| **Merchant retention** | +10% retention due to better insights | Churn analysis |
| **Plan upgrades** | +15% upgrade to higher plans | Subscription tracking |
| **Feature satisfaction** | > 4.5/5 rating for analytics | In-app survey |
| **Support tickets** | -20% analytics-related tickets | Support ticket analysis |

### 11.4 Data Quality Metrics

| Metric | Target | Validation |
|--------|--------|------------|
| **CRR accuracy** | ±2% vs manual calculation | Spot-check 10 shops |
| **CLV accuracy** | ±5% vs manual calculation | Spot-check 10 shops |
| **Cohort completeness** | 100% of customers in cohorts | Data integrity check |
| **Segment distribution** | No single segment > 50% | Data validation |

---

## 12. Appendix

### 12.1 Research Sources

1. AgencyAnalytics – *Customer Retention Rate (CRR) KPI Definition & Formula* (https://agencyanalytics.com/kpi-definitions/customer-retention-rate)
2. LoyaltyLion – *How to Calculate Customer Lifetime Value in Shopify* (https://loyaltylion.com/blog/shopify-customer-lifetime-value)
3. OpenLoyalty – *Loyalty Program Metrics Measuring the Health of Your Loyalty Program* (https://www.openloyalty.io/insider/loyalty-program-metrics-measuring-the-health-of-your-loyalty-program)
4. Snipp – *Customer Loyalty Analytics: Key Metrics* (https://www.snipp.com/blog/customer-loyalty-analytics-key-metrics)
5. LoyaltyLion – *Loyalty Program Redemption Rates* (https://loyaltylion.com/blog/loyalty-program-redemption-rates)
6. Yotpo – *Redemption Rate: Calculate, Benchmark & Boost Yours* (https://www.yotpo.com/blog/redemption-rate/)
7. OpenLoyalty – *Loyalty Program Metrics & Benchmarks* (https://www.openloyalty.io/insider/loyalty-program-metrics-measuring-the-health-of-your-loyalty-program)
8. Snipp – *Customer Loyalty Analytics: 8 Metrics Every Brand Should Track* (https://www.snipp.com/blog/customer-loyalty-analytics-key-metrics)
9. CleverTap – *How to Measure Customer Loyalty: 9 Important Metrics* (https://clevertap.com/blog/how-to-measure-customer-loyalty/)
10. Snipp – *Customer Effort Score Guide* (same as [4])
11. Snipp – *Sales Attribution Metrics* (same as [4])
12. LoyaltyLion – *Loyalty Segmentation: How It Works* (https://loyaltylion.com/blog/loyalty-segmentation)
13. Joy – *The Ultimate Guide to Data-Driven Loyalty Programs* (https://joy.so/data-driven-loyalty-program/)
14. Smartlook – *Data Retention Periods and Their Impact* (https://www.smartlook.com/blog/data-retention-period-user-behavior-analysis/)
15. Estuary – *Real-Time Analytics Explained* (https://estuary.dev/blog/real-time-analytics/)
16. MyTotalRetail – *Why Data Management Is Key to Any Successful Loyalty Program* (https://www.mytotalretail.com/article/why-data-management-is-key-to-any-successful-loyalty-program/)
17. MyTotalRetail – *Digital Integration Hub for Loyalty* (same as [16])
18. Yotpo – *Avoiding Double Counting with Unique Codes* (https://www.yotpo.com/blog/redemption-rate/)
19. OpenLoyalty – *Loyalty Segmentation Guide* (https://www.openloyalty.io/insider/loyalty-segmentation-guide)
20. OpenLoyalty – *Behavioural Segmentation Examples* (same as [19])
21. OpenLoyalty – *Attitudinal Segmentation for Loyalty* (same as [19])
22. LoyaltyLion – *Segmentation Variables and Data* (https://loyaltylion.com/blog/loyalty-segmentation)
23. OpenLoyalty – *Hybrid Segmentation & Clustering* (same as [19])
24. OpenLoyalty – *Privacy Considerations for Segmentation* (same as [19])
25. Toki – *Loyalty Programs Best Practices to Boost Your Brand* (https://www.buildwithtoki.com/blog-post/loyalty-programs-best-practices)
26. Tableau – *Best Practices for Analysing E-commerce Data* (https://www.tableau.com/learn/whitepapers/5-best-practices-analyzing-ecommerce-data)
27. Justinmind – *Dashboard Design Best Practices* (https://www.justinmind.com/ui-design/dashboard-design-best-practices-ux)
28. Justinmind – *Responsive Dashboard Principles* (same as [27])
29. Toki – *Omnichannel Loyalty Integration* (https://www.buildwithtoki.com/blog-post/loyalty-programs-best-practices)
30. Toki – *Gamification & Tier Best Practices* (same as [25])
31. Toki – *Tier Benefit Strategy* (same as [25])
32. Toki – *Gamification Elements* (same as [25])
33. LoyaltyLion – *70% of Customers Want Personalised Offers* (https://loyaltylion.com/blog/loyalty-segmentation)

### 12.2 Glossary

- **CRR**: Customer Retention Rate
- **CLV**: Customer Lifetime Value
- **RPR**: Repeat Purchase Rate
- **PF**: Purchase Frequency
- **RFM**: Recency, Frequency, Monetary (segmentation model)
- **Cohort**: Group of customers acquired in the same time period
- **Churn**: Loss of customers over time
- **AOV**: Average Order Value

### 12.3 Related Documentation

- [Current Analytics Page](../../app/routes/app.analytics.tsx) (1,487 lines)
- [Prisma Schema](../../prisma/schema.prisma) - Customer, Order, StoreCreditLedger models
- [Currency Utilities](../../app/utils/currency.ts) - Currency formatting
- [Tier Utilities](../../app/utils/tier-styles.ts) - Tier visualization

---

**Last Updated**: January 2025
**Document Version**: 1.0
**Prepared By**: Claude Code
**Status**: Ready for Implementation
