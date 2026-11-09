/**
 * What the Analytics page's Cohort Analysis Insights card says, from the
 * shop's own cohorts (services/cohort-analysis.server.ts).
 *
 * A cohort's month N is the Nth calendar month since it began, and its last
 * month is the one in progress. The summary metrics average each month over
 * whichever cohorts reach it, so avgLTV30Days and avgLTV90Days cover
 * different customers, and a shop with no cohort old enough gets 0. Each
 * figure here comes from one set of cohorts, and with none old enough the
 * card says so.
 */

type RetentionCohort = { retention: { monthIndex: number }[] };
type RevenueCohort = {
  initialCustomers: number;
  cumulativeRevenue: { monthIndex: number; totalRevenue: number }[];
};

const NOT_ENOUGH_HISTORY = "Not enough history yet";

/** The shop's Month 1 retention, once some cohort has a month 1 */
export function monthOneRetentionInsight(cohorts: RetentionCohort[], avgRetentionMonth1: number): string {
  if (!cohorts.some((cohort) => cohort.retention.some((point) => point.monthIndex === 1))) {
    return `${NOT_ENOUGH_HISTORY}: no cohort is a month old.`;
  }
  return `Your Month 1 retention is ${avgRetentionMonth1.toFixed(0)}% on average across your cohorts at least a month old.`;
}

/**
 * Average spend per customer in their first month and in their first three,
 * both over the cohorts whose first three months are over, or null when no
 * cohort is that old
 */
export function earlySpendPerCustomer(cohorts: RevenueCohort[]): { firstMonth: number; firstThreeMonths: number } | null {
  let customers = 0;
  let firstMonth = 0;
  let firstThreeMonths = 0;
  for (const cohort of cohorts) {
    const totalBy = (monthIndex: number) => cohort.cumulativeRevenue.find((point) => point.monthIndex === monthIndex)?.totalRevenue;
    const month0 = totalBy(0);
    const month2 = totalBy(2);
    // A cohort has a month 3 once its first three months are over
    if (month0 === undefined || month2 === undefined || totalBy(3) === undefined || cohort.initialCustomers <= 0) continue;
    customers += cohort.initialCustomers;
    firstMonth += month0;
    firstThreeMonths += month2;
  }
  return customers > 0 ? { firstMonth: firstMonth / customers, firstThreeMonths: firstThreeMonths / customers } : null;
}

export function earlySpendInsight(cohorts: RevenueCohort[], formatMoney: (amount: number) => string): string {
  const spend = earlySpendPerCustomer(cohorts);
  if (!spend) return `${NOT_ENOUGH_HISTORY}: no cohort is 3 months old.`;
  return `In cohorts at least 3 months old, customers spent ${formatMoney(spend.firstMonth)} each on average in their first month and ${formatMoney(spend.firstThreeMonths)} in their first three.`;
}

/** How many of the cohorts' customers moved up a tier: a count, not a cause */
export function tierProgressionInsight(cohorts: RetentionCohort[], tierUpgradeRate: number): string {
  if (cohorts.length === 0) return `${NOT_ENOUGH_HISTORY}.`;
  const moved = `${tierUpgradeRate.toFixed(0)}% of customers in these cohorts have moved up a tier.`;
  return tierUpgradeRate >= 20 ? moved : `Only ${moved} Consider adjusting tier thresholds or rewards.`;
}
