import { useState, useCallback, useEffect } from "react";
import {
  FormLayout,
  TextField,
  Select,
  Button,
  InlineStack,
  Banner,
  Text,
  BlockStack
} from "@shopify/polaris";
import { formatCurrency } from "~/utils/currency";

interface CreditAdjustmentFormProps {
  customer: {
    id: string;
    email: string;
    storeCredit: number | string;
  };
  type: 'add' | 'remove';
  onSubmit: (amount: number, reason: string) => void;
  onCancel: () => void;
  loading?: boolean;
  shopSettings?: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  initialAmount?: number;
  defaultReason?: string;
}

const PRESET_REASONS = {
  add: [
    { label: 'Customer service gesture', value: 'Customer service gesture' },
    { label: 'Loyalty reward', value: 'Loyalty reward' },
    { label: 'Referral bonus', value: 'Referral bonus' },
    { label: 'Promotion', value: 'Promotion' },
    { label: 'Refund to store credit', value: 'Refund to store credit' },
    { label: 'Other', value: 'other' },
  ],
  remove: [
    { label: 'Error correction', value: 'Error correction' },
    { label: 'Fraud prevention', value: 'Fraud prevention' },
    { label: 'Customer request', value: 'Customer request' },
    { label: 'Expired credit', value: 'Expired credit' },
    { label: 'Other', value: 'other' },
  ]
};

export function CreditAdjustmentForm({
  customer,
  type,
  onSubmit,
  onCancel,
  loading = false,
  shopSettings,
  initialAmount,
  defaultReason
}: CreditAdjustmentFormProps) {
  // Initialize amount from props if provided
  const hasInitialAmount = initialAmount !== undefined && initialAmount > 0;
  const [customAmount, setCustomAmount] = useState(hasInitialAmount ? initialAmount.toString() : '');

  // If defaultReason is provided, use it
  const defaultReasonValue = defaultReason || PRESET_REASONS[type][0].value;
  const isCustomReason = defaultReason && !PRESET_REASONS[type].some(r => r.value === defaultReason);
  const [presetReason, setPresetReason] = useState(isCustomReason ? 'other' : defaultReasonValue);
  const [customReason, setCustomReason] = useState(isCustomReason ? defaultReason : '');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});

  // Make currentBalance reactive to prop changes
  const [currentBalance, setCurrentBalance] = useState(() => {
    return typeof customer.storeCredit === 'string'
      ? parseFloat(customer.storeCredit)
      : customer.storeCredit;
  });

  // Update balance when customer prop changes
  useEffect(() => {
    const newBalance = typeof customer.storeCredit === 'string'
      ? parseFloat(customer.storeCredit)
      : customer.storeCredit;
    setCurrentBalance(newBalance);
  }, [customer.storeCredit]);

  const getAmount = useCallback(() => {
    return parseFloat(customAmount) || 0;
  }, [customAmount]);

  const getReason = useCallback(() => {
    if (presetReason === 'other') {
      return customReason;
    }
    return presetReason;
  }, [presetReason, customReason]);

  const validate = useCallback(() => {
    const newErrors: { amount?: string; reason?: string } = {};
    const amount = getAmount();
    const reason = getReason();

    if (amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (amount > 999999.99) {
      newErrors.amount = 'Amount cannot exceed $999,999.99';
    }

    if (type === 'remove' && amount > currentBalance) {
      newErrors.amount = `Cannot remove more than current balance (${formatCurrency(currentBalance, shopSettings as any)})`;
    }

    if (!reason || reason.trim().length === 0) {
      newErrors.reason = 'Reason is required';
    }

    if (reason && reason.length > 500) {
      newErrors.reason = 'Reason must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [getAmount, getReason, type, currentBalance, shopSettings]);

  const handleSubmit = useCallback(() => {
    if (validate()) {
      onSubmit(getAmount(), getReason());
    }
  }, [validate, getAmount, getReason, onSubmit]);

  return (
    <BlockStack gap="400">
      <Banner tone="info">
        <Text as="p" variant="bodySm">
          {type === 'add' ? 'Adding' : 'Removing'} store credit for{' '}
          <Text as="span" fontWeight="semibold">{customer.email}</Text>
        </Text>
      </Banner>

      <FormLayout>
        <TextField
          label="Amount"
          type="number"
          value={customAmount}
          onChange={setCustomAmount}
          prefix={shopSettings?.storeCurrency || '$'}
          error={errors.amount}
          disabled={loading}
          autoComplete="off"
        />

        <Select
          label="Reason"
          options={PRESET_REASONS[type]}
          value={presetReason}
          onChange={setPresetReason}
          disabled={loading}
        />

        {presetReason === 'other' && (
          <TextField
            label="Specify reason"
            value={customReason}
            onChange={setCustomReason}
            multiline={3}
            error={errors.reason}
            disabled={loading}
            maxLength={500}
            showCharacterCount
            autoComplete="off"
          />
        )}
      </FormLayout>

      <InlineStack gap="200" align="end">
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          tone={type === 'add' ? 'success' : 'critical'}
          onClick={handleSubmit}
          loading={loading}
        >
          {type === 'add' ? 'Add Credit' : 'Remove Credit'}
        </Button>
      </InlineStack>
    </BlockStack>
  );
}