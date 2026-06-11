#!/usr/bin/env tsx
/**
 *   npm run arch:list      print module table (name, files, imports)
 *   npm run arch:graph     print "consumer → canonical" edges
 *   npm run arch:diagram   print Mermaid diagram
 *   npm run arch:validate  fail on any pattern violation
 */
import { discoverArchitecture, validate, mermaid } from "./index";

const cmd = process.argv[2];

if (cmd === "list") {
  const arch = discoverArchitecture();
  console.log(`\n${arch.modules.length} module(s):\n`);
  for (const m of arch.modules) {
    const tags = [
      m.hasReadme ? "" : "no-readme",
      m.hasIndex ? "" : "no-index",
      m.hasTest ? "" : "no-test",
    ].filter(Boolean);
    const tagStr = tags.length ? ` ${tags.map((t) => `(${t})`).join(" ")}` : "";
    console.log(`  ${m.name.padEnd(22)} ${m.files.length} files · imports: [${m.imports.join(", ")}]${tagStr}`);
  }
  process.exit(0);
}

if (cmd === "graph") {
  const arch = discoverArchitecture();
  console.log("");
  for (const m of arch.modules) {
    if (m.imports.length === 0) {
      console.log(`  ${m.name.padEnd(22)} (foundation — no upstream)`);
    } else {
      console.log(`  ${m.name.padEnd(22)} → ${m.imports.join(", ")}`);
    }
  }
  console.log("");
  console.log("Reverse:");
  for (const [name, consumers] of Object.entries(arch.importedBy)) {
    console.log(`  ${name.padEnd(22)} ← ${consumers.join(", ")}`);
  }
  process.exit(0);
}

if (cmd === "diagram") {
  const arch = discoverArchitecture();
  console.log("```mermaid");
  process.stdout.write(mermaid(arch));
  console.log("```");
  process.exit(0);
}

if (cmd === "validate") {
  const arch = discoverArchitecture();
  const issues = validate(arch);
  if (issues.length === 0) {
    console.log(`✓ All ${arch.modules.length} modules follow the pattern`);
    process.exit(0);
  }
  console.error(`✗ ${issues.length} pattern violation(s):\n`);
  for (const i of issues) {
    console.error(`  [${i.type.padEnd(15)}] ${i.module}: ${i.detail}`);
  }
  process.exit(1);
}

console.error(`Usage: arch list | graph | diagram | validate`);
process.exit(1);
