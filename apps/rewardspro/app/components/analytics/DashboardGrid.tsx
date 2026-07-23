/**
 * DashboardGrid - Responsive grid layout for dashboard widgets
 *
 * Features:
 * - CSS Grid-based responsive layout
 * - Size presets (small, medium, large, full)
 * - Drag-and-drop reordering (future)
 * - Collapsible sections
 */

import { BlockStack, Text, Button, InlineStack, Collapsible } from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon, SettingsIcon } from "@shopify/polaris-icons";
import { useState, useCallback, type ReactNode } from "react";

export interface DashboardSection {
  id: string;
  title: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

export interface DashboardGridProps {
  sections?: DashboardSection[];
  columns?: 1 | 2 | 3 | 4;
  gap?: 'tight' | 'base' | 'loose';
  children?: ReactNode;
  onCustomize?: () => void;
}

const gapSizes = {
  tight: '12px',
  base: '16px',
  loose: '24px',
};

export function DashboardGrid({
  sections,
  columns = 4,
  gap = 'base',
  children,
  onCustomize,
}: DashboardGridProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    if (!sections) return new Set();
    return new Set(
      sections.filter(s => s.defaultCollapsed).map(s => s.id)
    );
  });

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: gapSizes[gap],
    width: '100%',
  };

  // Render with sections
  if (sections && sections.length > 0) {
    return (
      <BlockStack gap="600">
        {/* Customize Button */}
        {onCustomize && (
          <InlineStack align="end">
            <Button
              icon={SettingsIcon}
              onClick={onCustomize}
              variant="plain"
            >
              Customize Dashboard
            </Button>
          </InlineStack>
        )}

        {sections.map((section) => (
          <DashboardSectionComponent
            key={section.id}
            section={section}
            isCollapsed={collapsedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            columns={columns}
            gap={gap}
          />
        ))}
      </BlockStack>
    );
  }

  // Simple grid without sections
  return (
    <BlockStack gap="400">
      {onCustomize && (
        <InlineStack align="end">
          <Button
            icon={SettingsIcon}
            onClick={onCustomize}
            variant="plain"
          >
            Customize Dashboard
          </Button>
        </InlineStack>
      )}
      <div style={gridStyle}>
        {children}
      </div>
    </BlockStack>
  );
}

interface DashboardSectionComponentProps {
  section: DashboardSection;
  isCollapsed: boolean;
  onToggle: () => void;
  columns: number;
  gap: 'tight' | 'base' | 'loose';
}

function DashboardSectionComponent({
  section,
  isCollapsed,
  onToggle,
  columns,
  gap,
}: DashboardSectionComponentProps) {
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: gapSizes[gap],
    width: '100%',
  };

  return (
    <BlockStack gap="300">
      {/* Section Header */}
      <InlineStack align="space-between" blockAlign="center">
        <Text as="h2" variant="headingMd">{section.title}</Text>
        {section.collapsible && (
          <Button
            icon={isCollapsed ? ChevronDownIcon : ChevronUpIcon}
            onClick={onToggle}
            variant="plain"
            accessibilityLabel={isCollapsed ? "Expand section" : "Collapse section"}
          />
        )}
      </InlineStack>

      {/* Section Content */}
      {section.collapsible ? (
        <Collapsible
          id={`section-${section.id}`}
          open={!isCollapsed}
          transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}
        >
          <div style={gridStyle}>
            {section.children}
          </div>
        </Collapsible>
      ) : (
        <div style={gridStyle}>
          {section.children}
        </div>
      )}
    </BlockStack>
  );
}

// Responsive wrapper that adjusts columns based on viewport
export function ResponsiveDashboardGrid(props: DashboardGridProps) {
  // In a real implementation, this would use a resize observer
  // or CSS media queries to adjust columns
  return <DashboardGrid {...props} />;
}

export default DashboardGrid;
