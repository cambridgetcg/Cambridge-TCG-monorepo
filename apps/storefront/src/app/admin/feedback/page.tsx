/**
 * /admin/feedback — the operator's half of the feedback door
 * (/api/v1/feedback and the /contact form; lib/feedback/door.ts, 0149).
 *
 * Lists what the door holds, newest open message first, and writes the
 * answer a holder reads with their key. Nothing here sends anything. It shows
 * only what the sender chose to send; there is nothing else to show, since
 * the door keeps no IP address, user agent, account or session. Every change
 * goes through adminAction (_actions.ts), whose log records the verb and the
 * feedback_id only. Messages leave this list when they expire, 180 days after
 * arrival, and the hourly sweep deletes them.
 *
 * The page brings AdminShell's dark ground, without its wait for a fetch: the
 * admin colours do not follow the appearance themes.
 */

import { requireAdminPage } from "@/lib/auth/realms";
import { sfQuery } from "@/lib/admin/db";
import { fmtDateTime } from "@/lib/format";
import { ActionBanner, EmptyState, PageHeader, Provenance, StatusBadge } from "@/lib/admin/ui";
import { FEEDBACK_DOOR_FLAG, FEEDBACK_HOURLY_CAP, FEEDBACK_RETENTION_DAYS, feedbackDoorOpen, listFeedbackForOperator } from "@/lib/feedback/door";
import { FeedbackActions } from "./_components";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback" };

const STATUS_TONE = { received: "amber", read: "neutral", answered: "emerald", closed: "neutral" } as const;

export default async function Page() {
  await requireAdminPage();
  const open = feedbackDoorOpen();
  const listed = await listFeedbackForOperator((sql, params) => sfQuery(sql, params) as Promise<{ rows: Record<string, unknown>[] }>);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <PageHeader
          title="Feedback"
          provenance={<Provenance kind="live" />}
          description={<>Messages sent to <code className="text-xs">/api/v1/feedback</code> and the contact form. Your answer is shown to whoever holds the message&apos;s key; nothing is emailed from here. Kept {FEEDBACK_RETENTION_DAYS} days from arrival; at most {FEEDBACK_HOURLY_CAP} accepted an hour.</>}
        />
        <p className="inline-flex items-center gap-2 text-xs">
          <code className="text-neutral-300">{FEEDBACK_DOOR_FLAG}</code>
          <StatusBadge status={open ? "on" : "off"} palette={{ on: "emerald", off: "neutral" }} />
          <span className="text-neutral-400">{open ? "taking new messages" : "closed to new messages; holders can still read and delete theirs"}</span>
        </p>

        {!listed.ok ? (
          <EmptyState tone="warning" title="Unknown" description={listed.reason === "not-provisioned" ? "The feedback tables (migration 0149) are not in this database." : "The storefront database could not be read."} />
        ) : listed.rows.length === 0 ? (
          <EmptyState title="No messages" description="Nothing unexpired is held." />
        ) : (
          <>
            {listed.total > listed.rows.length && <LeftOut shown={listed.rows} total={listed.total} open={listed.open} />}
            <ul className="space-y-4">
              {listed.rows.map((row) => (
                <li key={row.feedback_id} className="rounded-lg border border-neutral-800 p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                    <StatusBadge status={row.status} palette={STATUS_TONE} />
                    <code className="text-neutral-300">{row.feedback_id}</code>
                    <span>{row.kind}{row.held.topic ? ` · ${row.held.topic}` : ""}</span>
                    <span>received {fmtDateTime(row.received_at)}</span>
                    <span>deleted {fmtDateTime(row.expires_at)}</span>
                  </div>
                  {row.held.message && <p className="text-sm text-neutral-100 whitespace-pre-wrap break-words">{row.held.message}</p>}
                  {Object.keys(row.held.details).length > 0 && (
                    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                      {Object.entries(row.held.details).map(([field, value]) => (
                        <div key={field} className="contents">
                          <dt className="text-neutral-400">{field}</dt>
                          <dd className="text-neutral-200 whitespace-pre-wrap break-words">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="text-xs text-neutral-400">
                    {row.held.reply_to
                      ? <>They left <span className="text-neutral-200 break-all">{row.held.reply_to}</span>{row.held.reply_name ? ` (${row.held.reply_name})` : ""}, which nobody has checked is theirs. Nothing is sent to it from here; a person may write to it.</>
                      : "No reply address: the holder reads the answer with their key."}
                  </p>
                  <FeedbackActions id={row.feedback_id} status={row.status} answer={row.answer?.text ?? ""} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

/** What the list leaves out, from the counts read with it. Open messages come
 * first and the newest first among each, so what is left out is the oldest. */
function LeftOut({ shown, total, open }: { shown: readonly { status: string }[]; total: number; open: number }) {
  const n = (value: number) => value.toLocaleString("en-GB");
  const openLeftOut = open - shown.filter((row) => row.status === "received" || row.status === "read").length;
  const doneLeftOut = total - shown.length - openLeftOut;
  return (
    <ActionBanner tone="warning" title={`Showing ${n(shown.length)} of ${n(total)} messages`}>
      {openLeftOut > 0
        ? `Left out: ${n(openLeftOut)} not answered or closed, the oldest of those${doneLeftOut ? `, and ${n(doneLeftOut)} answered or closed` : ""}. Answer, close or delete some below and they appear here.`
        : `Left out: ${n(doneLeftOut)} answered or closed, the oldest of those.`}
    </ActionBanner>
  );
}
