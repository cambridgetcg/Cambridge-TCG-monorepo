import React, { useState, useCallback, useMemo } from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Checkbox,
  Select,
  Badge,
  Banner,
  Divider,
  Button,
  Icon,
  Box,
  Collapsible,
  Tooltip,
} from '@shopify/polaris';
import {
  CalendarIcon,
  InfoIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon,
} from '@shopify/polaris-icons';

export interface SubscriptionOption {
  enableMonthly: boolean;
  enableQuarterly: boolean;
  enableAnnual: boolean;
  monthlyDiscount: string;
  quarterlyDiscount: string;
  annualDiscount: string;
  trialDays?: string;
  anchorType?: 'YEARDAY' | 'MONTHDAY' | 'WEEKDAY';
  anchorDay?: string;
  anchorMonth?: string;
  deliveryPolicy?: 'IMMEDIATE' | 'FIXED_CUTOFF' | 'PREORDER';
  inventoryPolicy?: 'CONTINUE' | 'PAUSE';
}

interface SubscriptionOptionsManagerProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  options: SubscriptionOption;
  onOptionsChange: (options: SubscriptionOption) => void;
  basePrice: string;
  currency?: string;
  showAdvanced?: boolean;
  compactMode?: boolean;
}

export function SubscriptionOptionsManager({
  enabled,
  onEnabledChange,
  options,
  onOptionsChange,
  basePrice,
  currency = 'USD',
  showAdvanced = true,
  compactMode = false,
}: SubscriptionOptionsManagerProps) {
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showPricingPreview, setShowPricingPreview] = useState(true);

  // Calculate pricing for each interval
  const calculatePrice = useCallback((interval: 'monthly' | 'quarterly' | 'annual') => {
    const price = parseFloat(basePrice || '0');
    const multipliers = { monthly: 1, quarterly: 3, annual: 12 };
    const discounts = {
      monthly: parseFloat(options.monthlyDiscount || '0'),
      quarterly: parseFloat(options.quarterlyDiscount || '0'),
      annual: parseFloat(options.annualDiscount || '0'),
    };

    const multiplier = multipliers[interval];
    const discount = discounts[interval];
    const total = price * multiplier;
    const discountAmount = total * (discount / 100);
    const final = total - discountAmount;

    return {
      total: total.toFixed(2),
      discount: discountAmount.toFixed(2),
      final: final.toFixed(2),
      perMonth: (final / multiplier).toFixed(2),
      savings: discountAmount > 0 ? discountAmount.toFixed(2) : null,
    };
  }, [basePrice, options]);

  const pricingData = useMemo(() => ({
    monthly: calculatePrice('monthly'),
    quarterly: calculatePrice('quarterly'),
    annual: calculatePrice('annual'),
  }), [calculatePrice]);

  // Validation helpers
  const validateDiscount = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '0';
    if (num < 0) return '0';
    if (num > 100) return '100';
    return value;
  };

  const handleDiscountChange = useCallback((field: keyof SubscriptionOption, value: string) => {
    const validated = validateDiscount(value);
    onOptionsChange({
      ...options,
      [field]: validated,
    });
  }, [options, onOptionsChange]);

  const handleCheckboxChange = useCallback((field: keyof SubscriptionOption, value: boolean) => {
    onOptionsChange({
      ...options,
      [field]: value,
    });
  }, [options, onOptionsChange]);

  const anchorTypeOptions = [
    { label: 'Specific day of month', value: 'MONTHDAY' },
    { label: 'Specific day of year', value: 'YEARDAY' },
    { label: 'Specific weekday', value: 'WEEKDAY' },
  ];

  const deliveryPolicyOptions = [
    { label: 'Immediate delivery', value: 'IMMEDIATE' },
    { label: 'Fixed cutoff', value: 'FIXED_CUTOFF' },
    { label: 'Pre-order', value: 'PREORDER' },
  ];

  const inventoryPolicyOptions = [
    { label: 'Continue selling', value: 'CONTINUE' },
    { label: 'Pause selling', value: 'PAUSE' },
  ];

  const hasEnabledOptions = options.enableMonthly || options.enableQuarterly || options.enableAnnual;

  if (compactMode) {
    return (
      <BlockStack gap="400">
        <Checkbox
          label="Enable subscription"
          checked={enabled}
          onChange={onEnabledChange}
        />
        {enabled && (
          <Box paddingInlineStart="400">
            <BlockStack gap="200">
              <InlineStack gap="200" align="center">
                <Checkbox
                  label="Monthly"
                  checked={options.enableMonthly}
                  onChange={(value) => handleCheckboxChange('enableMonthly', value)}
                />
                {options.enableMonthly && (
                  <TextField
                    label=""
                    type="number"
                    value={options.monthlyDiscount}
                    onChange={(value) => handleDiscountChange('monthlyDiscount', value)}
                    suffix="%"
                    autoComplete="off"
                    connectedRight={
                      <Button size="slim" variant="plain">
                        {currency} {pricingData.monthly.final}
                      </Button>
                    }
                  />
                )}
              </InlineStack>
              
              <InlineStack gap="200" align="center">
                <Checkbox
                  label="Quarterly"
                  checked={options.enableQuarterly}
                  onChange={(value) => handleCheckboxChange('enableQuarterly', value)}
                />
                {options.enableQuarterly && (
                  <TextField
                    label=""
                    type="number"
                    value={options.quarterlyDiscount}
                    onChange={(value) => handleDiscountChange('quarterlyDiscount', value)}
                    suffix="%"
                    autoComplete="off"
                    connectedRight={
                      <Button size="slim" variant="plain">
                        {currency} {pricingData.quarterly.final}
                      </Button>
                    }
                  />
                )}
              </InlineStack>
              
              <InlineStack gap="200" align="center">
                <Checkbox
                  label="Annual"
                  checked={options.enableAnnual}
                  onChange={(value) => handleCheckboxChange('enableAnnual', value)}
                />
                {options.enableAnnual && (
                  <TextField
                    label=""
                    type="number"
                    value={options.annualDiscount}
                    onChange={(value) => handleDiscountChange('annualDiscount', value)}
                    suffix="%"
                    autoComplete="off"
                    connectedRight={
                      <Button size="slim" variant="plain">
                        {currency} {pricingData.annual.final}
                      </Button>
                    }
                  />
                )}
              </InlineStack>
            </BlockStack>
          </Box>
        )}
      </BlockStack>
    );
  }

  return (
    <Card>
      <BlockStack gap="500">
        {/* Main toggle */}
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <InlineStack gap="200" align="center">
              <Icon source={CalendarIcon} tone="base" />
              <Text variant="headingMd" as="h3">
                Subscription Options
              </Text>
            </InlineStack>
            <Checkbox
              label="Enable subscriptions"
              checked={enabled}
              onChange={onEnabledChange}
            />
          </InlineStack>

          {enabled && !hasEnabledOptions && (
            <Banner tone="warning">
              Please enable at least one billing frequency below
            </Banner>
          )}
        </BlockStack>

        {enabled && (
          <>
            <Divider />

            {/* Billing Frequencies */}
            <BlockStack gap="400">
              <Text variant="headingSm" as="h4">
                Billing Frequencies
              </Text>

              <BlockStack gap="300">
                {/* Monthly */}
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <InlineStack gap="200" align="center">
                        <Checkbox
                          label={
                            <InlineStack gap="100" align="center">
                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                Monthly Billing
                              </Text>
                              <Badge tone="info">Most Popular</Badge>
                            </InlineStack>
                          }
                          checked={options.enableMonthly}
                          onChange={(value) => handleCheckboxChange('enableMonthly', value)}
                        />
                      </InlineStack>
                      {options.enableMonthly && (
                        <InlineStack gap="200" align="center">
                          <TextField
                            label="Discount"
                            labelHidden
                            type="number"
                            value={options.monthlyDiscount}
                            onChange={(value) => handleDiscountChange('monthlyDiscount', value)}
                            prefix="Discount"
                            suffix="%"
                            autoComplete="off"
                          />
                        </InlineStack>
                      )}
                    </InlineStack>
                    {options.enableMonthly && (
                      <Box paddingInlineStart="600">
                        <InlineStack gap="400">
                          <Text variant="bodyMd" tone="subdued" as="span">
                            Price: {currency} {pricingData.monthly.final}/month
                          </Text>
                          {pricingData.monthly.savings && (
                            <Badge tone="success">
                              {`Saves ${currency} ${pricingData.monthly.savings}`}
                            </Badge>
                          )}
                        </InlineStack>
                      </Box>
                    )}
                  </BlockStack>
                </Box>

                {/* Quarterly */}
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <InlineStack gap="200" align="center">
                        <Checkbox
                          label={
                            <InlineStack gap="100" align="center">
                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                Quarterly Billing
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="span">
                                (Every 3 months)
                              </Text>
                            </InlineStack>
                          }
                          checked={options.enableQuarterly}
                          onChange={(value) => handleCheckboxChange('enableQuarterly', value)}
                        />
                      </InlineStack>
                      {options.enableQuarterly && (
                        <InlineStack gap="200" align="center">
                          <TextField
                            label="Discount"
                            labelHidden
                            type="number"
                            value={options.quarterlyDiscount}
                            onChange={(value) => handleDiscountChange('quarterlyDiscount', value)}
                            prefix="Discount"
                            suffix="%"
                            autoComplete="off"
                          />
                        </InlineStack>
                      )}
                    </InlineStack>
                    {options.enableQuarterly && (
                      <Box paddingInlineStart="600">
                        <InlineStack gap="400">
                          <Text variant="bodyMd" tone="subdued" as="span">
                            Price: {currency} {pricingData.quarterly.final} per quarter
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="span">
                            ({currency} {pricingData.quarterly.perMonth}/month)
                          </Text>
                          {pricingData.quarterly.savings && (
                            <Badge tone="success">
                              {`Saves ${currency} ${pricingData.quarterly.savings}`}
                            </Badge>
                          )}
                        </InlineStack>
                      </Box>
                    )}
                  </BlockStack>
                </Box>

                {/* Annual */}
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <InlineStack gap="200" align="center">
                        <Checkbox
                          label={
                            <InlineStack gap="100" align="center">
                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                Annual Billing
                              </Text>
                              <Badge tone="success">Best Value</Badge>
                            </InlineStack>
                          }
                          checked={options.enableAnnual}
                          onChange={(value) => handleCheckboxChange('enableAnnual', value)}
                        />
                      </InlineStack>
                      {options.enableAnnual && (
                        <InlineStack gap="200" align="center">
                          <TextField
                            label="Discount"
                            labelHidden
                            type="number"
                            value={options.annualDiscount}
                            onChange={(value) => handleDiscountChange('annualDiscount', value)}
                            prefix="Discount"
                            suffix="%"
                            autoComplete="off"
                          />
                        </InlineStack>
                      )}
                    </InlineStack>
                    {options.enableAnnual && (
                      <Box paddingInlineStart="600">
                        <InlineStack gap="400">
                          <Text variant="bodyMd" tone="subdued" as="span">
                            Price: {currency} {pricingData.annual.final}/year
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="span">
                            ({currency} {pricingData.annual.perMonth}/month)
                          </Text>
                          {pricingData.annual.savings && (
                            <Badge tone="success">
                              {`Saves ${currency} ${pricingData.annual.savings}`}
                            </Badge>
                          )}
                        </InlineStack>
                      </Box>
                    )}
                  </BlockStack>
                </Box>
              </BlockStack>
            </BlockStack>

            {/* Pricing Preview */}
            {hasEnabledOptions && (
              <>
                <Divider />
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text variant="headingSm" as="h4">
                      Customer Pricing Preview
                    </Text>
                    <Button
                      variant="plain"
                      onClick={() => setShowPricingPreview(!showPricingPreview)}
                      icon={showPricingPreview ? ChevronUpIcon : ChevronDownIcon}
                    >
                      {showPricingPreview ? 'Hide' : 'Show'}
                    </Button>
                  </InlineStack>

                  <Collapsible
                    open={showPricingPreview}
                    id="pricing-preview"
                    transition={{ duration: '150ms', timingFunction: 'ease' }}
                  >
                    <Box padding="400" background="bg-surface" borderRadius="200">
                      <BlockStack gap="300">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          How customers will see pricing:
                        </Text>
                        <BlockStack gap="200">
                          {options.enableMonthly && (
                            <InlineStack gap="400" align="space-between">
                              <InlineStack gap="200">
                                <Icon source={CheckCircleIcon} tone="success" />
                                <Text variant="bodyMd" as="span">
                                  Monthly
                                </Text>
                              </InlineStack>
                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                {currency} {pricingData.monthly.final}/month
                              </Text>
                            </InlineStack>
                          )}
                          {options.enableQuarterly && (
                            <InlineStack gap="400" align="space-between">
                              <InlineStack gap="200">
                                <Icon source={CheckCircleIcon} tone="success" />
                                <Text variant="bodyMd" as="span">
                                  Every 3 months
                                </Text>
                                {pricingData.quarterly.savings && (
                                  <Badge tone="success">
                                    {`Save ${parseFloat(options.quarterlyDiscount)}%`}
                                  </Badge>
                                )}
                              </InlineStack>
                              <BlockStack gap="0">
                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                  {currency} {pricingData.quarterly.final}
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="span">
                                  {currency} {pricingData.quarterly.perMonth}/month
                                </Text>
                              </BlockStack>
                            </InlineStack>
                          )}
                          {options.enableAnnual && (
                            <InlineStack gap="400" align="space-between">
                              <InlineStack gap="200">
                                <Icon source={CheckCircleIcon} tone="success" />
                                <Text variant="bodyMd" as="span">
                                  Annual
                                </Text>
                                {pricingData.annual.savings && (
                                  <Badge tone="attention">
                                    {`Save ${parseFloat(options.annualDiscount)}%`}
                                  </Badge>
                                )}
                              </InlineStack>
                              <BlockStack gap="0">
                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                  {currency} {pricingData.annual.final}/year
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="span">
                                  {currency} {pricingData.annual.perMonth}/month
                                </Text>
                              </BlockStack>
                            </InlineStack>
                          )}
                        </BlockStack>
                      </BlockStack>
                    </Box>
                  </Collapsible>
                </BlockStack>
              </>
            )}

            {/* Advanced Options */}
            {showAdvanced && hasEnabledOptions && (
              <>
                <Divider />
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <InlineStack gap="200" align="center">
                      <Text variant="headingSm" as="h4">
                        Advanced Options
                      </Text>
                      <Tooltip content="Configure trial periods, billing anchors, and delivery policies">
                        <Icon source={InfoIcon} tone="subdued" />
                      </Tooltip>
                    </InlineStack>
                    <Button
                      variant="plain"
                      onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                      icon={showAdvancedOptions ? ChevronUpIcon : ChevronDownIcon}
                    >
                      {showAdvancedOptions ? 'Hide' : 'Show'}
                    </Button>
                  </InlineStack>

                  <Collapsible
                    open={showAdvancedOptions}
                    id="advanced-options"
                    transition={{ duration: '150ms', timingFunction: 'ease' }}
                  >
                    <BlockStack gap="400">
                      {/* Trial Period */}
                      <TextField
                        label="Trial period"
                        type="number"
                        value={options.trialDays || ''}
                        onChange={(value) => onOptionsChange({ ...options, trialDays: value })}
                        suffix="days"
                        helpText="Optional free trial before billing starts"
                        autoComplete="off"
                      />

                      {/* Billing Anchor */}
                      <Select
                        label="Billing anchor"
                        options={anchorTypeOptions}
                        value={options.anchorType || 'MONTHDAY'}
                        onChange={(value) => onOptionsChange({ 
                          ...options, 
                          anchorType: value as SubscriptionOption['anchorType'] 
                        })}
                        helpText="When to charge customers each billing cycle"
                      />

                      {options.anchorType === 'MONTHDAY' && (
                        <TextField
                          label="Day of month"
                          type="number"
                          value={options.anchorDay || ''}
                          onChange={(value) => {
                            const num = parseInt(value);
                            if (!isNaN(num) && num >= 1 && num <= 31) {
                              onOptionsChange({ ...options, anchorDay: value });
                            }
                          }}
                          helpText="1-31 (adjusts for shorter months)"
                          autoComplete="off"
                        />
                      )}

                      {/* Delivery Policy */}
                      <Select
                        label="Delivery policy"
                        options={deliveryPolicyOptions}
                        value={options.deliveryPolicy || 'IMMEDIATE'}
                        onChange={(value) => onOptionsChange({ 
                          ...options, 
                          deliveryPolicy: value as SubscriptionOption['deliveryPolicy'] 
                        })}
                        helpText="When orders are fulfilled"
                      />

                      {/* Inventory Policy */}
                      <Select
                        label="Out of stock behavior"
                        options={inventoryPolicyOptions}
                        value={options.inventoryPolicy || 'CONTINUE'}
                        onChange={(value) => onOptionsChange({ 
                          ...options, 
                          inventoryPolicy: value as SubscriptionOption['inventoryPolicy'] 
                        })}
                        helpText="What happens when inventory runs out"
                      />
                    </BlockStack>
                  </Collapsible>
                </BlockStack>
              </>
            )}
          </>
        )}
      </BlockStack>
    </Card>
  );
}