import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { discoverMigrations, runMigrations } from "../src/migrations.js";

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

describe("SQL migration runner", () => {
  it("discovers ordered files and calculates stable checksums", async () => {
    const directory = await migrationDirectory({
      "0002_second.sql": "SELECT 2;\n",
      "0001_first.sql": "SELECT 1;\n",
    });

    const migrations = await discoverMigrations(directory);
    expect(migrations.map((migration) => migration.version)).toEqual([
      "0001_first",
      "0002_second",
    ]);
    expect(migrations[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
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
    );

    expect(result.applied).toEqual(["0001_whole"]);
    expect(query.mock.calls.filter(([sql]) => sql === wholeFile)).toHaveLength(1);
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

  it("rejects SQL files outside the versioned naming convention", async () => {
    const directory = await migrationDirectory({ "latest.sql": "SELECT 1;" });
    await expect(discoverMigrations(directory)).rejects.toThrow(
      "Invalid migration filename",
    );
  });
});
