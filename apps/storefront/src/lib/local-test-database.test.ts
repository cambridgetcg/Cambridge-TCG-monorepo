/**
 * The guard the test scripts import (scripts/lib/local-test-database.mjs):
 * which databases it accepts, what a run's environment holds, and how a script
 * cleans up when it fails. No database is needed here.
 */
import { spawnSync } from "node:child_process";
import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompatDb } from "@cambridge-tcg/db/compat";
import { readLocalTestDatabase } from "../../scripts/lib/local-test-database.mjs";

const HELPER = new URL("../../scripts/lib/local-test-database.mjs", import.meta.url).href;

/** Runs `body` as a script that has imported the helper, with only `env` set. */
function run(body: string, env: Record<string, string> = {}) {
  const source = `import { cleanUp, requireLocalTestDatabase } from ${JSON.stringify(HELPER)};\n${body}`;
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    encoding: "utf8",
    env: env as NodeJS.ProcessEnv,
  });
}

describe("which databases the test scripts may use", () => {
  it.each([
    ["postgres://u@127.0.0.1:5432/ctcg_test", "postgres://u@127.0.0.1:5432/ctcg_test"],
    ["postgresql://u:p.w~1@localhost/test", "postgres://u:p.w~1@127.0.0.1:5432/test"],
    ["postgres://127.0.0.1:05432/test-2", "postgres://127.0.0.1:5432/test-2"],
    [" postgres://u:@localhost:55987/product_flow_TEST_copy\n", "postgres://u:@127.0.0.1:55987/product_flow_TEST_copy"],
  ])("accepts %s", (raw, url) => {
    expect(readLocalTestDatabase(raw)).toEqual({ url });
  });

  it.each([
    undefined,
    "",
    "   ",
    "ctcg_test",
    "postgres://secretuser:fake@secrethost.example:5432/ctcg_test",
    "postgres://secretuser:fake@127.0.0.1/secretlive",
    "postgres://test@127.0.0.1/secretlive",
    "postgres://secretuser@127.0.0.1/latest",
    "postgres://secretuser@127.0.0.1/contest",
    "postgres://secretuser@127.0.0.1/testing",
    "postgres://secretuser@127.0.0.1/ctcg_test?host=secrethost.example",
    "postgres://secretuser@127.0.0.1/ctcg_test?sslmode=disable",
    "postgres://secretuser@127.0.0.1/ctcg_test?options=-c%20search_path%3Dsecret",
    "postgres://secretuser@127.0.0.1/ctcg_test?search_path=secret",
    "postgres://secretuser@127.0.0.1/ctcg_test#secret",
    "postgres://secretuser@127.0.0.1:5432,secrethost.example:5432/ctcg_test",
    "postgres://u:fake@secrethost.example:5432,localhost@127.0.0.1/ctcg_test",
    "postgres://secrethost.example:5432/x@127.0.0.1/ctcg_test",
    "postgres://secretuser@127.0.0.1%2Csecrethost.example/ctcg_test",
    "postgres://secretuser@%2Ftmp/ctcg_test",
    "postgres:///ctcg_test",
    "postgres://secretuser@/ctcg_test",
    "postgres://secretuser@127.0.0.1",
    "postgres://secretuser@127.0.0.1/",
    "socket:/tmp?db=ctcg_test",
    "/tmp ctcg_test",
    "postgres://secretuser@[::1]:5432/ctcg_test",
    "postgres://secretuser@[::ffff:10.0.0.5]/ctcg_test",
    "postgres://secretuser@0.0.0.0/ctcg_test",
    "postgres://secretuser@127.0.0.2/ctcg_test",
    "postgres://secretuser@2130706433/ctcg_test",
    "postgres://secretuser@127x0x0x1/ctcg_test",
    "postgres://secretuser@localhost.secrethost.example/ctcg_test",
    "postgres://secretuser@LOCALHOST/ctcg_test",
    "postgres://secretuser@localhost./ctcg_test",
    `postgres://secretuser@127.0.0.1/${"x".repeat(59)}_test`, // 64 characters; the server cuts a name at 63
    "postgres://secretuser@127.0.0.1/ctcg%5Ftest",
    "postgres://secretuser@127.0.0.1/secret%2F_test",
    "postgres://secret%40user@127.0.0.1/ctcg_test",
    "postgres://secretuser@127.0.0.1/ctcg_test/../secretlive",
    "postgres://secretuser@127.0.0.1//ctcg_test",
    "postgres://secretuser@127.0.0.1/ctcg_test\npostgres://secrethost.example/x",
    "postgres://secretuser@localhost\\@secrethost.example/ctcg_test",
    "postgres://secretuser@127.0.0.1:0/ctcg_test",
    "postgres://secretuser@127.0.0.1:70000/ctcg_test",
    "mysql://secretuser@127.0.0.1/ctcg_test",
    "https://secretuser@127.0.0.1/ctcg_test",
    "xpostgres://secretuser@127.0.0.1/ctcg_test",
  ])("refuses %j, saying why without repeating it", (raw) => {
    const { refusal, url } = readLocalTestDatabase(raw);
    expect(url).toBeUndefined();
    expect(refusal).toMatch(/^(DATABASE_URL is not|The database name must have)/);
    expect(refusal).not.toMatch(/secret|fake/);
  });

  describe("as the two drivers read it", () => {
    afterEach(() => vi.unstubAllEnvs());

    it.each([
      ["postgres://127.0.0.1/test", 5432, "test"],
      ["postgres://u:p@localhost:55987/ctcg_test", 55987, "ctcg_test"],
    ])("%s is one server and database, whatever PG* says", async (raw, port, database) => {
      for (const name of ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGSSLMODE"]) vi.stubEnv(name, "7777");
      const { url } = readLocalTestDatabase(raw);
      const client = new pg.Client({ connectionString: url });
      expect([client.host, client.port, client.database]).toEqual(["127.0.0.1", port, database]);
      const app = createCompatDb({ url });
      expect(app.client.options).toMatchObject({ host: ["127.0.0.1"], port: [port], database });
      await app.close();
    });
  });
});

describe("in a script", { timeout: 30_000 }, () => {
  it.each([
    ["is missing", {}],
    ["is not a local test one", { DATABASE_URL: "postgres://secretuser:fake@secrethost.example/ctcg_test" }],
  ])("stops before anything else runs when the database %s", (_, env) => {
    const result = run("requireLocalTestDatabase(); console.log('ran');", env);
    expect(result).toMatchObject({ status: 2, stdout: "" });
    expect(result.stderr).toMatch(/^Refusing to run: .*\nDATABASE_URL is not .*\nThe top of scripts\/lib\/local-test-database.mjs /);
    expect(result.stderr).not.toMatch(/secret|fake/);
    const stubbed = run("process.exit = () => {}; requireLocalTestDatabase(); console.log('ran');", env);
    expect(stubbed).toMatchObject({ status: 1, stdout: "" });
    expect(stubbed.stderr).not.toMatch(/secret|fake/);
  });

  it("leaves the process with its own settings and no other", () => {
    const result = run("const pool = requireLocalTestDatabase(); console.log(JSON.stringify([pool.options.connectionString, process.env]));", {
      DATABASE_URL: "postgres://u@localhost/ctcg_test",
      WHOLESALE_DATABASE_URL: "postgres://elsewhere.example/live",
      PGHOST: "elsewhere.example",
      AWS_ACCESS_KEY_ID: "leftover",
      STRIPE_SECRET_KEY: "leftover",
      NODE_ENV: "production",
      PATH: "/bin",
    });
    const url = "postgres://u@127.0.0.1:5432/ctcg_test";
    expect(JSON.parse(result.stdout)).toEqual([
      url,
      { DATABASE_URL: url, DB_IDLE_TIMEOUT_S: "1", WHOLESALE_API_URL: "http://127.0.0.1:9", NO_PROXY: "*", no_proxy: "*" },
    ]);
  });

  it("survives an idle connection being dropped", () => {
    const result = run("requireLocalTestDatabase().emit('error', new Error('dropped'));", { DATABASE_URL: "postgres://127.0.0.1/test" });
    expect(result).toMatchObject({ status: 0, stderr: "" });
  });

  const POOL = `const pool = {
    async query(sql, ids) { if (sql === "bad") throw new Error("row is referenced"); console.log(this === pool, sql, ids); },
    end: async () => console.log("pool closed"),
  };\n`;

  it("cleans up after a throw, closes the pool and still reports the throw", () => {
    const result = run(`${POOL}try { throw new Error("the real failure"); } finally { await cleanUp(pool, () => console.log("cleaned")); }`);
    expect(result).toMatchObject({ status: 1, stdout: "cleaned\npool closed\n" });
    expect(result.stderr).toMatch(/Error: the real failure/);
  });

  it("reports a failed step beside the failure that stopped the test, and still runs the others", () => {
    const result = run(
      `${POOL}try { throw new Error("the real failure"); } finally {
        await cleanUp(pool, () => { throw new Error("row is referenced"); }, async () => { throw "odd"; }, () => console.log("third step"));
      }`,
    );
    expect(result).toMatchObject({ status: 1, stdout: "third step\npool closed\n" });
    expect(result.stderr).toMatch(/^Cleanup failed, .*: row is referenced\nCleanup failed, .*: odd\n[^]*Error: the real failure/);
  });

  it("reports a failed query, and still runs the ones after it in the same step", () => {
    const result = run(`${POOL}await cleanUp(pool, async () => { for (const sql of ["first", "bad", "third"]) await pool.query(sql, 7); });`);
    expect(result).toMatchObject({ status: 1, stdout: "true first 7\ntrue third 7\npool closed\n" });
    expect(result.stderr).toMatch(/^Cleanup failed, .*: row is referenced\n$/);
  });

  it("fails a passing run whose cleanup failed, and passes one whose pool would not close", () => {
    const failed = run(`${POOL}await cleanUp(pool, async () => { throw new Error("row is referenced"); });`);
    expect(failed).toMatchObject({ status: 1, stdout: "pool closed\n" });
    expect(failed.stderr).toMatch(/^Cleanup failed, .*: row is referenced\n$/);
    expect(run(`${POOL}pool.end = async () => { throw new Error("closed twice"); }; await cleanUp(pool);`)).toMatchObject({ status: 0, stderr: "" });
  });

  it("lets a write nobody awaited land before it deletes", () => {
    const result = run(`${POOL}setTimeout(() => console.log("late row"), 100); await cleanUp(pool, () => console.log("cleaned"));`);
    expect(result).toMatchObject({ status: 0, stdout: "late row\ncleaned\npool closed\n" });
  });
});
