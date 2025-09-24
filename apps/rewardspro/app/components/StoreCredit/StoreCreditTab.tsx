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
  Divider
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
            </InlineStack>
            <div style={{ width: '300px' }}>
              <TextField
                label="Search transactions"
                labelHidden
                placeholder="Search by type, reason, or order..."
                prefix={<Icon source={SearchIcon} />}
                value={transactionSearch}
                onChange={setTransactionSearch}
                clearButton
                onClearButtonClick={() => setTransactionSearch("")}
                autoComplete="off"
              />
            </div>
          </InlineStack>

          <Box paddingBlockStart="200">
            {loadingTransactions ? (
              <InlineStack align="center">
                <Spinner size="small" />
                <Text as="span" variant="bodySm">Loading transactions...</Text>
              </InlineStack>
            ) : (
              <TransactionTable
                transactions={filteredTransactions}
                shopSettings={shopSettings}
                compact={false}
              />
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