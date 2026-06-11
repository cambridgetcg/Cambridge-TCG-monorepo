/**
 * S3 Data Export Service
 *
 * Production-grade data export service using AWS S3.
 *
 * Features:
 * - Customer data exports (CSV, JSON)
 * - Analytics report storage
 * - Audit log archival
 * - Pre-signed URLs for secure downloads
 * - Automatic file expiration via S3 lifecycle rules
 *
 * Architecture:
 * ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
 * │   Export    │───►│ S3 Bucket   │───►│ Pre-signed  │
 * │   Request   │    │             │    │   URL       │
 * └─────────────┘    └──────┬──────┘    └─────────────┘
 *                           │ (90 days)
 *                    ┌──────▼──────┐
 *                    │  Glacier    │
 *                    │ (archival)  │
 *                    └─────────────┘
 */

import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client, getAWSConfig } from "~/utils/aws-clients.server";
import { v4 as uuidv4 } from "uuid";

/**
 * Export file metadata
 */
export interface ExportFile {
  key: string;
  filename: string;
  contentType: string;
  size?: number;
  createdAt: Date;
  expiresAt?: Date;
  shop: string;
  exportType: ExportType;
}

/**
 * Export types
 */
export type ExportType =
  | "customers"
  | "orders"
  | "analytics"
  | "transactions"
  | "audit"
  | "tier-report"
  | "points-report";

/**
 * Export format options
 */
export type ExportFormat = "csv" | "json" | "xlsx";

/**
 * S3 Data Export Service
 */
export class S3DataExportService {
  private static instance: S3DataExportService | null = null;

  private bucket: string;
  private enabled: boolean;

  private constructor() {
    const config = getAWSConfig();
    this.bucket = config.s3.exportsBucket;
    this.enabled = config.s3.enabled && !!this.bucket;

    if (this.enabled) {
      console.log(`[S3] Data export service initialized: ${this.bucket}`);
    } else {
      console.log("[S3] Data export service disabled or not configured");
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): S3DataExportService {
    if (!S3DataExportService.instance) {
      S3DataExportService.instance = new S3DataExportService();
    }
    return S3DataExportService.instance;
  }

  /**
   * Check if S3 exports are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate S3 key for export file
   */
  private generateKey(
    shop: string,
    exportType: ExportType,
    format: ExportFormat,
    filename?: string
  ): string {
    const date = new Date();
    const datePrefix = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    const shopSlug = shop.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const actualFilename =
      filename || `${exportType}-${Date.now()}.${format}`;

    return `exports/${shopSlug}/${datePrefix}/${actualFilename}`;
  }

  /**
   * Upload export data to S3
   *
   * @param params Export parameters
   * @returns Upload result with key and URL
   */
  async uploadExport(params: {
    shop: string;
    exportType: ExportType;
    format: ExportFormat;
    data: Buffer | string;
    filename?: string;
    metadata?: Record<string, string>;
  }): Promise<{
    success: boolean;
    key?: string;
    downloadUrl?: string;
    error?: string;
  }> {
    if (!this.enabled) {
      return { success: false, error: "S3 exports not enabled" };
    }

    const { shop, exportType, format, data, filename, metadata } = params;
    const key = this.generateKey(shop, exportType, format, filename);

    // Determine content type
    const contentType = this.getContentType(format);

    try {
      const client = getS3Client();

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8"),
        ContentType: contentType,
        Metadata: {
          shop,
          exportType,
          format,
          createdAt: new Date().toISOString(),
          ...metadata,
        },
        // Server-side encryption (also handled by bucket policy)
        ServerSideEncryption: "AES256",
      });

      await client.send(command);

      // Generate pre-signed URL for download (valid for 24 hours)
      const downloadUrl = await this.getDownloadUrl(key, 24 * 60 * 60);

      console.log(`[S3] Uploaded export: ${key}`);

      return {
        success: true,
        key,
        downloadUrl,
      };
    } catch (error: any) {
      console.error(`[S3] Failed to upload export:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate pre-signed download URL
   *
   * @param key S3 object key
   * @param expiresInSeconds URL expiration time (default: 1 hour)
   */
  async getDownloadUrl(
    key: string,
    expiresInSeconds: number = 3600
  ): Promise<string> {
    if (!this.enabled) {
      throw new Error("S3 exports not enabled");
    }

    const client = getS3Client();

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(client, command, {
      expiresIn: expiresInSeconds,
    });

    return url;
  }

  /**
   * Generate pre-signed upload URL for direct browser uploads
   *
   * @param shop Shop identifier
   * @param exportType Type of export
   * @param format File format
   * @param expiresInSeconds URL expiration time (default: 5 minutes)
   */
  async getUploadUrl(
    shop: string,
    exportType: ExportType,
    format: ExportFormat,
    expiresInSeconds: number = 300
  ): Promise<{ uploadUrl: string; key: string }> {
    if (!this.enabled) {
      throw new Error("S3 exports not enabled");
    }

    const key = this.generateKey(shop, exportType, format);
    const contentType = this.getContentType(format);
    const client = getS3Client();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: {
        shop,
        exportType,
        format,
        createdAt: new Date().toISOString(),
      },
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: expiresInSeconds,
    });

    return { uploadUrl, key };
  }

  /**
   * List exports for a shop
   */
  async listExports(
    shop: string,
    options?: {
      exportType?: ExportType;
      maxResults?: number;
      startAfter?: string;
    }
  ): Promise<ExportFile[]> {
    if (!this.enabled) {
      return [];
    }

    const { exportType, maxResults = 100, startAfter } = options || {};
    const shopSlug = shop.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const prefix = `exports/${shopSlug}/`;

    try {
      const client = getS3Client();

      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxResults,
        StartAfter: startAfter,
      });

      const response = await client.send(command);
      const contents = response.Contents || [];

      const exports: ExportFile[] = contents.map((item) => {
        const key = item.Key || "";
        const filename = key.split("/").pop() || "";

        // Parse export type from filename
        let parsedExportType: ExportType = "customers";
        for (const type of [
          "customers",
          "orders",
          "analytics",
          "transactions",
          "audit",
          "tier-report",
          "points-report",
        ] as ExportType[]) {
          if (filename.startsWith(type)) {
            parsedExportType = type;
            break;
          }
        }

        // Parse format from extension
        const extension = filename.split(".").pop() || "";
        const contentType = this.getContentType(extension as ExportFormat);

        return {
          key,
          filename,
          contentType,
          size: item.Size,
          createdAt: item.LastModified || new Date(),
          shop,
          exportType: parsedExportType,
        };
      });

      // Filter by export type if specified
      if (exportType) {
        return exports.filter((e) => e.exportType === exportType);
      }

      return exports;
    } catch (error) {
      console.error("[S3] Failed to list exports:", error);
      return [];
    }
  }

  /**
   * Get export file metadata
   */
  async getExportMetadata(key: string): Promise<ExportFile | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const client = getS3Client();

      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await client.send(command);
      const metadata = response.Metadata || {};

      return {
        key,
        filename: key.split("/").pop() || "",
        contentType: response.ContentType || "application/octet-stream",
        size: response.ContentLength,
        createdAt: response.LastModified || new Date(),
        shop: metadata.shop || "",
        exportType: (metadata.exporttype as ExportType) || "customers",
      };
    } catch (error: any) {
      if (error.name === "NotFound") {
        return null;
      }
      console.error("[S3] Failed to get export metadata:", error);
      return null;
    }
  }

  /**
   * Delete an export file
   */
  async deleteExport(key: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const client = getS3Client();

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await client.send(command);
      console.log(`[S3] Deleted export: ${key}`);
      return true;
    } catch (error) {
      console.error("[S3] Failed to delete export:", error);
      return false;
    }
  }

  /**
   * Export customers to CSV
   */
  async exportCustomersCSV(
    shop: string,
    customers: Array<{
      id: string;
      email: string;
      firstName?: string;
      lastName?: string;
      tier?: string;
      totalSpent?: number;
      orderCount?: number;
      createdAt: Date;
    }>
  ): Promise<{ success: boolean; key?: string; downloadUrl?: string; error?: string }> {
    // Build CSV content
    const headers = [
      "ID",
      "Email",
      "First Name",
      "Last Name",
      "Tier",
      "Total Spent",
      "Order Count",
      "Created At",
    ];

    const rows = customers.map((c) => [
      c.id,
      c.email,
      c.firstName || "",
      c.lastName || "",
      c.tier || "",
      c.totalSpent?.toString() || "0",
      c.orderCount?.toString() || "0",
      c.createdAt.toISOString(),
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return this.uploadExport({
      shop,
      exportType: "customers",
      format: "csv",
      data: csv,
      metadata: {
        recordCount: customers.length.toString(),
      },
    });
  }

  /**
   * Export data to JSON
   */
  async exportJSON(
    shop: string,
    exportType: ExportType,
    data: any
  ): Promise<{ success: boolean; key?: string; downloadUrl?: string; error?: string }> {
    const json = JSON.stringify(data, null, 2);

    return this.uploadExport({
      shop,
      exportType,
      format: "json",
      data: json,
    });
  }

  /**
   * Get content type for format
   */
  private getContentType(format: ExportFormat | string): string {
    switch (format) {
      case "csv":
        return "text/csv";
      case "json":
        return "application/json";
      case "xlsx":
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      default:
        return "application/octet-stream";
    }
  }
}

/**
 * Convenience export for singleton instance
 */
export const s3DataExport = S3DataExportService.getInstance();

export default S3DataExportService;
