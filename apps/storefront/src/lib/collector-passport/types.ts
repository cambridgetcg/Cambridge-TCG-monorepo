export const COLLECTOR_PASSPORT_NOTICE_VERSION =
  "collector-passport-v1-2026-07-12";

export const COLLECTOR_PASSPORT_MAX_PUBLISHED = 12;
export const COLLECTOR_PASSPORT_LABEL_MAX = 120;
export const COLLECTOR_PASSPORT_STORY_MAX = 500;

export interface OwnerPassportItem {
  /** Private database key. Never include this object in a public response. */
  showcase_id: string;
  /** Private portfolio join key. Never include this object in a public response. */
  portfolio_card_id: string;
  display_order: number;
  caption: string | null;
  public_label: string | null;
  public_story: string | null;
  passport_public: boolean;
  /** True only when selected under the currently accepted notice. */
  passport_current: boolean;
  passport_published_at: string | null;
  passport_notice_version: string | null;
  /** Owner-only context. These mixed-lineage fields are never projected. */
  private_card: {
    card_name: string | null;
    set_name: string | null;
    image_url: string | null;
  };
}

export interface OwnerPassport {
  profile_public: boolean;
  notice_version: string;
  max_published: number;
  published_count: number;
  items: OwnerPassportItem[];
}

/** Narrow database row used by the public boundary. It intentionally cannot
 * carry portfolio or catalog fields. */
export interface PublishedPassportRow {
  username: string;
  public_id: string;
  public_label: string;
  public_story: string | null;
  display_order: number;
  passport_published_at: string;
  updated_at: string;
}

export interface PublicPassportItem {
  public_id: string;
  label: string;
  story: string | null;
  display_order: number;
  published_at: string;
  updated_at: string;
}

export interface PublicCollectorPassport {
  username: string;
  status: "self_attested_unverified";
  published_item_count: number;
  items: PublicPassportItem[];
}

export type PassportMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404 | 409; code: string; reason: string };
