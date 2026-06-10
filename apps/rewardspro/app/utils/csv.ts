export const encoder = new TextEncoder();

export function csvHeader(cols: string[]) {
  return encoder.encode(cols.join(",") + "\n");
}

export function csvRow(obj: Record<string, any>, cols: string[]) {
  const vals = cols.map((c) => stringify(obj[c]));
  return encoder.encode(vals.join(",") + "\n");
}

function stringify(v: any) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  // escape CSV
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}