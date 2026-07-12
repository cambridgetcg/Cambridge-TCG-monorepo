export interface PveSweepResult {
  reconciled: number;
  failures: number;
  paused: true;
}

export async function runPveReconciliationSweep(): Promise<PveSweepResult> {
  // Keep the maintenance result shape stable without reading or writing any
  // PVE tables. Old unawarded wins stay untouched while rewards are paused.
  return { reconciled: 0, failures: 0, paused: true };
}
