import type {
  PublishedPassportRow,
  PublicCollectorPassport,
} from "./types";

const COLLECTOR_PASSPORT_PUBLIC_ORIGIN = "https://cambridgetcg.com";

export function collectorPassportPublicUrl(path: string): string {
  if (!/^\/[a-z0-9_?=&/%-]*$/i.test(path) || path.startsWith("//")) {
    throw new Error("Collector Passport public path is invalid.");
  }
  return `${COLLECTOR_PASSPORT_PUBLIC_ORIGIN}${path}`;
}

function requiredText(label: string, value: unknown, max: number): string {
  if (typeof value !== "string") {
    throw new Error(`Collector Passport ${label} is invalid.`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) {
    throw new Error(`Collector Passport ${label} is invalid.`);
  }
  return trimmed;
}

function optionalText(label: string, value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`Collector Passport ${label} is invalid.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new Error(`Collector Passport ${label} is invalid.`);
  }
  return trimmed;
}

function iso(label: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(`Collector Passport ${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Collector Passport ${label} is invalid.`);
  }
  return parsed.toISOString();
}

/**
 * The only public projection for Collector Passport.
 *
 * Callers must pass rows selected with the narrow PublishedPassportRow query.
 * Every returned property is named here; object spreading is deliberately
 * forbidden so a later private/catalog column cannot cross accidentally.
 */
export function toPublicCollectorPassport(
  rows: PublishedPassportRow[],
): PublicCollectorPassport | null {
  if (rows.length === 0) return null;

  const username = requiredText("username", rows[0].username, 30);
  const items = rows.map((row) => {
    if (row.username !== rows[0].username) {
      throw new Error("Collector Passport rows belong to different collectors.");
    }
    if (!Number.isSafeInteger(row.display_order) || row.display_order < 0) {
      throw new Error("Collector Passport display order is invalid.");
    }
    return {
      public_id: requiredText("public id", row.public_id, 36),
      label: requiredText("label", row.public_label, 120),
      story: optionalText("story", row.public_story, 500),
      display_order: row.display_order,
      published_at: iso("published time", row.passport_published_at),
      updated_at: iso("updated time", row.updated_at),
    };
  });

  return {
    username,
    status: "self_attested_unverified",
    published_item_count: items.length,
    items,
  };
}
