// Unit test for the portfolio CSV parser.
const { parseCsv } = await import("../src/components/portfolio/CsvImport");

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

// 1) Header-driven (canonical case)
{
  const r = parseCsv(`sku,quantity,condition,acquisition_price,acquired_at\nOP01-001,4,NM,12.50,2026-03-01\nOP01-013,1,LP,40,2026-04-15`);
  assert(r.rows.length === 2, "header: 2 rows");
  assert(r.rows[0].sku === "OP01-001", "header: sku uppercased + captured");
  assert(r.rows[0].quantity === 4, "header: qty");
  assert(r.rows[0].condition === "NM", "header: condition");
  assert(r.rows[0].acquisitionPrice === 12.5, "header: price");
  assert(r.rows[0].acquiredAt === "2026-03-01", "header: date");
  assert(r.warnings.length === 0, "header: no warnings");
}

// 2) Positional (no header)
{
  const r = parseCsv(`OP01-001,4,NM,12.50,2026-03-01\nOP01-013,1,LP,40,2026-04-15`);
  assert(r.rows.length === 2, "positional: 2 rows");
  assert(r.rows[1].sku === "OP01-013" && r.rows[1].quantity === 1, "positional: fields");
}

// 3) Column aliases
{
  const r = parseCsv(`SKU,qty,cond,price,date,note\nOP01-001,2,NM,,,nice`);
  assert(r.rows.length === 1, "aliases: parsed");
  assert(r.rows[0].quantity === 2, "aliases: qty → quantity");
  assert(r.rows[0].notes === "nice", "aliases: note → notes");
  assert(r.rows[0].acquisitionPrice === null, "aliases: missing price = null");
  assert(r.rows[0].acquiredAt === null, "aliases: missing date = null");
}

// 4) Currency symbols stripped from price
{
  // Note: third row uses "1,200.00" — that's a legit CSV cell using the
  // quoting to survive the comma inside. Without quotes the splitter would
  // treat it as two cells.
  const r = parseCsv(`sku,quantity,price\nOP01-001,1,£12.50\nOP01-002,1,$40\nOP01-003,1,"1,200.00"`);
  assert(r.rows[0].acquisitionPrice === 12.5, "£ stripped");
  assert(r.rows[1].acquisitionPrice === 40, "$ stripped");
  assert(r.rows[2].acquisitionPrice === 1200, "commas stripped from quoted price");
}

// 5) Bad date → warning + null
{
  const r = parseCsv(`sku,quantity,date\nOP01-001,1,15/03/2026`);
  assert(r.rows[0].acquiredAt === null, "bad date → null");
  assert(r.warnings.length === 1, "bad date → 1 warning");
}

// 6) Unknown condition → warning + NM fallback
{
  const r = parseCsv(`sku,quantity,condition\nOP01-001,1,TERRIBLE`);
  assert(r.rows[0].condition === "NM", "unknown condition → NM");
  assert(r.warnings.some((w) => w.includes("TERRIBLE")), "warning mentions the bad value");
}

// 7) Missing quantity → skip + warning
{
  const r = parseCsv(`sku,quantity\nOP01-001,0\nOP01-002,`);
  assert(r.rows.length === 0, "zero + empty quantity: both skipped");
  assert(r.warnings.length === 2, "2 warnings raised");
}

// 8) Quoted fields with commas
{
  const r = parseCsv(`sku,quantity,notes\nOP01-001,1,"bought at shop, autographed"`);
  assert(r.rows[0].notes === "bought at shop, autographed", "quoted comma preserved");
}

// 9) Empty input
{
  const r = parseCsv("");
  assert(r.rows.length === 0, "empty: 0 rows");
  assert(r.warnings.length === 0, "empty: 0 warnings");
}

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
