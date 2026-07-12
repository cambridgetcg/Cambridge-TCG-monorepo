import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  collectorMediaVaultOperationAllowed,
  resolveCollectorMediaVaultConfig,
} from "@/lib/media-vault/config";
import { findOwnedCollectorMedia } from "@/lib/media-vault/db";
import {
  collectorMediaNotFound,
  collectorMediaUnavailable,
  COLLECTOR_MEDIA_PRIVATE_HEADERS,
} from "@/lib/media-vault/http";
import { isSameOriginMutation } from "@/lib/media-vault/input";
import { isUuid } from "@/lib/media-vault/keys";
import {
  COLLECTOR_MEDIA_ACCESS_SECONDS,
  createCollectorMediaVaultStorage,
} from "@/lib/media-vault/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401, headers: COLLECTOR_MEDIA_PRIVATE_HEADERS },
    );
  }

  const resolved = resolveCollectorMediaVaultConfig();
  if (!collectorMediaVaultOperationAllowed(resolved, "read")) {
    return collectorMediaUnavailable();
  }
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "Same-origin request required." },
      { status: 403, headers: COLLECTOR_MEDIA_PRIVATE_HEADERS },
    );
  }

  const { id } = await params;
  if (!isUuid(id)) return collectorMediaNotFound();

  let media;
  try {
    media = await findOwnedCollectorMedia(id, session.user.id, true);
  } catch {
    return collectorMediaUnavailable();
  }
  if (!media) return collectorMediaNotFound();

  try {
    const accessUrl = await createCollectorMediaVaultStorage(
      resolved.config,
    ).createAccessUrl(media.objectKey);
    return NextResponse.json(
      {
        accessUrl,
        expiresInSeconds: COLLECTOR_MEDIA_ACCESS_SECONDS,
        disposition: "attachment",
      },
      { headers: COLLECTOR_MEDIA_PRIVATE_HEADERS },
    );
  } catch {
    return collectorMediaUnavailable();
  }
}
