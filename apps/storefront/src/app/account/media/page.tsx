import type { Metadata } from "next";
import Link from "next/link";
import CollectorMediaVaultPanel from "@/components/account/CollectorMediaVaultPanel";
import { Audience } from "@/lib/ui";
import {
  collectorMediaVaultOperationAllowed,
  resolveCollectorMediaVaultConfig,
} from "@/lib/media-vault/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Private collector media",
  robots: { index: false, follow: false, nocache: true },
};

export default function CollectorMediaPage() {
  const resolved = resolveCollectorMediaVaultConfig();
  const listable = collectorMediaVaultOperationAllowed(resolved, "list");
  const readable = collectorMediaVaultOperationAllowed(resolved, "read");
  const uploadable = collectorMediaVaultOperationAllowed(resolved, "upload");

  return (
    <div>
      <Audience kind="consumer" contexts={["collector", "private-media"]} />
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Collection</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Private collector media</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Owner-only collection photos, kept separate from public Passport text,
          catalog images, identity documents, disputes, auctions and trade evidence.
        </p>
      </div>

      {listable ? (
        <CollectorMediaVaultPanel canDownload={readable} canUpload={uploadable} />
      ) : (
        <section className="rounded-xl border border-border-subtle bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-ink">Built, not enabled</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
                No photo metadata, upload, read, or deletion is accepted in this environment. The
                vault stays off until a dedicated private bucket, encryption key,
                least-privilege identity, deletion flow and staging security probes
                have all been verified together.
              </p>
            </div>
            <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
              Intake off
            </span>
          </div>
          <p className="mt-4 text-xs text-ink-faint">
            Existing public-media upload doors remain paused. Read the{" "}
            <Link href="/privacy" className="text-accent underline">privacy boundary</Link>.
          </p>
        </section>
      )}
    </div>
  );
}
