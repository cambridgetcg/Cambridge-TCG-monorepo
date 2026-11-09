"use server";

/**
 * Feedback — admin server actions for the feedback door (lib/feedback/door.ts).
 *
 *   answerFeedback     — write the answer the holder reads with the key;
 *                        status becomes answered.
 *   markFeedback       — read or closed.
 *   deleteFeedback     — erase the row now, as a holder can.
 *
 * Each runs through adminAction(), which checks the admin and logs the verb
 * and the feedback_id to admin_actions_log. The message and the answer are
 * never put in the log: the log is kept longer than the 180 days the row is,
 * and a copy there would outlive it.
 */

import { adminAction, ActionInputError } from "@/lib/admin/actions";
import { sfQuery } from "@/lib/admin/db";
import {
  FEEDBACK_ANSWER_SQL,
  FEEDBACK_ID_PATTERN,
  FEEDBACK_OPERATOR_DELETE_SQL,
  FEEDBACK_OPERATOR_STATUSES,
  FEEDBACK_STATUS_SQL,
  changeFeedback,
  validateAnswer,
  type FeedbackOperatorStatus,
} from "@/lib/feedback/door";

const PAGE = "/admin/feedback";
const run = (sql: string, params?: unknown[]) => sfQuery(sql, params) as Promise<{ rows: Record<string, unknown>[] }>;

function feedbackId(id: unknown): string {
  if (typeof id !== "string" || !FEEDBACK_ID_PATTERN.test(id)) throw new ActionInputError("Not a feedback id.");
  return id;
}

export async function answerFeedback(input: { id: string; answer: string }) {
  return adminAction({
    action: "feedback.answer",
    targetKind: "feedback",
    targetId: typeof input.id === "string" ? input.id : null,
    revalidate: PAGE,
    run: async () => {
      const checked = validateAnswer(input.id, input.answer);
      if (!checked.ok) throw new ActionInputError(checked.error);
      if (!(await changeFeedback(FEEDBACK_ANSWER_SQL, [checked.value.feedbackId, checked.value.answer], run))) {
        throw new ActionInputError("No unexpired message has that id.");
      }
      return { id: checked.value.feedbackId, status: "answered" as const };
    },
  });
}

export async function markFeedback(input: { id: string; status: FeedbackOperatorStatus }) {
  return adminAction({
    action: `feedback.${input.status === "closed" ? "close" : "read"}`,
    targetKind: "feedback",
    targetId: typeof input.id === "string" ? input.id : null,
    revalidate: PAGE,
    run: async () => {
      const id = feedbackId(input.id);
      if (!(FEEDBACK_OPERATOR_STATUSES as readonly string[]).includes(input.status)) throw new ActionInputError("Status must be read or closed.");
      if (!(await changeFeedback(FEEDBACK_STATUS_SQL, [id, input.status], run))) throw new ActionInputError("No unexpired message has that id.");
      return { id, status: input.status };
    },
  });
}

export async function deleteFeedback(input: { id: string }) {
  return adminAction({
    action: "feedback.delete",
    targetKind: "feedback",
    targetId: typeof input.id === "string" ? input.id : null,
    revalidate: PAGE,
    run: async () => {
      const id = feedbackId(input.id);
      if (!(await changeFeedback(FEEDBACK_OPERATOR_DELETE_SQL, [id], run))) throw new ActionInputError("No message has that id.");
      return { id, deleted: true as const };
    },
  });
}
