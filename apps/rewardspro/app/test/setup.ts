// Test setup file
import { vi } from "vitest";

// Mock environment variables for testing
process.env.AURORA_RESOURCE_ARN = "arn:aws:rds:eu-north-1:123456789:cluster:test";
process.env.AURORA_SECRET_ARN = "arn:aws:secretsmanager:eu-north-1:123456789:secret:test";
process.env.AURORA_DATABASE_NAME = "testdb";
process.env.AWS_REGION = "eu-north-1";