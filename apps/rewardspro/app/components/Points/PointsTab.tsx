import { useState, useCallback, useEffect, useRef } from "react";
import { useFetcher } from "@remix-run/react";
import {
  BlockStack,
  Card,
  Button,
  InlineStack,
  Text,
  Box,
  Modal,
  Banner,
  TextField,
  Icon,
  Spinner,
  Badge,
  Divider,
  Select,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import {
  PlusCircleIcon,
  MinusCircleIcon,
  ClockIcon,
  SearchIcon,
} from "@shopify/polaris-icons";
import { PointsAdjustmentForm } from "./PointsAdjustmentForm";

type ActionType = 'none' | 'add' | 'remove';

interface PointsTransactionRow {
  id: string;
  amount: number;
  balance: number;
  type: string;
  description: string | null;
  createdAt: string;
  expiresAt: string | null;
  metadata: Record<string, unknown> | null;
}

interface PointsTabProps {
  customer: {
    id: string;
    email: string;
    pointsBalance: number;
  };
  currencyConfig: {
    name: string;
    plural: string;
    icon: string;
  };
  initialTransactions?: PointsTransactionRow[];
  lifetimePoints?: number;
  expiringSoon?: number;
}

export function PointsTab({
  customer,
  currencyConfig,
  initialTransactions,
  lifetimePoints = 0,
  expiringSoon = 0,
}: PointsTabProps) {
  const actionFetcher = useFetcher();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [transactions, setTransactions] = useState<PointsTransactionRow[]>(initialTransactions || []);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPageSize, setSelectedPageSize] = useState(25);
  const [activeAction, setActiveAction] = useState<ActionType>('none');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [currentBalance, setCurrentBalance] = useState(customer.pointsBalance);
  const [currentLifetime, setCurrentLifetime] = useState(lifetimePoints);

  // Update when customer prop changes (different customer selected)
  useEffect(() => {
    setCurrentBalance(customer.pointsBalance);
    setCurrentLifetime(lifetimePoints);
    setCurrentPage(1);
    setTransactionSearch("");
    if (initialTransactions) {
      setTransactions(initialTransactions);
    }
  }, [customer.id, customer.pointsBalance, lifetimePoints, initialTransactions]);

  // Watch for action fetcher responses
  useEffect(() => {
    if (actionFetcher.data) {
      const data = actionFetcher.data as any;
      if (data.success) {
        if (data.newBalance !== undefined) {
          setCurrentBalance(data.newBalance);
        }
        if (data.newLifetime !== undefined) {
          setCurrentLifetime(data.newLifetime);
        }
        if (data.transactions) {
          setTransactions(data.transactions);
        }
        setShowAddModal(false);
        setShowRemoveModal(false);
        setActiveAction('none');
      } else if (data.error || data.message) {
        setActiveAction('none');
      }
    }
  }, [actionFetcher.data]);

  // Reset active action when fetcher becomes idle
  useEffect(() => {
    if (actionFetcher.state === 'idle' && activeAction !== 'none') {
      if (actionFetcher.data) {
        setActiveAction('none');
      }
    }
  }, [actionFetcher.state, activeAction, actionFetcher.data]);

  const handleAddPoints = useCallback((amount: number, reason: string) => {
    setActiveAction('add');
    setBannerDismissed(false);
    const formData = new FormData();
    formData.append("intent", "adjustPoints");
    formData.append("customerId", customer.id);
    formData.append("actionType", "add");
    formData.append("amount", amount.toString());
    formData.append("reason", reason);
    actionFetcher.submit(formData, { method: "post" });
  }, [customer.id, actionFetcher]);

  const handleRemovePoints = useCallback((amount: number, reason: string) => {
    setActiveAction('remove');
    setBannerDismissed(false);
    const formData = new FormData();
    formData.append("intent", "adjustPoints");
    formData.append("customerId", customer.id);
    formData.append("actionType", "remove");
    formData.append("amount", amount.toString());
    formData.append("reason", reason);
    actionFetcher.submit(formData, { method: "post" });
  }, [customer.id, actionFetcher]);

  const filteredTransactions = transactions.filter(transaction => {
    if (!transactionSearch) return true;
    const search = transactionSearch.toLowerCase();
    return (
      transaction.type?.toLowerCase().includes(search) ||
      transaction.description?.toLowerCase().includes(search) ||
      (typeof (transaction.metadata as any)?.reason === 'string' && (transaction.metadata as any).reason.toLowerCase().includes(search))
    );
  });

  const totalPages = Math.ceil(filteredTransactions.length / selectedPageSize);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * selectedPageSize,
    currentPage * selectedPageSize
  );

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  const handlePageSizeChange = useCallback((value: string) => {
    setSelectedPageSize(parseInt(value));
    setCurrentPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setTransactionSearch(value);
    setCurrentPage(1);
  }, []);

  const isActionInProgress = actionFetcher.state === "submitting" || actionFetcher.state === "loading";

  const getTransactionBadge = (type: string) => {
    const config: Record<string, { tone: "success" | "info" | "warning" | "critical", label: string }> = {
      ORDER_EARNED: { tone: "success", label: "Purchase" },
      CHALLENGE_COMPLETED: { tone: "success", label: "Challenge" },
      SPIN_WHEEL_WIN: { tone: "success", label: "Spin Win" },
      SCRATCH_CARD_WIN: { tone: "success", label: "Scratch Win" },
      MYSTERY_BOX_WIN: { tone: "success", label: "Mystery Box" },
      BONUS_EVENT: { tone: "success", label: "Bonus" },
      REFERRAL_BONUS: { tone: "success", label: "Referral" },
      MANUAL_CREDIT: { tone: "info", label: "Manual Credit" },
      STREAK_BONUS: { tone: "success", label: "Streak" },
      RAFFLE_ENTRY: { tone: "warning", label: "Raffle" },
      MYSTERY_BOX_OPEN: { tone: "warning", label: "Mystery Box" },
      PREMIUM_SPIN: { tone: "warning", label: "Premium Spin" },
      GIVEBACK_DONATION: { tone: "warning", label: "Donation" },
      MANUAL_DEBIT: { tone: "critical", label: "Manual Debit" },
      EXPIRATION: { tone: "critical", label: "Expired" },
      REFUND_CLAWBACK: { tone: "critical", label: "Clawback" },
      SYSTEM_ADJUSTMENT: { tone: "info", label: "System" },
    };

    const { tone, label } = config[type] || { tone: "info" as const, label: type };
    return <Badge tone={tone}>{label}</Badge>;
  };

  const formatAmount = (amount: number) => {
    const formatted = Math.abs(amount).toLocaleString();
    return (
      <Text as="span" tone={amount >= 0 ? "success" : "critical"} fontWeight="semibold">
        {amount >= 0 ? "+" : "-"}{formatted}
      </Text>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const transactionRows = paginatedTransactions.map(transaction => {
    const details = transaction.description
      || (transaction.metadata as any)?.reason
      || "\u2014";

    return [
      formatDate(transaction.createdAt),
      getTransactionBadge(transaction.type),
      formatAmount(transaction.amount),
      transaction.balance.toLocaleString(),
      details,
    ];
  });

  return (
    <BlockStack gap="400">
      {/* Header with balance and actions */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">
                Current Balance
              </Text>
              <InlineStack gap="200" blockAlign="baseline">
                {currencyConfig.icon && (
                  <Text as="span" variant="headingXl">{currencyConfig.icon}</Text>
                )}
                <Text
                  as="span"
                  variant="headingXl"
                  fontWeight="bold"
                  tone={currentBalance > 0 ? "success" : undefined}
                >
                  {currentBalance.toLocaleString()} {currencyConfig.plural}
                </Text>
              </InlineStack>
            </BlockStack>
            <InlineStack gap="200">
              <Button
                icon={PlusCircleIcon}
                variant="primary"
                tone="success"
                onClick={() => setShowAddModal(true)}
                disabled={isActionInProgress}
              >
                Add {currencyConfig.name}
              </Button>
              <Button
                icon={MinusCircleIcon}
                onClick={() => setShowRemoveModal(true)}
                disabled={isActionInProgress || currentBalance <= 0}
              >
                Remove {currencyConfig.name}
              </Button>
            </InlineStack>
          </InlineStack>

          <Divider />
          <InlineStack gap="600">
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">Lifetime Earned</Text>
              <Text as="span" variant="headingSm" fontWeight="bold">
                {currentLifetime.toLocaleString()} {currencyConfig.plural}
              </Text>
            </BlockStack>
            {expiringSoon > 0 && (
              <BlockStack gap="100">
                <Text as="span" variant="bodySm" tone="subdued">Expiring Soon (30 days)</Text>
                <Text as="span" variant="headingSm" fontWeight="bold" tone="caution">
                  {expiringSoon.toLocaleString()} {currencyConfig.plural}
                </Text>
              </BlockStack>
            )}
          </InlineStack>
        </BlockStack>
      </Card>

      {/* Transaction History */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <Icon source={ClockIcon} />
              <Text variant="headingMd" as="h3">
                Transaction History
              </Text>
              {filteredTransactions.length > 0 && (
                <Badge>
                  {`${paginatedTransactions.length} of ${filteredTransactions.length}`}
                </Badge>
              )}
            </InlineStack>
            <InlineStack gap="200">
              <div style={{ width: '250px' }}>
                <TextField
                  label="Search transactions"
                  labelHidden
                  placeholder="Search by type or description..."
                  prefix={<Icon source={SearchIcon} />}
                  value={transactionSearch}
                  onChange={handleSearchChange}
                  clearButton
                  onClearButtonClick={() => handleSearchChange("")}
                  autoComplete="off"
                />
              </div>
              <Select
                label="Items per page"
                labelHidden
                options={[
                  { label: "25 per page", value: "25" },
                  { label: "50 per page", value: "50" },
                  { label: "100 per page", value: "100" },
                ]}
                value={selectedPageSize.toString()}
                onChange={handlePageSizeChange}
              />
            </InlineStack>
          </InlineStack>

          <Box paddingBlockStart="200">
            {transactions.length === 0 ? (
              <EmptyState
                heading={`No ${currencyConfig.plural.toLowerCase()} transactions yet`}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>{currencyConfig.name} transactions will appear here once the customer earns or spends {currencyConfig.plural.toLowerCase()}.</p>
              </EmptyState>
            ) : filteredTransactions.length === 0 ? (
              <Box padding="400">
                <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                  No transactions match your search.
                </Text>
              </Box>
            ) : (
              <BlockStack gap="400">
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "numeric", "text"]}
                  headings={["Date & Time", "Type", "Amount", "Balance", "Details"]}
                  rows={transactionRows}
                  hoverable
                />

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <Box>
                    <Divider />
                    <Box paddingBlockStart="400">
                      <InlineStack align="center" gap="400">
                        <Button
                          variant="plain"
                          disabled={currentPage === 1}
                          onClick={() => handlePageChange(currentPage - 1)}
                        >
                          Previous
                        </Button>

                        <InlineStack gap="200">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }

                            if (pageNum < 1 || pageNum > totalPages) return null;

                            return (
                              <Button
                                key={pageNum.toString()}
                                variant={currentPage === pageNum ? "primary" : "plain"}
                                onClick={() => handlePageChange(pageNum)}
                                size="slim"
                              >
                                {pageNum.toString()}
                              </Button>
                            );
                          })}
                        </InlineStack>

                        <Button
                          variant="plain"
                          disabled={currentPage === totalPages}
                          onClick={() => handlePageChange(currentPage + 1)}
                        >
                          Next
                        </Button>
                      </InlineStack>

                      <Box paddingBlockStart="200">
                        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                          Page {currentPage} of {totalPages} • Showing {((currentPage - 1) * selectedPageSize) + 1}-
                          {Math.min(currentPage * selectedPageSize, filteredTransactions.length)} of {filteredTransactions.length} transactions
                        </Text>
                      </Box>
                    </Box>
                  </Box>
                )}
              </BlockStack>
            )}
          </Box>
        </BlockStack>
      </Card>

      {/* Add Points Modal */}
      <Modal
        open={showAddModal}
        onClose={() => !isActionInProgress && setShowAddModal(false)}
        title={`Add ${currencyConfig.name}`}
        size="small"
      >
        <Modal.Section>
          <PointsAdjustmentForm
            key={`add-${showAddModal}`}
            customer={customer}
            type="add"
            onSubmit={handleAddPoints}
            onCancel={() => setShowAddModal(false)}
            loading={activeAction === 'add' && isActionInProgress}
            currencyConfig={currencyConfig}
          />
        </Modal.Section>
      </Modal>

      {/* Remove Points Modal */}
      <Modal
        open={showRemoveModal}
        onClose={() => !isActionInProgress && setShowRemoveModal(false)}
        title={`Remove ${currencyConfig.name}`}
        size="small"
      >
        <Modal.Section>
          <PointsAdjustmentForm
            key={`remove-${showRemoveModal}`}
            customer={customer}
            type="remove"
            onSubmit={handleRemovePoints}
            onCancel={() => setShowRemoveModal(false)}
            loading={activeAction === 'remove' && isActionInProgress}
            currencyConfig={currencyConfig}
          />
        </Modal.Section>
      </Modal>

      {/* Success/Error Messages */}
      {!bannerDismissed && actionFetcher.data && (actionFetcher.data as any).message && (
        <Banner
          tone={(actionFetcher.data as any).success ? "success" : "critical"}
          onDismiss={() => setBannerDismissed(true)}
        >
          <p>{(actionFetcher.data as any).message}</p>
        </Banner>
      )}
    </BlockStack>
  );
}
