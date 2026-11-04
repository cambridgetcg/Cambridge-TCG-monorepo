/**
 * AutoCashbackConfirmModal - what turning on automatic cashback pays
 *
 * The reconciliation cron sends every PENDING cashback entry from the last
 * 7 days in a shop with automatic cashback on, 50 an hour
 * (api.cron.cashback-reconciliation.tsx), so turning it on also pays the
 * cashback already waiting. The dashboard asks first when any is waiting
 * (autoCashbackBacklog).
 */

import { BlockStack, Modal, Text } from "@shopify/polaris";
import { formatCurrency } from "~/utils/currency";

/** Waiting cashback the cron sends per run (MAX_ENTRIES_PER_RUN) */
const SENT_PER_HOUR = 50;

export function autoCashbackBacklogText({ count, total, currency }: { count: number; total: number; currency: string }): string {
  const amount = formatCurrency(total, currency);
  const waiting =
    count === 1
      ? `1 paid order from the last 7 days is waiting for cashback (${amount}).`
      : `${count} paid orders from the last 7 days are waiting for cashback (${amount} in all).`;
  const hours = Math.ceil(count / SENT_PER_HOUR);
  const when = hours <= 1 ? "within the hour" : `over the next ${hours} hours`;
  return `${waiting} Turning automatic cashback on pays ${count === 1 ? "it" : "them"} as store credit ${when}, less any refunds, along with cashback on new paid orders.`;
}

export interface AutoCashbackConfirmModalProps {
  open: boolean;
  count: number;
  total: number;
  currency: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AutoCashbackConfirmModal({ open, count, total, currency, onConfirm, onCancel }: AutoCashbackConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Turn on automatic cashback?"
      primaryAction={{ content: count === 1 ? "Turn on and pay it" : "Turn on and pay them", onAction: onConfirm }}
      secondaryActions={[{ content: "Cancel", onAction: onCancel }]}
    >
      <Modal.Section>
        <BlockStack gap="200">
          <Text as="p">{autoCashbackBacklogText({ count, total, currency })}</Text>
          <Text as="p" tone="subdued">
            {count === 1 ? "To leave it unpaid" : "To leave some of them unpaid"}, keep automatic cashback off and issue cashback order
            by order on the Orders page.
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
