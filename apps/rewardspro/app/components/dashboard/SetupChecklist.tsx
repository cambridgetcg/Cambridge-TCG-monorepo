import { Card, BlockStack, InlineStack, Text, Button, ProgressBar, Icon, Box, Collapsible } from "@shopify/polaris";
import { CheckCircleIcon, AlertTriangleIcon, ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { memo, useState } from "react";

interface SetupTask {
  id: string;
  label: string;
  description?: string;
  completed: boolean;
  action: string | (() => void);
  priority?: "high" | "medium" | "low";
}

interface SetupChecklistProps {
  tasks: SetupTask[];
  onTaskAction: (action: string | (() => void)) => void;
}

export const SetupChecklist = memo(function SetupChecklist({
  tasks,
  onTaskAction,
}: SetupChecklistProps) {
  const [expanded, setExpanded] = useState(true);
  
  const completedTasks = tasks.filter(t => t.completed).length;
  const progress = Math.round((completedTasks / tasks.length) * 100);
  const isComplete = progress === 100;

  return (
    <Card roundedAbove="sm">
      <Box padding="400">
        <BlockStack gap="400">
          {/* Header */}
          <InlineStack align="space-between">
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd" fontWeight="semibold">
                  {isComplete ? "Setup Complete!" : "Complete Your Setup"}
                </Text>
                {isComplete && (
                  <Icon source={CheckCircleIcon} tone="success" />
                )}
              </InlineStack>
              
              <Text as="p" variant="bodyMd" tone="subdued">
                {isComplete 
                  ? "Your loyalty program is fully configured and ready"
                  : `Complete these tasks to launch your loyalty program`
                }
              </Text>
            </BlockStack>
            
            <Button
              variant="plain"
              icon={expanded ? ChevronUpIcon : ChevronDownIcon}
              onClick={() => setExpanded(!expanded)}
              accessibilityLabel={expanded ? "Collapse setup tasks" : "Expand setup tasks"}
            />
          </InlineStack>

          {/* Progress */}
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" variant="bodySm" fontWeight="semibold">
                {completedTasks} of {tasks.length} tasks completed
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {progress}%
              </Text>
            </InlineStack>
            <ProgressBar 
              progress={progress} 
              size="small" 
              tone={isComplete ? "success" : "primary"}
            />
          </BlockStack>

          {/* Tasks */}
          <Collapsible
            id="setup-tasks"
            open={expanded}
            transition={{
              duration: "150ms",
              timingFunction: "ease-in-out",
            }}
          >
            <BlockStack gap="300">
              {tasks.map((task) => (
                <Box
                  key={task.id}
                  padding="300"
                  background={task.completed ? "bg-surface-success-hover" : "bg-surface-secondary"}
                  borderRadius="200"
                  borderColor={task.completed ? "border-success" : "border"}
                  borderWidth="025"
                >
                  <InlineStack align="space-between" blockAlign="center" wrap={false}>
                    <InlineStack gap="300" blockAlign="center">
                      <Icon
                        source={task.completed ? CheckCircleIcon : AlertTriangleIcon}
                        tone={task.completed ? "success" : getPriorityTone(task.priority)}
                      />
                      
                      <BlockStack gap="050">
                        <Text 
                          as="p" 
                          variant="bodyMd" 
                          fontWeight={task.completed ? "regular" : "semibold"}
                        >
                          {task.label}
                        </Text>
                        {task.description && !task.completed && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {task.description}
                          </Text>
                        )}
                      </BlockStack>
                    </InlineStack>
                    
                    {!task.completed && (
                      <Button
                        size="slim"
                        variant={task.priority === "high" ? "primary" : undefined}
                        onClick={() => onTaskAction(task.action)}
                        accessibilityLabel={`Complete task: ${task.label}`}
                      >
                        Start
                      </Button>
                    )}
                    
                    {task.completed && (
                      <Text as="span" variant="bodySm" tone="success" fontWeight="medium">
                        Complete
                      </Text>
                    )}
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          </Collapsible>
        </BlockStack>
      </Box>
    </Card>
  );
});

function getPriorityTone(priority?: string) {
  switch (priority) {
    case "high":
      return "critical" as const;
    case "medium":
      return "warning" as const;
    default:
      return "caution" as const;
  }
}