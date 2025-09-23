import type {
  Field,
  ColumnMetadata,
} from "@aws-sdk/client-rds-data";

type SqlValue =
  | string
  | number
  | boolean
  | Date
  | Buffer
  | null;

export function marshal(value: SqlValue) {
  if (value === null || value === undefined) return { isNull: true };
  if (Buffer.isBuffer(value)) return { blobValue: value };
  if (value instanceof Date) return { stringValue: value.toISOString() };
  switch (typeof value) {
    case "string":
      return { stringValue: value };
    case "number":
      // Use double to be safe (Data API maps to numeric/double)
      return Number.isInteger(value) ? { longValue: value } : { doubleValue: value };
    case "boolean":
      return { booleanValue: value };
    default:
      return { stringValue: String(value) };
  }
}

export function unmarshalRows<T = any>(
  records: Field[][] | undefined,
  cols: ColumnMetadata[] | undefined
): T[] {
  if (!records || !cols) return [];
  const colNames = cols.map((c) => c.name || "col");
  return records.map((row) => {
    const obj: any = {};
    row.forEach((f, i) => {
      obj[colNames[i]] = fieldToJs(f);
    });
    return obj as T;
  });
}

function fieldToJs(f: Field): any {
  if (f.isNull) return null;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.longValue !== undefined) return Number(f.longValue);
  if (f.doubleValue !== undefined) return Number(f.doubleValue);
  if (f.booleanValue !== undefined) return Boolean(f.booleanValue);
  if (f.blobValue !== undefined) return Buffer.from(f.blobValue as Uint8Array);
  if (f.arrayValue) {
    const arr = f.arrayValue;
    if (arr.stringValues) return arr.stringValues;
    if (arr.longValues) return arr.longValues.map(Number);
    if (arr.doubleValues) return arr.doubleValues.map(Number);
    if (arr.booleanValues) return arr.booleanValues.map(Boolean);
    if (arr.arrayValues) return arr.arrayValues.map(fieldToJs);
  }
  return null;
}