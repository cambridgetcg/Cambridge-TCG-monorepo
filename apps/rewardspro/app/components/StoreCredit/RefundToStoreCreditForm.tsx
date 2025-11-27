import { useState, useCallback, useEffect } from "react";
import {
  FormLayout,
  TextField,
  Button,
  InlineStack,
  Banner,
  Text,
  BlockStack,
  Select,
  Box,
  Spinner,
  Badge,
  Divider
} from "@shopify/polaris";
import { formatCurrency } from "~/utils/currency";

interface Order {
  id: string;
  name: string;
  createdAt: string;
  financialStatus: string;
  total: {
    amount: string;
    currencyCode: string;
  };
}

interface RefundToStoreCreditFormProps {
  customer: {
    id: string;
    email: string;
    storeCredit: number | string;
  };
  orders: Order[];
  onSubmit: (orderId: string, amount: number, reason: string) => void;
  onCancel: () => void;
  loading?: boolean;
  shopSettings?: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
}

export function RefundToStoreCreditForm({
  customer,
  orders,
  onSubmit,
  onCancel,
  loading = false,
  shopSettings
}: RefundToStoreCreditFormProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [customAmount, setCustomAmount] = useState('');
  const [reason, setReason] = useState('Refund to store credit');
  const [errors, setErrors] = useState<{ order?: string; amount?: string; reason?: string }>({});

  // Get selected order details
  const selectedOrder = orders.find(o => o.id === selectedOrderId);
  const maxRefundAmount = selectedOrder
    ? parseFloat(selectedOrder.total.amount)
    : 0;

  // Order options for select
  const orderOptions = [
    { label: 'Select an order...', value: '' },
    ...orders.map(order => ({
      label: `${order.name} - ${formatCurrency(parseFloat(order.total.amount), shopSettings)} (${order.financialStatus})`,
      value: order.id
    }))
  ];

  // When order is selected, default amount to full order amount
  useEffect(() => {
    if (selectedOrder) {
      setCustomAmount(selectedOrder.total.amount);
    } else {
      setCustomAmount('');
    }
  }, [selectedOrderId, selectedOrder]);

  const getAmount = useCallback(() => {
    return parseFloat(customAmount) || 0;
  }, [customAmount]);

  const validate = useCallback(() => {
    const newErrors: { order?: string; amount?: string; reason?: string } = {};
    const amount = getAmount();

    if (!selectedOrderId) {
      newErrors.order = 'Please select an order to refund';
    }

    if (amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (amount > maxRefundAmount && selectedOrderId) {
      newErrors.amount = `Amount cannot exceed order total (${formatCurrency(maxRefundAmount, shopSettings as any)})`;
    }

    if (!reason || reason.trim().length === 0) {
      newErrors.reason = 'Reason is required';
    }

    if (reason && reason.length > 500) {
      newErrors.reason = 'Reason must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [getAmount, selectedOrderId, maxRefundAmount, reason, shopSettings]);

  const handleSubmit = useCallback(() => {
    if (validate()) {
      onSubmit(selectedOrderId, getAmount(), reason);
    }
  }, [validate, selectedOrderId, getAmount, reason, onSubmit]);

  // Filter to only show paid orders that haven't been fully refunded
  const refundableOrders = orders.filter(order =>
    ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'].includes(order.financialStatus?.toUpperCase() || '')
  );

  if (orders.length === 0) {
    return (
      <BlockStack gap="400">
        <Banner tone="info">
          <Text as="p" variant="bodySm">
            No orders found for this customer that can be refunded to store credit.
          </Text>
        </Banner>
        <InlineStack gap="200" align="end">
          <Button onClick={onCancel}>Close</Button>
        </InlineStack>
      </BlockStack>
    );
  }

  return (
    <BlockStack gap="400">
      <Banner tone="warning">
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" fontWeight="semibold">
            Create a Shopify Refund to Store Credit
          </Text>
          <Text as="p" variant="bodySm">
            This will create an official refund on the order in Shopify and issue the refund amount as store credit to the customer. The refund will appear on the order timeline.
          </Text>
        </BlockStack>
      </Banner>

      <FormLayout>
        <Select
          label="Select Order to Refund"
          options={orderOptions}
          value={selectedOrderId}
          onChange={setSelectedOrderId}
          error={errors.order}
          disabled={loading}
          helpText="Only orders with PAID or PARTIALLY_PAID status can be refunded"
        />

        {selectedOrder && (
          <Box
            background="bg-surface-secondary"
            padding="300"
            borderRadius="200"
          >
            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text as="span" variant="bodySm" tone="subdued">Order</Text>
                <Text as="span" variant="bodySm" fontWeight="semibold">{selectedOrder.name}</Text>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span" variant="bodySm" tone="subdued">Order Total</Text>
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  {formatCurrency(parseFloat(selectedOrder.total.amount), shopSettings)}
                </Text>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span" variant="bodySm" tone="subdued">Status</Text>
                <Badge tone={selectedOrder.financialStatus === 'PAID' ? 'success' : 'warning'}>
                  {selectedOrder.financialStatus}
                </Badge>
              </InlineStack>
            </BlockStack>
          </Box>
        )}

        <TextField
          label="Refund Amount"
          type="number"
          value={customAmount}
          onChange={setCustomAmount}
          prefix={shopSettings?.storeCurrency || '$'}
          error={errors.amount}
          disabled={loading || !selectedOrderId}
          autoComplete="off"
          helpText={selectedOrderId ? `Maximum: ${formatCurrency(maxRefundAmount, shopSettings)}` : 'Select an order first'}
        />

        <TextField
          label="Reason for Refund"
          value={reason}
          onChange={setReason}
          multiline={2}
          error={errors.reason}
          disabled={loading}
          maxLength={500}
          showCharacterCount
          autoComplete="off"
          helpText="This note will appear on the refund in Shopify"
        />
      </FormLayout>

      <Divider />

      <InlineStack gap="200" align="end">
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={loading}
          disabled={!selectedOrderId}
        >
          Create Refund to Store Credit
        </Button>
      </InlineStack>
    </BlockStack>
  );
}
