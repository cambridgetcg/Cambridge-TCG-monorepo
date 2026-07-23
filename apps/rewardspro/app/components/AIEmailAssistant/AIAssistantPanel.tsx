/**
 * AIAssistantPanel Component
 *
 * Global AI panel for email template editor sidebar.
 * Supports content generation, enhancement, and subject line suggestions.
 */

import { useState, useCallback, useMemo } from "react";
import {
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Box,
  Banner,
  Badge,
  Spinner,
  Divider,
  Tabs,
  Scrollable,
} from "@shopify/polaris";
import {
  MagicIcon,
  RefreshIcon,
  CheckIcon,
  XIcon,
  ClipboardIcon,
} from "@shopify/polaris-icons";
import { useAIAssistant, type AIContext } from "~/hooks/useAIAssistant";

// ============================================================================
// TYPES
// ============================================================================

type AIMode = "generate" | "enhance" | "subject";

const MODE_TABS = [
  { id: "generate", content: "Generate", accessibilityLabel: "Generate new content" },
  { id: "enhance", content: "Enhance", accessibilityLabel: "Enhance existing content" },
  { id: "subject", content: "Subjects", accessibilityLabel: "Generate subject lines" },
];

interface AIAssistantPanelProps {
  /** Current template type (tier_welcome, promotional, etc.) */
  templateType: string;
  /** Shop name for brand context */
  shopName?: string;
  /** Current subject line */
  currentSubject?: string;
  /** Preview text */
  previewText?: string;
  /** Currently selected block content (for enhance mode) */
  selectedBlockContent?: string;
  /** Callback when AI content should be applied */
  onApplyContent?: (content: string) => void;
  /** Callback when subject line is updated */
  onUpdateSubject?: (subject: string) => void;
  /** Whether AI features are enabled */
  disabled?: boolean;
}

// ============================================================================
// QUICK PROMPTS BY TEMPLATE TYPE
// ============================================================================

const QUICK_PROMPTS: Record<string, { label: string; prompt: string }[]> = {
  tier_welcome: [
    { label: "Welcome message", prompt: "Write a warm welcome for new tier members highlighting their key benefits" },
    { label: "Benefits overview", prompt: "Create a brief overview of their new tier benefits and how to use them" },
    { label: "First purchase CTA", prompt: "Write an engaging call-to-action encouraging their first purchase as a new tier member" },
  ],
  tier_upgrade: [
    { label: "Congratulations", prompt: "Write an exciting congratulations message for reaching a new tier" },
    { label: "New perks", prompt: "Highlight the new perks and benefits they've unlocked" },
    { label: "Exclusive access", prompt: "Emphasize their new exclusive access and VIP status" },
  ],
  tier_downgrade: [
    { label: "Gentle notice", prompt: "Write a supportive message about their tier change with a path to recovery" },
    { label: "How to return", prompt: "Explain how they can reach their previous tier again" },
    { label: "Current benefits", prompt: "Remind them of the benefits they still have" },
  ],
  reward_expiry: [
    { label: "Expiry warning", prompt: "Create an urgent but friendly reminder about expiring rewards" },
    { label: "Use your points", prompt: "Encourage using points before they expire with specific suggestions" },
    { label: "Last chance", prompt: "Write a final reminder with clear deadline and call-to-action" },
  ],
  inactive_reengagement: [
    { label: "We miss you", prompt: "Write a warm 'we miss you' message to re-engage inactive customers" },
    { label: "What's new", prompt: "Highlight what they've been missing and new benefits available" },
    { label: "Special offer", prompt: "Create a special comeback offer to incentivize return" },
  ],
  promotional: [
    { label: "Limited offer", prompt: "Create urgency around a limited-time exclusive offer for members" },
    { label: "Flash sale", prompt: "Write an exciting flash sale announcement with member-exclusive discount" },
    { label: "New arrivals", prompt: "Announce new arrivals with a personalized recommendation feel" },
  ],
  transactional: [
    { label: "Order confirmed", prompt: "Write a friendly order confirmation message" },
    { label: "Shipping update", prompt: "Create an engaging shipping notification" },
    { label: "Thank you", prompt: "Write a heartfelt thank you message after purchase" },
  ],
};

const DEFAULT_QUICK_PROMPTS = [
  { label: "Welcome message", prompt: "Write a warm welcome message for loyalty members" },
  { label: "Thank you", prompt: "Create a heartfelt thank you message for being a valued customer" },
  { label: "Shop now CTA", prompt: "Write an engaging call-to-action to visit the store" },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function AIAssistantPanel({
  templateType,
  shopName,
  currentSubject,
  previewText,
  selectedBlockContent,
  onApplyContent,
  onUpdateSubject,
  disabled = false,
}: AIAssistantPanelProps) {
  const [mode, setMode] = useState<AIMode>("generate");
  const [prompt, setPrompt] = useState("");
  const [generatedSubjects, setGeneratedSubjects] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const {
    generate,
    generateSubjects,
    streamedContent,
    isStreaming,
    error,
    abort,
    reset,
  } = useAIAssistant();

  // Get quick prompts for current template type
  const quickPrompts = useMemo(
    () => QUICK_PROMPTS[templateType] || DEFAULT_QUICK_PROMPTS,
    [templateType]
  );

  // Build context for AI
  const buildContext = useCallback((): AIContext => ({
    templateType,
    shopName,
    currentContent: mode === "enhance" ? selectedBlockContent : undefined,
    currentSubject,
    previewText,
  }), [templateType, shopName, mode, selectedBlockContent, currentSubject, previewText]);

  // Handle generation
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    const context = buildContext();
    const action = mode === "enhance" ? "enhance" : "generate";
    await generate(prompt, context, action);
  }, [prompt, mode, buildContext, generate]);

  // Handle quick prompt selection
  const handleQuickPrompt = useCallback((quickPrompt: string) => {
    setPrompt(quickPrompt);
  }, []);

  // Handle subject line generation
  const handleGenerateSubjects = useCallback(async () => {
    const context = buildContext();
    const subjects = await generateSubjects(context, prompt || undefined);
    setGeneratedSubjects(subjects);
  }, [buildContext, generateSubjects, prompt]);

  // Handle apply content
  const handleApply = useCallback(() => {
    if (streamedContent && onApplyContent) {
      onApplyContent(streamedContent);
      reset();
      setPrompt("");
    }
  }, [streamedContent, onApplyContent, reset]);

  // Handle subject selection
  const handleSelectSubject = useCallback((subject: string) => {
    if (onUpdateSubject) {
      onUpdateSubject(subject);
    }
  }, [onUpdateSubject]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (streamedContent) {
      await navigator.clipboard.writeText(streamedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [streamedContent]);

  const selectedTabIndex = MODE_TABS.findIndex(t => t.id === mode);

  const handleTabChange = useCallback((index: number) => {
    const newMode = MODE_TABS[index].id as AIMode;
    setMode(newMode);
    reset();
    setGeneratedSubjects([]);
    setPrompt("");
  }, [reset]);

  // Disabled state
  if (disabled) {
    return (
      <BlockStack gap="300">
        <InlineStack gap="200" blockAlign="center">
          <MagicIcon />
          <Text as="h3" variant="headingMd">AI Assistant</Text>
        </InlineStack>
        <Banner tone="warning">
          <p>AI features require the Anthropic API key to be configured.</p>
        </Banner>
      </BlockStack>
    );
  }

  return (
    <BlockStack gap="300">
      {/* Header */}
      <InlineStack gap="200" blockAlign="center">
        <MagicIcon />
        <Text as="h3" variant="headingMd">AI Assistant</Text>
        <Badge tone="info">Beta</Badge>
      </InlineStack>

      {/* Mode Tabs */}
      <Tabs tabs={MODE_TABS} selected={selectedTabIndex} onSelect={handleTabChange} fitted />

      <Divider />

      {/* Generate Mode */}
      {mode === "generate" && (
        <BlockStack gap="300">
          <Text as="p" variant="bodySm" tone="subdued">
            Describe what content you want to create for your {templateType.replace("_", " ")} email.
          </Text>

          {/* Quick Prompts */}
          <BlockStack gap="200">
            <Text as="span" variant="bodySm" fontWeight="semibold">Quick prompts:</Text>
            <InlineStack gap="100" wrap>
              {quickPrompts.map((qp, i) => (
                <Button
                  key={i}
                  size="slim"
                  variant="secondary"
                  onClick={() => handleQuickPrompt(qp.prompt)}
                >
                  {qp.label}
                </Button>
              ))}
            </InlineStack>
          </BlockStack>

          {/* Prompt Input */}
          <TextField
            label="Your prompt"
            labelHidden
            value={prompt}
            onChange={setPrompt}
            placeholder="e.g., Write a welcome message for new Gold tier members..."
            multiline={3}
            autoComplete="off"
            disabled={isStreaming}
          />

          {/* Generate Button */}
          <Button
            variant="primary"
            onClick={handleGenerate}
            loading={isStreaming}
            disabled={!prompt.trim() || isStreaming}
            fullWidth
          >
            {isStreaming ? "Generating..." : "Generate Content"}
          </Button>
        </BlockStack>
      )}

      {/* Enhance Mode */}
      {mode === "enhance" && (
        <BlockStack gap="300">
          {selectedBlockContent ? (
            <>
              <Text as="p" variant="bodySm" tone="subdued">
                Describe how you want to improve the selected content.
              </Text>

              {/* Current Content Preview */}
              <Box padding="200" background="bg-surface-secondary" borderRadius="150">
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" fontWeight="semibold">Current content:</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {selectedBlockContent.length > 100
                      ? selectedBlockContent.substring(0, 100) + "..."
                      : selectedBlockContent}
                  </Text>
                </BlockStack>
              </Box>

              {/* Enhancement suggestions */}
              <BlockStack gap="200">
                <Text as="span" variant="bodySm" fontWeight="semibold">Suggestions:</Text>
                <InlineStack gap="100" wrap>
                  <Button size="slim" variant="secondary" onClick={() => handleQuickPrompt("Make it shorter and punchier")}>
                    Shorter
                  </Button>
                  <Button size="slim" variant="secondary" onClick={() => handleQuickPrompt("Make it more engaging and exciting")}>
                    More engaging
                  </Button>
                  <Button size="slim" variant="secondary" onClick={() => handleQuickPrompt("Add personalization variables")}>
                    Personalize
                  </Button>
                  <Button size="slim" variant="secondary" onClick={() => handleQuickPrompt("Make it more urgent")}>
                    Add urgency
                  </Button>
                </InlineStack>
              </BlockStack>

              <TextField
                label="Enhancement instructions"
                labelHidden
                value={prompt}
                onChange={setPrompt}
                placeholder="e.g., Make it more personal and add a sense of urgency..."
                multiline={2}
                autoComplete="off"
                disabled={isStreaming}
              />

              <Button
                variant="primary"
                onClick={handleGenerate}
                loading={isStreaming}
                disabled={!prompt.trim() || isStreaming}
                fullWidth
              >
                {isStreaming ? "Enhancing..." : "Enhance Content"}
              </Button>
            </>
          ) : (
            <Box padding="400" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="200">
                <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                  Select a text block to enhance its content with AI.
                </Text>
                <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                  Click on any text block in the editor to get started.
                </Text>
              </BlockStack>
            </Box>
          )}
        </BlockStack>
      )}

      {/* Subject Lines Mode */}
      {mode === "subject" && (
        <BlockStack gap="300">
          <Text as="p" variant="bodySm" tone="subdued">
            Generate compelling subject line variations for your email.
          </Text>

          {currentSubject && (
            <Box padding="200" background="bg-surface-secondary" borderRadius="150">
              <BlockStack gap="100">
                <Text as="span" variant="bodySm" fontWeight="semibold">Current subject:</Text>
                <Text as="p" variant="bodySm">{currentSubject}</Text>
              </BlockStack>
            </Box>
          )}

          <TextField
            label="Optional guidance"
            labelHidden
            value={prompt}
            onChange={setPrompt}
            placeholder="Optional: Add specific guidance for subject lines..."
            autoComplete="off"
            disabled={isStreaming}
          />

          <Button
            variant="primary"
            onClick={handleGenerateSubjects}
            loading={isStreaming}
            disabled={isStreaming}
            fullWidth
          >
            {isStreaming ? "Generating..." : "Generate Subject Lines"}
          </Button>

          {/* Generated Subject Lines */}
          {generatedSubjects.length > 0 && (
            <BlockStack gap="200">
              <Text as="span" variant="bodySm" fontWeight="semibold">Suggestions:</Text>
              {generatedSubjects.map((subject, i) => (
                <Box
                  key={i}
                  padding="200"
                  background="bg-surface-secondary"
                  borderRadius="150"
                >
                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <div style={{ flex: 1 }}>
                      <Text as="p" variant="bodySm">{subject}</Text>
                    </div>
                    <Button
                      size="slim"
                      icon={CheckIcon}
                      onClick={() => handleSelectSubject(subject)}
                      accessibilityLabel="Use this subject"
                    />
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      )}

      <Divider />

      {/* Error Display */}
      {error && (
        <Banner tone="critical" onDismiss={reset}>
          <p>{error}</p>
        </Banner>
      )}

      {/* Streaming Preview */}
      {(isStreaming || streamedContent) && mode !== "subject" && (
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="span" variant="bodySm" fontWeight="semibold">
              {isStreaming ? "Generating..." : "Preview"}
            </Text>
            {isStreaming && (
              <Button size="slim" variant="plain" icon={XIcon} onClick={abort}>
                Cancel
              </Button>
            )}
          </InlineStack>

          <Box
            padding="300"
            background="bg-surface-secondary"
            borderRadius="200"
            minHeight="100px"
          >
            <Scrollable style={{ maxHeight: "200px" }}>
              {isStreaming && !streamedContent && (
                <InlineStack gap="200" blockAlign="center">
                  <Spinner size="small" />
                  <Text as="p" variant="bodySm" tone="subdued">Starting...</Text>
                </InlineStack>
              )}
              {streamedContent && (
                <Text as="p" variant="bodySm" breakWord>
                  {streamedContent}
                  {isStreaming && <span className="cursor-blink">|</span>}
                </Text>
              )}
            </Scrollable>
          </Box>

          {/* Action Buttons */}
          {streamedContent && !isStreaming && (
            <InlineStack gap="200">
              <Button
                variant="primary"
                icon={CheckIcon}
                onClick={handleApply}
                disabled={!onApplyContent}
              >
                Apply to Template
              </Button>
              <Button
                variant="secondary"
                icon={copied ? CheckIcon : ClipboardIcon}
                onClick={handleCopy}
              >
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button
                variant="plain"
                icon={RefreshIcon}
                onClick={handleGenerate}
              >
                Regenerate
              </Button>
            </InlineStack>
          )}
        </BlockStack>
      )}

      {/* Variable Hint */}
      <Box padding="200" background="bg-surface-secondary" borderRadius="100">
        <Text as="p" variant="bodySm" tone="subdued">
          AI-generated content may include personalization variables like {"{{customer_name}}"} that will be replaced with real customer data.
        </Text>
      </Box>
    </BlockStack>
  );
}

export default AIAssistantPanel;
