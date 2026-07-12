/** Strict owner-only portable archive projection. */

export interface PortablePassportSourceRow {
  sku: string;
  condition: string;
  quantity: number;
  acquisition_price: string | null;
  acquired_at: string | null;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  public_label: string | null;
  public_story: string | null;
  passport_public: boolean | null;
}

export interface PortablePassportHolding {
  sku: string;
  condition: string;
  quantity: number;
  acquisition_price_recorded: {
    amount: string;
    currency: null;
    provenance: "legacy-derived-cost-basis-estimate";
  } | null;
  acquired_at: string | null;
  private_notes: string | null;
  recorded_at: string;
  updated_at: string;
  passport: {
    collector_label: string | null;
    collector_story: string | null;
    publication_selected: boolean;
  };
}

export function toPortablePassportHoldings(
  rows: PortablePassportSourceRow[],
): PortablePassportHolding[] {
  return rows.map((row) => {
    if (
      typeof row.sku !== "string" || !row.sku || row.sku.length > 60 ||
      typeof row.condition !== "string" || !row.condition || row.condition.length > 10 ||
      !Number.isSafeInteger(row.quantity)
    ) {
      throw new Error("Collector Passport archive row is invalid.");
    }
    return {
      sku: row.sku,
      condition: row.condition,
      quantity: row.quantity,
      acquisition_price_recorded: row.acquisition_price == null
        ? null
        : {
            amount: boundedNullable(row.acquisition_price, 32) as string,
            currency: null,
            provenance: "legacy-derived-cost-basis-estimate",
          },
      acquired_at: dateOnly(row.acquired_at),
      // Legacy notes were accepted as unconstrained TEXT. Portability must not
      // turn a long, valid owner record into a failed whole-account export.
      private_notes: nullableText(row.notes),
      recorded_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
      passport: {
        collector_label: boundedNullable(row.public_label, 120),
        collector_story: boundedNullable(row.public_story, 500),
        publication_selected: row.passport_public === true,
      },
    };
  });
}

function nullableText(value: string | null): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("Collector Passport archive text is invalid.");
  return value;
}

function boundedNullable(value: string | null, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > max) {
    throw new Error("Collector Passport archive text is invalid.");
  }
  return value;
}

function dateOnly(value: string | null): string | null {
  if (value == null) return null;
  const date = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Collector Passport archive date is invalid.");
  }
  return date;
}

function iso(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Collector Passport archive timestamp is invalid.");
  }
  return parsed.toISOString();
}
