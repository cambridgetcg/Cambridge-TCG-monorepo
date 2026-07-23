import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  discoverMigrationPlan,
  discoverMigrations,
  runMigrations,
} from "../src/migrations.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

async function migrationDirectory(
  files: Record<string, string>,
): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "rp-migrations-"));
  temporaryDirectories.push(directory);
  await Promise.all(
    Object.entries(files).map(([filename, contents]) =>
      writeFile(path.join(directory, filename), contents),
    ),
  );
  return directory;
}

async function yutabaseMigrationDirectory(): Promise<string> {
  return migrationDirectory({
    "0001_yu_core.sql": "SELECT 'yu-core';\n",
    "0002_starter_lexicon.sql": "SELECT 'yu-lexicon';\n",
    "0004_candidate_hardening.sql": "SELECT 'yu-hardening';\n",
  });
}

describe("SQL migration runner", () => {
  it("discovers ordered files and calculates stable checksums", async () => {
    const directory = await migrationDirectory({
      "0002_second.sql": "SELECT 2;\n",
      "0001_first.sql": "SELECT 1;\n",
    });

    const migrations = await discoverMigrations(directory);
    expect(migrations.map((migration) => migration.version)).toEqual([
      "rewardspro/0001_first",
      "rewardspro/0002_second",
    ]);
    expect(migrations[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("runs pinned YUTABASE source before namespaced app migrations", async () => {
    const appDirectory = await migrationDirectory({
      "0001_app.sql": "SELECT 'app';\n",
    });
    const upstreamDirectory = await yutabaseMigrationDirectory();

    const plan = await discoverMigrationPlan(
      appDirectory,
      upstreamDirectory,
    );

    expect(plan.map((migration) => migration.version)).toEqual([
      "yutabase@0.1.0-candidate.2/0001_yu_core",
      "yutabase@0.1.0-candidate.2/0002_starter_lexicon",
      "yutabase@0.1.0-candidate.2/0004_candidate_hardening",
      "rewardspro/0001_app",
    ]);
  });

  it("executes each complete SQL file without statement splitting", async () => {
    const wholeFile = `
CREATE FUNCTION example() RETURNS void AS $$
BEGIN
  PERFORM 1;
  PERFORM 2;
END;
$$ LANGUAGE plpgsql;
`;
    const directory = await migrationDirectory({ "0001_whole.sql": wholeFile });
    const upstreamDirectory = await yutabaseMigrationDirectory();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT checksum_sha256")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const release = vi.fn();

    const result = await runMigrations(
      {
        connect: vi.fn(async () => ({ query, release })),
      } as never,
      directory,
      upstreamDirectory,
    );

    expect(result.applied).toEqual([
      "yutabase@0.1.0-candidate.2/0001_yu_core",
      "yutabase@0.1.0-candidate.2/0002_starter_lexicon",
      "yutabase@0.1.0-candidate.2/0004_candidate_hardening",
      "rewardspro/0001_whole",
    ]);
    expect(query.mock.calls.filter(([sql]) => sql === wholeFile)).toHaveLength(1);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes(
          "INSERT INTO public.rp_schema_migration",
        ),
      ),
    ).toBe(true);
    expect(query).toHaveBeenCalledWith("BEGIN");
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("refuses a changed migration checksum", async () => {
    const directory = await migrationDirectory({
      "0001_fixed.sql": "SELECT 1;\n",
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT checksum_sha256")) {
        return { rows: [{ checksum_sha256: "0".repeat(64) }] };
      }
      return { rows: [] };
    });

    await expect(
      runMigrations(
        {
          connect: vi.fn(async () => ({ query, release: vi.fn() })),
        } as never,
        directory,
      ),
    ).rejects.toThrow("Migration checksum mismatch");
    expect(query).not.toHaveBeenCalledWith("BEGIN");
  });

  it("refuses a pre-namespaced migration ledger before applying upstream SQL", async () => {
    const directory = await migrationDirectory({
      "0001_fixed.sql": "SELECT 1;\n",
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("AS ledger_exists")) {
        return {
          rows: [
            {
              app_objects_exist: true,
              ledger_exists: true,
              legacy_event_table_exists: true,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      runMigrations(
        {
          connect: vi.fn(async () => ({ query, release: vi.fn() })),
        } as never,
        directory,
      ),
    ).rejects.toThrow("Legacy RewardsPro event table detected");
    expect(query).not.toHaveBeenCalledWith("BEGIN");
  });

  it("refuses app objects without the namespaced migration ledger", async () => {
    const directory = await migrationDirectory({
      "0001_fixed.sql": "SELECT 1;\n",
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("AS ledger_exists")) {
        return {
          rows: [
            {
              app_objects_exist: true,
              ledger_exists: false,
              legacy_event_table_exists: false,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      runMigrations(
        {
          connect: vi.fn(async () => ({ query, release: vi.fn() })),
        } as never,
        directory,
      ),
    ).rejects.toThrow("schema and namespaced migration ledger disagree");
    expect(query).not.toHaveBeenCalledWith("BEGIN");
  });

  it("rejects SQL files outside the versioned naming convention", async () => {
    const directory = await migrationDirectory({ "latest.sql": "SELECT 1;" });
    await expect(discoverMigrations(directory)).rejects.toThrow(
      "Invalid migration filename",
    );
  });
});
