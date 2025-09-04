import { Card, BlockStack, InlineStack, Text, Box, Icon, ProgressBar } from "@shopify/polaris";
import type { FunctionComponent, SVGProps } from "react";
import { memo } from "react";

interface JourneyStep {
  icon: FunctionComponent<SVGProps<SVGSVGElement>>;
  timeframe: string;
  title: string;
  description: string;
  isCompleted?: boolean;
  isCurrent?: boolean;
}

interface CustomerJourneyProps {
  steps: JourneyStep[];
  currentStep?: number;
}

export const CustomerJourney = memo(function CustomerJourney({
  steps,
  currentStep = 0,
}: CustomerJourneyProps) {
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <Card roundedAbove="sm">
      <Box padding="400">
        <BlockStack gap="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd" fontWeight="semibold">
              Customer Journey
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Track your customers' progression through the loyalty program
            </Text>
          </BlockStack>

          <Box paddingBlockEnd="200">
            <ProgressBar 
              progress={progress} 
              size="small" 
              tone="primary"
            />
          </Box>

          <Box position="relative">
            {/* Connection line */}
            <Box
              position="absolute"
              insetBlockStart="300"
              insetInlineStart="300"
              insetInlineEnd="300"
              background="bg-fill-tertiary"
              minHeight="2px"
            />

            {/* Steps */}
            <InlineStack gap="0" align="space-between" wrap={false}>
              {steps.map((step, index) => {
                const isActive = index <= currentStep;
                const isCurrent = index === currentStep;

                return (
                  <Box 
                    key={index} 
                    width="33.33%" 
                    padding="200"
                  >
                    <BlockStack gap="300" align="center">
                      {/* Icon container */}
                      <Box
                        background={
                          isActive ? "bg-fill-success" : "bg-surface-secondary"
                        }
                        borderRadius="full"
                        borderColor={isCurrent ? "border-secondary" : "border"}
                        borderWidth={isCurrent ? "050" : "025"}
                        padding="400"
                        minHeight="60px"
                        minWidth="60px"
                      >
                        <InlineStack align="center" blockAlign="center">
                          <Icon 
                            source={step.icon} 
                            tone={isActive ? "success" : "subdued"}
                          />
                        </InlineStack>
                      </Box>

                      {/* Content */}
                      <BlockStack gap="100" align="center">
                        <Badge
                          size="small"
                          tone={isActive ? "success" : "default"}
                        >
                          {step.timeframe}
                        </Badge>
                        
                        <Text 
                          as="h3" 
                          variant="headingSm" 
                          alignment="center"
                          fontWeight={isCurrent ? "semibold" : "regular"}
                        >
                          {step.title}
                        </Text>
                        
                        <Box maxWidth="200px">
                          <Text 
                            as="p" 
                            variant="bodySm" 
                            alignment="center" 
                            tone="subdued"
                          >
                            {step.description}
                          </Text>
                        </Box>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                );
              })}
            </InlineStack>
          </Box>
        </BlockStack>
      </Box>
    </Card>
  );

  function Badge({ children, size, tone }: any) {
    const bgColor = tone === "success" ? "bg-fill-success-secondary" : "bg-fill-tertiary";
    const textTone = tone === "success" ? "success" : "subdued";
    
    return (
      <Box
        padding="100"
        paddingInlineStart="200"
        paddingInlineEnd="200"
        background={bgColor}
        borderRadius="100"
      >
        <Text as="span" variant="bodySm" tone={textTone} fontWeight="medium">
          {children}
        </Text>
      </Box>
    );
  }
});