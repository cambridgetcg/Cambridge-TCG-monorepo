import { DataTable, Card, Text, Badge, EmptyState, SkeletonBodyText } from "@shopify/polaris";
import { formatCurrency } from "~/utils/currency";
import type { LedgerEntryType } from "@prisma/client";

interface Transaction {
  id: string;
  amount: string;
  balance: string;
  type: LedgerEntryType;
  metadata: any;
  createdAt: string;
  shopifyOrderId?: string | null;
}

interface TransactionTableProps {
  transactions: Transaction[];
  shopSettings?: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  loading?: boolean;
  compact?: boolean;
}

export function TransactionTable({
  transactions,
  shopSettings,
  loading = false,
  compact = false
}: TransactionTableProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (compact) {
      return date.toLocaleDateString();
    }
    return date.toLocaleString();
  };

  const getTransactionBadge = (type: LedgerEntryType) => {
    const config: Record<LedgerEntryType, { tone: "success" | "info" | "warning" | "critical", label: string }> = {
      CASHBACK_EARNED: { tone: "success", label: "Cashback" },
      ORDER_PAYMENT: { tone: "info", label: "Payment" },
      REFUND_CREDIT: { tone: "warning", label: "Refund" },
      REFUND_CLAWBACK: { tone: "critical", label: "Clawback" },
      MANUAL_ADJUSTMENT: { tone: "info", label: "Adjustment" },
      SHOPIFY_SYNC: { tone: "info", label: "Sync" },
    };

    const { tone, label } = config[type] || { tone: "info", label: type };
    return <Badge tone={tone}>{label}</Badge>;
  };

  const formatAmount = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    const formatted = shopSettings
      ? formatCurrency(Math.abs(num), shopSettings as any)
      : `$${Math.abs(num).toFixed(2)}`;

    return (
      <Text as="span" tone={num >= 0 ? "success" : "critical"} fontWeight="semibold">
        {num >= 0 ? "+" : "-"}{formatted}
      </Text>
    );
  };

  if (loading) {
    return (
      <Card>
        <SkeletonBodyText lines={5} />
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <EmptyState
        heading="No transactions yet"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>Store credit transactions will appear here once customers earn or use their credit.</p>
      </EmptyState>
    );
  }

  const headings = compact
    ? ["Date", "Type", "Amount", "Balance"]
    : ["Date & Time", "Type", "Amount", "Balance", "Details"];

  const rows = transactions.map(transaction => {
    const baseRow = [
      formatDate(transaction.createdAt),
      getTransactionBadge(transaction.type),
      formatAmount(transaction.amount),
      formatCurrency(parseFloat(transaction.balance), shopSettings as any)
    ];

    if (!compact) {
      // Extract details from metadata based on transaction type
      let details = "—";

      if (transaction.type === "CASHBACK_EARNED" && transaction.metadata) {
        // For cashback: show description or order name
        details = transaction.metadata.description ||
                 transaction.metadata.orderName ||
                 transaction.shopifyOrderId || "—";
      } else if (transaction.type === "MANUAL_ADJUSTMENT" && transaction.metadata) {
        // For manual adjustments: show reason
        details = transaction.metadata.reason || "—";
      } else if (transaction.type === "ORDER_PAYMENT" && transaction.metadata) {
        // For payments: show order information
        details = transaction.metadata.orderName ||
                 transaction.shopifyOrderId || "—";
      } else if (transaction.type === "REFUND_CREDIT" && transaction.metadata) {
        // For refunds: show refund reason or order
        details = transaction.metadata.reason ||
                 transaction.metadata.orderName ||
                 transaction.shopifyOrderId || "—";
      } else if (transaction.shopifyOrderId) {
        // Fallback to order ID if available
        details = `Order ${transaction.shopifyOrderId}`;
      }

      baseRow.push(details);
    }

    return baseRow;
  });

  return (
    <DataTable
      columnContentTypes={
        compact
          ? ["text", "text", "numeric", "numeric"]
          : ["text", "text", "numeric", "numeric", "text"]
      }
      headings={headings}
      rows={rows}
      hoverable
      truncate={compact}
    />
  );
}