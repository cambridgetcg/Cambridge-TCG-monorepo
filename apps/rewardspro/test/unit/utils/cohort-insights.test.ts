import { describe, expect, it } from "vitest";
import {
  earlySpendInsight,
  earlySpendPerCustomer,
  monthOneRetentionInsight,
  tierProgressionInsight,
} from "~/utils/cohort-insights";

/**
 * The Cohort Analysis Insights card on the Analytics page quotes only what
 * the shop's own cohorts measured (services/cohort-analysis.server.ts): each
 * figure comes from one set of cohorts, and with no cohort old enough it says
 * so rather than quoting a 0 nothing measured.
 */

const money = (amount: number) => `£${amount.toFixed(2)}`;

/** A cohort's cumulative revenue, one total per month since it began (month 0 = its first month) */
function revenueCohort(initialCustomers: number, totals: number[]) {
  return {
    initialCustomers,
    cumulativeRevenue: totals.map((totalRevenue, monthIndex) => ({
      monthIndex,
      totalRevenue,
      avgRevenuePerCustomer: totalRevenue / initialCustomers,
    })),
  };
}

function retentionCohort(months: number) {
  return { retention: Array.from({ length: months }, (_, monthIndex) => ({ monthIndex, retentionRate: monthIndex === 0 ? 100 : 30 })) };
}

describe("early spend per customer", () => {
  it("works out both figures from the same cohorts: those whose first three months are over", () => {
    const cohorts = [
      // Four months old: months 0-2 are over
      revenueCohort(10, [500, 600, 900, 1000, 1100]),
      // Three months old: months 0-2 are over
      revenueCohort(30, [900, 1200, 1500, 1500]),
      // Two months old: its third month (index 2) is this month, not over
      revenueCohort(100, [5000, 5000, 5000]),
      // This month's cohort
      revenueCohort(50, [2500]),
    ];

    // (500 + 900) / 40 and (900 + 1500) / 40
    expect(earlySpendPerCustomer(cohorts)).toEqual({ firstMonth: 35, firstThreeMonths: 60 });
  });

  it("has no figure when no cohort's first three months are over", () => {
    expect(earlySpendPerCustomer([revenueCohort(100, [5000, 5000, 5000]), revenueCohort(50, [2500])])).toBeNull();
    expect(earlySpendPerCustomer([])).toBeNull();
  });

  it("states the two measured figures, and which cohorts they cover", () => {
    const text = earlySpendInsight([revenueCohort(10, [500, 600, 900, 1000])], money);

    expect(text).toBe(
      "In cohorts at least 3 months old, customers spent £50.00 each on average in their first month and £90.00 in their first three.",
    );
  });

  it("says there isn't enough history rather than drawing a conclusion from zeros", () => {
    const text = earlySpendInsight([revenueCohort(50, [2500, 2600])], money);

    expect(text).toBe("Not enough history yet: no cohort is 3 months old.");
    expect(earlySpendInsight([], money)).toBe("Not enough history yet: no cohort is 3 months old.");
  });
});

describe("month 1 retention", () => {
  it("quotes the shop's figure once a cohort is a month old", () => {
    expect(monthOneRetentionInsight([retentionCohort(2), retentionCohort(1)], 30)).toBe(
      "Your Month 1 retention is 30% on average across your cohorts at least a month old.",
    );
  });

  it("says there isn't enough history when no cohort has a month 1", () => {
    expect(monthOneRetentionInsight([retentionCohort(1)], 0)).toBe("Not enough history yet: no cohort is a month old.");
    expect(monthOneRetentionInsight([], 0)).toBe("Not enough history yet: no cohort is a month old.");
  });
});

describe("tier progression", () => {
  it("says how many customers moved up a tier, not that the program caused anything", () => {
    const text = tierProgressionInsight([retentionCohort(3)], 25);

    expect(text).toBe("25% of customers in these cohorts have moved up a tier.");
    expect(text).not.toMatch(/driving|engagement/i);
  });

  it("keeps the advice for a low rate", () => {
    expect(tierProgressionInsight([retentionCohort(3)], 5)).toBe(
      "Only 5% of customers in these cohorts have moved up a tier. Consider adjusting tier thresholds or rewards.",
    );
  });

  it("says there isn't enough history with no cohorts", () => {
    expect(tierProgressionInsight([], 0)).toBe("Not enough history yet.");
  });
});
