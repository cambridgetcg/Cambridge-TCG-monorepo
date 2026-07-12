"use client";

import { useEffect, useRef, useState } from "react";

interface CollectorMediaItem {
  id: string;
  status: "pending" | "ready";
  sourceMimeType: "image/jpeg" | "image/png" | "image/webp";
  sourceBytes: number;
  storedBytes: number;
  width: number;
  height: number;
  createdAt: string;
  readyAt: string | null;
}

interface VaultResponse {
  media?: CollectorMediaItem[];
  error?: string;
}

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function responseMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "The collector media vault is unavailable.";
}

/**
 * Standalone owner UI. It is intentionally not mounted on passport or
 * portfolio pages until the private bucket and operating controls are signed
 * off. The browser sends the raw file to the authenticated server route; it
 * never receives an upload capability or permanent URL. A download action
 * returns a one-minute bearer URL, including its private storage host/path.
 */
export function CollectorMediaVaultPanel({
  className = "",
  canDownload,
  canUpload,
}: {
  className?: string;
  canDownload: boolean;
  canUpload: boolean;
}) {
  const [media, setMedia] = useState<CollectorMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/media-vault", {
        credentials: "same-origin",
        cache: "no-store",
      })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        return (await response.json()) as VaultResponse;
      })
      .then((body) => {
        if (cancelled) return;
        setMedia(body.media ?? []);
        setMessage(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "The vault is unavailable.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      setMessage("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      setMessage("Choose a non-empty image no larger than 3 MiB.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/media-vault", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = (await response.json()) as { media: CollectorMediaItem };
      setMedia((current) => [body.media, ...current]);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed safely.");
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/account/media-vault/${id}/access`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = (await response.json()) as { accessUrl: string };
      window.location.assign(body.accessUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this private collector photo? This cannot be undone.")) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/account/media-vault/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setMedia((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deletion could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`rounded-xl border border-border-subtle bg-surface p-5 ${className}`.trim()}
      aria-labelledby="collector-media-vault-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="collector-media-vault-heading" className="text-lg font-bold text-ink">
            Private collector media
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Owner-only photos. The server removes metadata and stores a bounded WebP;
            downloads use a one-minute private attachment link.
          </p>
        </div>
        {canUpload ? (
          <label className="cursor-pointer rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-page disabled:opacity-50">
            {busy ? "Working…" : "Add photo"}
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
        ) : (
          <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
            Intake off
          </span>
        )}
      </div>

      <p className="mt-3 text-xs text-ink-faint">
        {canUpload
          ? "JPEG, PNG, or WebP · 3 MiB maximum · 20 photos per account"
          : canDownload
            ? "Read-only mode: download and deletion remain available; new intake is off."
            : "Safe-off mode: only metadata listing and permanent deletion remain available."}
      </p>

      {message && (
        <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-ink">
          {message}
        </p>
      )}

      {loading ? (
        <p className="mt-5 text-sm text-ink-faint">Loading private media…</p>
      ) : media.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed border-border-subtle p-4 text-sm text-ink-faint">
          No private collector photos stored.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {media.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-page px-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {item.status === "ready" ? "Private photo" : "Incomplete upload"}
                </p>
                <p className="text-xs text-ink-faint">
                  {item.width}×{item.height} · {(item.storedBytes / 1024).toFixed(0)} KiB ·{" "}
                  {new Date(item.createdAt).toLocaleDateString("en-GB")}
                </p>
              </div>
              {canDownload && item.status === "ready" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void download(item.id)}
                  className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-subtle disabled:opacity-50"
                >
                  Download
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(item.id)}
                className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default CollectorMediaVaultPanel;
