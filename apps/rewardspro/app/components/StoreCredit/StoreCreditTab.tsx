import { useState, useCallback, useEffect } from "react";
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
  Collapsible,
  Link
} from "@shopify/polaris";
import {
  PlusCircleIcon,
  MinusCircleIcon,
  RefreshIcon,
  ClockIcon,
  SearchIcon
} from "@shopify/polaris-icons";
import { StoreCreditDisplay } from "./StoreCreditDisplay";
import { TransactionTable } from "./TransactionTable";
import { CreditAdjustmentForm } from "./CreditAdjustmentForm";
import { formatCurrency } from "~/utils/currency";

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
}

export function StoreCreditTab({ customer, shopSettings }: StoreCreditTabProps) {
  const fetcher = useFetcher();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [transactionsExpanded, setTransactionsExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const transactionsPerPage = 7;

  const currentBalance = typeof customer.storeCredit === 'string'
    ? parseFloat(customer.storeCredit)
    : customer.storeCredit;

  // Load transactions when component mounts
  useEffect(() => {
    loadTransactions();
  }, [customer.id]);

  // Watch for fetcher responses
  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.transactions) {
        setTransactions(fetcher.data.transactions);
        setLoadingTransactions(false);
      }
      if (fetcher.data.success) {
        // Close modals on successful action
        setShowAddModal(false);
        setShowRemoveModal(false);
        setSyncLoading(false);
        // Reload transactions after any credit change
        if (fetcher.data.message?.includes('Credit') || fetcher.data.message?.includes('Sync')) {
          loadTransactions();
        }
      }
    }
  }, [fetcher.data]);

  const loadTransactions = useCallback(() => {
    setLoadingTransactions(true);
    const formData = new FormData();
    formData.append("intent", "loadTransactions");
    formData.append("customerId", customer.id);
    fetcher.submit(formData, { method: "post" });
  }, [customer.id, fetcher]);

  const handleAddCredit = useCallback((amount: number, reason: string) => {
    const formData = new FormData();
    formData.append("intent", "adjustCredit");
    formData.append("customerId", customer.id);
    formData.append("actionType", "add");
    formData.append("amount", amount.toString());
    formData.append("reason", reason);
    fetcher.submit(formData, { method: "post" });
  }, [customer.id, fetcher]);

  const handleRemoveCredit = useCallback((amount: number, reason: string) => {
    const formData = new FormData();
    formData.append("intent", "adjustCredit");
    formData.append("customerId", customer.id);
    formData.append("actionType", "remove");
    formData.append("amount", amount.toString());
    formData.append("reason", reason);
    fetcher.submit(formData, { method: "post" });
  }, [customer.id, fetcher]);

  const handleSyncCredit = useCallback(() => {
    setSyncLoading(true);
    const formData = new FormData();
    formData.append("intent", "syncCredit");
    formData.append("customerId", customer.id);
    fetcher.submit(formData, { method: "post" });
  }, [customer.id, fetcher]);

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
  const totalPages = Math.ceil(filteredTransactions.length / transactionsPerPage);
  const paginatedTransactions = transactionsExpanded
    ? filteredTransactions.slice((currentPage - 1) * transactionsPerPage, currentPage * transactionsPerPage)
    : filteredTransactions.slice(0, transactionsPerPage);

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  const handleToggleExpand = useCallback(() => {
    setTransactionsExpanded(!transactionsExpanded);
    if (!transactionsExpanded) {
      setCurrentPage(1);
    }
  }, [transactionsExpanded]);

  const handleSearchChange = useCallback((value: string) => {
    setTransactionSearch(value);
    setCurrentPage(1); // Reset to first page when searching
  }, []);

  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

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
                disabled={isLoading}
              >
                Add Credit
              </Button>
              <Button
                icon={MinusCircleIcon}
                onClick={() => setShowRemoveModal(true)}
                disabled={isLoading || currentBalance <= 0}
              >
                Remove Credit
              </Button>
              <Button
                icon={RefreshIcon}
                onClick={handleSyncCredit}
                loading={syncLoading}
                disabled={isLoading}
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
                  {customer.currentTier.name} ({customer.currentTier.cashbackPercent}% cashback)
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
                <Badge tone="subdued">{filteredTransactions.length}</Badge>
              )}
            </InlineStack>
            <InlineStack gap="200">
              <div style={{ width: '250px' }}>
                <TextField
                  label="Search transactions"
                  labelHidden
                  placeholder="Search transactions..."
                  prefix={<Icon source={SearchIcon} />}
                  value={transactionSearch}
                  onChange={handleSearchChange}
                  clearButton
                  onClearButtonClick={() => handleSearchChange("")}
                  autoComplete="off"
                />
              </div>
              {filteredTransactions.length > transactionsPerPage && (
                <Button
                  variant="plain"
                  onClick={handleToggleExpand}
                  disclosure={transactionsExpanded ? "up" : "down"}
                >
                  {transactionsExpanded ? "Show less" : `Show all (${filteredTransactions.length})`}
                </Button>
              )}
            </InlineStack>
          </InlineStack>

          <Box paddingBlockStart="200">
            {loadingTransactions ? (
              <InlineStack align="center">
                <Spinner size="small" />
                <Text as="span" variant="bodySm">Loading transactions...</Text>
              </InlineStack>
            ) : (
              <BlockStack gap="400">
                <TransactionTable
                  transactions={paginatedTransactions}
                  shopSettings={shopSettings}
                  compact={false}
                />

                {/* Pagination Controls */}
                {transactionsExpanded && totalPages > 1 && (
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
                                key={pageNum}
                                variant={currentPage === pageNum ? "primary" : "plain"}
                                onClick={() => handlePageChange(pageNum)}
                                size="slim"
                              >
                                {pageNum}
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
                          Showing {((currentPage - 1) * transactionsPerPage) + 1}-
                          {Math.min(currentPage * transactionsPerPage, filteredTransactions.length)} of {filteredTransactions.length} transactions
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
        onClose={() => setShowAddModal(false)}
        title="Add Store Credit"
        size="small"
      >
        <Modal.Section>
          <CreditAdjustmentForm
            customer={customer}
            type="add"
            onSubmit={handleAddCredit}
            onCancel={() => setShowAddModal(false)}
            loading={isLoading}
            shopSettings={shopSettings}
          />
        </Modal.Section>
      </Modal>

      {/* Remove Credit Modal */}
      <Modal
        open={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        title="Remove Store Credit"
        size="small"
      >
        <Modal.Section>
          <CreditAdjustmentForm
            customer={customer}
            type="remove"
            onSubmit={handleRemoveCredit}
            onCancel={() => setShowRemoveModal(false)}
            loading={isLoading}
            shopSettings={shopSettings}
          />
        </Modal.Section>
      </Modal>

      {/* Success/Error Messages */}
      {fetcher.data?.message && (
        <Banner
          tone={fetcher.data.success ? "success" : "critical"}
          onDismiss={() => {}}
        >
          <p>{fetcher.data.message}</p>
        </Banner>
      )}
    </BlockStack>
  );
}