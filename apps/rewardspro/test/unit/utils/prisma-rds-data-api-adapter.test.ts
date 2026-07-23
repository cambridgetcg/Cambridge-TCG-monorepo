/**
 * Pure unit tests for the new Prisma Driver Adapter.
 *
 * Covers the translation layer (placeholder rewrite, param building, column
 * type mapping, result shaping) without hitting a live database. Connectivity
 * tests live in the integration suite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the un-exported helpers via the exported class surface. To exercise
// the placeholder rewriter in isolation, we mock the AWS SDK and read what the
// adapter sends downstream.
const sendMock = vi.fn();
vi.mock("@aws-sdk/client-rds-data", () => {
  class FakeClient { send = sendMock }
  // Capture the input passed to each command for assertions.
  class ExecuteStatementCommand {
    public input: any;

    constructor(input: any) {
      this.input = input;
    }
  }
  class BeginTransactionCommand {
    public input: any;

    constructor(input: any) {
      this.input = input;
    }
  }
  class CommitTransactionCommand {
    public input: any;

    constructor(input: any) {
      this.input = input;
    }
  }
  class RollbackTransactionCommand {
    public input: any;

    constructor(input: any) {
      this.input = input;
    }
  }
  return {
    RDSDataClient: FakeClient,
    ExecuteStatementCommand,
    BeginTransactionCommand,
    CommitTransactionCommand,
    RollbackTransactionCommand,
  };
});

import { PrismaRdsDataApiAdapter } from "../../../app/utils/prisma-rds-data-api-adapter.server";

const baseConfig = {
  resourceArn: "arn:writer",
  secretArn: "arn:secret",
  database: "rewardspro",
  region: "eu-north-1",
};

function makeAdapter(extra: Partial<typeof baseConfig> & { readReplicaArn?: string } = {}) {
  return new PrismaRdsDataApiAdapter({ ...baseConfig, ...extra });
}

beforeEach(() => {
  sendMock.mockReset();
  // Default: a successful execute response with empty result.
  sendMock.mockResolvedValue({
    records: [],
    columnMetadata: [],
    numberOfRecordsUpdated: 0,
  });
});

/**
 * Helper: pull the ExecuteStatementCommand input out of the most recent send().
 */
function lastExecInput() {
  const cmd = sendMock.mock.calls.at(-1)?.[0];
  return cmd?.input;
}

describe("placeholder rewrite ($N → :paramN)", () => {
  it("rewrites bare numeric placeholders", async () => {
    const a = makeAdapter();
    await a.queryRaw({
      sql: 'SELECT * FROM "Customer" WHERE id = $1 AND shop = $2',
      args: ["c1", "shop.myshopify.com"],
      argTypes: [{ scalarType: "uuid", arity: "scalar" }, { scalarType: "string", arity: "scalar" }],
    });
    expect(lastExecInput().sql).toBe(
      'SELECT * FROM "Customer" WHERE id = :param0 AND shop = :param1',
    );
  });

  it("does NOT rewrite $N inside single-quoted string literals", async () => {
    const a = makeAdapter();
    await a.queryRaw({
      sql: "SELECT 'price is $1' as msg, x FROM t WHERE x = $1",
      args: ["abc"],
      argTypes: [{ scalarType: "string", arity: "scalar" }],
    });
    expect(lastExecInput().sql).toBe(
      "SELECT 'price is $1' as msg, x FROM t WHERE x = :param0",
    );
  });

  it("does NOT rewrite $N inside dollar-quoted blocks", async () => {
    const a = makeAdapter();
    await a.queryRaw({
      sql: "SELECT $tag$contains $1 verbatim$tag$ as raw, x FROM t WHERE x = $1",
      args: ["abc"],
      argTypes: [{ scalarType: "string", arity: "scalar" }],
    });
    expect(lastExecInput().sql).toBe(
      "SELECT $tag$contains $1 verbatim$tag$ as raw, x FROM t WHERE x = :param0",
    );
  });

  it("preserves quoted identifiers untouched", async () => {
    const a = makeAdapter();
    await a.queryRaw({
      sql: 'SELECT "$weird column" FROM t WHERE id = $1',
      args: ["c1"],
      argTypes: [{ scalarType: "string", arity: "scalar" }],
    });
    expect(lastExecInput().sql).toBe(
      'SELECT "$weird column" FROM t WHERE id = :param0',
    );
  });

  it("renumbers correctly: $1 → :param0, $2 → :param1, $10 → :param9", async () => {
    const a = makeAdapter();
    await a.queryRaw({
      sql: "SELECT $1, $2, $10",
      args: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      argTypes: Array(10).fill({ scalarType: "string", arity: "scalar" }),
    });
    expect(lastExecInput().sql).toBe("SELECT :param0, :param1, :param9");
  });
});

describe("argTypes → SqlParameter type hints", () => {
  it("maps datetime to TIMESTAMP with formatted UTC string", async () => {
    const a = makeAdapter();
    const date = new Date("2026-04-30T15:42:30.123Z");
    await a.executeRaw({
      sql: "INSERT INTO t (created_at) VALUES ($1)",
      args: [date],
      argTypes: [{ scalarType: "datetime", arity: "scalar" }],
    });
    const params = lastExecInput().parameters;
    expect(params[0].typeHint).toBe("TIMESTAMP");
    expect(params[0].value).toEqual({ stringValue: "2026-04-30 15:42:30.123" });
  });

  it("maps decimal to DECIMAL with stringified value (precision-preserving)", async () => {
    const a = makeAdapter();
    await a.executeRaw({
      sql: "UPDATE t SET amt = $1",
      args: ["12345.678901234567890"],
      argTypes: [{ scalarType: "decimal", arity: "scalar" }],
    });
    const params = lastExecInput().parameters;
    expect(params[0].typeHint).toBe("DECIMAL");
    expect(params[0].value).toEqual({ stringValue: "12345.678901234567890" });
  });

  it("maps uuid to UUID", async () => {
    const a = makeAdapter();
    await a.queryRaw({
      sql: "SELECT * FROM t WHERE id = $1",
      args: ["00000000-0000-0000-0000-000000000001"],
      argTypes: [{ scalarType: "uuid", arity: "scalar" }],
    });
    const params = lastExecInput().parameters;
    expect(params[0].typeHint).toBe("UUID");
    expect(params[0].value).toEqual({
      stringValue: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("maps json with object → stringified JSON + JSON typeHint", async () => {
    const a = makeAdapter();
    await a.executeRaw({
      sql: "INSERT INTO t (data) VALUES ($1)",
      args: [{ a: 1, b: [2, 3] }],
      argTypes: [{ scalarType: "json", arity: "scalar" }],
    });
    const params = lastExecInput().parameters;
    expect(params[0].typeHint).toBe("JSON");
    expect(params[0].value).toEqual({ stringValue: '{"a":1,"b":[2,3]}' });
  });

  it("maps json with already-stringified payload → passes through", async () => {
    const a = makeAdapter();
    await a.executeRaw({
      sql: "INSERT INTO t (data) VALUES ($1)",
      args: ['{"already":"json"}'],
      argTypes: [{ scalarType: "json", arity: "scalar" }],
    });
    expect(lastExecInput().parameters[0].value).toEqual({
      stringValue: '{"already":"json"}',
    });
  });

  it("maps bytes → blobValue", async () => {
    const a = makeAdapter();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await a.executeRaw({
      sql: "INSERT INTO t (b) VALUES ($1)",
      args: [bytes],
      argTypes: [{ scalarType: "bytes", arity: "scalar" }],
    });
    expect(lastExecInput().parameters[0].value).toEqual({ blobValue: bytes });
  });

  it("maps int → longValue", async () => {
    const a = makeAdapter();
    await a.queryRaw({
      sql: "SELECT * FROM t WHERE n = $1",
      args: [42],
      argTypes: [{ scalarType: "int", arity: "scalar" }],
    });
    expect(lastExecInput().parameters[0].value).toEqual({ longValue: 42 });
  });

  it("maps boolean → booleanValue", async () => {
    const a = makeAdapter();
    await a.queryRaw({
      sql: "SELECT * FROM t WHERE b = $1",
      args: [true],
      argTypes: [{ scalarType: "boolean", arity: "scalar" }],
    });
    expect(lastExecInput().parameters[0].value).toEqual({ booleanValue: true });
  });

  it("maps enum → stringValue (Postgres handles enum cast at parse time)", async () => {
    const a = makeAdapter();
    await a.executeRaw({
      sql: "UPDATE t SET status = $1",
      args: ["ACTIVE"],
      argTypes: [{ scalarType: "enum", dbType: "TierStatus", arity: "scalar" }],
    });
    expect(lastExecInput().parameters[0].value).toEqual({ stringValue: "ACTIVE" });
  });

  it("maps null/undefined → isNull regardless of declared type", async () => {
    const a = makeAdapter();
    await a.executeRaw({
      sql: "UPDATE t SET x = $1, y = $2",
      args: [null, undefined],
      argTypes: [
        { scalarType: "string", arity: "scalar" },
        { scalarType: "datetime", arity: "scalar" },
      ],
    });
    const params = lastExecInput().parameters;
    expect(params[0].value).toEqual({ isNull: true });
    expect(params[1].value).toEqual({ isNull: true });
  });

  it("maps list arity → JSON-encoded string (Data API has no array support)", async () => {
    const a = makeAdapter();
    await a.executeRaw({
      sql: "UPDATE t SET tags = $1",
      args: [["a", "b", "c"]],
      argTypes: [{ scalarType: "string", arity: "list" }],
    });
    const params = lastExecInput().parameters;
    expect(params[0].typeHint).toBe("JSON");
    expect(params[0].value).toEqual({ stringValue: '["a","b","c"]' });
  });
});

describe("result-set shaping (Field[] → Prisma SqlResultSet)", () => {
  it("shapes columns + rows positionally and maps Postgres types to ColumnType enum", async () => {
    sendMock.mockResolvedValueOnce({
      columnMetadata: [
        { name: "id", typeName: "uuid" },
        { name: "name", typeName: "text" },
        { name: "active", typeName: "bool" },
        { name: "balance", typeName: "numeric" },
        { name: "created_at", typeName: "timestamptz" },
      ],
      records: [
        [
          { stringValue: "00000000-0000-0000-0000-000000000001" },
          { stringValue: "Alice" },
          { booleanValue: true },
          { stringValue: "100.50" },
          { stringValue: "2026-04-30 12:00:00" },
        ],
      ],
      numberOfRecordsUpdated: 0,
    });
    const a = makeAdapter();
    const result = await a.queryRaw({ sql: "SELECT * FROM t", args: [], argTypes: [] });
    expect(result.columnNames).toEqual(["id", "name", "active", "balance", "created_at"]);
    // ColumnTypeEnum values: Uuid=15, Text=7, Boolean=5, Numeric=4, DateTime=10
    expect(result.columnTypes).toEqual([15, 7, 5, 4, 10]);
    expect(result.rows).toEqual([
      [
        "00000000-0000-0000-0000-000000000001",
        "Alice",
        true,
        "100.50",
        "2026-04-30 12:00:00",
      ],
    ]);
  });

  it("preserves Numeric as string (Decimal precision)", async () => {
    sendMock.mockResolvedValueOnce({
      columnMetadata: [{ name: "n", typeName: "numeric" }],
      records: [[{ stringValue: "123456789012345.678901234567" }]],
      numberOfRecordsUpdated: 0,
    });
    const a = makeAdapter();
    const result = await a.queryRaw({ sql: "SELECT n FROM t", args: [], argTypes: [] });
    expect(result.rows[0][0]).toBe("123456789012345.678901234567");
  });

  it("returns null for isNull fields", async () => {
    sendMock.mockResolvedValueOnce({
      columnMetadata: [{ name: "x", typeName: "text" }],
      records: [[{ isNull: true }]],
      numberOfRecordsUpdated: 0,
    });
    const a = makeAdapter();
    const result = await a.queryRaw({ sql: "SELECT x FROM t", args: [], argTypes: [] });
    expect(result.rows[0][0]).toBeNull();
  });

  it("maps unknown Postgres types to Enum (catch-all for user-defined enums)", async () => {
    sendMock.mockResolvedValueOnce({
      columnMetadata: [{ name: "status", typeName: "TierStatus" }],
      records: [[{ stringValue: "ACTIVE" }]],
      numberOfRecordsUpdated: 0,
    });
    const a = makeAdapter();
    const result = await a.queryRaw({ sql: "SELECT status FROM t", args: [], argTypes: [] });
    expect(result.columnTypes[0]).toBe(12); // ColumnType.Enum
  });
});

describe("statement-size + response-size guards (optimisation #3)", () => {
  it("throws before sending if SQL exceeds 64 KB", async () => {
    const a = makeAdapter();
    // Build a SQL string > 64 KB (no actual DB needed; the guard runs first).
    // 17000 × "'X'," = 68000 bytes — comfortably over the 65536 cap.
    const huge = "SELECT * FROM t WHERE x IN (" + Array(17000).fill("'X'").join(",") + ")";
    expect(huge.length).toBeGreaterThan(65_536);
    await expect(
      a.queryRaw({ sql: huge, args: [], argTypes: [] }),
    ).rejects.toThrow(/exceeds Aurora Data API 65536-byte cap/);
    // Crucially: never sent to AWS.
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("translates response-size error to actionable message", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("Database returned more than the allowed response size"), {
        name: "BadRequestException",
      }),
    );
    const a = makeAdapter();
    await expect(
      a.queryRaw({ sql: "SELECT * FROM t", args: [], argTypes: [] }),
    ).rejects.toThrow(/Response exceeded Aurora Data API 1 MB cap.*Add take/);
  });

  it("does not warp non-size errors", async () => {
    sendMock.mockRejectedValueOnce(new Error("some other Postgres error"));
    const a = makeAdapter();
    await expect(
      a.queryRaw({ sql: "SELECT * FROM t", args: [], argTypes: [] }),
    ).rejects.toThrow(/some other Postgres error/);
  });
});

describe("connection info / factory contract", () => {
  it("connect() returns the adapter (factory pattern)", async () => {
    const a = makeAdapter();
    const adapter = await a.connect();
    expect(adapter).toBe(a);
  });

  it("getConnectionInfo() advertises join support and 1000 maxBindValues", () => {
    const a = makeAdapter();
    const info = a.getConnectionInfo();
    expect(info.schemaName).toBe("public");
    expect(info.maxBindValues).toBe(1000);
    expect(info.supportsRelationJoins).toBe(true);
  });
});

describe("executeRaw returns rows-affected count", () => {
  it("returns numberOfRecordsUpdated from the response", async () => {
    sendMock.mockResolvedValueOnce({
      columnMetadata: [],
      records: [],
      numberOfRecordsUpdated: 3,
    });
    const a = makeAdapter();
    const n = await a.executeRaw({
      sql: "DELETE FROM t WHERE shop = $1",
      args: ["shop.myshopify.com"],
      argTypes: [{ scalarType: "string", arity: "scalar" }],
    });
    expect(n).toBe(3);
  });
});

describe("read/write split (reader replica routing)", () => {
  it("routes SELECT to reader ARN when configured", async () => {
    const a = makeAdapter({ readReplicaArn: "arn:reader" });
    await a.queryRaw({
      sql: "SELECT id FROM t WHERE shop = $1",
      args: ["s"],
      argTypes: [{ scalarType: "string", arity: "scalar" }],
    });
    expect(lastExecInput().resourceArn).toBe("arn:reader");
  });

  it("routes WITH ... SELECT (CTE) to reader", async () => {
    const a = makeAdapter({ readReplicaArn: "arn:reader" });
    await a.queryRaw({
      sql: "WITH x AS (SELECT 1) SELECT * FROM x",
      args: [],
      argTypes: [],
    });
    expect(lastExecInput().resourceArn).toBe("arn:reader");
  });

  it("routes executeRaw (writes) to writer ARN", async () => {
    const a = makeAdapter({ readReplicaArn: "arn:reader" });
    await a.executeRaw({
      sql: "UPDATE t SET x = 1",
      args: [],
      argTypes: [],
    });
    expect(lastExecInput().resourceArn).toBe("arn:writer");
  });

  it("routes everything to writer when no reader configured", async () => {
    const a = makeAdapter();
    await a.queryRaw({ sql: "SELECT 1", args: [], argTypes: [] });
    expect(lastExecInput().resourceArn).toBe("arn:writer");
  });
});

describe("transactions", () => {
  it("threads transactionId through queryRaw + executeRaw + commit", async () => {
    sendMock
      .mockResolvedValueOnce({ transactionId: "tx-123" }) // BeginTransaction
      .mockResolvedValueOnce({ records: [], columnMetadata: [], numberOfRecordsUpdated: 0 })
      .mockResolvedValueOnce({ records: [], columnMetadata: [], numberOfRecordsUpdated: 1 })
      .mockResolvedValueOnce({}); // Commit

    const a = makeAdapter();
    const tx = await a.startTransaction();
    await tx.queryRaw({
      sql: "SELECT 1",
      args: [],
      argTypes: [],
    });
    await tx.executeRaw({
      sql: "UPDATE t SET x = $1",
      args: [1],
      argTypes: [{ scalarType: "int", arity: "scalar" }],
    });
    await tx.commit();

    // Calls 2 and 3 carry the transactionId.
    expect(sendMock.mock.calls[1][0].input.transactionId).toBe("tx-123");
    expect(sendMock.mock.calls[2][0].input.transactionId).toBe("tx-123");
    // Commit gets transactionId.
    expect(sendMock.mock.calls[3][0].input.transactionId).toBe("tx-123");
  });

  it("rollback issues RollbackTransactionCommand", async () => {
    sendMock
      .mockResolvedValueOnce({ transactionId: "tx-456" })
      .mockResolvedValueOnce({});

    const a = makeAdapter();
    const tx = await a.startTransaction();
    await tx.rollback();
    expect(sendMock.mock.calls[1][0].input.transactionId).toBe("tx-456");
  });

  it("throws if BeginTransaction returns no id", async () => {
    sendMock.mockResolvedValueOnce({}); // missing transactionId
    const a = makeAdapter();
    await expect(a.startTransaction()).rejects.toThrow(/Failed to begin transaction/);
  });
});

describe("dispose / executeScript", () => {
  it("dispose is a no-op (Data API is stateless)", async () => {
    const a = makeAdapter();
    await expect(a.dispose()).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("executeScript splits on ; and runs each statement", async () => {
    const a = makeAdapter();
    await a.executeScript("CREATE TABLE a (id int); CREATE INDEX b ON a(id);");
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[0][0].input.sql.trim()).toBe("CREATE TABLE a (id int)");
    expect(sendMock.mock.calls[1][0].input.sql.trim()).toBe("CREATE INDEX b ON a(id)");
  });

  it("executeScript respects ; inside dollar-quoted blocks (does not split)", async () => {
    const a = makeAdapter();
    await a.executeScript("DO $$ BEGIN PERFORM 1; PERFORM 2; END $$;");
    // Should be ONE statement, not three.
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

describe("provider + adapterName", () => {
  it("identifies as postgres / rds-data-api", () => {
    const a = makeAdapter();
    expect(a.provider).toBe("postgres");
    expect(a.adapterName).toBe("rds-data-api");
  });
});
