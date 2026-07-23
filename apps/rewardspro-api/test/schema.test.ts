import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("initial schema invariants", () => {
  it("separates immutable cards, deletable payloads, and mutable state", async () => {
    const sql = await readFile(
      new URL("../migrations/0001_commerce_event_foundation.sql", import.meta.url),
      "utf8",
    );

    expect(sql).toContain("UNIQUE (commerce_connection_id, external_event_id)");
    expect(sql).toContain("CREATE TABLE commerce.events");
    expect(sql).toContain("CREATE TABLE commerce.event_payloads");
    expect(sql).toContain("CREATE TABLE public.rp_commerce_event_state");
    expect(sql).not.toContain("CREATE TABLE rp_commerce_event (");
    expect(sql).toContain("retention_until = stored_at + interval '30 days'");
    expect(sql).toContain("commerce_events_immutable");
    expect(sql).toContain("capabilities jsonb");
    expect(sql).toContain("sync_cursor jsonb");
    expect(sql).toContain("credential_reference text");
    expect(sql).toMatch(/^SET LOCAL search_path = pg_catalog;/);
  });

  it("exposes only the narrow security-definer ingest capability", async () => {
    const sql = await readFile(
      new URL("../migrations/0001_commerce_event_foundation.sql", import.meta.url),
      "utf8",
    );

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.rp_ingest_shopify_event(",
    );
    expect(sql).toContain("$$ LANGUAGE plpgsql SECURITY DEFINER");
    expect(sql).toContain("SET search_path = pg_catalog");
    expect(sql).toContain("SET row_security = off");
    expect(sql).toContain(
      "FROM PUBLIC, yu_reader, yu_writer, yu_lexicographer",
    );
  });

  it("registers computed decks and names their YUTABASE relations", async () => {
    const sql = await readFile(
      new URL("../migrations/0001_commerce_event_foundation.sql", import.meta.url),
      "utf8",
    );

    expect(sql).toContain("CREATE TABLE commerce.orders");
    expect(sql).toContain("CREATE TABLE commerce.line_items");
    expect(sql).toContain("INSERT INTO yu.registry");
    expect(sql).toContain("'derived_from'");
    expect(sql).toContain("UPDATE yu.lexicon");
    expect(sql).toContain("WHERE word = 'contains'");
    expect(sql).toContain("SELECT yu.refresh_via()");
    expect(sql.match(/EXECUTE FUNCTION yu\._guard_delete\(\)/g)).toHaveLength(3);
    expect(sql).toContain("WHERE word IN (");
    expect(sql).toContain("'submitted_by'");
    expect(sql).toContain("'refused_because'");
    expect(sql).toContain("rewardspro_projection_thread_scope");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION commerce._validate_projection_thread()");
  });
});
