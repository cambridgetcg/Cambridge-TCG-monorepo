/**
 * Shape of the usage analysis — where each foundation token and
 * primitive class is consumed across the widget codebase.
 */
export interface FileReference {
  /** Source-relative path of the file (e.g. `assets/raffles.css`). */
  path: string;
  /** 1-indexed line number where the reference occurs. */
  line: number;
}

export interface UsageReport {
  /** Token name → every reference site (one entry per occurrence). */
  tokens: Map<string, FileReference[]>;
  /** Primitive class name → every reference site. */
  primitives: Map<string, FileReference[]>;
  /** Registry tokens not referenced by any scanned file. */
  unusedTokens: string[];
  /** Registry primitives not referenced by any scanned file. */
  unusedPrimitives: string[];
  /** Number of source files scanned. */
  filesScanned: number;
}

export interface ScannedFile {
  /** Display path used in `FileReference.path`. */
  path: string;
  /** Raw file contents. */
  content: string;
}
