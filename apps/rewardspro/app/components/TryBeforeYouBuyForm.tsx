import { useState, useCallback } from "react";
import {
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Banner,
  InlineStack,
  Box,
  Text,
  Checkbox,
  RadioButton,
  Divider,
  Badge
} from "@shopify/polaris";

interface TryBeforeYouBuyFormProps {
  productId?: string;
  productVariantIds?: string[];
  onSubmit: (data: any) => Promise<void>;
  isLoading?: boolean;
}

export function TryBeforeYouBuyForm({
  productId,
  productVariantIds = [],
  onSubmit,
  isLoading = false
}: TryBeforeYouBuyFormProps) {
  // Form state
  const [planName, setPlanName] = useState("Try Before You Buy");
  const [merchantCode, setMerchantCode] = useState("TBYB");
  const [optionLabel, setOptionLabel] = useState("Try before you buy");
  const [trialDays, setTrialDays] = useState("14");
  const [chargeType, setChargeType] = useState<"PRICE" | "PERCENTAGE">("PRICE");
  const [initialCharge, setInitialCharge] = useState("0");
  const [fulfillmentTrigger, setFulfillmentTrigger] = useState<"ASAP" | "EXACT_TIME">("ASAP");
  const [inventoryReserve, setInventoryReserve] = useState<"ON_SALE" | "ON_FULFILLMENT">("ON_SALE");
  const [autoCharge, setAutoCharge] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(productId ? [productId] : []);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>(productVariantIds);

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Trial period options
  const trialPeriodOptions = [
    { label: "7 days", value: "7" },
    { label: "14 days", value: "14" },
    { label: "21 days", value: "21" },
    { label: "30 days", value: "30" },
    { label: "Custom", value: "custom" }
  ];

  const [customTrialDays, setCustomTrialDays] = useState("");
  const [useCustomTrialDays, setUseCustomTrialDays] = useState(false);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    // Reset errors
    setErrors({});

    // Validation
    const newErrors: Record<string, string> = {};
    if (!planName) newErrors.planName = "Plan name is required";
    if (!merchantCode) newErrors.merchantCode = "Merchant code is required";
    if (!optionLabel) newErrors.optionLabel = "Option label is required";
    if (useCustomTrialDays && !customTrialDays) {
      newErrors.customTrialDays = "Custom trial days is required";
    }
    if (selectedProductIds.length === 0 && selectedVariantIds.length === 0) {
      newErrors.products = "At least one product or variant must be selected";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Calculate trial period in ISO 8601 duration format
    const days = useCustomTrialDays ? customTrialDays : trialDays;
    const trialPeriodISO = `P${days}D`;

    // Build the mutation variables
    const variables = {
      input: {
        name: planName,
        merchantCode: merchantCode.toLowerCase().replace(/\s+/g, "-"),
        options: [optionLabel],
        sellingPlansToCreate: [
          {
            name: planName,
            options: `Try free for ${days} days`,
            category: "TRY_BEFORE_YOU_BUY",
            billingPolicy: {
              fixed: {
                checkoutCharge: {
                  type: chargeType,
                  value: chargeType === "PRICE"
                    ? { fixedValue: parseFloat(initialCharge) }
                    : { percentage: parseFloat(initialCharge) }
                },
                remainingBalanceChargeTrigger: autoCharge
                  ? "TIME_AFTER_CHECKOUT"
                  : "EXACT_TIME",
                remainingBalanceChargeTimeAfterCheckout: autoCharge ? trialPeriodISO : undefined
              }
            },
            inventoryPolicy: {
              reserve: inventoryReserve
            },
            deliveryPolicy: {
              fixed: {
                fulfillmentTrigger: fulfillmentTrigger
              }
            }
          }
        ]
      },
      resources: {
        productIds: selectedProductIds,
        productVariantIds: selectedVariantIds
      }
    };

    // Call the parent's onSubmit handler
    await onSubmit(variables);
  }, [
    planName,
    merchantCode,
    optionLabel,
    trialDays,
    customTrialDays,
    useCustomTrialDays,
    chargeType,
    initialCharge,
    fulfillmentTrigger,
    inventoryReserve,
    autoCharge,
    selectedProductIds,
    selectedVariantIds,
    onSubmit
  ]);

  return (
    <Card>
      <Box padding="400">
        <Text variant="headingMd" as="h2">Create Try Before You Buy Plan</Text>
      </Box>

      <Box padding="400">
        <FormLayout>
          {/* Basic Information */}
          <FormLayout.Group>
            <TextField
              label="Plan Name"
              value={planName}
              onChange={setPlanName}
              error={errors.planName}
              helpText="Customer-facing name for this selling plan"
              autoComplete="off"
            />
            <TextField
              label="Merchant Code"
              value={merchantCode}
              onChange={setMerchantCode}
              error={errors.merchantCode}
              helpText="Internal identifier (no spaces)"
              autoComplete="off"
            />
          </FormLayout.Group>

          <TextField
            label="Option Label"
            value={optionLabel}
            onChange={setOptionLabel}
            error={errors.optionLabel}
            helpText="Label shown to customers on product page"
            autoComplete="off"
          />

          <Divider />

          {/* Trial Period Configuration */}
          <Box paddingBlockStart="400">
            <Text variant="headingSm" as="h3">Trial Period</Text>
          </Box>

          <Select
            label="Trial Duration"
            options={trialPeriodOptions}
            value={useCustomTrialDays ? "custom" : trialDays}
            onChange={(value) => {
              if (value === "custom") {
                setUseCustomTrialDays(true);
              } else {
                setUseCustomTrialDays(false);
                setTrialDays(value);
              }
            }}
            helpText="How long customers can try before being charged"
          />

          {useCustomTrialDays && (
            <TextField
              label="Custom Trial Days"
              type="number"
              value={customTrialDays}
              onChange={setCustomTrialDays}
              error={errors.customTrialDays}
              suffix="days"
              autoComplete="off"
            />
          )}

          <Divider />

          {/* Checkout Charge Configuration */}
          <Box paddingBlockStart="400">
            <Text variant="headingSm" as="h3">Initial Checkout Charge</Text>
          </Box>

          <FormLayout.Group>
            <Select
              label="Charge Type"
              options={[
                { label: "Fixed Amount", value: "PRICE" },
                { label: "Percentage", value: "PERCENTAGE" }
              ]}
              value={chargeType}
              onChange={(value) => setChargeType(value as "PRICE" | "PERCENTAGE")}
            />
            <TextField
              label={chargeType === "PRICE" ? "Amount" : "Percentage"}
              type="number"
              value={initialCharge}
              onChange={setInitialCharge}
              prefix={chargeType === "PRICE" ? "$" : undefined}
              suffix={chargeType === "PERCENTAGE" ? "%" : undefined}
              helpText="Amount to charge at checkout (0 for free trial)"
              autoComplete="off"
            />
          </FormLayout.Group>

          <Checkbox
            label="Automatically charge remaining balance after trial"
            checked={autoCharge}
            onChange={setAutoCharge}
            helpText="If unchecked, manual payment collection will be required"
          />

          <Divider />

          {/* Fulfillment Configuration */}
          <Box paddingBlockStart="400">
            <Text variant="headingSm" as="h3">Fulfillment & Inventory</Text>
          </Box>

          <FormLayout.Group>
            <Select
              label="Fulfillment Trigger"
              options={[
                { label: "As soon as possible", value: "ASAP" },
                { label: "At exact time", value: "EXACT_TIME" }
              ]}
              value={fulfillmentTrigger}
              onChange={(value) => setFulfillmentTrigger(value as "ASAP" | "EXACT_TIME")}
              helpText="When to fulfill the order"
            />

            <Select
              label="Inventory Reserve"
              options={[
                { label: "On sale", value: "ON_SALE" },
                { label: "On fulfillment", value: "ON_FULFILLMENT" }
              ]}
              value={inventoryReserve}
              onChange={(value) => setInventoryReserve(value as "ON_SALE" | "ON_FULFILLMENT")}
              helpText="When to reserve inventory"
            />
          </FormLayout.Group>

          <Divider />

          {/* Product Selection */}
          <Box paddingBlockStart="400">
            <Text variant="headingSm" as="h3">Product Assignment</Text>
          </Box>

          {productId && (
            <Banner status="info">
              This selling plan will be automatically associated with the current product (ID: {productId})
            </Banner>
          )}

          {!productId && (
            <Banner status="warning">
              No product selected. You'll need to associate products with this selling plan after creation.
            </Banner>
          )}

          {errors.products && (
            <Box paddingBlockStart="200">
              <Banner status="critical">{errors.products}</Banner>
            </Box>
          )}

          <Divider />

          {/* Preview */}
          <Box paddingBlockStart="400">
            <Text variant="headingSm" as="h3">Preview</Text>
          </Box>

          <Card>
            <Box padding="300" background="bg-surface-secondary">
              <InlineStack gap="200" wrap={false}>
                <Badge>Try Before You Buy</Badge>
                <Text as="span" variant="bodyMd">
                  {optionLabel}: Try free for {useCustomTrialDays ? customTrialDays : trialDays} days
                </Text>
              </InlineStack>
              <Box paddingBlockStart="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  • Initial charge: {chargeType === "PRICE" ? `$${initialCharge}` : `${initialCharge}%`}
                  <br />
                  • {autoCharge ? "Automatic billing after trial" : "Manual payment collection required"}
                  <br />
                  • Fulfillment: {fulfillmentTrigger === "ASAP" ? "Immediate" : "Scheduled"}
                  <br />
                  • Inventory reserved: {inventoryReserve === "ON_SALE" ? "At purchase" : "At fulfillment"}
                </Text>
              </Box>
            </Box>
          </Card>

          {/* Submit Button */}
          <Box paddingBlockStart="400">
            <InlineStack gap="300" align="end">
              <Button
                primary
                onClick={handleSubmit}
                loading={isLoading}
                disabled={isLoading}
              >
                Create Selling Plan
              </Button>
            </InlineStack>
          </Box>
        </FormLayout>
      </Box>
    </Card>
  );
}