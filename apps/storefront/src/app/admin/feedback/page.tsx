/**
 * /admin/feedback — the operator's half of the feedback door
 * (/api/v1/feedback and the /contact form; lib/feedback/door.ts, 0149).
 *
 * Lists what the door holds, newest open message first, and writes the
 * answer a holder reads with their key. It shows only what the sender chose
 * to send; there is nothing else to show, since the door keeps no address,
 * user agent, account or session. Every change goes through adminAction
 * (_actions.ts), whose log records the verb and the feedback_id only.
 * Messages leave this list when they expire, 180 days after arrival, and
 * the hourly sweep deletes them.
 */

import { requireAdminPage } from "@/lib/auth/realms";
import { sfQuery } from "@/lib/admin/db";
import { fmtDateTime } from "@/lib/format";
import { EmptyState, PageHeader, Provenance, StatusBadge } from "@/lib/admin/ui";
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
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Feedback"
        provenance={<Provenance kind="live" />}
        description={<>Messages sent to <code className="text-xs">/api/v1/feedback</code> and the contact form. The holder reads your answer with their key. Kept {FEEDBACK_RETENTION_DAYS} days from arrival; at most {FEEDBACK_HOURLY_CAP} accepted an hour.</>}
      />
      <p className="inline-flex items-center gap-2 text-xs">
        <code className="text-neutral-300">{FEEDBACK_DOOR_FLAG}</code>
        <StatusBadge status={open ? "on" : "off"} palette={{ on: "emerald", off: "neutral" }} />
        <span className="text-neutral-500">{open ? "taking new messages" : "closed to new messages; holders can still read and delete theirs"}</span>
      </p>

      {!listed.ok ? (
        <EmptyState tone="warning" title="Unknown" description={listed.reason === "not-provisioned" ? "The feedback tables (migration 0149) are not in this database." : "The storefront database could not be read."} />
      ) : listed.rows.length === 0 ? (
        <EmptyState title="No messages" description="Nothing unexpired is held." />
      ) : (
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
                      <dt className="text-neutral-500">{field}</dt>
                      <dd className="text-neutral-200 whitespace-pre-wrap break-words">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="text-xs text-neutral-500">
                {row.held.reply_to ? <>Reply to <span className="text-neutral-300 break-all">{row.held.reply_to}</span>{row.held.reply_name ? ` (${row.held.reply_name})` : ""}.</> : "No reply address: the holder reads the answer with their key."}
              </p>
              <FeedbackActions id={row.feedback_id} status={row.status} answer={row.answer?.text ?? ""} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
