import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPresignedUploadUrl } from "@/lib/auction/s3";

// Reuse the auction S3 presigned URL system but with a "quotes" prefix.
// contentType drives the S3 key extension, so it's allowlisted rather
// than accepting any image/* string.
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  try {
    const { contentType } = await request.json();
    if (typeof contentType !== "string" || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json({ error: "Only JPEG, PNG, or WebP images allowed." }, { status: 400 });
    }

    // Use a quotes-specific prefix
    const result = await getPresignedUploadUrl("quotes", contentType);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[quote] Upload URL error:", err);
    return NextResponse.json({ error: "Failed to generate upload URL." }, { status: 500 });
  }
}
