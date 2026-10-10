const STATE_SNAPSHOT_ARGUMENT = "--state-snapshot-in-progress";

/**
 * The freshness audit may be deferred only by the explicit child invocation
 * used while state:snapshot is regenerating the file. Environment variables
 * are intentionally ignored so an inherited shell setting cannot bypass it.
 */
export function isStateSnapshotRegeneration(argv: readonly string[]): boolean {
  return argv.slice(2).includes(STATE_SNAPSHOT_ARGUMENT);
}

export const STATE_SNAPSHOT_REGENERATION_ARGS = [
  "--",
  STATE_SNAPSHOT_ARGUMENT,
] as const;
