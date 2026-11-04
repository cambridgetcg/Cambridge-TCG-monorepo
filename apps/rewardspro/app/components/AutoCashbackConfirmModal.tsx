/**
 * AutoCashbackConfirmModal - what turning on automatic cashback pays
 *
 * The reconciliation cron sends every PENDING cashback entry from the last
 * 7 days in a shop with automatic cashback on, once an hour, oldest first
 * across every such shop (api.cron.cashback-reconciliation.tsx), so turning
 * it on also pays the cashback already waiting. The dashboard asks first
 * when any is waiting (autoCashbackBacklog), or when it does not know.
 */

import { BlockStack, Modal, Text } from "@shopify/polaris";
import { formatCurrency } from "~/utils/currency";

/** The waiting cashback, or null when it could not be counted or may have changed since */
export type AutoCashbackBacklog = { count: number; total: number } | null;

const HOW_IT_IS_SENT = "Waiting cashback is sent once an hour, oldest first.";

export function autoCashbackBacklogText(backlog: AutoCashbackBacklog, currency: string): string {
  if (backlog === null) {
    return `Turning automatic cashback on also pays any cashback still waiting from paid orders of the last 7 days as store credit, less any refunds, along with cashback on new paid orders. ${HOW_IT_IS_SENT}`;
  }
  const { count, total } = backlog;
  const amount = formatCurrency(total, currency);
  const waiting =
    count === 1
      ? `1 paid order from the last 7 days is waiting for cashback (${amount}).`
      : `${count} paid orders from the last 7 days are waiting for cashback (${amount} in all).`;
  return `${waiting} Turning automatic cashback on pays ${count === 1 ? "it" : "them"} as store credit, less any refunds, along with cashback on new paid orders. ${HOW_IT_IS_SENT}`;
}

export interface AutoCashbackConfirmModalProps {
  open: boolean;
  backlog: AutoCashbackBacklog;
  currency: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AutoCashbackConfirmModal({ open, backlog, currency, onConfirm, onCancel }: AutoCashbackConfirmModalProps) {
  const one = backlog?.count === 1;
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Turn on automatic cashback?"
      primaryAction={{
        content: backlog === null ? "Turn on automatic cashback" : one ? "Turn on and pay it" : "Turn on and pay them",
        onAction: onConfirm,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onCancel }]}
    >
      <Modal.Section>
        <BlockStack gap="200">
          <Text as="p">{autoCashbackBacklogText(backlog, currency)}</Text>
          <Text as="p" tone="subdued">
            {one ? "To leave it unpaid" : "To leave some of them unpaid"}, keep automatic cashback off and issue cashback order
            by order on the Orders page.
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
