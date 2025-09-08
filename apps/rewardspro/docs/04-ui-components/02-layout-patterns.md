# Shopify Polaris Layout & Structure Components Guide

This comprehensive guide covers 14 Shopify Polaris layout and structure components with practical implementation examples for building the RewardsPro admin interface.

## Table of Contents
1. [Installation & Setup](#installation-setup)
2. [Bleed Component](#bleed-component)
3. [BlockStack Component](#blockstack-component)
4. [Box Component](#box-component)
5. [CalloutCard Component](#calloutcard-component)
6. [Card Component](#card-component)
7. [Divider Component](#divider-component)
8. [EmptyState Component](#emptystate-component)
9. [FormLayout Component](#formlayout-component)
10. [Grid Component](#grid-component)
11. [InlineGrid Component](#inlinegrid-component)
12. [InlineStack Component](#inlinestack-component)
13. [Layout Component](#layout-component)
14. [MediaCard Component](#mediacard-component)
15. [Page Component](#page-component)
16. [Best Practices](#best-practices)

## Installation & Setup {#installation-setup}

Install Shopify Polaris:
```bash
npm install @shopify/polaris
```

Import required components and styles:
```typescript
import '@shopify/polaris/build/esm/styles.css';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';

function App() {
  return (
    <AppProvider i18n={enTranslations}>
      {/* Your app content */}
    </AppProvider>
  );
}
```

## Bleed Component {#bleed-component}

Creates negative space around children, allowing content to extend beyond container padding.

### Import
```typescript
import { Bleed } from '@shopify/polaris';
```

### Key Props
- `marginInline`: Horizontal negative space
- `marginBlock`: Vertical negative space
- `marginBlockStart`: Top negative space
- `marginBlockEnd`: Bottom negative space
- `marginInlineStart`: Left negative space
- `marginInlineEnd`: Right negative space

### Examples

#### Horizontal Bleed
```typescript
function BleedHorizontal() {
  return (
    <Card>
      <Text as="h2" variant="bodyMd">
        Card content
      </Text>
      <Bleed marginInline="400">
        <Box background="bg-surface-brand" padding="400">
          <Text tone="text-inverse">
            This content bleeds horizontally
          </Text>
        </Box>
      </Bleed>
    </Card>
  );
}
```

#### Vertical Bleed
```typescript
function BleedVertical() {
  return (
    <Card>
      <BlockStack gap="400">
        <Text>Above bleed</Text>
        <Bleed marginBlock="400">
          <Box background="bg-surface-success" padding="400">
            <Text>Vertical bleed content</Text>
          </Box>
        </Bleed>
        <Text>Below bleed</Text>
      </BlockStack>
    </Card>
  );
}
```

#### Specific Direction Bleed
```typescript
function BleedDirection() {
  return (
    <Card>
      <Bleed marginInlineStart="600" marginBlockEnd="400">
        <Box background="bg-surface-warning" padding="400">
          <Text>Bleeds left and bottom only</Text>
        </Box>
      </Bleed>
    </Card>
  );
}
```

## BlockStack Component {#blockstack-component}

Arranges children vertically with consistent spacing.

### Import
```typescript
import { BlockStack } from '@shopify/polaris';
```

### Key Props
- `gap`: Spacing between children
- `align`: Horizontal alignment
- `inlineAlign`: Vertical alignment 
- `reverseOrder`: Reverse render order
- `as`: HTML element type

### Examples

#### Default BlockStack
```typescript
function DefaultBlockStack() {
  return (
    <BlockStack gap="400">
      <Card>
        <Text>First item</Text>
      </Card>
      <Card>
        <Text>Second item</Text>
      </Card>
      <Card>
        <Text>Third item</Text>
      </Card>
    </BlockStack>
  );
}
```

#### BlockStack with Alignment
```typescript
function AlignedBlockStack() {
  return (
    <Box background="bg-surface-secondary" padding="400">
      <BlockStack gap="400" align="center">
        <Card>
          <Text>Centered item 1</Text>
        </Card>
        <Card>
          <Text>Centered item 2</Text>
        </Card>
      </BlockStack>
    </Box>
  );
}
```

#### Responsive BlockStack
```typescript
function ResponsiveBlockStack() {
  return (
    <BlockStack gap={{xs: '200', sm: '400', md: '600'}}>
      <Card>
        <Text>Responsive gap spacing</Text>
      </Card>
      <Card>
        <Text>Adapts to screen size</Text>
      </Card>
    </BlockStack>
  );
}
```

## Box Component {#box-component}

Provides access to design tokens for styling.

### Import
```typescript
import { Box } from '@shopify/polaris';
```

### Key Props
- `padding`: Spacing around children
- `background`: Background color token
- `borderColor`: Border color token
- `borderRadius`: Border radius token
- `borderWidth`: Border width scale
- `shadow`: Shadow token
- `color`: Text color token

### Examples

#### Box with Border
```typescript
function BoxWithBorder() {
  return (
    <Box 
      borderColor="border" 
      borderWidth="050" 
      borderStyle="solid"
      padding="400"
      borderRadius="200"
    >
      <Text>Bordered box content</Text>
    </Box>
  );
}
```

#### Box with Shadow
```typescript
function BoxWithShadow() {
  return (
    <Box 
      shadow="300"
      padding="400"
      borderRadius="200"
      background="bg-surface"
    >
      <Text>Box with elevation shadow</Text>
    </Box>
  );
}
```

#### Nested Boxes
```typescript
function NestedBoxes() {
  return (
    <Box padding="800" background="bg-surface-secondary">
      <Box padding="400" background="bg-surface" borderRadius="300">
        <Box padding="200" background="bg-surface-success">
          <Text>Nested box composition</Text>
        </Box>
      </Box>
    </Box>
  );
}
```

## CalloutCard Component {#calloutcard-component}

Encourages merchants to take action on new features.

### Import
```typescript
import { CalloutCard } from '@shopify/polaris';
```

### Key Props
- `title`: Card title (required)
- `illustration`: URL to illustration
- `primaryAction`: Primary action config
- `secondaryAction`: Secondary action config
- `onDismiss`: Dismiss callback
- `children`: Card content

### Examples

#### Basic CalloutCard
```typescript
function BasicCalloutCard() {
  return (
    <CalloutCard
      title="Set up loyalty tiers"
      illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings.svg"
      primaryAction={{
        content: 'Configure tiers',
        url: '/app/tiers',
      }}
    >
      <p>Create different cashback percentages for customer segments.</p>
    </CalloutCard>
  );
}
```

#### CalloutCard with Actions
```typescript
function CalloutCardWithActions() {
  return (
    <CalloutCard
      title="Import existing customers"
      illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings.svg"
      primaryAction={{
        content: 'Import customers',
        onAction: () => console.log('Import'),
      }}
      secondaryAction={{
        content: 'Learn more',
        url: 'https://help.shopify.com',
      }}
    >
      <p>Bulk import your existing customer base to the loyalty program.</p>
    </CalloutCard>
  );
}
```

#### Dismissible CalloutCard
```typescript
function DismissibleCalloutCard() {
  const [dismissed, setDismissed] = useState(false);
  
  if (dismissed) return null;
  
  return (
    <CalloutCard
      title="Upgrade your plan"
      illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings.svg"
      primaryAction={{
        content: 'View plans',
        url: '/app/billing',
      }}
      onDismiss={() => setDismissed(true)}
    >
      <p>Unlock advanced features with our premium plans.</p>
    </CalloutCard>
  );
}
```

## Card Component {#card-component}

Modern card component with composable layout primitives.

### Import
```typescript
import { Card } from '@shopify/polaris';
```

### Key Props
- `children`: Content inside card
- `background`: Background color alias
- `padding`: Spacing around content
- `roundedAbove`: Border radius breakpoint

### Examples

#### Basic Card
```typescript
function BasicCard() {
  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd">Card Title</Text>
        <Text>Card content goes here</Text>
      </BlockStack>
    </Card>
  );
}
```

#### Card with Sections
```typescript
function CardWithSections() {
  return (
    <Card>
      <BlockStack gap="400">
        <Box paddingBlockEnd="400">
          <Text variant="headingMd">Customer Details</Text>
        </Box>
        <Divider />
        <Box paddingBlock="400">
          <Text>Email: customer@example.com</Text>
          <Text>Tier: Gold</Text>
          <Text>Store Credit: $125.00</Text>
        </Box>
        <Divider />
        <Box paddingBlockStart="400">
          <InlineStack gap="200">
            <Button>Edit</Button>
            <Button variant="primary">Save</Button>
          </InlineStack>
        </Box>
      </BlockStack>
    </Card>
  );
}
```

#### Card with Custom Background
```typescript
function CardWithBackground() {
  return (
    <Card background="bg-surface-secondary" padding="600">
      <BlockStack gap="400">
        <Text variant="headingLg">Premium Feature</Text>
        <Text>This feature requires an upgraded plan</Text>
        <Button variant="primary">Upgrade Now</Button>
      </BlockStack>
    </Card>
  );
}
```

## Divider Component {#divider-component}

Creates visual separation between sections.

### Import
```typescript
import { Divider } from '@shopify/polaris';
```

### Key Props
- `borderColor`: Color of divider
- `borderWidth`: Thickness of divider

### Examples

```typescript
function DividerExamples() {
  return (
    <Card>
      <BlockStack gap="400">
        <Text>Section One</Text>
        <Divider />
        <Text>Section Two</Text>
        <Divider borderColor="border" borderWidth="200" />
        <Text>Section Three</Text>
      </BlockStack>
    </Card>
  );
}
```

## EmptyState Component {#emptystate-component}

Provides guidance when content is missing.

### Import
```typescript
import { EmptyState } from '@shopify/polaris';
```

### Key Props
- `heading`: Empty state heading
- `image`: Path to image (required)
- `action`: Primary action
- `secondaryAction`: Secondary action
- `fullWidth`: Span full width
- `footerContent`: Content below actions

### Examples

#### Basic EmptyState
```typescript
function BasicEmptyState() {
  return (
    <Card>
      <EmptyState
        heading="No customers enrolled yet"
        action={{
          content: 'Import customers',
          url: '/app/customers/import'
        }}
        secondaryAction={{
          content: 'Learn about loyalty programs',
          url: 'https://help.shopify.com',
        }}
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>Start enrolling customers in your loyalty program to see them here.</p>
      </EmptyState>
    </Card>
  );
}
```

#### EmptyState with Footer
```typescript
function EmptyStateWithFooter() {
  return (
    <EmptyState
      heading="No tiers configured"
      action={{content: 'Create first tier'}}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      footerContent={
        <Text variant="bodyMd" tone="subdued">
          Need help? <Link url="/help">Contact support</Link>
        </Text>
      }
    >
      <p>Set up loyalty tiers to start rewarding customers.</p>
    </EmptyState>
  );
}
```

## FormLayout Component {#formlayout-component}

Arranges form fields with standard spacing.

### Import
```typescript
import { FormLayout, TextField } from '@shopify/polaris';
```

### Examples

#### Basic FormLayout
```typescript
function BasicFormLayout() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  return (
    <FormLayout>
      <TextField 
        label="Store name" 
        value={name}
        onChange={setName} 
        autoComplete="off" 
      />
      <TextField
        type="email"
        label="Account email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
      />
    </FormLayout>
  );
}
```

#### FormLayout Groups
```typescript
function FormLayoutGroups() {
  return (
    <FormLayout>
      <FormLayout.Group>
        <TextField label="First name" onChange={() => {}} />
        <TextField label="Last name" onChange={() => {}} />
      </FormLayout.Group>
      <TextField label="Email" type="email" onChange={() => {}} />
      <FormLayout.Group condensed>
        <TextField label="City" onChange={() => {}} />
        <TextField label="Province" onChange={() => {}} />
        <TextField label="Postal code" onChange={() => {}} />
      </FormLayout.Group>
    </FormLayout>
  );
}
```

## Grid Component {#grid-component}

Creates complex two-dimensional layouts.

### Import
```typescript
import { Grid } from '@shopify/polaris';
```

### Key Props
- `columns`: Responsive column configuration
- `gap`: Gap between items
- `Grid.Cell columnSpan`: Cell column span

### Examples

#### Basic Grid
```typescript
function BasicGrid() {
  return (
    <Grid>
      <Grid.Cell>
        <Card>
          <Text>Cell 1</Text>
        </Card>
      </Grid.Cell>
      <Grid.Cell>
        <Card>
          <Text>Cell 2</Text>
        </Card>
      </Grid.Cell>
    </Grid>
  );
}
```

#### Responsive Grid Layout
```typescript
function ResponsiveGrid() {
  return (
    <Grid>
      <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 4, lg: 8}}>
        <Card>
          <Text>Main content (2/3 on desktop)</Text>
        </Card>
      </Grid.Cell>
      <Grid.Cell columnSpan={{xs: 6, sm: 2, md: 2, lg: 4}}>
        <Card>
          <Text>Sidebar (1/3 on desktop)</Text>
        </Card>
      </Grid.Cell>
    </Grid>
  );
}
```

#### Three Column Grid
```typescript
function ThreeColumnGrid() {
  return (
    <Grid columns={{xs: 1, sm: 2, md: 3}} gap="400">
      <Grid.Cell>
        <Card>
          <Text variant="headingMd">Total Customers</Text>
          <Text variant="heading2xl">1,234</Text>
        </Card>
      </Grid.Cell>
      <Grid.Cell>
        <Card>
          <Text variant="headingMd">Active Tiers</Text>
          <Text variant="heading2xl">5</Text>
        </Card>
      </Grid.Cell>
      <Grid.Cell>
        <Card>
          <Text variant="headingMd">Total Rewards</Text>
          <Text variant="heading2xl">$12,456</Text>
        </Card>
      </Grid.Cell>
    </Grid>
  );
}
```

## InlineGrid Component {#inlinegrid-component}

Creates horizontal layouts with equal/fixed columns.

### Import
```typescript
import { InlineGrid } from '@shopify/polaris';
```

### Key Props
- `columns`: Number or width values array
- `gap`: Spacing between children
- `alignItems`: Vertical alignment

### Examples

#### Equal Width Columns
```typescript
function EqualWidthColumns() {
  return (
    <InlineGrid columns={3} gap="400">
      <Card>
        <Text>Column 1</Text>
      </Card>
      <Card>
        <Text>Column 2</Text>
      </Card>
      <Card>
        <Text>Column 3</Text>
      </Card>
    </InlineGrid>
  );
}
```

#### Fixed Width Columns
```typescript
function FixedWidthColumns() {
  return (
    <InlineGrid columns={['oneThird', 'twoThirds']} gap="400">
      <Card>
        <Text>1/3 width</Text>
      </Card>
      <Card>
        <Text>2/3 width</Text>
      </Card>
    </InlineGrid>
  );
}
```

#### Responsive InlineGrid
```typescript
function ResponsiveInlineGrid() {
  return (
    <InlineGrid 
      columns={{xs: 1, sm: 2, md: 3, lg: 4}} 
      gap={{xs: '200', md: '400'}}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
        <Card key={item}>
          <Text>Item {item}</Text>
        </Card>
      ))}
    </InlineGrid>
  );
}
```

## InlineStack Component {#inlinestack-component}

Arranges children horizontally with spacing.

### Import
```typescript
import { InlineStack } from '@shopify/polaris';
```

### Key Props
- `gap`: Spacing between elements
- `align`: Horizontal alignment
- `blockAlign`: Vertical alignment
- `wrap`: Allow wrapping
- `direction`: Flow direction

### Examples

#### Basic InlineStack
```typescript
function BasicInlineStack() {
  return (
    <InlineStack gap="400">
      <Button>Save</Button>
      <Button>Cancel</Button>
      <Button tone="critical">Delete</Button>
    </InlineStack>
  );
}
```

#### InlineStack with Alignment
```typescript
function AlignedInlineStack() {
  return (
    <InlineStack align="space-between" blockAlign="center">
      <Text variant="headingMd">Product Title</Text>
      <InlineStack gap="200">
        <Button>Edit</Button>
        <Button variant="primary">Save</Button>
      </InlineStack>
    </InlineStack>
  );
}
```

#### Wrapping InlineStack
```typescript
function WrappingInlineStack() {
  return (
    <InlineStack gap="200" wrap>
      {['Active', 'Draft', 'Archived', 'Pending', 'Review'].map((status) => (
        <Badge key={status}>{status}</Badge>
      ))}
    </InlineStack>
  );
}
```

## Layout Component {#layout-component}

Creates page-level structure with sections.

### Import
```typescript
import { Layout } from '@shopify/polaris';
```

### Examples

#### One Column Layout
```typescript
function OneColumnLayout() {
  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <Card>
            <Text variant="headingMd">Main Content</Text>
            <Text>Full width content area</Text>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

#### Two Column Layout
```typescript
function TwoColumnLayout() {
  return (
    <Page title="Customer Details">
      <Layout>
        <Layout.Section>
          <Card>
            <Text variant="headingMd">Customer Information</Text>
            <Text>Primary content (2/3 width)</Text>
          </Card>
        </Layout.Section>
        <Layout.Section secondary>
          <Card>
            <Text variant="headingMd">Quick Stats</Text>
            <Text>Secondary content (1/3 width)</Text>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

#### Annotated Layout
```typescript
function AnnotatedLayout() {
  return (
    <Page title="Settings">
      <Layout>
        <Layout.AnnotatedSection
          title="Store details"
          description="Manage your store's basic information."
        >
          <Card>
            <FormLayout>
              <TextField label="Store name" onChange={() => {}} />
              <TextField label="Email" type="email" onChange={() => {}} />
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>
        
        <Layout.AnnotatedSection
          title="Loyalty settings"
          description="Configure your loyalty program preferences."
        >
          <Card>
            <FormLayout>
              <TextField label="Points name" onChange={() => {}} />
              <Select
                label="Evaluation period"
                options={['Annual', 'Lifetime']}
                onChange={() => {}}
              />
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>
      </Layout>
    </Page>
  );
}
```

## MediaCard Component {#mediacard-component}

Combines media content with text and actions.

### Import
```typescript
import { MediaCard } from '@shopify/polaris';
```

### Key Props
- `title`: Heading content
- `description`: Body content
- `primaryAction`: Main CTA
- `secondaryAction`: Secondary CTA
- `portrait`: Vertical layout
- `size`: Visual media size
- `children`: Media content

### Examples

#### Basic MediaCard
```typescript
function BasicMediaCard() {
  return (
    <MediaCard
      title="Getting Started with Loyalty"
      primaryAction={{
        content: 'Start tutorial',
        onAction: () => {},
      }}
      description="Learn how to set up and manage your loyalty program."
      popoverActions={[{ content: 'Dismiss', onAction: () => {} }]}
    >
      <img
        alt=""
        width="100%"
        height="100%"
        style={{
          objectFit: 'cover',
          objectPosition: 'center',
        }}
        src="https://burst.shopifycdn.com/photos/business-woman-smiling-in-office.jpg"
      />
    </MediaCard>
  );
}
```

#### Video MediaCard
```typescript
function VideoMediaCard() {
  return (
    <MediaCard
      title="Advanced Tier Strategies"
      primaryAction={{
        content: 'Watch video',
        onAction: () => {},
      }}
      description="Learn advanced techniques for tier configuration."
    >
      <VideoThumbnail
        videoLength={180}
        thumbnailUrl="https://burst.shopifycdn.com/photos/business-woman-smiling-in-office.jpg"
        onClick={() => console.log('Play video')}
      />
    </MediaCard>
  );
}
```

## Page Component {#page-component}

Top-level structure for admin pages.

### Import
```typescript
import { Page } from '@shopify/polaris';
```

### Key Props
- `title`: Page title
- `subtitle`: Page subtitle
- `primaryAction`: Primary page action
- `secondaryActions`: Secondary actions array
- `backAction`: Back navigation
- `fullWidth`: Remove max-width
- `narrowWidth`: Decrease max-width

### Examples

#### Basic Page
```typescript
function BasicPage() {
  return (
    <Page
      title="Loyalty Tiers"
      primaryAction={{
        content: 'Create tier',
        onAction: () => console.log('Create'),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Text>Page content goes here</Text>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

#### Page with Actions
```typescript
function PageWithActions() {
  return (
    <Page
      backAction={{ content: 'Dashboard', url: '/app' }}
      title="Customer Details"
      titleMetadata={<Badge tone="success">Active</Badge>}
      subtitle="Member since 2024"
      primaryAction={{
        content: 'Save changes',
        disabled: false,
        onAction: () => console.log('Save'),
      }}
      secondaryActions={[
        {
          content: 'Adjust credit',
          onAction: () => console.log('Adjust'),
        },
        {
          content: 'Change tier',
          onAction: () => console.log('Change'),
        },
        {
          content: 'Delete customer',
          destructive: true,
          onAction: () => console.log('Delete'),
        },
      ]}
      actionGroups={[
        {
          title: 'Export',
          actions: [
            {
              content: 'Export as CSV',
              onAction: () => console.log('CSV'),
            },
            {
              content: 'Export as PDF',
              onAction: () => console.log('PDF'),
            },
          ],
        },
      ]}
      pagination={{
        hasPrevious: true,
        hasNext: true,
        onPrevious: () => console.log('Previous'),
        onNext: () => console.log('Next'),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Text>Customer information</Text>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

#### Full Width Page
```typescript
function FullWidthPage() {
  return (
    <Page
      fullWidth
      title="Analytics Dashboard"
      primaryAction={{
        content: 'Export data',
        onAction: () => console.log('Export'),
      }}
    >
      <Grid columns={{xs: 1, sm: 2, lg: 4}} gap="400">
        <Grid.Cell>
          <Card>
            <Text variant="headingMd">Metric 1</Text>
          </Card>
        </Grid.Cell>
        <Grid.Cell>
          <Card>
            <Text variant="headingMd">Metric 2</Text>
          </Card>
        </Grid.Cell>
        <Grid.Cell>
          <Card>
            <Text variant="headingMd">Metric 3</Text>
          </Card>
        </Grid.Cell>
        <Grid.Cell>
          <Card>
            <Text variant="headingMd">Metric 4</Text>
          </Card>
        </Grid.Cell>
      </Grid>
    </Page>
  );
}
```

## Best Practices {#best-practices}

### Layout Components Usage

#### Vertical Layouts
- Use **BlockStack** for vertical arrangements
- Use consistent `gap` values (200, 400, 600)
- Consider responsive gap values for different screens

#### Horizontal Layouts
- Use **InlineStack** for horizontal button groups
- Use **InlineGrid** for equal-width items
- Add `wrap` for responsive behavior

#### Complex Layouts
- Use **Grid** for two-dimensional layouts
- Use **Layout** for page-level structure
- Combine with responsive breakpoints

### Spacing Tokens
Common spacing values:
- `025`: 0.25rem (4px)
- `050`: 0.5rem (8px)
- `100`: 1rem (16px)
- `200`: 2rem (32px)
- `300`: 3rem (48px)
- `400`: 4rem (64px)
- `500`: 5rem (80px)
- `600`: 6rem (96px)
- `800`: 8rem (128px)

### Responsive Breakpoints
- `xs`: 0px and up
- `sm`: 490px and up
- `md`: 768px and up
- `lg`: 1040px and up
- `xl`: 1200px and up

### Card Component Best Practices
- Use new **Card** with layout primitives
- Combine with **BlockStack** for sections
- Use **Divider** for visual separation
- Apply padding through **Box** component

### Page Structure
1. Start with **Page** component
2. Use **Layout** for main structure
3. Add **Card** for content groups
4. Apply **BlockStack**/**InlineStack** for internal layout

### Accessibility
- Use semantic HTML elements via `as` prop
- Provide proper heading hierarchy
- Include alt text for images
- Ensure proper focus management

### Performance
- Use responsive values sparingly
- Avoid deep nesting of layout components
- Leverage CSS grid for complex layouts
- Use `key` props for dynamic lists

This guide provides comprehensive patterns for building professional RewardsPro admin interfaces using Polaris layout components.