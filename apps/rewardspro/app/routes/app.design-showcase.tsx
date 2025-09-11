import { Page, Layout, Card, Text, BlockStack, Box, Tabs, Divider } from '@shopify/polaris';
import { useState, useCallback } from 'react';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import {
  SymmetricalHeroSection,
  AsymmetricalDashboard,
  RadialMetricsDisplay,
  GoldenRatioLayout,
  ResponsiveSymmetryLayout,
  BalancedFormLayout,
  BalancedLoadingState,
  FilteredDataView,
} from '../components/BalancedLayouts';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }
  
  return json({ shop: session.shop });
};

export default function DesignShowcase() {
  const [selected, setSelected] = useState(0);
  
  const handleTabChange = useCallback(
    (selectedTabIndex: number) => setSelected(selectedTabIndex),
    [],
  );
  
  const tabs = [
    {
      id: 'symmetrical',
      content: 'Symmetrical',
      component: <SymmetricalHeroSection />,
      description: 'Perfect for onboarding, empty states, and modal dialogs. Creates formal balance with mirrored elements.',
    },
    {
      id: 'asymmetrical',
      content: 'Asymmetrical',
      component: <AsymmetricalDashboard />,
      description: 'Ideal for dashboards and data-heavy interfaces. Balances different elements through visual weight.',
    },
    {
      id: 'radial',
      content: 'Radial',
      component: <RadialMetricsDisplay />,
      description: 'Great for metrics displays and status indicators. Elements radiate from central points.',
    },
    {
      id: 'golden-ratio',
      content: 'Golden Ratio',
      component: <GoldenRatioLayout />,
      description: 'Uses the 1.618:1 ratio for naturally pleasing proportions between content areas.',
    },
    {
      id: 'responsive',
      content: 'Responsive',
      component: <ResponsiveSymmetryLayout />,
      description: 'Adapts symmetry patterns across different screen sizes while maintaining balance.',
    },
    {
      id: 'forms',
      content: 'Forms',
      component: <BalancedFormLayout />,
      description: 'Demonstrates balanced form field arrangements for better visual flow.',
    },
    {
      id: 'loading',
      content: 'Loading States',
      component: <BalancedLoadingState />,
      description: 'Skeleton screens that maintain visual balance during loading.',
    },
    {
      id: 'data-view',
      content: 'Data Views',
      component: <FilteredDataView />,
      description: 'Asymmetrical balance between filter controls and main data display.',
    },
  ];
  
  return (
    <Page 
      title="Design Pattern Showcase"
      subtitle="Examples of balanced and symmetrical layouts"
      backAction={{content: 'Dashboard', url: '/app'}}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">Balance and Symmetry Principles</Text>
                  <Text as="p" tone="subdued">
                    These examples demonstrate the implementation of visual and functional balance patterns
                    from our design guide. Each pattern serves specific use cases and maintains consistency
                    across the application.
                  </Text>
                </BlockStack>
                
                <Divider />
                
                <Tabs tabs={tabs} selected={selected} onSelect={handleTabChange} />
                
                <Box paddingBlockStart="400">
                  <BlockStack gap="400">
                    {/* Pattern description */}
                    <Card>
                      <Box padding="300" background="bg-surface-info">
                        <BlockStack gap="200">
                          <Text variant="headingMd" as="h3">{tabs[selected].content} Balance</Text>
                          <Text as="p">{tabs[selected].description}</Text>
                        </BlockStack>
                      </Box>
                    </Card>
                    
                    {/* Pattern example */}
                    <Box>
                      {tabs[selected].component}
                    </Box>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
        
        {/* Implementation notes */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Implementation Guidelines</Text>
                
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Key Principles:</Text>
                  <Box paddingInlineStart="400">
                    <BlockStack gap="100">
                      <Text as="p">• Use Polaris spacing tokens for consistent gaps</Text>
                      <Text as="p">• Maintain visual hierarchy with typography scales</Text>
                      <Text as="p">• Balance color weight across the interface</Text>
                      <Text as="p">• Test responsive behavior at all breakpoints</Text>
                      <Text as="p">• Group related content for better organization</Text>
                    </BlockStack>
                  </Box>
                </BlockStack>
                
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Responsive Considerations:</Text>
                  <Box paddingInlineStart="400">
                    <BlockStack gap="100">
                      <Text as="p">• Switch from horizontal to vertical layouts on mobile</Text>
                      <Text as="p">• Adjust grid columns based on screen size</Text>
                      <Text as="p">• Ensure touch targets are at least 44x44px on mobile</Text>
                      <Text as="p">• Test with real device viewports</Text>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}