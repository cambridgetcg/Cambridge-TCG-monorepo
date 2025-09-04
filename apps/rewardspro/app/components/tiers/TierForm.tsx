import { useState, useCallback, useEffect } from "react";
import {
  FormLayout,
  TextField,
  Select,
  BlockStack,
  Text,
  InlineError,
  Banner,
  InlineStack,
  Badge,
  Box,
} from "@shopify/polaris";

export interface TierFormData {
  name: string;
  minSpend: number;
  cashbackPercent: number;
  evaluationPeriod: "ANNUAL" | "LIFETIME";
  description?: string;
}

interface TierFormProps {
  initialData?: Partial<TierFormData>;
  onSubmit: (data: TierFormData) => void;
  isSubmitting?: boolean;
  errors?: string[];
  existingTiers?: Array<{
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
  }>;
}

export function TierForm({
  initialData,
  onSubmit,
  isSubmitting = false,
  errors = [],
  existingTiers = [],
}: TierFormProps) {
  // Form state
  const [name, setName] = useState(initialData?.name || "");
  const [minSpend, setMinSpend] = useState(
    initialData?.minSpend?.toString() || ""
  );
  const [cashbackPercent, setCashbackPercent] = useState(
    initialData?.cashbackPercent?.toString() || ""
  );
  const [evaluationPeriod, setEvaluationPeriod] = useState<"ANNUAL" | "LIFETIME">(
    initialData?.evaluationPeriod || "ANNUAL"
  );
  const [description, setDescription] = useState(initialData?.description || "");
  
  // Validation state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  
  // Suggested tier templates
  const tierTemplates = [
    { name: "Bronze", minSpend: 0, cashback: 2, description: "Entry level tier" },
    { name: "Silver", minSpend: 500, cashback: 3, description: "For regular customers" },
    { name: "Gold", minSpend: 1000, cashback: 5, description: "For VIP customers" },
    { name: "Platinum", minSpend: 2500, cashback: 7, description: "For premium customers" },
  ];
  
  // Validate individual fields
  const validateField = useCallback((field: string, value: string) => {
    const errors: Record<string, string> = {};
    
    switch (field) {
      case "name":
        if (!value.trim()) {
          errors.name = "Tier name is required";
        } else if (value.length > 50) {
          errors.name = "Tier name must be less than 50 characters";
        } else if (!/^[a-zA-Z0-9\s-]+$/.test(value)) {
          errors.name = "Tier name can only contain letters, numbers, spaces, and hyphens";
        }
        break;
        
      case "minSpend":
        const spend = Number(value);
        if (!value || isNaN(spend)) {
          errors.minSpend = "Minimum spend is required";
        } else if (spend < 0) {
          errors.minSpend = "Minimum spend cannot be negative";
        } else if (spend > 1000000) {
          errors.minSpend = "Minimum spend exceeds maximum allowed (1,000,000)";
        } else {
          // Check for conflicts with existing tiers
          const conflict = existingTiers.find(
            tier => tier.minSpend === spend && tier.name !== initialData?.name
          );
          if (conflict) {
            errors.minSpend = `This amount is already used by the "${conflict.name}" tier`;
          }
        }
        break;
        
      case "cashbackPercent":
        const percent = Number(value);
        if (!value || isNaN(percent)) {
          errors.cashbackPercent = "Cashback percentage is required";
        } else if (percent < 0) {
          errors.cashbackPercent = "Cashback cannot be negative";
        } else if (percent > 100) {
          errors.cashbackPercent = "Cashback cannot exceed 100%";
        } else if (percent > 20) {
          errors.cashbackPercent = "Warning: Cashback over 20% may impact profitability";
        }
        break;
    }
    
    return errors;
  }, [existingTiers, initialData?.name]);
  
  // Handle field changes with validation
  const handleFieldChange = useCallback((field: string, value: string, setter: (v: string) => void) => {
    setter(value);
    setTouched(prev => ({ ...prev, [field]: true }));
    
    const errors = validateField(field, value);
    setFieldErrors(prev => ({
      ...prev,
      [field]: errors[field] || "",
    }));
  }, [validateField]);
  
  // Apply template
  const applyTemplate = useCallback((template: typeof tierTemplates[0]) => {
    setName(template.name);
    setMinSpend(template.minSpend.toString());
    setCashbackPercent(template.cashback.toString());
    setDescription(template.description);
    
    // Clear errors for populated fields
    setFieldErrors({});
    setTouched({});
  }, []);
  
  // Validate all fields
  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    
    // Validate each field
    Object.assign(errors, validateField("name", name));
    Object.assign(errors, validateField("minSpend", minSpend));
    Object.assign(errors, validateField("cashbackPercent", cashbackPercent));
    
    setFieldErrors(errors);
    setTouched({
      name: true,
      minSpend: true,
      cashbackPercent: true,
    });
    
    return Object.keys(errors).length === 0;
  }, [name, minSpend, cashbackPercent, validateField]);
  
  // Handle form submission
  const handleSubmit = useCallback(() => {
    if (validateForm()) {
      onSubmit({
        name: name.trim(),
        minSpend: Number(minSpend),
        cashbackPercent: Number(cashbackPercent),
        evaluationPeriod,
        description: description.trim(),
      });
    }
  }, [name, minSpend, cashbackPercent, evaluationPeriod, description, validateForm, onSubmit]);
  
  // Calculate estimated rewards
  const estimatedMonthlyRewards = useCallback(() => {
    const percent = Number(cashbackPercent);
    const spend = Number(minSpend);
    if (isNaN(percent) || isNaN(spend)) return 0;
    
    // Estimate based on average customer spending 2x minimum
    return (spend * 2 * percent) / 100;
  }, [cashbackPercent, minSpend]);
  
  return (
    <BlockStack gap="400">
      {/* Show global errors */}
      {errors.length > 0 && (
        <Banner tone="critical">
          <BlockStack gap="100">
            {errors.map((error, i) => (
              <Text key={i} as="p" variant="bodyMd">
                {error}
              </Text>
            ))}
          </BlockStack>
        </Banner>
      )}
      
      {/* Tier Templates */}
      {!initialData && (
        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Quick Start Templates
            </Text>
            <InlineStack gap="200">
              {tierTemplates.map((template) => (
                <Badge
                  key={template.name}
                  tone="new"
                  progress="complete"
                >
                  <Box
                    padding="100"
                    onClick={() => applyTemplate(template)}
                    role="button"
                    style={{ cursor: "pointer" }}
                  >
                    {template.name} ({template.cashback}%)
                  </Box>
                </Badge>
              ))}
            </InlineStack>
          </BlockStack>
        </Box>
      )}
      
      <FormLayout>
        {/* Tier Name */}
        <TextField
          label="Tier Name"
          value={name}
          onChange={(value) => handleFieldChange("name", value, setName)}
          error={touched.name ? fieldErrors.name : undefined}
          helpText="Choose a memorable name for your tier (e.g., Bronze, Silver, Gold)"
          placeholder="Enter tier name"
          maxLength={50}
          showCharacterCount
          autoComplete="off"
          requiredIndicator
        />
        
        {/* Minimum Spend */}
        <TextField
          label="Minimum Spend"
          value={minSpend}
          onChange={(value) => handleFieldChange("minSpend", value, setMinSpend)}
          error={touched.minSpend ? fieldErrors.minSpend : undefined}
          helpText="Minimum amount customers must spend to qualify for this tier"
          placeholder="0"
          prefix="$"
          type="number"
          min="0"
          autoComplete="off"
          requiredIndicator
        />
        
        {/* Cashback Percentage */}
        <TextField
          label="Cashback Percentage"
          value={cashbackPercent}
          onChange={(value) => handleFieldChange("cashbackPercent", value, setCashbackPercent)}
          error={touched.cashbackPercent ? fieldErrors.cashbackPercent : undefined}
          helpText="Percentage of order value returned as store credit"
          placeholder="0"
          suffix="%"
          type="number"
          min="0"
          max="100"
          step="0.5"
          autoComplete="off"
          requiredIndicator
        />
        
        {/* Evaluation Period */}
        <Select
          label="Evaluation Period"
          options={[
            {
              label: "Annual (12-month rolling window)",
              value: "ANNUAL",
              helpText: "Based on spending in the last 12 months",
            },
            {
              label: "Lifetime (all-time spending)",
              value: "LIFETIME",
              helpText: "Based on total spending since first purchase",
            },
          ]}
          value={evaluationPeriod}
          onChange={(value) => setEvaluationPeriod(value as "ANNUAL" | "LIFETIME")}
          helpText="How customer spending is calculated for tier qualification"
        />
        
        {/* Description (optional) */}
        <TextField
          label="Description"
          value={description}
          onChange={setDescription}
          helpText="Optional description for internal reference"
          placeholder="e.g., Entry level tier for new customers"
          multiline={2}
          autoComplete="off"
        />
      </FormLayout>
      
      {/* Estimated Impact */}
      {cashbackPercent && minSpend && (
        <Box padding="300" background="bg-surface-info" borderRadius="200">
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" fontWeight="semibold">
              Estimated Impact
            </Text>
            <InlineStack gap="400">
              <BlockStack gap="050">
                <Text as="p" variant="bodySm" tone="subdued">
                  Avg. Monthly Rewards
                </Text>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  ${estimatedMonthlyRewards().toFixed(2)} per customer
                </Text>
              </BlockStack>
              <BlockStack gap="050">
                <Text as="p" variant="bodySm" tone="subdued">
                  Evaluation Period
                </Text>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {evaluationPeriod === "ANNUAL" ? "12 months" : "All time"}
                </Text>
              </BlockStack>
            </InlineStack>
          </BlockStack>
        </Box>
      )}
    </BlockStack>
  );
}