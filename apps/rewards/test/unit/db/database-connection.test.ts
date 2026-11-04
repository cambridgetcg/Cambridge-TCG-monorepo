import { X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import { databaseConnectionConfig } from "~/db/database-connection.server";
import { SUPABASE_ROOT_CA_2021 } from "~/db/database-tls.server";

// No password in a remote URL here (fixture rule); "decodes percent-encoded
// credentials" covers the password on a loopback URL.
const SUPABASE_URL =
  "postgresql://rewards_app.ref@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=rewards";

describe("bundled database CA", () => {
  it("is the Supabase Root 2021 CA (pinned fingerprint)", () => {
    const certificate = new X509Certificate(SUPABASE_ROOT_CA_2021);
    expect(certificate.subject).toContain("CN=Supabase Root 2021 CA");
    expect(certificate.fingerprint256).toBe(
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
    );
  });
});

describe("databaseConnectionConfig", () => {
  it("verifies TLS against the bundled CA for remote hosts", () => {
    const { pool } = databaseConnectionConfig(SUPABASE_URL);
    expect(pool.ssl).toEqual({
      ca: SUPABASE_ROOT_CA_2021,
      rejectUnauthorized: true,
      servername: "aws-0-eu-west-2.pooler.supabase.com",
    });
  });

  it("maps the Prisma URL parameters", () => {
    const { pool, schema } = databaseConnectionConfig(SUPABASE_URL);
    expect(schema).toBe("rewards");
    expect(pool).toMatchObject({
      host: "aws-0-eu-west-2.pooler.supabase.com",
      port: 6543,
      user: "rewards_app.ref",
      password: "",
      database: "postgres",
      max: 1,
    });
  });

  it("ignores sslmode so a URL cannot weaken verification", () => {
    const { pool } = databaseConnectionConfig(`${SUPABASE_URL}&sslmode=require`);
    expect(pool.ssl).toMatchObject({ rejectUnauthorized: true, ca: SUPABASE_ROOT_CA_2021 });
  });

  it("refuses sslmode=disable for a remote host", () => {
    expect(() => databaseConnectionConfig(`${SUPABASE_URL}&sslmode=disable`)).toThrow(/TLS is required/);
  });

  it("connects to loopback databases without TLS and defaults the schema", () => {
    const { pool, schema } = databaseConnectionConfig("postgresql://postgres@127.0.0.1:5432/rewards_test");
    expect(pool.ssl).toBe(false);
    expect(schema).toBe("public");
  });

  it("keeps a small pool with a short idle timeout unless the URL caps it", () => {
    const { pool } = databaseConnectionConfig("postgresql://postgres@127.0.0.1:5432/rewards_test");
    expect(pool.max).toBe(3);
    expect(pool.idleTimeoutMillis).toBe(5_000);
    expect(databaseConnectionConfig("postgresql://postgres@127.0.0.1:5432/db?connection_limit=7").pool.max).toBe(7);
  });

  it("decodes percent-encoded credentials", () => {
    const { pool } = databaseConnectionConfig("postgresql://app%2Buser:p%40ss%2Fw@127.0.0.1:5432/db");
    expect(pool.user).toBe("app+user");
    expect(pool.password).toBe("p@ss/w");
  });

  it("rejects schema names that are not plain identifiers", () => {
    expect(() =>
      databaseConnectionConfig('postgresql://postgres@127.0.0.1/db?schema=x";drop'),
    ).toThrow(/plain identifier/);
  });

  it("rejects non-Postgres URLs", () => {
    expect(() => databaseConnectionConfig("mysql://root@127.0.0.1/db")).toThrow(/postgresql:\/\//);
  });
});
