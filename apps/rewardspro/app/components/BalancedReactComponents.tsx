/**
 * Balanced React Components for RewardsPro
 * Practical implementations of balance and symmetry principles
 * Based on docs/04-ui-components/react-balance-symmetry-guide.md
 */

import React, { 
  useState, 
  useEffect, 
  useLayoutEffect, 
  useRef, 
  useMemo, 
  useCallback,
  createContext,
  useContext,
  useTransition,
  Suspense
} from 'react';
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
  TextField,
  Select,
  FormLayout,
  DataTable,
  Icon,
  Divider,
  SkeletonBodyText,
  SkeletonDisplayText,
  Modal,
  Spinner,
} from '@shopify/polaris';
import {
  PersonIcon,
  CashDollarIcon,
  ChartLineIcon,
  StarIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
} from '@shopify/polaris-icons';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * BALANCE CONTEXT PROVIDER
 * Manages balance configuration across the application
 */

interface BalanceConfig {
  type: 'symmetrical' | 'asymmetrical' | 'radial' | 'mosaic';
  mainWeight: number;
  sideWeight: number;
  spacing: string;
  breakpoint: number;
  goldenRatio: boolean;
}

const BalanceContext = createContext<{
  balanceConfig: BalanceConfig;
  updateBalance: (updates: Partial<BalanceConfig>) => void;
} | undefined>(undefined);

export const BalanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [balanceConfig, setBalanceConfig] = useState<BalanceConfig>({
    type: 'asymmetrical',
    mainWeight: 1.618, // Golden ratio
    sideWeight: 1,
    spacing: 'var(--p-space-400)',
    breakpoint: 1024,
    goldenRatio: true,
  });
  
  const updateBalance = useCallback((updates: Partial<BalanceConfig>) => {
    setBalanceConfig(prev => ({ ...prev, ...updates }));
  }, []);
  
  return (
    <BalanceContext.Provider value={{ balanceConfig, updateBalance }}>
      {children}
    </BalanceContext.Provider>
  );
};

export const useBalance = () => {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error('useBalance must be used within BalanceProvider');
  }
  return context;
};

/**
 * RESPONSIVE BALANCE HOOK
 * Dynamically adjusts layout based on viewport
 */

interface GridConfig {
  columns: number;
  gap: string;
  minItemWidth: string;
}

export const useResponsiveBalance = (): GridConfig => {
  const [gridConfig, setGridConfig] = useState<GridConfig>({
    columns: 3,
    gap: 'var(--p-space-400)',
    minItemWidth: '250px'
  });
  
  useLayoutEffect(() => {
    const updateConfig = () => {
      const width = window.innerWidth;
      
      if (width < 768) {
        // Mobile
        setGridConfig({
          columns: 1,
          gap: 'var(--p-space-300)',
          minItemWidth: '100%'
        });
      } else if (width < 1024) {
        // Tablet
        setGridConfig({
          columns: 2,
          gap: 'var(--p-space-400)',
          minItemWidth: '300px'
        });
      } else {
        // Desktop
        setGridConfig({
          columns: 3,
          gap: 'var(--p-space-500)',
          minItemWidth: '350px'
        });
      }
    };
    
    const observer = new ResizeObserver(updateConfig);
    observer.observe(document.body);
    updateConfig();
    
    return () => observer.disconnect();
  }, []);
  
  return gridConfig;
};

/**
 * BALANCED HEIGHT HOOK
 * Ensures equal heights for card layouts
 */

export const useBalancedHeight = (dependencies: any[] = []) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    const cards = Array.from(containerRef.current.children) as HTMLElement[];
    
    // Reset heights for recalculation
    cards.forEach(card => {
      card.style.minHeight = 'auto';
    });
    
    // Wait for layout to settle
    requestAnimationFrame(() => {
      const heights = cards.map(card => card.getBoundingClientRect().height);
      const maxHeight = Math.max(...heights);
      
      // Apply uniform height
      cards.forEach(card => {
        card.style.minHeight = `${maxHeight}px`;
      });
    });
    
    return () => {
      cards.forEach(card => {
        card.style.minHeight = 'auto';
      });
    };
  }, dependencies);
  
  return containerRef;
};

/**
 * REDUCED MOTION HOOK
 * Respects user's motion preferences
 */

export const useReducedMotion = (): boolean => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    
    return () => {};
  }, []);
  
  return prefersReducedMotion;
};

/**
 * SPLIT SCREEN COMPONENT
 * Implements golden ratio and custom weight distributions
 */

interface SplitScreenProps {
  children: [React.ReactNode, React.ReactNode];
  leftWeight?: number;
  rightWeight?: number;
  gap?: string;
  responsive?: boolean;
}

export const SplitScreen: React.FC<SplitScreenProps> = ({
  children,
  leftWeight = 1.618, // Golden ratio by default
  rightWeight = 1,
  gap = 'var(--p-space-500)',
  responsive = true
}) => {
  const [left, right] = children;
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  if (responsive && isMobile) {
    return (
      <BlockStack gap="500">
        <div>{left}</div>
        <div>{right}</div>
      </BlockStack>
    );
  }
  
  return (
    <div style={{
      display: 'flex',
      gap,
      alignItems: 'start'
    }}>
      <div style={{ flex: leftWeight }}>{left}</div>
      <div style={{ flex: rightWeight }}>{right}</div>
    </div>
  );
};

/**
 * RADIAL METRICS DISPLAY
 * Creates balanced radial layouts for metrics
 */

interface Metric {
  id: string;
  value: string | number;
  label: string;
  icon: any;
  trend?: number;
  tone?: 'success' | 'warning' | 'critical' | 'info';
}

interface RadialMetricsProps {
  metrics: Metric[];
  animated?: boolean;
}

export const RadialMetricsDisplay: React.FC<RadialMetricsProps> = ({ 
  metrics, 
  animated = true 
}) => {
  const reducedMotion = useReducedMotion();
  const shouldAnimate = animated && !reducedMotion;
  
  return (
    <Grid columns={{xs: 2, sm: 2, md: 4, lg: 4}}>
      {metrics.map((metric, index) => (
        <Grid.Cell key={metric.id}>
          <motion.div
            initial={shouldAnimate ? { opacity: 0, scale: 0.9 } : {}}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ 
              delay: shouldAnimate ? index * 0.1 : 0,
              duration: shouldAnimate ? 0.3 : 0 
            }}
          >
            <Card>
              <Box padding="400">
                <BlockStack gap="300" align="center">
                  {/* Radial center - Icon */}
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'var(--p-color-bg-surface-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Icon source={metric.icon} tone="base" />
                  </div>
                  
                  {/* Primary value */}
                  <Text variant="heading2xl" as="h3" fontWeight="bold">
                    {metric.value}
                  </Text>
                  
                  {/* Label */}
                  <Text variant="bodySm" tone="subdued" as="p">
                    {metric.label}
                  </Text>
                  
                  {/* Trend indicator */}
                  {metric.trend !== undefined && (
                    <Badge tone={metric.trend > 0 ? 'success' : 'critical'}>
                      {metric.trend > 0 ? '+' : ''}{metric.trend}%
                    </Badge>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </motion.div>
        </Grid.Cell>
      ))}
    </Grid>
  );
};

/**
 * BALANCED CARD GRID
 * Maintains equal heights and responsive columns
 */

interface CardData {
  id: string;
  title: string;
  content: React.ReactNode;
  actions?: React.ReactNode;
}

interface BalancedCardGridProps {
  cards: CardData[];
  columns?: number;
  maintainHeight?: boolean;
}

export const BalancedCardGrid: React.FC<BalancedCardGridProps> = ({
  cards,
  columns,
  maintainHeight = true
}) => {
  const gridConfig = useResponsiveBalance();
  const containerRef = maintainHeight ? useBalancedHeight([cards]) : useRef(null);
  const actualColumns = columns || gridConfig.columns;
  
  return (
    <div
      ref={containerRef}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${actualColumns}, 1fr)`,
        gap: gridConfig.gap
      }}
    >
      {cards.map(card => (
        <Card key={card.id}>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h3">{card.title}</Text>
            <div style={{ flex: 1 }}>{card.content}</div>
            {card.actions && (
              <>
                <Divider />
                {card.actions}
              </>
            )}
          </BlockStack>
        </Card>
      ))}
    </div>
  );
};

/**
 * FOCUSABLE GRID
 * Keyboard-navigable balanced grid layout
 */

interface FocusableGridProps {
  items: Array<{ id: string; content: React.ReactNode }>;
  columns?: number;
}

export const FocusableGrid: React.FC<FocusableGridProps> = ({ 
  items, 
  columns = 3 
}) => {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const maxIndex = items.length - 1;
    let newIndex = focusedIndex;
    
    switch(e.key) {
      case 'ArrowRight':
        newIndex = Math.min(focusedIndex + 1, maxIndex);
        break;
      case 'ArrowLeft':
        newIndex = Math.max(focusedIndex - 1, 0);
        break;
      case 'ArrowDown':
        newIndex = Math.min(focusedIndex + columns, maxIndex);
        break;
      case 'ArrowUp':
        newIndex = Math.max(focusedIndex - columns, 0);
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'End':
        newIndex = maxIndex;
        break;
      default:
        return;
    }
    
    if (newIndex !== focusedIndex) {
      e.preventDefault();
      setFocusedIndex(newIndex);
      const element = gridRef.current?.children[newIndex] as HTMLElement;
      element?.focus();
    }
  }, [focusedIndex, items.length, columns]);
  
  return (
    <div 
      ref={gridRef}
      role="grid"
      onKeyDown={handleKeyDown}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 'var(--p-space-400)'
      }}
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          role="gridcell"
          tabIndex={index === focusedIndex ? 0 : -1}
          onFocus={() => setFocusedIndex(index)}
          style={{
            outline: index === focusedIndex ? '2px solid var(--p-color-border-interactive)' : 'none',
            borderRadius: 'var(--p-border-radius-200)',
            padding: '2px'
          }}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
};

/**
 * ANIMATED BALANCE LIST
 * List with balanced animations using Framer Motion
 */

interface AnimatedListItem {
  id: string;
  content: React.ReactNode;
}

interface AnimatedBalanceListProps {
  items: AnimatedListItem[];
  columns?: number;
}

export const AnimatedBalanceList: React.FC<AnimatedBalanceListProps> = ({ 
  items,
  columns = 3 
}) => {
  const reducedMotion = useReducedMotion();
  
  return (
    <motion.div 
      layout
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(250px, 1fr))`,
        gap: 'var(--p-space-400)'
      }}
    >
      <AnimatePresence>
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            layout
            initial={reducedMotion ? {} : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reducedMotion ? {} : { opacity: 0, scale: 0.8 }}
            transition={{ 
              type: reducedMotion ? "tween" : "spring",
              stiffness: 300,
              damping: 30,
              duration: reducedMotion ? 0 : 0.3
            }}
          >
            <Card>{item.content}</Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
};

/**
 * BALANCED FORM LAYOUT
 * Responsive form with balanced field arrangements
 */

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'select' | 'number';
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  width?: 'full' | 'half' | 'third';
}

interface BalancedFormProps {
  fields: FormField[];
  onSubmit: (data: any) => void;
}

export const BalancedForm: React.FC<BalancedFormProps> = ({ 
  fields, 
  onSubmit 
}) => {
  const [formData, setFormData] = useState<Record<string, string>>({});
  
  const handleChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };
  
  // Group fields by row for balanced layout
  const groupedFields = useMemo(() => {
    const groups: FormField[][] = [];
    let currentGroup: FormField[] = [];
    let currentWidth = 0;
    
    fields.forEach(field => {
      const fieldWidth = field.width === 'full' ? 1 : 
                        field.width === 'third' ? 0.33 : 0.5;
      
      if (currentWidth + fieldWidth > 1) {
        groups.push(currentGroup);
        currentGroup = [field];
        currentWidth = fieldWidth;
      } else {
        currentGroup.push(field);
        currentWidth += fieldWidth;
      }
    });
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }, [fields]);
  
  return (
    <form onSubmit={handleSubmit}>
      <FormLayout>
        {groupedFields.map((group, groupIndex) => (
          <FormLayout.Group key={groupIndex}>
            {group.map(field => (
              field.type === 'select' ? (
                <Select
                  key={field.name}
                  label={field.label}
                  options={field.options || []}
                  value={formData[field.name] || ''}
                  onChange={(value) => handleChange(field.name, value)}
                />
              ) : (
                <TextField
                  key={field.name}
                  label={field.label}
                  type={field.type}
                  value={formData[field.name] || ''}
                  onChange={(value) => handleChange(field.name, value)}
                  required={field.required}
                  autoComplete="off"
                />
              )
            ))}
          </FormLayout.Group>
        ))}
        
        {/* Balanced action buttons */}
        <InlineStack gap="300" align="end">
          <Button variant="primary" submit>Submit</Button>
          <Button variant="plain" onClick={() => setFormData({})}>Reset</Button>
        </InlineStack>
      </FormLayout>
    </form>
  );
};

/**
 * COMPLETE DASHBOARD EXAMPLE
 * Demonstrates all balance principles in RewardsPro context
 */

export function RewardsProBalancedDashboard() {
  const [isPending, startTransition] = useTransition();
  const gridConfig = useResponsiveBalance();
  
  // Sample data
  const metrics: Metric[] = [
    { id: '1', value: '1,234', label: 'Customers', icon: PersonIcon, trend: 12 },
    { id: '2', value: '$45.6k', label: 'Revenue', icon: CashDollarIcon, trend: 8 },
    { id: '3', value: '89%', label: 'Retention', icon: ChartLineIcon, trend: -2 },
    { id: '4', value: '4.9', label: 'Rating', icon: StarIcon, trend: 5 },
  ];
  
  const recentActivity = [
    { id: '1', type: 'Cashback Earned', customer: 'John Doe', amount: '+$25.00', time: '2 min ago' },
    { id: '2', type: 'Tier Upgrade', customer: 'Jane Smith', amount: 'Gold', time: '15 min ago' },
    { id: '3', type: 'Credit Used', customer: 'Bob Johnson', amount: '-$10.00', time: '1 hour ago' },
  ];
  
  return (
    <Page title="RewardsPro Dashboard">
      <Layout>
        {/* Radial balance metrics */}
        <Layout.Section>
          <RadialMetricsDisplay metrics={metrics} />
        </Layout.Section>
        
        {/* Golden ratio split layout */}
        <Layout.Section>
          <SplitScreen leftWeight={1.618} rightWeight={1}>
            {/* Main content area */}
            <Card>
              <Box padding="500">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingLg" as="h2">Recent Activity</Text>
                    <Badge tone="info">{recentActivity.length} items</Badge>
                  </InlineStack>
                  
                  <BlockStack gap="300">
                    {recentActivity.map(activity => (
                      <Box key={activity.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                        <InlineStack align="space-between">
                          <BlockStack gap="050">
                            <Text variant="bodyMd" as="p" fontWeight="semibold">
                              {activity.type}
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              {activity.customer} • {activity.time}
                            </Text>
                          </BlockStack>
                          <Text variant="bodyMd" fontWeight="bold" as="p">
                            {activity.amount}
                          </Text>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
            
            {/* Sidebar */}
            <BlockStack gap="400">
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">Quick Actions</Text>
                    <BlockStack gap="200">
                      <Button fullWidth variant="primary">Add Customer</Button>
                      <Button fullWidth variant="secondary">Create Tier</Button>
                      <Button fullWidth variant="plain">View Reports</Button>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
              
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">System Status</Text>
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <InlineStack gap="100">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text variant="bodySm" as="p">API</Text>
                        </InlineStack>
                        <Badge tone="success">Operational</Badge>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <InlineStack gap="100">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text variant="bodySm" as="p">Webhooks</Text>
                        </InlineStack>
                        <Badge tone="success">Active</Badge>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
            </BlockStack>
          </SplitScreen>
        </Layout.Section>
      </Layout>
    </Page>
  );
}