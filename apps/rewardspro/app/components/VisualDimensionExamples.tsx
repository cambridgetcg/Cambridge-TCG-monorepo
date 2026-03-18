/**
 * Visual Dimension Examples - Practical implementations of design principles
 * Based on docs/04-ui-components/visual-dimensions-guide.md
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
  Badge,
  Box,
  Grid,
  Banner,
  TextField,
  DataTable,
  Icon,
  Divider,
  Select,
} from '@shopify/polaris';
import {
  PersonIcon,
  CashDollarIcon,
  ChartLineIcon,
  StarIcon,
} from '@shopify/polaris-icons';

/**
 * VISUAL HIERARCHY EXAMPLES
 */

// ✅ Good: Clear hierarchy with size, weight, and contrast
export function GoodVisualHierarchy() {
  return (
    <Card>
      <Box padding="600">
        <BlockStack gap="400">
          {/* Primary focal point - largest and boldest */}
          <Text variant="heading3xl" as="h1" fontWeight="bold" alignment="center">
            $124,567
          </Text>
          
          {/* Secondary information - medium size */}
          <Text variant="headingLg" as="h2" alignment="center">
            Total Revenue
          </Text>
          
          {/* Supporting details - smallest and subdued */}
          <Text variant="bodySm" as="span" tone="subdued" as="p" alignment="center">
            Last 30 days • Updated 5 min ago
          </Text>
          
          {/* Clear action hierarchy */}
          <InlineStack gap="300" align="center">
            <Button variant="primary">View Details</Button>
            <Button variant="plain">Export</Button>
          </InlineStack>
        </BlockStack>
      </Box>
    </Card>
  );
}

// ❌ Bad: No clear hierarchy
export function BadVisualHierarchy() {
  return (
    <Card>
      <Box padding="600">
        <BlockStack gap="400">
          {/* Everything same size - no focal point */}
          <Text variant="bodyMd" as="span">$124,567</Text>
          <Text variant="bodyMd" as="span">Total Revenue</Text>
          <Text variant="bodyMd" as="span">Last 30 days</Text>
          <Text variant="bodyMd" as="span">Updated 5 min ago</Text>
          
          {/* Multiple primary buttons - confusing */}
          <InlineStack gap="300">
            <Button variant="primary">View</Button>
            <Button variant="primary">Export</Button>
            <Button variant="primary">Share</Button>
          </InlineStack>
        </BlockStack>
      </Box>
    </Card>
  );
}

/**
 * COLOR THEORY EXAMPLES - 60-30-10 Rule
 */

// ✅ Good: Balanced color usage following 60-30-10 rule
export function GoodColorBalance() {
  return (
    <Page>  {/* 60% - Neutral background */}
      <Layout>
        <Layout.Section>
          <Card>  {/* Still neutral */}
            <Box padding="400">
              <BlockStack gap="400">
                {/* 30% - Text and UI chrome */}
                <Text variant="headingLg" as="h2">Order Summary</Text>
                <Text variant="bodyMd" as="span">Review your recent orders</Text>
                
                <Divider />
                
                <InlineStack align="space-between">
                  <Text as="span">Status</Text>
                  {/* 10% - Accent colors for important info */}
                  <Badge tone="success">Completed</Badge>
                </InlineStack>
                
                <InlineStack align="space-between">
                  <Text as="span">Total</Text>
                  <Text as="span" fontWeight="bold" tone="success">$1,234.56</Text>
                </InlineStack>
                
                {/* Primary action gets accent color */}
                <Button variant="primary" fullWidth>Process Refund</Button>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ❌ Bad: Too many colors, no balance
export function BadColorBalance() {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          <Text tone="success" variant="headingLg" as="h2">Order Summary</Text>
          <Text tone="warning">Review your recent orders</Text>
          <Badge tone="critical">Important</Badge>
          <Badge tone="info">New</Badge>
          <Badge tone="success">Active</Badge>
          <Button tone="warning">Action 1</Button>
          <Button tone="critical">Action 2</Button>
          {/* Rainbow of colors without purpose */}
        </BlockStack>
      </Box>
    </Card>
  );
}

// Semantic color usage example
export function SemanticColorUsage() {
  return (
    <BlockStack gap="400">
      {/* Each color has a specific meaning */}
      <Banner tone="critical" title="Payment Failed">
        Your payment could not be processed.
      </Banner>
      
      <Banner tone="warning" title="Subscription Expiring">
        Your plan expires in 3 days.
      </Banner>
      
      <Banner tone="success" title="Order Shipped">
        Your order is on its way!
      </Banner>
      
      <Banner tone="info" title="New Feature Available">
        Try our new analytics dashboard.
      </Banner>
    </BlockStack>
  );
}

/**
 * TYPOGRAPHY EXAMPLES - Modular Scale
 */

// ✅ Good: Clear typographic hierarchy with modular scale
export function GoodTypography() {
  return (
    <Card>
      <Box padding="600">
        <BlockStack gap="500">
          {/* Clear hierarchy using Polaris type scale */}
          <Text variant="heading2xl" as="h1">Customer Dashboard</Text>
          
          <BlockStack gap="400">
            <Text variant="headingLg" as="h2">Account Overview</Text>
            <Text variant="bodyMd" as="span">
              Manage your customer information and preferences.
            </Text>
          </BlockStack>
          
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Recent Activity</Text>
            <BlockStack gap="200">
              <Text variant="bodyMd" as="span">Order #1234 - Delivered</Text>
              <Text variant="bodySm" as="span" tone="subdued" as="p">2 days ago</Text>
            </BlockStack>
          </BlockStack>
          
          {/* Proper line height for readability */}
          <Box maxWidth="600px">
            <Text variant="bodyMd" as="span">
              This paragraph demonstrates proper line height for optimal readability. 
              When text spans multiple lines, adequate spacing between lines (typically 
              1.4-1.6× the font size) ensures comfortable reading without strain.
            </Text>
          </Box>
        </BlockStack>
      </Box>
    </Card>
  );
}

// ❌ Bad: Flat typography, no hierarchy
export function BadTypography() {
  return (
    <Card>
      <Box padding="600">
        <BlockStack gap="200">
          {/* Everything same size - no hierarchy */}
          <Text as="span">Customer Dashboard</Text>
          <Text as="span">Account Overview</Text>
          <Text as="span">Manage your customer information</Text>
          <Text as="span">Recent Activity</Text>
          <Text as="span">Order #1234</Text>
          <Text as="span">2 days ago</Text>
        </BlockStack>
      </Box>
    </Card>
  );
}

// Modular scale demonstration
export function ModularScaleExample() {
  // Using approximately 1.25× scale (Major Third)
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <Text variant="heading2xl" as="h1">32px Display Text</Text>
          <Text variant="headingXl" as="h2">24px Large Heading</Text>
          <Text variant="headingLg" as="h3">20px Regular Heading</Text>
          <Text variant="bodyLg" as="span">16px Large Body Text</Text>
          <Text variant="bodyMd" as="span">14px Regular Body Text</Text>
          <Text variant="bodySm" as="span">12px Small Text</Text>
        </BlockStack>
      </Box>
    </Card>
  );
}

/**
 * SPATIAL COMPOSITION EXAMPLES - Grids and White Space
 */

// ✅ Good: Well-structured grid with proper spacing
export function GoodSpatialComposition() {
  return (
    <Page>
      <Layout>
        {/* Consistent grid alignment */}
        <Layout.Section>
          <Grid columns={{xs: 1, sm: 2, md: 4}}>
            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200" align="center">
                    <Icon source={PersonIcon} tone="base" />
                    <Text variant="heading2xl" as="h3">245</Text>
                    <Text variant="bodySm" as="span" tone="subdued" as="p">Customers</Text>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>
            
            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200" align="center">
                    <Icon source={CashDollarIcon} tone="base" />
                    <Text variant="heading2xl" as="h3">$12.5k</Text>
                    <Text variant="bodySm" as="span" tone="subdued" as="p">Revenue</Text>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>
            
            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200" align="center">
                    <Icon source={ChartLineIcon} tone="base" />
                    <Text variant="heading2xl" as="h3">18%</Text>
                    <Text variant="bodySm" as="span" tone="subdued" as="p">Growth</Text>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>
            
            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200" align="center">
                    <Icon source={StarIcon} tone="base" />
                    <Text variant="heading2xl" as="h3">4.8</Text>
                    <Text variant="bodySm" as="span" tone="subdued" as="p">Rating</Text>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>
        
        {/* Proper use of white space to separate sections */}
        <Box paddingBlockStart="800" />
        
        {/* Golden ratio layout (approximately 38% : 62%) */}
        <Layout>
          <Layout.Section variant="oneThird">  {/* ~33% close to golden ratio */}
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Filters</Text>
                  <Select
                    label="Status"
                    options={[
                      {label: 'All', value: 'all'},
                      {label: 'Active', value: 'active'},
                      {label: 'Inactive', value: 'inactive'},
                    ]}
                  />
                  <TextField label="Search" placeholder="Enter name..." />
                  <Button fullWidth>Apply Filters</Button>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
          
          <Layout.Section>  {/* ~67% main content */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h2">Customer List</Text>
                  <DataTable
                    columnContentTypes={['text', 'text', 'numeric']}
                    headings={['Name', 'Email', 'Orders']}
                    rows={[
                      ['John Doe', 'john@example.com', '12'],
                      ['Jane Smith', 'jane@example.com', '8'],
                      ['Bob Johnson', 'bob@example.com', '15'],
                    ]}
                  />
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Layout>
    </Page>
  );
}

// ❌ Bad: Crowded layout with inconsistent spacing
export function BadSpatialComposition() {
  return (
    <div>
      {/* Inconsistent, arbitrary spacing */}
      <Card style={{marginBottom: '7px'}}>
        <div style={{padding: '3px'}}>
          <Text as="span">Cramped content</Text>
        </div>
      </Card>
      
      <Card style={{marginBottom: '23px', marginLeft: '11px'}}>
        <div style={{padding: '5px'}}>
          <Text as="span">Misaligned element</Text>
        </div>
      </Card>
      
      <Card style={{marginTop: '45px'}}>
        <div style={{padding: '2px'}}>
          <Text as="span">Random spacing</Text>
        </div>
      </Card>
    </div>
  );
}

// Proximity principle example
export function ProximityPrinciple() {
  return (
    <Card>
      <Box padding="600">
        <BlockStack gap="800">  {/* Large gap between unrelated groups */}
          
          {/* Group 1: Tightly related items */}
          <BlockStack gap="200">  {/* Small gap within group */}
            <Text variant="headingMd" as="h2">Billing Information</Text>
            <TextField label="Card Number" />
            <InlineStack gap="200">
              <TextField label="Expiry" />
              <TextField label="CVV" />
            </InlineStack>
          </BlockStack>
          
          {/* Group 2: Another related set */}
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">Shipping Address</Text>
            <TextField label="Street Address" />
            <InlineStack gap="200">
              <TextField label="City" />
              <TextField label="ZIP" />
            </InlineStack>
          </BlockStack>
          
        </BlockStack>
      </Box>
    </Card>
  );
}

/**
 * COMPLETE EXAMPLE - All Principles Combined
 */
export function CompleteVisualExample() {
  const metrics = [
    { id: 1, value: '1,234', label: 'Customers', trend: 12, icon: PersonIcon },
    { id: 2, value: '$45.6k', label: 'Revenue', trend: 8, icon: CashDollarIcon },
    { id: 3, value: '89%', label: 'Retention', trend: -2, icon: ChartLineIcon },
    { id: 4, value: '4.9', label: 'Rating', trend: 5, icon: StarIcon },
  ];
  
  return (
    <Page 
      title="Analytics Dashboard"  // Clear hierarchy - largest element
      primaryAction={{
        content: 'Export Report',
        onAction: () => console.log('Export')
      }}
    >
      <Layout>
        {/* Metrics row - Grid alignment, radial balance */}
        <Layout.Section>
          <Grid columns={{xs: 2, sm: 2, md: 4}}>
            {metrics.map(metric => (
              <Grid.Cell key={metric.id}>
                <Card>
                  <Box padding="400">  {/* Consistent spacing */}
                    <BlockStack gap="200" align="center">
                      {/* Visual hierarchy in each card */}
                      <Icon source={metric.icon} tone="base" />
                      <Text variant="heading2xl" as="h2" fontWeight="bold">
                        {metric.value}
                      </Text>
                      <Text variant="bodySm" as="span" tone="subdued" as="p">
                        {metric.label}
                      </Text>
                      {/* Semantic color usage */}
                      <Badge tone={metric.trend > 0 ? 'success' : 'critical'}>
                        {`${metric.trend > 0 ? '+' : ''}${metric.trend}%`}
                      </Badge>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>
            ))}
          </Grid>
        </Layout.Section>
        
        {/* White space separation */}
        <Box paddingBlockStart="600" />
        
        {/* Main content - Golden ratio split */}
        <Layout>
          <Layout.Section>  {/* Main content ~67% */}
            <Card>
              <Box padding="500">
                <BlockStack gap="400">
                  {/* Typography hierarchy */}
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingLg" as="h2">Recent Transactions</Text>
                    <Badge tone="info">245 total</Badge>
                  </InlineStack>
                  
                  <DataTable
                    columnContentTypes={['text', 'text', 'numeric', 'text']}
                    headings={['Customer', 'Date', 'Amount', 'Status']}
                    rows={[
                      ['John Doe', 'Dec 1, 2024', '$125.00', <Badge tone="success">Completed</Badge>],
                      ['Jane Smith', 'Dec 1, 2024', '$87.50', <Badge tone="warning">Pending</Badge>],
                      ['Bob Johnson', 'Nov 30, 2024', '$234.00', <Badge tone="success">Completed</Badge>],
                    ]}
                  />
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">  {/* Sidebar ~33% */}
            <BlockStack gap="400">
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Quick Actions</Text>
                    <BlockStack gap="200">
                      {/* Clear button hierarchy */}
                      <Button fullWidth variant="primary">Create Report</Button>
                      <Button fullWidth variant="secondary">View Analytics</Button>
                      <Button fullWidth variant="plain">Settings</Button>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
              
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Period</Text>
                    <Select
                      options={[
                        {label: 'Last 7 days', value: '7d'},
                        {label: 'Last 30 days', value: '30d'},
                        {label: 'Last 90 days', value: '90d'},
                      ]}
                    />
                  </BlockStack>
                </Box>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Layout>
    </Page>
  );
}