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
  Select
} from "@shopify/polaris";
import {
  PlusCircleIcon,
  MinusCircleIcon,
  RefreshIcon,
  ClockIcon,
  SearchIcon,
  ReturnIcon
} from "@shopify/polaris-icons";
import { StoreCreditDisplay } from "./StoreCreditDisplay";
import { TransactionTable } from "./TransactionTable";
import { CreditAdjustmentForm } from "./CreditAdjustmentForm";
import { RefundToStoreCreditForm } from "./RefundToStoreCreditForm";

// Track which action is currently in progress for granular button states
type ActionType = 'none' | 'add' | 'remove' | 'sync' | 'refund';

interface Order {
  id: string;
  name: string;
  createdAt: string;
  financialStatus: string;
  fulfillmentStatus: string;
  total: {
    amount: string;
    currencyCode: string;
  };
  lineItems: Array<{
    title: string;
    quantity: number;
    total: {
      amount: string;
      currencyCode: string;
    };
  }>;
}

interface StoreCreditTabProps {
  customer: {
    id: string;
    email: string;
    shopifyCustomerId: string;
    storeCredit: number | string;
    currentTier?: {
      name: string;
      cashbackPercent: number;
    } | null;
  };
  shopSettings?: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  orders?: Order[];
}

export function StoreCreditTab({ customer, shopSettings, orders = [] }: StoreCreditTabProps) {
  // Use separate fetchers for transactions (background) vs actions (user-initiated)
  const transactionFetcher = useFetcher();
  const actionFetcher = useFetcher();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPageSize, setSelectedPageSize] = useState(25);

  // Track which specific action is in progress for granular button feedback
  const [activeAction, setActiveAction] = useState<ActionType>('none');

  // Prevent duplicate transaction loads
  const isLoadingTransactionsRef = useRef(false);

  // Track balance locally to update immediately after credit changes
  const initialBalance = typeof customer.storeCredit === 'string'
    ? parseFloat(customer.storeCredit)
    : customer.storeCredit;
  const [currentBalance, setCurrentBalance] = useState(initialBalance);

  // Load transactions when component mounts or customer changes
  useEffect(() => {
    loadTransactions();
    // Update balance when customer prop changes
    const newBalance = typeof customer.storeCredit === 'string'
      ? parseFloat(customer.storeCredit)
      : customer.storeCredit;
    setCurrentBalance(newBalance);
  }, [customer.id, customer.storeCredit]);

  // Watch for transaction fetcher responses (background loading)
  useEffect(() => {
    if (transactionFetcher.data) {
      const data = transactionFetcher.data as any;
      if (data.transactions) {
        setTransactions(data.transactions);
        isLoadingTransactionsRef.current = false;
      }
    }
    if (transactionFetcher.state === 'idle') {
      isLoadingTransactionsRef.current = false;
    }
  }, [transactionFetcher.data, transactionFetcher.state]);

  // Watch for action fetcher responses (user-initiated actions)
  useEffect(() => {
    if (actionFetcher.data) {
      const data = actionFetcher.data as any;
      if (data.success) {
        // Update balance if new balance is returned
        if (data.newBalance !== undefined) {
          setCurrentBalance(parseFloat(data.newBalance));
        }
        // Close modals on successful action
        setShowAddModal(false);
        setShowRemoveModal(false);
        setShowRefundModal(false);
        // Reset active action
        setActiveAction('none');
        // Reload transactions after any credit change
        if (data.message?.includes('Credit') || data.message?.includes('Sync') || data.message?.includes('refund')) {
          loadTransactions();
        }
      } else if (data.error || data.message) {
        // Reset active action on error as well
        setActiveAction('none');
      }
    }
  }, [actionFetcher.data]);

  // Reset active action when actionFetcher becomes idle
  useEffect(() => {
    if (actionFetcher.state === 'idle' && activeAction !== 'none') {
      // Only reset if we have data (action completed)
      if (actionFetcher.data) {
        setActiveAction('none');
      }
    }
  }, [actionFetcher.state, activeAction, actionFetcher.data]);

  const loadTransactions = useCallback(() => {
    // Prevent duplicate loads
    if (isLoadingTransactionsRef.current) return;
    isLoadingTransactionsRef.current = true;

    const formData = new FormData();
    formData.append("intent", "loadTransactions");
    formData.append("customerId", customer.id);
    transactionFetcher.submit(formData, { method: "post" });
  }, [customer.id, transactionFetcher]);

  const handleAddCredit = useCallback((amount: number, reason: string) => {
    setActiveAction('add');
    const formData = new FormData();
    formData.append("intent", "adjustCredit");
    formData.append("customerId", customer.id);
    formData.append("actionType", "add");
    formData.append("amount", amount.toString());
    formData.append("reason", reason);
    actionFetcher.submit(formData, { method: "post" });
  }, [customer.id, actionFetcher]);

  const handleRemoveCredit = useCallback((amount: number, reason: string) => {
    setActiveAction('remove');
    const formData = new FormData();
    formData.append("intent", "adjustCredit");
    formData.append("customerId", customer.id);
    formData.append("actionType", "remove");
    formData.append("amount", amount.toString());
    formData.append("reason", reason);
    actionFetcher.submit(formData, { method: "post" });
  }, [customer.id, actionFetcher]);

  const handleSyncCredit = useCallback(() => {
    setActiveAction('sync');
    const formData = new FormData();
    formData.append("intent", "syncCredit");
    formData.append("customerId", customer.id);
    actionFetcher.submit(formData, { method: "post" });
  }, [customer.id, actionFetcher]);

  const handleRefundToStoreCredit = useCallback((orderId: string, amount: number, reason: string) => {
    setActiveAction('refund');
    const formData = new FormData();
    formData.append("intent", "refundToStoreCredit");
    formData.append("customerId", customer.id);
    formData.append("orderId", orderId);
    formData.append("amount", amount.toString());
    formData.append("reason", reason);
    actionFetcher.submit(formData, { method: "post" });
  }, [customer.id, actionFetcher]);

  // Filter orders that can be refunded (PAID or PARTIALLY_PAID)
  const refundableOrders = orders.filter(order =>
    ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'].includes(order.financialStatus?.toUpperCase() || '')
  );

  const filteredTransactions = transactions.filter(transaction => {
    if (!transactionSearch) return true;
    const search = transactionSearch.toLowerCase();
    return (
      transaction.type?.toLowerCase().includes(search) ||
      transaction.metadata?.reason?.toLowerCase().includes(search) ||
      transaction.shopifyOrderId?.toLowerCase().includes(search)
    );
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredTransactions.length / selectedPageSize);
  const paginatedTransactions = filteredTransactions.slice((currentPage - 1) * selectedPageSize, currentPage * selectedPageSize);

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  const handlePageSizeChange = useCallback((value: string) => {
    setSelectedPageSize(parseInt(value));
    setCurrentPage(1); // Reset to first page when changing page size
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setTransactionSearch(value);
    setCurrentPage(1); // Reset to first page when searching
  }, []);

  // Derived state for loading indicators
  const isTransactionsLoading = transactionFetcher.state === "submitting" || transactionFetcher.state === "loading";
  const isActionInProgress = actionFetcher.state === "submitting" || actionFetcher.state === "loading";

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
              <StoreCreditDisplay
                amount={currentBalance}
                shopSettings={shopSettings}
                size="large"
                tone={currentBalance > 0 ? "success" : undefined}
              />
            </BlockStack>
            <InlineStack gap="200">
              <Button
                icon={PlusCircleIcon}
                variant="primary"
                tone="success"
                onClick={() => setShowAddModal(true)}
                disabled={isActionInProgress}
              >
                Add Credit
              </Button>
              <Button
                icon={MinusCircleIcon}
                onClick={() => setShowRemoveModal(true)}
                disabled={isActionInProgress || currentBalance <= 0}
              >
                Remove Credit
              </Button>
              {refundableOrders.length > 0 && (
                <Button
                  icon={ReturnIcon}
                  onClick={() => setShowRefundModal(true)}
                  disabled={isActionInProgress}
                >
                  Refund to Credit
                </Button>
              )}
              <Button
                icon={RefreshIcon}
                onClick={handleSyncCredit}
                loading={activeAction === 'sync' && isActionInProgress}
                disabled={isActionInProgress}
              >
                Sync from Shopify
              </Button>
            </InlineStack>
          </InlineStack>

          {customer.currentTier && (
            <>
              <Divider />
              <InlineStack align="space-between">
                <Text variant="bodyMd" as="span">
                  Current Tier
                </Text>
                <Badge tone="success">
                  {`${customer.currentTier.name} (${customer.currentTier.cashbackPercent}% cashback)`}
                </Badge>
              </InlineStack>
            </>
          )}
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
                  placeholder="Search by type, reason, or order..."
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
                  { label: "200 per page", value: "200" },
                ]}
                value={selectedPageSize.toString()}
                onChange={handlePageSizeChange}
              />
            </InlineStack>
          </InlineStack>

          <Box paddingBlockStart="200">
            {isTransactionsLoading && transactions.length === 0 ? (
              <InlineStack align="center" gap="200">
                <Spinner size="small" />
                <Text as="span" variant="bodySm" tone="subdued">Loading transactions...</Text>
              </InlineStack>
            ) : (
              <BlockStack gap="400">
                <TransactionTable
                  transactions={paginatedTransactions}
                  shopSettings={shopSettings}
                  compact={false}
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

      {/* Add Credit Modal */}
      <Modal
        open={showAddModal}
        onClose={() => !isActionInProgress && setShowAddModal(false)}
        title="Add Store Credit"
        size="small"
      >
        <Modal.Section>
          <CreditAdjustmentForm
            customer={customer}
            type="add"
            onSubmit={handleAddCredit}
            onCancel={() => setShowAddModal(false)}
            loading={activeAction === 'add' && isActionInProgress}
            shopSettings={shopSettings}
          />
        </Modal.Section>
      </Modal>

      {/* Remove Credit Modal */}
      <Modal
        open={showRemoveModal}
        onClose={() => !isActionInProgress && setShowRemoveModal(false)}
        title="Remove Store Credit"
        size="small"
      >
        <Modal.Section>
          <CreditAdjustmentForm
            customer={customer}
            type="remove"
            onSubmit={handleRemoveCredit}
            onCancel={() => setShowRemoveModal(false)}
            loading={activeAction === 'remove' && isActionInProgress}
            shopSettings={shopSettings}
          />
        </Modal.Section>
      </Modal>

      {/* Refund to Store Credit Modal */}
      <Modal
        open={showRefundModal}
        onClose={() => !isActionInProgress && setShowRefundModal(false)}
        title="Refund Order to Store Credit"
        size="large"
      >
        <Modal.Section>
          <RefundToStoreCreditForm
            customer={customer}
            orders={refundableOrders}
            onSubmit={handleRefundToStoreCredit}
            onCancel={() => setShowRefundModal(false)}
            loading={activeAction === 'refund' && isActionInProgress}
            shopSettings={shopSettings}
          />
        </Modal.Section>
      </Modal>

      {/* Success/Error Messages */}
      {actionFetcher.data && (actionFetcher.data as any).message && (
        <Banner
          tone={(actionFetcher.data as any).success ? "success" : "critical"}
          onDismiss={() => {}}
        >
          <p>{(actionFetcher.data as any).message}</p>
        </Banner>
      )}
    </BlockStack>
  );
}