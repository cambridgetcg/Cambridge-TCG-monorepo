import Link from "next/link";
import { notFound } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import { Audience, Provenance } from "@/lib/admin/ui";
import { deployedRegistryHash, deployedSourceMeta, SourceRightsInputError } from "@/lib/source-rights/workbench";
import { getSourceRightsReviewHistory } from "@/lib/source-rights/workbench-db";
import ProposalForm from "./ProposalForm";
import ReviewActions from "./ReviewActions";

export const dynamic = "force-dynamic";

export default async function SourceRightsDetailPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId } = await params;
  let source;
  try {
    source = deployedSourceMeta(sourceId);
  } catch (error) {
    if (error instanceof SourceRightsInputError) notFound();
    throw error;
  }

  let reviewsAvailable = true;
  let reviews: Awaited<ReturnType<typeof getSourceRightsReviewHistory>> = [];
  try {
    reviews = await getSourceRightsReviewHistory(sourceId);
  } catch {
    reviewsAvailable = false;
  }

  const layers = [
    { name: "Code", headline: source.rights.code.license, notes: source.rights.code.notes },
    { name: "Data", headline: source.rights.data.terms, notes: source.rights.data.notes },
    { name: "Images", headline: source.rights.images.terms, notes: source.rights.images.notes },
    { name: "Redistribution", headline: source.rights.redistribution.verdict, notes: source.rights.redistribution.notes },
  ];
  const currentRegistryHash = deployedRegistryHash(sourceId);
  const today = new Date().toISOString().slice(0, 10);
  const latestReview = reviews[0] ?? null;
  const canStartDraft = !latestReview || latestReview.state === "rejected" || latestReview.state === "landed";

  return (
    <AdminShell
      title={`${source.name} rights`}
      subtitle="The deployed record below is effective. Every workbench row is a non-effective proposal until ordinary code review and deployment changes the registry."
      actions={<Link href="/admin/system/source-rights" className="rounded border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:text-white">← All sources</Link>}
    >
      <Audience kind="operator" contexts={["source-rights", sourceId]} />
      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs">
        <Provenance kind="live" source="@cambridge-tcg/data-ingest registry" />
        <span className="rounded border border-emerald-800/60 bg-emerald-950/30 px-2 py-1 text-emerald-300">Deployed · effective</span>
        <code className="text-neutral-600">{source.id}</code>
      </div>

      <section className="mb-8 space-y-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {layers.map((layer) => (
            <div key={layer.name} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-600">{layer.name}</div>
              <div className="mt-1 break-words text-sm font-medium text-white">{layer.headline}</div>
              <p className="mt-2 text-xs leading-relaxed text-neutral-500">{layer.notes}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <Fact label="Safe default" value={source.rights.safe_default} />
            <Fact label="Reviewed" value={source.rights.reviewed_at} />
            <Fact label="Legacy redistribution flag" value={source.redistribute ? "true" : "false"} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-neutral-500">{source.rights.notes}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {source.rights.evidence_urls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="max-w-full truncate rounded border border-neutral-800 px-2 py-1 text-xs text-sky-300 hover:border-sky-700">
                {url}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Review history</h2>
            <p className="text-xs text-neutral-600">Append-only proposals. No row below is a runtime permission.</p>
          </div>
          <span className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400">Proposal · not effective</span>
        </div>
        {!reviewsAvailable ? (
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-200">
            Proposal ledger unavailable —. The deployed record above remains effective.
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-lg border border-neutral-800 p-5 text-sm text-neutral-600">No proposals recorded.</div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300">{review.state}</span>
                      <code className="text-xs text-neutral-700">{review.revision_hash.slice(0, 16)}</code>
                    </div>
                    <p className="mt-2 text-sm text-neutral-200">{review.summary}</p>
                  </div>
                  <time className="font-mono text-xs text-neutral-600">{review.created_at.slice(0, 19).replace("T", " ")}Z</time>
                </div>
                <div className="mt-3 grid gap-3 text-xs md:grid-cols-3">
                  <Fact label="Valid until" value={review.valid_until ?? "not set"} />
                  <Fact label="Agreement record" value={review.agreement_reference ? "recorded privately" : "none"} />
                  <Fact label="Exact cells" value={String(review.cells?.length ?? 0)} />
                </div>
                <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                  <Fact label="Base registry hash" value={review.base_registry_hash} />
                  <Fact
                    label="Registry drift"
                    value={review.base_registry_hash === currentRegistryHash ? "none — matches deployed policy" : `stale — deployed is ${currentRegistryHash}`}
                  />
                  {review.landed_commit && <Fact label="Observed landed commit" value={review.landed_commit} />}
                  {review.decision_note && <Fact label="Rejection reason" value={review.decision_note} />}
                </div>
                <p className="mt-3 text-xs text-neutral-500"><span className="text-neutral-600">Review trigger:</span> {review.review_trigger}</p>
                <div className="mt-3 space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-700">Public evidence</div>
                  {review.public_evidence.map((evidence) => (
                    <div key={evidence.url} className="flex flex-wrap gap-x-2 text-xs">
                      <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="break-all text-sky-300 hover:underline">{evidence.title}</a>
                      <span className="text-neutral-600">observed {evidence.observed_at}</span>
                    </div>
                  ))}
                </div>
                {!!review.cells?.length && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-left text-xs">
                      <thead className="text-neutral-600"><tr><th className="py-1">Field</th><th>Purpose</th><th>Verdict</th><th>Conditions</th><th>Attribution</th><th>Retention</th></tr></thead>
                      <tbody className="divide-y divide-neutral-900">
                        {review.cells.map((cell) => (
                          <tr key={`${cell.proposed_field_path}:${cell.purpose}`}>
                            <td className="py-1.5 font-mono text-neutral-300">{cell.proposed_field_path}</td>
                            <td className="text-neutral-400">{cell.purpose}</td>
                            <td className="text-neutral-300">{cell.verdict}</td>
                            <td className="max-w-sm whitespace-normal py-1.5 text-neutral-500">{cell.conditions ?? "—"}</td>
                            <td className="max-w-xs whitespace-normal text-neutral-500">{cell.attribution ?? "—"}</td>
                            <td className="text-neutral-500">{cell.retention_days == null ? "—" : `${cell.retention_days} days`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <ReviewActions
                  sourceId={sourceId}
                  reviewId={review.id}
                  state={review.state}
                  isLeaf={review.id === latestReview?.id}
                  blockedReason={
                    review.base_registry_hash !== currentRegistryHash
                      ? "Deployed registry changed. Reject this review and start a fresh draft."
                      : review.valid_until && review.valid_until < today
                        ? "This review expired. Reject it and start a fresh draft."
                        : null
                  }
                />
              </article>
            ))}
          </div>
        )}
      </section>

      {reviewsAvailable && canStartDraft ? (
        <ProposalForm sourceId={sourceId} />
      ) : reviewsAvailable ? (
        <p className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-500">
          Finish the current {latestReview?.state} review before starting another draft.
        </p>
      ) : null}
    </AdminShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-neutral-700">{label}</div><div className="mt-0.5 break-words text-neutral-300">{value}</div></div>;
}
