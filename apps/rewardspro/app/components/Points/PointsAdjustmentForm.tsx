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

interface PointsAdjustmentFormProps {
  customer: {
    id: string;
    email: string;
    pointsBalance: number;
  };
  type: 'add' | 'remove';
  onSubmit: (amount: number, reason: string) => void;
  onCancel: () => void;
  loading?: boolean;
  currencyConfig?: {
    name: string;
    plural: string;
    icon: string;
  } | null;
}

const PRESET_REASONS = {
  add: [
    { label: 'Customer service gesture', value: 'Customer service gesture' },
    { label: 'Loyalty reward', value: 'Loyalty reward' },
    { label: 'Promotional bonus', value: 'Promotional bonus' },
    { label: 'Error correction', value: 'Error correction' },
    { label: 'Other', value: 'other' },
  ],
  remove: [
    { label: 'Error correction', value: 'Error correction' },
    { label: 'Fraud prevention', value: 'Fraud prevention' },
    { label: 'Customer request', value: 'Customer request' },
    { label: 'Points expiration', value: 'Points expiration' },
    { label: 'Other', value: 'other' },
  ]
};

export function PointsAdjustmentForm({
  customer,
  type,
  onSubmit,
  onCancel,
  loading = false,
  currencyConfig
}: PointsAdjustmentFormProps) {
  const [customAmount, setCustomAmount] = useState('');
  const [presetReason, setPresetReason] = useState(PRESET_REASONS[type][0].value);
  const [customReason, setCustomReason] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});

  const currencyName = currencyConfig?.name || 'Points';
  const currencyPlural = currencyConfig?.plural || 'Points';
  const currencyIcon = currencyConfig?.icon || '';

  const [currentBalance, setCurrentBalance] = useState(customer.pointsBalance);

  useEffect(() => {
    setCurrentBalance(customer.pointsBalance);
  }, [customer.pointsBalance]);

  const getAmount = useCallback(() => {
    return parseInt(customAmount, 10) || 0;
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

    // Points are integers
    if (customAmount && !Number.isInteger(parseFloat(customAmount))) {
      newErrors.amount = `${currencyName} must be whole numbers`;
    }

    if (amount > 999999999) {
      newErrors.amount = `Amount cannot exceed 999,999,999 ${currencyPlural}`;
    }

    if (type === 'remove' && amount > currentBalance) {
      newErrors.amount = `Cannot remove more than current balance (${currentBalance.toLocaleString()} ${currencyPlural})`;
    }

    if (!reason || reason.trim().length === 0) {
      newErrors.reason = 'Reason is required';
    }

    if (reason && reason.length > 500) {
      newErrors.reason = 'Reason must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [getAmount, getReason, type, currentBalance, currencyName, currencyPlural, customAmount]);

  const handleSubmit = useCallback(() => {
    if (validate()) {
      onSubmit(getAmount(), getReason());
    }
  }, [validate, getAmount, getReason, onSubmit]);

  return (
    <BlockStack gap="400">
      <Banner tone="info">
        <Text as="p" variant="bodySm">
          {type === 'add' ? 'Adding' : 'Removing'} {currencyPlural.toLowerCase()} for{' '}
          <Text as="span" fontWeight="semibold">{customer.email}</Text>
        </Text>
      </Banner>

      <FormLayout>
        <TextField
          label="Amount"
          type="number"
          value={customAmount}
          onChange={setCustomAmount}
          prefix={currencyIcon}
          suffix={currencyPlural}
          error={errors.amount}
          disabled={loading}
          autoComplete="off"
          min={1}
          step={1}
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
          {type === 'add' ? `Add ${currencyName}` : `Remove ${currencyName}`}
        </Button>
      </InlineStack>
    </BlockStack>
  );
}
