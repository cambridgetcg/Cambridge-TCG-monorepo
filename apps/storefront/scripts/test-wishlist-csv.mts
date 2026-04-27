// Unit test for the wishlist CSV parser.
const { parseWishlistCsv } = await import("../src/components/wishlist/CsvImport");

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

{
  const r = parseWishlistCsv(`sku,max_price,condition_min\nOP01-120,30.00,NM\nOP01-013,40.00,LP`);
  assert(r.rows.length === 2, "header: 2 rows");
  assert(r.rows[0].sku === "OP01-120", "header: sku uppercased");
  assert(r.rows[0].maxPrice === 30, "header: price");
  assert(r.rows[0].conditionMin === "NM", "header: condition");
}

{
  const r = parseWishlistCsv(`OP01-120,30,NM\nOP01-013,40,LP`);
  assert(r.rows.length === 2, "positional: 2 rows");
  assert(r.rows[1].conditionMin === "LP", "positional: condition");
}

{
  const r = parseWishlistCsv(`SKU,price,cond\nOP01-120,£30,NM`);
  assert(r.rows[0].maxPrice === 30, "aliases: price + £ stripped");
  assert(r.rows[0].conditionMin === "NM", "aliases: cond → condition_min");
}

{
  const r = parseWishlistCsv(`sku,max_price,notes\nOP01-120,30,"bought similar for £25"`);
  assert(r.rows[0].notes === "bought similar for £25", "quoted notes preserved");
}

{
  const r = parseWishlistCsv(`sku,cond\nOP01-120,BAD`);
  assert(r.rows[0].conditionMin === "NM", "unknown condition → NM");
  assert(r.warnings.some((w) => w.includes("BAD")), "warning mentions bad condition");
}

{
  const r = parseWishlistCsv("");
  assert(r.rows.length === 0 && r.warnings.length === 0, "empty: clean");
}

{
  const r = parseWishlistCsv(`sku,max_price\nOP01-120,`);
  assert(r.rows[0].maxPrice === null, "empty max_price → null");
}

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
