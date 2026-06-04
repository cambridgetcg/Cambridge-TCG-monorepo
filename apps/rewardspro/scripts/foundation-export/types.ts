/**
 * Output types for the writer.
 *
 * Pure formatters return `Artifact` records; the facade then writes
 * them to disk. This split keeps the formatters unit-testable and
 * decouples the format logic from the file system.
 */
export type ExportFormat = "json" | "ts";

export interface Artifact {
  format: ExportFormat;
  filename: string;
  content: string;
}
