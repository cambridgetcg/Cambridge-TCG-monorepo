/**
 * Tests for Connection Strategy
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getConnectionStrategy,
  getDatabaseUrl,
  shouldUseDataAPI,
  getPrismaConnectionConfig,
} from "./connection-strategy";

describe("Connection Strategy", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("getConnectionStrategy", () => {
    it("should_use_direct_connection_in_production", () => {
      // Production uses fast direct connection
      process.env.VERCEL_ENV = "production";
      process.env.DATABASE_URL = "postgresql://prod-db";

      const strategy = getConnectionStrategy();

      expect(strategy.type).toBe("direct");
      expect(strategy.maxConnections).toBe(5);
      expect(strategy.useDataAPI).toBe(false);
      expect(strategy.description).toContain("Production");
    });

    it("should_use_rds_proxy_when_configured", () => {
      // Production with RDS Proxy URL
      process.env.VERCEL_ENV = "production";
      process.env.DATABASE_URL_PROXY = "postgresql://proxy-db";

      const strategy = getConnectionStrategy();

      expect(strategy.type).toBe("rds-proxy");
      expect(strategy.maxConnections).toBe(5);
      expect(strategy.useDataAPI).toBe(false);
    });

    it("should_use_data_api_in_preview", () => {
      // Preview deployments use Data API
      process.env.VERCEL_ENV = "preview";

      const strategy = getConnectionStrategy();

      expect(strategy.type).toBe("data-api");
      expect(strategy.maxConnections).toBe(0);
      expect(strategy.useDataAPI).toBe(true);
      expect(strategy.description).toContain("Preview");
    });

    it("should_use_data_api_in_development_deployment", () => {
      // Vercel development deployments use Data API
      process.env.VERCEL_ENV = "development";

      const strategy = getConnectionStrategy();

      expect(strategy.type).toBe("data-api");
      expect(strategy.maxConnections).toBe(0);
      expect(strategy.useDataAPI).toBe(true);
    });

    it("should_use_local_connection_for_local_dev", () => {
      // Local development uses direct connection
      delete process.env.VERCEL_ENV;
      process.env.NODE_ENV = "development";

      const strategy = getConnectionStrategy();

      expect(strategy.type).toBe("local");
      expect(strategy.maxConnections).toBe(10);
      expect(strategy.useDataAPI).toBe(false);
      expect(strategy.description).toContain("Local");
    });

    it("should_force_data_api_when_flag_set", () => {
      // Force Data API for testing
      process.env.VERCEL_ENV = "production";
      process.env.FORCE_DATA_API = "true";

      const strategy = getConnectionStrategy();

      expect(strategy.type).toBe("data-api");
      expect(strategy.useDataAPI).toBe(true);
      expect(strategy.description).toContain("Forced");
    });

    it("should_default_to_data_api_for_unknown_env", () => {
      // Unknown environment defaults to safe option
      process.env.VERCEL_ENV = "unknown-env";

      const strategy = getConnectionStrategy();

      expect(strategy.type).toBe("data-api");
      expect(strategy.useDataAPI).toBe(true);
      expect(strategy.description).toContain("Unknown");
    });
  });

  describe("getDatabaseUrl", () => {
    it("should_return_proxy_url_for_rds_proxy", () => {
      // RDS Proxy strategy returns proxy URL
      process.env.VERCEL_ENV = "production";
      process.env.DATABASE_URL_PROXY = "postgresql://proxy-url";
      process.env.DATABASE_URL = "postgresql://direct-url";

      const url = getDatabaseUrl();

      expect(url).toBe("postgresql://proxy-url");
    });

    it("should_return_direct_url_for_production", () => {
      // Direct connection returns standard URL
      process.env.VERCEL_ENV = "production";
      process.env.DATABASE_URL = "postgresql://direct-url";
      delete process.env.DATABASE_URL_PROXY;

      const url = getDatabaseUrl();

      expect(url).toBe("postgresql://direct-url");
    });

    it("should_return_undefined_for_data_api", () => {
      // Data API doesn't use connection strings
      process.env.VERCEL_ENV = "preview";

      const url = getDatabaseUrl();

      expect(url).toBeUndefined();
    });

    it("should_return_local_url_for_local_dev", () => {
      // Local development can use separate URL
      delete process.env.VERCEL_ENV;
      process.env.NODE_ENV = "development";
      process.env.DATABASE_URL_LOCAL = "postgresql://localhost";
      process.env.DATABASE_URL = "postgresql://remote";

      const url = getDatabaseUrl();

      expect(url).toBe("postgresql://localhost");
    });
  });

  describe("shouldUseDataAPI", () => {
    it("should_return_false_for_production", () => {
      // Production doesn't use Data API
      process.env.VERCEL_ENV = "production";

      expect(shouldUseDataAPI()).toBe(false);
    });

    it("should_return_true_for_preview", () => {
      // Preview always uses Data API
      process.env.VERCEL_ENV = "preview";

      expect(shouldUseDataAPI()).toBe(true);
    });

    it("should_return_true_when_forced", () => {
      // Force flag overrides environment
      process.env.VERCEL_ENV = "production";
      process.env.FORCE_DATA_API = "true";

      expect(shouldUseDataAPI()).toBe(true);
    });
  });

  describe("getPrismaConnectionConfig", () => {
    it("should_return_config_for_direct_connection", () => {
      // Direct connections get pool config
      process.env.VERCEL_ENV = "production";

      const config = getPrismaConnectionConfig();

      expect(config).toEqual({
        connection_limit: 5,
        connect_timeout: 30,
        pool_timeout: 30,
        idle_in_transaction_session_timeout: 60000,
        statement_timeout: 20000,
      });
    });

    it("should_return_null_for_data_api", () => {
      // Data API doesn't use connection pools
      process.env.VERCEL_ENV = "preview";

      const config = getPrismaConnectionConfig();

      expect(config).toBeNull();
    });

    it("should_have_higher_limits_for_local", () => {
      // Local development can use more connections
      delete process.env.VERCEL_ENV;
      process.env.NODE_ENV = "development";

      const config = getPrismaConnectionConfig();

      expect(config?.connection_limit).toBe(10);
      expect(config?.pool_timeout).toBe(10);
    });
  });
});
