/**
 * Example Layout Components Demonstrating Balance and Symmetry Principles
 * These components follow the design guidelines from docs/04-ui-components/balance-symmetry-design-guide.md
 */

import React from 'react';
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Grid,
  Box,
  Icon,
  Badge,
  Divider,
  Select,
  TextField,
  FormLayout,
  DataTable,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonThumbnail,
} from '@shopify/polaris';
import {
  StarIcon,
  PersonIcon,
  CashDollarIcon,
  ChartLineIcon,
  ClockIcon,
  SearchIcon,
  FilterIcon,
} from '@shopify/polaris-icons';
import { ANGEL_NUMBERS } from '~/utils/angel-numbers';

/**
 * 1. SYMMETRICAL BALANCE EXAMPLE
 * Perfect for onboarding, empty states, and modals
 */
export function SymmetricalHeroSection() {
  return (
    <Card>
      <Box padding="800">
        <BlockStack gap="500" align="center">
          {/* Centered icon */}
          <Icon source={StarIcon} tone="base" />
          
          {/* Centered heading */}
          <Text variant="heading2xl" as="h1" alignment="center">
            Welcome to RewardsPro
          </Text>
          
          {/* Centered description */}
          <Box maxWidth="600px">
            <Text variant="bodyLg" tone="subdued" alignment="center" as="p">
              Build lasting customer relationships with our powerful loyalty program. 
              Increase retention, boost sales, and reward your best customers.
            </Text>
          </Box>
          
          {/* Symmetrical button group */}
          <InlineStack gap="300">
            <Button variant="primary" size="large">Get Started</Button>
            <Button variant="plain" size="large">Learn More</Button>
          </InlineStack>
        </BlockStack>
      </Box>
    </Card>
  );
}

/**
 * 2. ASYMMETRICAL BALANCE EXAMPLE
 * Ideal for dashboards and data-heavy interfaces
 */
export function AsymmetricalDashboard() {
  // Using angel numbers for demo displays
  const tableData = [
    ['John Doe', 'john@example.com', `$${ANGEL_NUMBERS.CREDIT.ABUNDANCE}`, 'Gold'],
    ['Jane Smith', 'jane@example.com', `$${ANGEL_NUMBERS.CREDIT.CHANGE}`, 'Silver'],
    ['Bob Johnson', 'bob@example.com', `$${ANGEL_NUMBERS.CREDIT.GROWTH}`, 'Bronze'],
  ];
  
  return (
    <Page title="Dashboard">
      <Layout>
        {/* Main content area - heavier visual weight */}
        <Layout.Section>
          <BlockStack gap="400">
            {/* Data table card */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h2">Recent Customers</Text>
                  <DataTable
                    columnContentTypes={['text', 'text', 'numeric', 'text']}
                    headings={['Name', 'Email', 'Store Credit', 'Tier']}
                    rows={tableData}
                  />
                </BlockStack>
              </Box>
            </Card>
            
            {/* Secondary content */}
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">Activity Feed</Text>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span">Cashback earned</Text>
                      <Badge tone="success">+$25.00</Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span">Credit redeemed</Text>
                      <Badge>-$10.00</Badge>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </BlockStack>
        </Layout.Section>
        
        {/* Sidebar - lighter visual weight */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">Quick Stats</Text>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text tone="subdued" as="span">Total Customers</Text>
                      <Text fontWeight="semibold" as="span">1,234</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text tone="subdued" as="span">Active Tiers</Text>
                      <Text fontWeight="semibold" as="span">3</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text tone="subdued" as="span">Avg. Credit</Text>
                      <Text fontWeight="semibold" as="span">$75.50</Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
            
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">Actions</Text>
                  <BlockStack gap="200">
                    <Button fullWidth>Add Customer</Button>
                    <Button fullWidth variant="plain">Export Data</Button>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

/**
 * 3. RADIAL BALANCE EXAMPLE
 * Perfect for metrics displays and status indicators
 */
export function RadialMetricsDisplay() {
  const metrics = [
    { icon: PersonIcon, label: 'Customers', value: '1,234', growth: '+12%' },
    { icon: CashDollarIcon, label: 'Revenue', value: '$45,678', growth: '+8%' },
    { icon: StarIcon, label: 'Loyalty Points', value: '89,012', growth: '+15%' },
    { icon: ChartLineIcon, label: 'Conversion', value: '3.4%', growth: '+0.5%' },
  ];
  
  return (
    <Grid columns={{xs: 2, sm: 2, md: 4, lg: 4}}>
      {metrics.map((metric, index) => (
        <Grid.Cell key={index}>
          <Card>
            <Box padding="400">
              <BlockStack gap="300" align="center">
                {/* Central icon */}
                <Box 
                  padding="300" 
                  background="bg-surface-secondary" 
                  borderRadius="100"
                  width="48px"
                >
                  <Icon source={metric.icon} tone="base" />
                </Box>
                
                {/* Metric label */}
                <Text variant="bodySm" tone="subdued" alignment="center" as="p">
                  {metric.label}
                </Text>
                
                {/* Large value */}
                <Text variant="heading2xl" as="p" alignment="center">
                  {metric.value}
                </Text>
                
                {/* Growth indicator */}
                <Badge tone="success">{metric.growth}</Badge>
              </BlockStack>
            </Box>
          </Card>
        </Grid.Cell>
      ))}
    </Grid>
  );
}

/**
 * 4. GOLDEN RATIO LAYOUT
 * Using the 1.618:1 ratio for content and sidebar
 */
export function GoldenRatioLayout() {
  return (
    <Page title="Golden Ratio Layout">
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1.618fr 1fr', 
        gap: '20px' 
      }}>
        {/* Main content (1.618 units) */}
        <Card>
          <Box padding="600">
            <BlockStack gap="400">
              <Text variant="headingLg" as="h2">Main Content Area</Text>
              <Text as="p">
                This section uses the golden ratio for optimal visual balance. 
                The width relationship creates a naturally pleasing proportion.
              </Text>
              <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                <Text as="p">Content goes here...</Text>
              </Box>
            </BlockStack>
          </Box>
        </Card>
        
        {/* Sidebar (1 unit) */}
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd" as="h3">Supporting Content</Text>
              <Text variant="bodySm" tone="subdued" as="p">
                This sidebar complements the main content using golden ratio proportions.
              </Text>
              <Button fullWidth>Action</Button>
            </BlockStack>
          </Box>
        </Card>
      </div>
    </Page>
  );
}

/**
 * 5. RESPONSIVE SYMMETRY EXAMPLE
 * Adapts from horizontal to vertical layout on mobile
 */
export function ResponsiveSymmetryLayout() {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          <Text variant="headingLg" as="h2">Responsive Symmetry</Text>
          
          {/* Responsive button group */}
          <InlineStack 
            gap="300" 
            wrap={false}
            align="center"
          >
            <Button variant="primary">
              Primary Action
            </Button>
            <Button>
              Secondary Action
            </Button>
            <Button variant="plain">
              Tertiary Action
            </Button>
          </InlineStack>
          
          {/* Responsive grid */}
          <Grid columns={{xs: 1, sm: 2, md: 3}}>
            <Grid.Cell>
              <Box background="bg-surface-secondary" padding="400" borderRadius="100">
                <Text alignment="center" as="p">Item 1</Text>
              </Box>
            </Grid.Cell>
            <Grid.Cell>
              <Box background="bg-surface-secondary" padding="400" borderRadius="100">
                <Text alignment="center" as="p">Item 2</Text>
              </Box>
            </Grid.Cell>
            <Grid.Cell>
              <Box background="bg-surface-secondary" padding="400" borderRadius="100">
                <Text alignment="center" as="p">Item 3</Text>
              </Box>
            </Grid.Cell>
          </Grid>
        </BlockStack>
      </Box>
    </Card>
  );
}

/**
 * 6. BALANCED FORM LAYOUT
 * Demonstrates symmetrical form field arrangement
 */
export function BalancedFormLayout() {
  return (
    <Card>
      <Box padding="600">
        <BlockStack gap="500">
          <Text variant="headingLg" as="h2">Customer Information</Text>
          
          <FormLayout>
            {/* Paired fields for balance */}
            <FormLayout.Group>
              <TextField label="First name" autoComplete="given-name" />
              <TextField label="Last name" autoComplete="family-name" />
            </FormLayout.Group>
            
            {/* Full width field */}
            <TextField label="Email" type="email" autoComplete="email" />
            
            {/* Another paired group */}
            <FormLayout.Group>
              <TextField label="Phone" type="tel" autoComplete="tel" />
              <Select
                label="Tier"
                options={[
                  {label: 'Bronze', value: 'bronze'},
                  {label: 'Silver', value: 'silver'},
                  {label: 'Gold', value: 'gold'},
                ]}
              />
            </FormLayout.Group>
            
            {/* Full width field */}
            <TextField label="Address" autoComplete="street-address" />
            
            {/* Triple group for addresses */}
            <FormLayout.Group condensed>
              <TextField label="City" autoComplete="address-level2" />
              <TextField label="State" autoComplete="address-level1" />
              <TextField label="ZIP" autoComplete="postal-code" />
            </FormLayout.Group>
          </FormLayout>
          
          {/* Balanced action buttons */}
          <InlineStack gap="300" align="end">
            <Button variant="primary">Save Customer</Button>
            <Button variant="plain">Cancel</Button>
          </InlineStack>
        </BlockStack>
      </Box>
    </Card>
  );
}

/**
 * 7. LOADING STATE WITH BALANCE
 * Skeleton screens maintaining visual balance
 */
export function BalancedLoadingState() {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          {/* Header skeleton */}
          <SkeletonDisplayText size="medium" />
          
          {/* Balanced content skeleton */}
          <InlineStack gap="400" align="start">
            <Box width="100px">
              <SkeletonThumbnail size="large" />
            </Box>
            <BlockStack gap="200">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={3} />
            </BlockStack>
          </InlineStack>
          
          <Divider />
          
          {/* Grid skeleton */}
          <Grid columns={{xs: 1, sm: 2, md: 3}}>
            <Grid.Cell>
              <BlockStack gap="200">
                <SkeletonDisplayText size="small" />
                <SkeletonBodyText lines={2} />
              </BlockStack>
            </Grid.Cell>
            <Grid.Cell>
              <BlockStack gap="200">
                <SkeletonDisplayText size="small" />
                <SkeletonBodyText lines={2} />
              </BlockStack>
            </Grid.Cell>
            <Grid.Cell>
              <BlockStack gap="200">
                <SkeletonDisplayText size="small" />
                <SkeletonBodyText lines={2} />
              </BlockStack>
            </Grid.Cell>
          </Grid>
        </BlockStack>
      </Box>
    </Card>
  );
}

/**
 * 8. FILTER AND DATA VIEW
 * Asymmetrical balance with filters and main content
 */
export function FilteredDataView() {
  return (
    <Layout>
      {/* Filter sidebar - lighter weight */}
      <Layout.Section variant="oneThird">
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h3">Filters</Text>
                <Icon source={FilterIcon} tone="base" />
              </InlineStack>
              
              <TextField
                label="Search"
                placeholder="Name or email"
                autoComplete="off"
              />
              
              <Select
                label="Tier"
                options={[
                  {label: 'All Tiers', value: 'all'},
                  {label: 'Bronze', value: 'bronze'},
                  {label: 'Silver', value: 'silver'},
                  {label: 'Gold', value: 'gold'},
                ]}
              />
              
              <Select
                label="Status"
                options={[
                  {label: 'All Statuses', value: 'all'},
                  {label: 'Active', value: 'active'},
                  {label: 'Inactive', value: 'inactive'},
                ]}
              />
              
              <InlineStack gap="200">
                <Button fullWidth variant="primary">Apply</Button>
                <Button fullWidth variant="plain">Reset</Button>
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>
      </Layout.Section>
      
      {/* Main content - heavier weight */}
      <Layout.Section>
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingLg" as="h2">Customers</Text>
                <Badge tone="info">234 results</Badge>
              </InlineStack>
              
              <DataTable
                columnContentTypes={['text', 'text', 'numeric', 'text', 'text']}
                headings={['Name', 'Email', 'Credit', 'Tier', 'Status']}
                rows={[
                  ['John Doe', 'john@example.com', '$125.50', 'Gold', 'Active'],
                  ['Jane Smith', 'jane@example.com', '$87.25', 'Silver', 'Active'],
                  ['Bob Johnson', 'bob@example.com', '$45.00', 'Bronze', 'Inactive'],
                  ['Alice Brown', 'alice@example.com', '$200.00', 'Gold', 'Active'],
                  ['Charlie Wilson', 'charlie@example.com', '$65.75', 'Silver', 'Active'],
                ]}
              />
            </BlockStack>
          </Box>
        </Card>
      </Layout.Section>
    </Layout>
  );
}