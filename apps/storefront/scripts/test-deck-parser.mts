// Unit test for the bulk-import parser.

const { parseDeckList } = await import("../src/components/deck-builder/BulkImport");

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

// 1) Standard MTGA-style
{
  const r = parseDeckList(`4 OP01-001\n4 OP01-002\n2 OP01-003`);
  assert(r.entries.length === 3, "standard: 3 entries");
  assert(r.entries[0].quantity === 4 && r.entries[0].cardNumber === "OP01-001", "standard: first parsed");
  assert(r.warnings.length === 0, "standard: no warnings");
}

// 2) With "4x" prefix and trailing names
{
  const r = parseDeckList(`4x OP01-006 Nami\n2x OP01-013 Portgas D. Ace`);
  assert(r.entries.length === 2, "x-prefix: 2 entries");
  assert(r.entries[0].quantity === 4, "x-prefix: quantity 4");
  assert(r.entries[0].cardNumber === "OP01-006", "x-prefix: number");
}

// 3) Leader line
{
  const r = parseDeckList(`Leader: OP01-001 Luffy\n4 OP01-006 Nami`);
  assert(r.entries.length === 2, "leader: 2 entries");
  assert(r.entries[0].isLeader, "leader: first marked");
  assert(!r.entries[1].isLeader, "leader: second not marked");
  assert(r.entries[0].cardNumber === "OP01-001", "leader: number captured");
}

// 4) Comments + blank lines
{
  const r = parseDeckList(`// My deck\n\n# Another comment\n4 OP01-001\n`);
  assert(r.entries.length === 1, "comments: ignored");
}

// 5) Trailing quantity
{
  const r = parseDeckList(`OP01-001 x4\nOP02-050 4`);
  assert(r.entries.length === 2, "trailing qty: 2 entries");
  assert(r.entries[0].quantity === 4, "trailing qty: 4");
  assert(r.entries[1].cardNumber === "OP02-050", "trailing qty: different set");
}

// 6) Bare card number = 1 copy
{
  const r = parseDeckList(`OP01-001`);
  assert(r.entries.length === 1, "bare: 1 entry");
  assert(r.entries[0].quantity === 1, "bare: default qty 1");
}

// 7) Unparseable line → warning
{
  const r = parseDeckList(`this is garbage\n4 OP01-001`);
  assert(r.entries.length === 1, "garbage + real: real parsed");
  assert(r.warnings.length === 1, "garbage: warning raised");
}

// 8) Different prefixes (EB, ST, PRB, etc.)
{
  const r = parseDeckList(`4 EB01-002\n1 ST01-001\n3 PRB01-100\n2 P-001`);
  assert(r.entries.length === 4, "prefixes: 4 parsed");
  assert(r.entries.map((e) => e.cardNumber).join(",") === "EB01-002,ST01-001,PRB01-100,P-001", "prefixes: all kinds work");
}

// 9) Mixed case → normalized
{
  const r = parseDeckList(`4 op01-001`);
  assert(r.entries[0].cardNumber === "OP01-001", "mixed case: uppercased");
}

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
