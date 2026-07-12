import Link from "next/link";
import { listSourceMeta } from "@cambridge-tcg/data-ingest";
import AdminShell from "@/components/admin/AdminShell";
import { Audience, Provenance } from "@/lib/admin/ui";
import { listLatestSourceRightsReviews } from "@/lib/source-rights/workbench-db";

export const metadata = { title: "Source rights · Admin" };
export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  redistribute: "border-emerald-700/50 bg-emerald-950/40 text-emerald-300",
  "display-with-terms": "border-sky-700/50 bg-sky-950/40 text-sky-300",
  "contract-only": "border-violet-700/50 bg-violet-950/40 text-violet-300",
  "internal-only": "border-amber-700/50 bg-amber-950/40 text-amber-300",
  "no-fetch": "border-red-700/50 bg-red-950/40 text-red-300",
};

export default async function SourceRightsPage() {
  let reviewsAvailable = true;
  let latest = new Map<string, Awaited<ReturnType<typeof listLatestSourceRightsReviews>>[number]>();
  try {
    latest = new Map((await listLatestSourceRightsReviews()).map((review) => [review.source_id, review]));
  } catch {
    reviewsAvailable = false;
  }

  const sources = listSourceMeta();
  return (
    <AdminShell
      title="Source rights"
      subtitle="Deployed policy is effective. Workbench reviews are append-only proposals and cannot turn on fetching, storage, display or redistribution."
    >
      <Audience kind="operator" contexts={["source-rights", "review"]} />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <Provenance kind="live" source="deployed registry + storefront proposal ledger" />
        <span className="rounded border border-emerald-800/50 bg-emerald-950/30 px-2 py-1 text-emerald-300">
          Deployed policy · effective
        </span>
        <span className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-400">
          Proposal · not effective
        </span>
      </div>

      {!reviewsAvailable && (
        <div className="mb-5 rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-200">
          The proposal ledger is unavailable or migration 0122 has not been applied. Deployed rights remain visible and effective; proposal values show —.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-neutral-900/80 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Deployed default</th>
              <th className="px-4 py-3">Redistribution</th>
              <th className="px-4 py-3">Reviewed</th>
              <th className="px-4 py-3">Latest proposal</th>
              <th className="px-4 py-3 text-right">Cells</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-900">
            {sources.map((source) => {
              const proposal = latest.get(source.id);
              return (
                <tr key={source.id} className="bg-neutral-950 hover:bg-neutral-900/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/system/source-rights/${source.id}`} className="font-medium text-white hover:text-amber-300">
                      {source.name}
                    </Link>
                    <div className="font-mono text-xs text-neutral-600">{source.id} · {source.status}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded border px-2 py-1 text-xs ${TONE[source.rights.safe_default] ?? "border-neutral-700 text-neutral-400"}`}>
                      {source.rights.safe_default}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-300">{source.rights.redistribution.verdict}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-400">{source.rights.reviewed_at}</td>
                  <td className="px-4 py-3">
                    {reviewsAvailable ? proposal ? (
                      <div>
                        <span className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300">{proposal.state}</span>
                        <div className="mt-1 max-w-xs truncate text-xs text-neutral-600">{proposal.summary}</div>
                      </div>
                    ) : <span className="text-neutral-700">none</span> : <span className="text-neutral-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-neutral-400">
                    {reviewsAvailable ? proposal?.cell_count ?? 0 : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
