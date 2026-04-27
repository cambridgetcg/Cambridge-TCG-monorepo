import { NextResponse } from "next/server";
import { getPresignedUploadUrl } from "@/lib/auction/s3";

// Reuse the auction S3 presigned URL system but with a "quotes" prefix
export async function POST(request: Request) {
  try {
    const { contentType } = await request.json();
    if (!contentType?.startsWith("image/")) {
      return NextResponse.json({ error: "Only images allowed." }, { status: 400 });
    }

    // Use a quotes-specific prefix
    const result = await getPresignedUploadUrl("quotes", contentType);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[quote] Upload URL error:", err);
    return NextResponse.json({ error: "Failed to generate upload URL." }, { status: 500 });
  }
}
