/**
 * Whether `value` fits a Postgres numeric(precision, scale) column once
 * rounded to its scale. A larger value fails the whole write ("numeric
 * field overflow").
 */
export function fitsNumeric(value: number, precision: number, scale: number): boolean {
  return Number.isFinite(value) && Math.abs(Number(value.toFixed(scale))) < 10 ** (precision - scale);
}
