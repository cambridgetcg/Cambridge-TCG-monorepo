import { useState, useCallback, useRef, useEffect } from "react";
import {
  Box,
  Button,
  TextField,
  Text,
  BlockStack,
  InlineStack,
  Spinner,
  Link,
  Icon,
} from "@shopify/polaris";
import {
  QuestionCircleIcon,
  XIcon,
  SendIcon,
  ChatIcon,
  ExternalIcon,
} from "@shopify/polaris-icons";

interface Source {
  type: string;
  pageId?: string;
  spaceId?: string;
  reason?: string;
  sections?: string[];
}

interface Message {
  id: string;
  type: "user" | "assistant";
  content: string;
  sources?: Source[];
  followupQuestions?: string[];
  timestamp: Date;
}

interface HelpAssistantProps {
  /** Custom placeholder text */
  placeholder?: string;
  /** Docs base URL for source links */
  docsUrl?: string;
}

export function HelpAssistant({
  placeholder = "Ask a question about RewardsPro...",
  docsUrl = "https://docs.rewardspro.io",
}: HelpAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback(async (questionText?: string) => {
    const q = questionText || question;
    if (!q.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: "user",
      content: q.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    setIsLoading(true);
    setError(null);

    try {
      console.log("[HelpAssistant] Sending question:", q.trim());

      const response = await fetch("/api/gitbook-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: q.trim() }),
      });

      const data = await response.json();

      console.log("[HelpAssistant] Response status:", response.status);
      console.log("[HelpAssistant] Response data:", {
        hasAnswer: !!data.answer,
        answerLength: data.answer?.length || 0,
        answerPreview: data.answer?.substring(0, 100),
        sourcesCount: data.sources?.length || 0,
        followupCount: data.followupQuestions?.length || 0,
        error: data.error,
      });

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      // Provide more helpful fallback message
      let content = data.answer;
      if (!content || content.trim() === "") {
        content = "I couldn't find a specific answer to that question. Try rephrasing or check out the documentation at docs.rewardspro.io";
        console.warn("[HelpAssistant] Empty answer received from API");
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        type: "assistant",
        content,
        sources: data.sources,
        followupQuestions: data.followupQuestions,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("[HelpAssistant] Error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, [question, isLoading]);

  const handleFollowupClick = useCallback((followup: string) => {
    handleSubmit(followup);
  }, [handleSubmit]);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  // Render markdown-like content (basic)
  const renderContent = (content: string) => {
    // Convert markdown links to JSX
    const parts = content.split(/(\[.*?\]\(.*?\))/g);
    return parts.map((part, index) => {
      const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        return (
          <Link key={index} url={linkMatch[2]} target="_blank">
            {linkMatch[1]}
          </Link>
        );
      }
      // Convert **bold** to strong
      const boldParts = part.split(/(\*\*.*?\*\*)/g);
      return boldParts.map((bp, bi) => {
        if (bp.startsWith("**") && bp.endsWith("**")) {
          return <strong key={`${index}-${bi}`}>{bp.slice(2, -2)}</strong>;
        }
        // Convert `code` to code elements
        const codeParts = bp.split(/(`.*?`)/g);
        return codeParts.map((cp, ci) => {
          if (cp.startsWith("`") && cp.endsWith("`")) {
            return (
              <code
                key={`${index}-${bi}-${ci}`}
                style={{
                  background: "var(--p-color-bg-surface-secondary)",
                  padding: "0 4px",
                  borderRadius: "4px",
                  fontSize: "0.9em",
                }}
              >
                {cp.slice(1, -1)}
              </code>
            );
          }
          return cp;
        });
      });
    });
  };

  return (
    <>
      {/* Floating Button */}
      <div
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 1000,
        }}
      >
        <Button
          icon={isOpen ? XIcon : undefined}
          onClick={toggleOpen}
          variant={isOpen ? "secondary" : "primary"}
          size="large"
          accessibilityLabel={isOpen ? "Close help assistant" : "Open help assistant"}
        >
          {isOpen ? null : "Ask me anything"}
        </Button>
      </div>

      {/* Chat Panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "80px",
            right: "20px",
            width: "380px",
            maxHeight: "500px",
            backgroundColor: "var(--p-color-bg-surface)",
            borderRadius: "12px",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
            zIndex: 999,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            border: "1px solid var(--p-color-border)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--p-color-border)",
              backgroundColor: "var(--p-color-bg-surface-secondary)",
            }}
          >
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Icon source={ChatIcon} tone="base" />
                <Text as="h3" variant="headingSm">
                  Help Assistant
                </Text>
              </InlineStack>
              <InlineStack gap="100">
                {messages.length > 0 && (
                  <Button
                    variant="plain"
                    size="slim"
                    onClick={clearChat}
                  >
                    Clear
                  </Button>
                )}
                <Link url={docsUrl} target="_blank">
                  <InlineStack gap="100" blockAlign="center">
                    <Text as="span" variant="bodySm">Docs</Text>
                    <Icon source={ExternalIcon} tone="base" />
                  </InlineStack>
                </Link>
              </InlineStack>
            </InlineStack>
          </div>

          {/* Messages Area */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px",
              minHeight: "200px",
              maxHeight: "320px",
            }}
          >
            {messages.length === 0 && !isLoading && (
              <Box padding="400">
                <BlockStack gap="300" inlineAlign="center">
                  <Icon source={QuestionCircleIcon} tone="subdued" />
                  <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                    Ask me anything about RewardsPro! I can help with setup, features, troubleshooting, and more.
                  </Text>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">Try asking:</Text>
                    {[
                      "How do I set up loyalty tiers?",
                      "What is cashback and how does it work?",
                      "How do customers earn store credit?",
                    ].map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="plain"
                        size="slim"
                        onClick={() => handleSubmit(suggestion)}
                        textAlign="left"
                      >
                        "{suggestion}"
                      </Button>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Box>
            )}

            <BlockStack gap="300">
              {messages.map((message) => (
                <div
                  key={message.id}
                  style={{
                    display: "flex",
                    justifyContent: message.type === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "10px 14px",
                      borderRadius: message.type === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      backgroundColor:
                        message.type === "user"
                          ? "var(--p-color-bg-fill-brand)"
                          : "var(--p-color-bg-surface-secondary)",
                      color: message.type === "user" ? "white" : "inherit",
                    }}
                  >
                    <Text as="p" variant="bodySm">
                      {message.type === "user"
                        ? message.content
                        : renderContent(message.content)
                      }
                    </Text>

                    {/* Sources */}
                    {message.sources && message.sources.length > 0 && (
                      <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--p-color-border)" }}>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Sources:
                        </Text>
                        <BlockStack gap="100">
                          {message.sources.slice(0, 3).map((source, idx) => (
                            <Link
                              key={idx}
                              url={docsUrl}
                              target="_blank"
                            >
                              <Text as="span" variant="bodySm">
                                {source.reason || "View documentation"}
                              </Text>
                            </Link>
                          ))}
                        </BlockStack>
                      </div>
                    )}

                    {/* Follow-up Questions */}
                    {message.followupQuestions && message.followupQuestions.length > 0 && (
                      <div style={{ marginTop: "8px" }}>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Related questions:
                        </Text>
                        <BlockStack gap="100">
                          {message.followupQuestions.slice(0, 3).map((followup, idx) => (
                            <Button
                              key={idx}
                              variant="plain"
                              size="slim"
                              onClick={() => handleFollowupClick(followup)}
                              textAlign="left"
                            >
                              {followup}
                            </Button>
                          ))}
                        </BlockStack>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: "16px 16px 16px 4px",
                      backgroundColor: "var(--p-color-bg-surface-secondary)",
                    }}
                  >
                    <InlineStack gap="200" blockAlign="center">
                      <Spinner size="small" />
                      <Text as="span" variant="bodySm" tone="subdued">
                        Thinking...
                      </Text>
                    </InlineStack>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    backgroundColor: "var(--p-color-bg-surface-critical)",
                  }}
                >
                  <Text as="p" variant="bodySm" tone="critical">
                    {error}
                  </Text>
                </div>
              )}
            </BlockStack>
          </div>

          {/* Input Area */}
          <div
            style={{
              padding: "12px",
              borderTop: "1px solid var(--p-color-border)",
              backgroundColor: "var(--p-color-bg-surface)",
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              style={{ display: "flex", gap: "8px", alignItems: "flex-end", width: "100%" }}
            >
              <div style={{ flex: 1 }}>
                <TextField
                  label=""
                  labelHidden
                  value={question}
                  onChange={setQuestion}
                  placeholder={placeholder}
                  disabled={isLoading}
                  autoComplete="off"
                />
              </div>
              <Button
                icon={SendIcon}
                submit
                disabled={!question.trim() || isLoading}
                variant="primary"
                accessibilityLabel="Send question"
              />
            </form>
          </div>
        </div>
      )}
    </>
  );
}
