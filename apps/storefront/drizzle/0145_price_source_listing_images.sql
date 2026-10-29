-- Where each CardRush listing's own image lives on CardRush, so /prices can
-- show it beside the listing's price and a person or an agent can check the
-- item (Yu, 2026-10-29: "Also would be great to have images linked to each
-- item (official or use cardrush) so that humans and agents can double
-- confirm the item."). The rule is the agents' reading of those words, in
-- docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md: a
-- CardRush image is linked at CardRush's own URL, credited and linked to the
-- listing, and Cambridge never copies, mirrors, re-hosts, proxies or caches
-- it. It is display only, like CardRush's prices: no member API, download or
-- /api/v1/market/* route reads this table.
--
-- A row is a link record, not evidence and not a copy. It holds a URL the
-- listing's page declared (its og:image) when the collector read that page
-- for a price, and the digest of that page (artifact_sha256); it holds no
-- image bytes, and nothing here says what the image shows. The CardRush
-- collector (lib/datafeed/listing-images.ts) upserts one row per listing
-- whose observation its run wrote: a changed image_url replaces the URL and
-- moves last_seen_at on, and first_seen_at stays the first sighting.
--
-- Takedown: setting withdrawn_at stops Cambridge linking the image. Readers
-- filter withdrawn_at IS NULL, the collector never touches a withdrawn row,
-- and the guard below keeps a withdrawal from being cleared or moved. Deleting
-- the row is the way back, after which the next read of the page links it
-- again. No row is written here, and no collector runs from this migration.
CREATE TABLE price_source_listing_images (
  source text NOT NULL REFERENCES member_price_source_releases(source) CHECK (source IN ('cardrush')),
  -- The observation's own key: host-qualified, as the collector writes it.
  source_product_id text NOT NULL
    CHECK (source_product_id ~ '^www\.cardrush-(op|pokemon|db|digimon|vanguard|bs)\.jp/product/[1-9][0-9]{0,9}$'),
  -- On the listing's own host, under that host's own directory (cardrush-op,
  -- cardrushpokemon, cardrush-db: the hyphen varies), then /_/ and the hex of
  -- a product/ path; https, no query, at most 512 characters. The same shape
  -- cardRushListingImageUrl (packages/data-ingest/src/cardrush/member-prices.ts)
  -- accepts.
  image_url text NOT NULL
    CHECK (char_length(image_url) <= 512
      AND image_url ~ '^https://www\.cardrush-(op|pokemon|db|digimon|vanguard|bs)\.jp/data/cardrush-?[a-z]+/_/70726f647563742f([0-9a-f]{2})+\.(jpg|jpeg|png|webp)$'),
  listing_url text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  withdrawn_at timestamptz,
  PRIMARY KEY (source, source_product_id),
  CHECK (listing_url = 'https://' || source_product_id),
  CHECK (split_part(image_url, '/', 3) = split_part(source_product_id, '/', 1)
    AND replace(split_part(image_url, '/', 5), '-', '') = replace(split_part(split_part(source_product_id, '/', 1), '.', 2), '-', '')),
  -- Forward-only, as the observations are (0139): no page read before the
  -- permission of 2026-10-28 is a sighting.
  CHECK (first_seen_at >= timestamptz '2026-10-28T00:00:00Z'),
  CHECK (last_seen_at >= first_seen_at),
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= first_seen_at)
);

-- A link keeps its listing and its first sighting, and its last sighting
-- moves only forward. A withdrawal stands: once withdrawn_at is set, no
-- update clears or moves it.
CREATE FUNCTION price_source_listing_image_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source <> OLD.source OR NEW.source_product_id <> OLD.source_product_id
     OR NEW.first_seen_at <> OLD.first_seen_at OR NEW.last_seen_at < OLD.last_seen_at THEN
    RAISE EXCEPTION 'a listing image link keeps its listing and first sighting, and its last sighting only moves forward';
  END IF;
  IF OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at THEN
    RAISE EXCEPTION 'a withdrawn listing image stays withdrawn; delete the row to link it again';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER price_source_listing_image_guard BEFORE UPDATE ON price_source_listing_images
  FOR EACH ROW EXECUTE FUNCTION price_source_listing_image_guard();
