/**
 * Pure: render an `Architecture` as a Mermaid `graph LR` diagram.
 *
 * Modules with no incoming imports are rendered first (foundations);
 * modules with no outgoing imports are rendered last (consumers /
 * top of stack). Edges go consumer → canonical (so arrows point
 * "down the stack" in the Mermaid output).
 */
import type { Architecture } from "./types";

export function mermaid(arch: Architecture): string {
  const lines: string[] = [];
  lines.push("graph LR");
  lines.push("");
  for (const m of arch.modules) {
    lines.push(`  ${nodeId(m.name)}["${m.name}"]`);
  }
  lines.push("");
  for (const m of arch.modules) {
    for (const dep of m.imports) {
      lines.push(`  ${nodeId(m.name)} --> ${nodeId(dep)}`);
    }
  }
  return lines.join("\n") + "\n";
}

function nodeId(name: string): string {
  // Mermaid doesn't allow hyphens in unquoted node IDs.
  return name.replace(/-/g, "_");
}
