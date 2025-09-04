import { memo, useState, useCallback, useMemo } from "react";
import {
  IndexTable,
  IndexFilters,
  useIndexResourceState,
  useSetIndexFiltersMode,
  Card,
  BlockStack,
  Text,
  Badge,
  Button,
  InlineStack,
  Box,
  EmptyState,
  ChoiceList,
  RangeSlider,
  TextField,
  Tabs,
} from "@shopify/polaris";
import type { TabProps, IndexFiltersProps } from "@shopify/polaris";
import { TierData } from "./TierCard";

interface TierListProps {
  tiers: TierData[];
  onEdit: (tier: TierData) => void;
  onDelete: (tierId: string) => void;
  onBulkDelete?: (tierIds: string[]) => void;
  onBulkEdit?: (tierIds: string[], updates: Partial<TierData>) => void;
  onSort?: (field: string, direction: "asc" | "desc") => void;
  loading?: boolean;
}

export const TierList = memo(function TierList({
  tiers,
  onEdit,
  onDelete,
  onBulkDelete,
  onBulkEdit,
  onSort,
  loading = false,
}: TierListProps) {
  const [selected, setSelected] = useState(0);
  const [queryValue, setQueryValue] = useState("");
  const [evaluationFilter, setEvaluationFilter] = useState<string[]>([]);
  const [cashbackRange, setCashbackRange] = useState<[number, number]>([0, 100]);
  
  const { mode, setMode } = useSetIndexFiltersMode();
  
  const resourceName = {
    singular: "tier",
    plural: "tiers",
  };
  
  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
    clearSelection,
    removeSelectedResources,
  } = useIndexResourceState(tiers);
  
  // Filter tiers based on search and filters
  const filteredTiers = useMemo(() => {
    let filtered = [...tiers];
    
    // Search filter
    if (queryValue) {
      const searchLower = queryValue.toLowerCase();
      filtered = filtered.filter(
        tier =>
          tier.name.toLowerCase().includes(searchLower) ||
          tier.description?.toLowerCase().includes(searchLower)
      );
    }
    
    // Evaluation period filter
    if (evaluationFilter.length > 0) {
      filtered = filtered.filter(tier =>
        evaluationFilter.includes(tier.evaluationPeriod)
      );
    }
    
    // Cashback range filter
    filtered = filtered.filter(
      tier =>
        tier.cashbackPercent >= cashbackRange[0] &&
        tier.cashbackPercent <= cashbackRange[1]
    );
    
    return filtered;
  }, [tiers, queryValue, evaluationFilter, cashbackRange]);
  
  // Tabs for different views
  const tabs: TabProps[] = [
    {
      id: "all-tiers",
      content: "All tiers",
      badge: tiers.length.toString(),
      panelID: "all-tiers-panel",
    },
    {
      id: "active-tiers",
      content: "With customers",
      badge: tiers.filter(t => (t.customerCount || 0) > 0).length.toString(),
      panelID: "active-tiers-panel",
    },
    {
      id: "empty-tiers",
      content: "Empty tiers",
      badge: tiers.filter(t => (t.customerCount || 0) === 0).length.toString(),
      panelID: "empty-tiers-panel",
    },
  ];
  
  // Get tiers for current tab
  const tiersForTab = useMemo(() => {
    switch (selected) {
      case 1: // Active tiers
        return filteredTiers.filter(t => (t.customerCount || 0) > 0);
      case 2: // Empty tiers
        return filteredTiers.filter(t => (t.customerCount || 0) === 0);
      default:
        return filteredTiers;
    }
  }, [selected, filteredTiers]);
  
  // Bulk actions
  const bulkActions: any[] = selectedResources.length > 0 ? [
    {
      content: `Edit ${selectedResources.length} ${
        selectedResources.length === 1 ? "tier" : "tiers"
      }`,
      onAction: () => {
        if (onBulkEdit) {
          // This would open a bulk edit modal
          console.log("Bulk edit:", selectedResources);
        }
      },
      disabled: !onBulkEdit,
    },
    {
      content: `Delete ${selectedResources.length} ${
        selectedResources.length === 1 ? "tier" : "tiers"
      }`,
      destructive: true,
      onAction: () => {
        if (onBulkDelete) {
          onBulkDelete(selectedResources);
          clearSelection();
        }
      },
      disabled: !onBulkDelete,
    },
  ] : [];
  
  // Filters configuration
  const filters = [
    {
      key: "evaluationPeriod",
      label: "Evaluation Period",
      filter: (
        <ChoiceList
          title="Evaluation Period"
          titleHidden
          choices={[
            { label: "Annual (12 months)", value: "ANNUAL" },
            { label: "Lifetime", value: "LIFETIME" },
          ]}
          selected={evaluationFilter}
          onChange={setEvaluationFilter}
          allowMultiple
        />
      ),
      shortcut: true,
    },
    {
      key: "cashbackRange",
      label: "Cashback %",
      filter: (
        <Box padding="300">
          <BlockStack gap="300">
            <RangeSlider
              label="Cashback percentage range"
              labelHidden
              value={cashbackRange}
              onChange={setCashbackRange}
              min={0}
              max={100}
              output
              suffix="%"
            />
            <InlineStack gap="200">
              <TextField
                label="Min"
                labelHidden
                type="number"
                value={cashbackRange[0].toString()}
                onChange={(value) => setCashbackRange([Number(value), cashbackRange[1]])}
                suffix="%"
                autoComplete="off"
              />
              <TextField
                label="Max"
                labelHidden
                type="number"
                value={cashbackRange[1].toString()}
                onChange={(value) => setCashbackRange([cashbackRange[0], Number(value)])}
                suffix="%"
                autoComplete="off"
              />
            </InlineStack>
          </BlockStack>
        </Box>
      ),
    },
  ];
  
  // Applied filters for display
  const appliedFilters = [];
  if (evaluationFilter.length > 0) {
    appliedFilters.push({
      key: "evaluationPeriod",
      label: `Period: ${evaluationFilter.join(", ")}`,
      onRemove: () => setEvaluationFilter([]),
    });
  }
  if (cashbackRange[0] > 0 || cashbackRange[1] < 100) {
    appliedFilters.push({
      key: "cashbackRange",
      label: `Cashback: ${cashbackRange[0]}% - ${cashbackRange[1]}%`,
      onRemove: () => setCashbackRange([0, 100]),
    });
  }
  
  // Sort options
  const sortOptions: IndexFiltersProps["sortOptions"] = [
    { label: "Name A-Z", value: "name-asc", directionLabel: "A-Z" },
    { label: "Name Z-A", value: "name-desc", directionLabel: "Z-A" },
    { label: "Min spend (low to high)", value: "minSpend-asc", directionLabel: "Low to high" },
    { label: "Min spend (high to low)", value: "minSpend-desc", directionLabel: "High to low" },
    { label: "Cashback (low to high)", value: "cashback-asc", directionLabel: "Low to high" },
    { label: "Cashback (high to low)", value: "cashback-desc", directionLabel: "High to low" },
    { label: "Most customers", value: "customers-desc", directionLabel: "Most" },
    { label: "Least customers", value: "customers-asc", directionLabel: "Least" },
  ];
  
  const [sortSelected, setSortSelected] = useState(["minSpend-asc"]);
  
  const handleSortChange = useCallback((selected: string[]) => {
    setSortSelected(selected);
    if (onSort && selected.length > 0) {
      const [field, direction] = selected[0].split("-");
      onSort(field, direction as "asc" | "desc");
    }
  }, [onSort]);
  
  // Format currency
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);
  
  // Row markup for table
  const rowMarkup = tiersForTab.map((tier, index) => (
    <IndexTable.Row
      id={tier.id}
      key={tier.id}
      selected={selectedResources.includes(tier.id)}
      position={index}
    >
      <IndexTable.Cell>
        <InlineStack gap="200" blockAlign="center">
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {tier.name}
          </Text>
        </InlineStack>
      </IndexTable.Cell>
      
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd">
          {formatCurrency(tier.minSpend)}
        </Text>
      </IndexTable.Cell>
      
      <IndexTable.Cell>
        <Badge tone="success">
          {tier.cashbackPercent}%
        </Badge>
      </IndexTable.Cell>
      
      <IndexTable.Cell>
        <Badge tone={tier.evaluationPeriod === "ANNUAL" ? "info" : "success"}>
          {tier.evaluationPeriod === "ANNUAL" ? "Annual" : "Lifetime"}
        </Badge>
      </IndexTable.Cell>
      
      <IndexTable.Cell>
        {tier.customerCount !== undefined ? (
          <Text as="span" variant="bodyMd">
            {tier.customerCount.toLocaleString()}
          </Text>
        ) : (
          <Text as="span" variant="bodyMd" tone="subdued">
            —
          </Text>
        )}
      </IndexTable.Cell>
      
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            size="slim"
            onClick={() => onEdit(tier)}
          >
            Edit
          </Button>
          <Button
            size="slim"
            variant="plain"
            tone="critical"
            onClick={() => onDelete(tier.id)}
          >
            Delete
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));
  
  // Empty state
  const emptyStateMarkup = (
    <EmptyState
      heading="Create your first loyalty tier"
      action={{ content: "Add tier", onAction: () => {} }}
      secondaryAction={{
        content: "Learn more",
        url: "https://help.shopify.com",
      }}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>Start rewarding your customers by creating loyalty tiers with different cashback rates.</p>
    </EmptyState>
  );
  
  return (
    <Card padding="0">
      <IndexFilters
        queryValue={queryValue}
        queryPlaceholder="Search tiers..."
        onQueryChange={setQueryValue}
        onQueryClear={() => setQueryValue("")}
        sortOptions={sortOptions}
        sortSelected={sortSelected}
        onSort={handleSortChange}
        tabs={tabs}
        selected={selected}
        onSelect={setSelected}
        filters={filters}
        appliedFilters={appliedFilters}
        onClearAll={() => {
          setQueryValue("");
          setEvaluationFilter([]);
          setCashbackRange([0, 100]);
        }}
        mode={mode}
        setMode={setMode}
        loading={loading}
        cancelAction={{
          onAction: () => {},
          disabled: false,
          loading: false,
        }}
      />
      
      {tiersForTab.length === 0 && !loading ? (
        tiers.length === 0 ? (
          emptyStateMarkup
        ) : (
          <Box padding="400">
            <Text as="p" variant="bodyMd" tone="subdued">
              No tiers match your filters. Try adjusting your search or filters.
            </Text>
          </Box>
        )
      ) : (
        <IndexTable
          resourceName={resourceName}
          itemCount={tiersForTab.length}
          selectedItemsCount={
            allResourcesSelected ? "All" : selectedResources.length
          }
          onSelectionChange={handleSelectionChange}
          bulkActions={bulkActions}
          headings={[
            { title: "Name" },
            { title: "Min Spend" },
            { title: "Cashback" },
            { title: "Period" },
            { title: "Customers" },
            { title: "Actions" },
          ]}
          loading={loading}
        >
          {rowMarkup}
        </IndexTable>
      )}
    </Card>
  );
});