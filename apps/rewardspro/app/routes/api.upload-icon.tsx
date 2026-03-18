/**
 * API Route: Upload Custom Points Icon
 *
 * Handles file uploads for custom points currency icons using Shopify's Files API.
 * Supports SVG, PNG, JPEG, GIF, and WebP formats up to 1MB.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json, unstable_parseMultipartFormData } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Max file size: 1MB
const MAX_FILE_SIZE = 1024 * 1024;
const ALLOWED_TYPES = ["image/svg+xml", "image/png", "image/jpeg", "image/gif", "image/webp"];

// Shopify GraphQL mutations
const STAGED_UPLOADS_CREATE = `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_CREATE = `
  mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        ... on GenericFile {
          id
          url
          alt
        }
        ... on MediaImage {
          id
          image {
            url
          }
          alt
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("[api.upload-icon] Starting file upload...");

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;
    console.log(`[api.upload-icon] Authenticated for shop: ${shop}`);

    // Parse multipart form data
    const formData = await unstable_parseMultipartFormData(
      request,
      (async ({ name, contentType, data, filename }: any) => {
        if (name !== "file") return undefined;

        // Validate content type
        if (!ALLOWED_TYPES.includes(contentType)) {
          throw new Error(`Invalid file type: ${contentType}. Allowed types: SVG, PNG, JPEG, GIF, WebP`);
        }

        // Collect file chunks
        const chunks: Uint8Array[] = [];
        let size = 0;

        for await (const chunk of data) {
          size += chunk.length;
          if (size > MAX_FILE_SIZE) {
            throw new Error("File size exceeds 1MB limit");
          }
          chunks.push(chunk);
        }

        // Combine chunks into a single buffer
        const buffer = Buffer.concat(chunks);

        return {
          filename,
          contentType,
          buffer,
          size,
        };
      }) as any
    );

    const fileData = formData.get("file") as {
      filename: string;
      contentType: string;
      buffer: Buffer;
      size: number;
    } | null;

    if (!fileData) {
      return json({ error: "No file provided" }, { status: 400 });
    }

    console.log(`[api.upload-icon] File received: ${fileData.filename}, size: ${fileData.size}, type: ${fileData.contentType}`);

    // Step 1: Create staged upload target
    const stagedUploadResponse = await admin.graphql(STAGED_UPLOADS_CREATE, {
      variables: {
        input: [
          {
            resource: "FILE",
            filename: fileData.filename,
            mimeType: fileData.contentType,
            httpMethod: "POST",
            fileSize: fileData.size.toString(),
          },
        ],
      },
    });

    const stagedData = await stagedUploadResponse.json();

    if (stagedData.data?.stagedUploadsCreate?.userErrors?.length > 0) {
      const errors = stagedData.data.stagedUploadsCreate.userErrors;
      console.error("[api.upload-icon] Staged upload errors:", errors);
      return json({ error: errors[0].message }, { status: 400 });
    }

    const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) {
      console.error("[api.upload-icon] No staged target returned");
      return json({ error: "Failed to create upload target" }, { status: 500 });
    }

    console.log(`[api.upload-icon] Staged upload target: ${target.url}`);

    // Step 2: Upload file to staged target
    const uploadFormData = new FormData();

    // Add parameters from staged upload
    for (const param of target.parameters) {
      uploadFormData.append(param.name, param.value);
    }

    // Add the file
    const blob = new Blob([new Uint8Array(fileData.buffer)], { type: fileData.contentType });
    uploadFormData.append("file", blob, fileData.filename);

    const uploadResponse = await fetch(target.url, {
      method: "POST",
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      console.error("[api.upload-icon] File upload failed:", uploadResponse.status);
      return json({ error: "Failed to upload file to Shopify" }, { status: 500 });
    }

    console.log("[api.upload-icon] File uploaded to staged target");

    // Step 3: Create file in Shopify Files
    const fileCreateResponse = await admin.graphql(FILE_CREATE, {
      variables: {
        files: [
          {
            alt: "Points currency icon",
            contentType: fileData.contentType === "image/svg+xml" ? "FILE" : "IMAGE",
            originalSource: target.resourceUrl,
          },
        ],
      },
    });

    const fileCreateData = await fileCreateResponse.json();

    if (fileCreateData.data?.fileCreate?.userErrors?.length > 0) {
      const errors = fileCreateData.data.fileCreate.userErrors;
      console.error("[api.upload-icon] File create errors:", errors);
      return json({ error: errors[0].message }, { status: 400 });
    }

    const createdFile = fileCreateData.data?.fileCreate?.files?.[0];
    if (!createdFile) {
      console.error("[api.upload-icon] No file created");
      return json({ error: "Failed to create file in Shopify" }, { status: 500 });
    }

    // Get the final URL
    const fileUrl = createdFile.url || createdFile.image?.url;
    console.log(`[api.upload-icon] File created with URL: ${fileUrl}`);

    return json({
      success: true,
      url: fileUrl,
      fileId: createdFile.id,
    });
  } catch (error: any) {
    console.error("[api.upload-icon] Error:", error);
    return json(
      {
        error: error.message || "Failed to upload icon",
      },
      { status: 500 }
    );
  }
};
