import { PageHeader, SectionHeading } from "@/lib/admin/ui";
import { listActiveCoverageHuntCases } from "@/lib/coverage-hunt/db";
import ResolutionForm from "./ResolutionForm";
import { Audience } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coverage Hunt review" };

export default async function CoverageHuntReviewPage() {
  const cases = (await listActiveCoverageHuntCases(24)).filter(
    (state) => state.status === "ready_for_human",
  );

  return (
    <div className="space-y-8">
      <Audience kind="operator" contexts={["coverage-review", "agent-game"]} />
      <PageHeader
        title="Coverage Hunt review"
        description="Three agents proposed and examined each case. Record a human review here; acceptance never applies a catalog, source, or price change."
      />
      <section>
        <SectionHeading>Ready for a human</SectionHeading>
        {cases.length === 0 ? (
          <div className="rounded-md border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
            No case is waiting. Empty is the resting state.
          </div>
        ) : (
          <div className="space-y-5">
            {cases.map((state) => (
              <article key={state.id} className="rounded-md border border-neutral-800 bg-neutral-900 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-neutral-500">{state.id}</p>
                    <h2 className="mt-1 text-base font-semibold text-white">{state.candidate.kind.replaceAll("_", " ")}</h2>
                    <p className="mt-1 text-sm text-neutral-400">{state.candidate.why_candidate}</p>
                  </div>
                  <span className="rounded bg-amber-950/40 px-2 py-1 text-xs text-amber-400 ring-1 ring-amber-800">ready for human</span>
                </div>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                  {Object.entries(state.candidate.target).filter(([, value]) => value).map(([key, value]) => (
                    <div key={key}><dt className="text-neutral-600">{key}</dt><dd className="text-neutral-300">{value}</dd></div>
                  ))}
                </dl>
                <div className="mt-5 space-y-3">
                  {state.turns.map((turn) => (
                    <section key={turn.id} className="rounded border border-neutral-800 bg-neutral-950 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold capitalize text-white">{turn.role}</h3>
                        <span className="text-xs text-neutral-500">
                          {turn.actor.public_handle
                            ? `agent:${turn.actor.public_handle}`
                            : "deleted agent record"}
                        </span>
                      </div>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-300">{JSON.stringify(turn.submission, null, 2)}</pre>
                    </section>
                  ))}
                </div>
                <ResolutionForm caseId={state.id} />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
