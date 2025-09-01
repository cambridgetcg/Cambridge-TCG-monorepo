/**
 * Tests for Aurora Data API Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RDSDataClient } from "@aws-sdk/client-rds-data";
import { AuroraDataAPI } from "./aurora-data-api";

// Mock AWS SDK
vi.mock("@aws-sdk/client-rds-data", () => ({
  RDSDataClient: vi.fn(),
  ExecuteStatementCommand: vi.fn(),
  BatchExecuteStatementCommand: vi.fn(),
  BeginTransactionCommand: vi.fn(),
  CommitTransactionCommand: vi.fn(),
  RollbackTransactionCommand: vi.fn(),
}));

describe("AuroraDataAPI", () => {
  let client: AuroraDataAPI;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    (RDSDataClient as any).mockImplementation(() => ({
      send: mockSend,
    }));

    client = new AuroraDataAPI({
      resourceArn: "arn:aws:rds:eu-north-1:123456789:cluster:test",
      secretArn: "arn:aws:secretsmanager:eu-north-1:123456789:secret:test",
      database: "testdb",
      region: "eu-north-1",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("executeStatement", () => {
    it("should_execute_simple_query_successfully", async () => {
      // Executes SELECT query and returns formatted records
      mockSend.mockResolvedValue({
        records: [
          [
            { stringValue: "1" },
            { stringValue: "test@example.com" },
            { doubleValue: 100.50 },
          ],
        ],
        columnMetadata: [
          { name: "id" },
          { name: "email" },
          { name: "storeCredit" },
        ],
        numberOfRecordsUpdated: 0,
      });

      const result = await client.executeStatement("SELECT * FROM customers");

      expect(result.records).toEqual([
        { id: "1", email: "test@example.com", storeCredit: 100.50 },
      ]);
      expect(result.numberOfRecordsUpdated).toBe(0);
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it("should_handle_parameterized_queries", async () => {
      // Prevents SQL injection with parameters
      mockSend.mockResolvedValue({
        records: [],
        columnMetadata: [],
      });

      const params = [
        AuroraDataAPI.buildParameter("email", "test@example.com"),
        AuroraDataAPI.buildParameter("amount", 50.25),
      ];

      await client.executeStatement(
        "SELECT * FROM customers WHERE email = :email AND storeCredit > :amount",
        params
      );

      const callArg = mockSend.mock.calls[0][0];
      expect(callArg).toBeDefined();
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it("should_handle_null_values_correctly", async () => {
      // Handles NULL database values properly
      mockSend.mockResolvedValue({
        records: [
          [
            { stringValue: "1" },
            { isNull: true },
            { longValue: 0 },
          ],
        ],
        columnMetadata: [
          { name: "id" },
          { name: "tierId" },
          { name: "credits" },
        ],
      });

      const result = await client.executeStatement("SELECT * FROM customers");

      expect(result.records[0]).toEqual({
        id: "1",
        tierId: null,
        credits: 0,
      });
    });

    it("should_throw_enhanced_error_on_failure", async () => {
      // Provides helpful error messages
      mockSend.mockRejectedValue(new Error("Connection timeout"));

      await expect(
        client.executeStatement("SELECT * FROM invalid_table")
      ).rejects.toThrow("Aurora Data API Error: Connection timeout");
    });
  });

  describe("executeTransaction", () => {
    it("should_commit_transaction_on_success", async () => {
      // Commits when all operations succeed
      mockSend
        .mockResolvedValueOnce({ transactionId: "tx-123" }) // begin
        .mockResolvedValueOnce({ records: [], columnMetadata: [] }) // execute
        .mockResolvedValueOnce({}); // commit

      const result = await client.executeTransaction(async (execute) => {
        await execute("UPDATE customers SET storeCredit = 100");
        return "success";
      });

      expect(result).toBe("success");
      expect(mockSend).toHaveBeenCalledTimes(3);
      // Verify transaction flow: begin, execute, commit
    });

    it("should_rollback_transaction_on_error", async () => {
      // Rolls back when operation fails
      mockSend
        .mockResolvedValueOnce({ transactionId: "tx-456" }) // begin
        .mockRejectedValueOnce(new Error("Constraint violation")) // execute fails
        .mockResolvedValueOnce({}); // rollback

      await expect(
        client.executeTransaction(async (execute) => {
          await execute("UPDATE customers SET invalid = true");
          return "should not reach";
        })
      ).rejects.toThrow("Constraint violation");

      expect(mockSend).toHaveBeenCalledTimes(3);
      // Verify transaction flow: begin, execute (fails), rollback
    });
  });

  describe("buildParameter", () => {
    it("should_build_string_parameter", () => {
      // Handles string values
      const param = AuroraDataAPI.buildParameter("name", "John Doe");
      expect(param).toEqual({
        name: "name",
        value: { stringValue: "John Doe" },
      });
    });

    it("should_build_number_parameter", () => {
      // Handles integer and decimal
      const intParam = AuroraDataAPI.buildParameter("age", 25);
      expect(intParam.value).toEqual({ longValue: 25 });

      const floatParam = AuroraDataAPI.buildParameter("price", 19.99);
      expect(floatParam.value).toEqual({ doubleValue: 19.99 });
    });

    it("should_build_null_parameter", () => {
      // Handles null values
      const param = AuroraDataAPI.buildParameter("optional", null);
      expect(param.value).toEqual({ isNull: true });
    });

    it("should_build_date_parameter", () => {
      // Converts dates to ISO strings
      const date = new Date("2025-09-01T12:00:00Z");
      const param = AuroraDataAPI.buildParameter("createdAt", date);
      expect(param.value).toEqual({ stringValue: "2025-09-01T12:00:00.000Z" });
    });

    it("should_build_array_parameter", () => {
      // Handles PostgreSQL arrays
      const stringArray = AuroraDataAPI.buildParameter("tags", ["red", "blue"]);
      expect(stringArray.value).toEqual({
        arrayValue: { stringValues: ["red", "blue"] },
      });

      const numberArray = AuroraDataAPI.buildParameter("scores", [95, 87, 92]);
      expect(numberArray.value).toEqual({
        arrayValue: { longValues: [95, 87, 92] },
      });
    });

    it("should_build_json_parameter_for_objects", () => {
      // Serializes objects to JSON
      const obj = { tier: "gold", benefits: ["free shipping"] };
      const param = AuroraDataAPI.buildParameter("metadata", obj);
      expect(param.value).toEqual({
        stringValue: JSON.stringify(obj),
      });
    });
  });

  describe("batchExecuteStatement", () => {
    it("should_execute_batch_insert_successfully", async () => {
      // Performs bulk operations efficiently
      mockSend.mockResolvedValue({ updateResults: [] });

      const parameterSets = [
        [
          AuroraDataAPI.buildParameter("email", "user1@test.com"),
          AuroraDataAPI.buildParameter("credit", 100),
        ],
        [
          AuroraDataAPI.buildParameter("email", "user2@test.com"),
          AuroraDataAPI.buildParameter("credit", 200),
        ],
      ];

      await client.batchExecuteStatement(
        "INSERT INTO customers (email, storeCredit) VALUES (:email, :credit)",
        parameterSets
      );

      expect(mockSend).toHaveBeenCalledOnce();
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg).toBeDefined();
    });
  });
});