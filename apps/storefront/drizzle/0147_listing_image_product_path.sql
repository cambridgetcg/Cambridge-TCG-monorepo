-- A CardRush listing's og:image takes the plain product/ form: on
-- 2026-10-30 a live listing page declared
-- https://www.cardrush-op.jp/data/cardrush-op/product/_ST06_16.jpg. 0145
-- allowed only the /_/<hex of a product/ path> form (the resized copies
-- listing pages show), so the collector recorded no link at all: its first
-- live run (2026-10-30 12:15 UTC) wrote 101 observations and no image link.
-- packages/data-ingest/src/cardrush/member-prices.ts (cardRushListingImageUrl)
-- now accepts both forms, and this widens the matching CHECK to the same two.
--
-- Nothing else changes: the URL stays https, on the listing's own host, under
-- that host's directory (the 0145 check on split_part 3 and 5 still applies),
-- with one plain file name (no further path), an image type and at most 512
-- characters. Still a link record, never a copy. No row is written here.
ALTER TABLE price_source_listing_images
  DROP CONSTRAINT price_source_listing_images_image_url_check,
  ADD CONSTRAINT price_source_listing_images_image_url_check
    CHECK (char_length(image_url) <= 512
      AND image_url ~ '^https://www\.cardrush-(op|pokemon|db|digimon|vanguard|bs)\.jp/data/cardrush-?[a-z]+/(product/[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}|_/70726f647563742f([0-9a-f]{2})+)\.(jpg|jpeg|png|webp)$');
