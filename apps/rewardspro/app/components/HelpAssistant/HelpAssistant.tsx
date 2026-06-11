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
  Tooltip,
  Badge,
} from "@shopify/polaris";
import {
  QuestionCircleIcon,
  XIcon,
  SendIcon,
  ChatIcon,
  ExternalIcon,
  DeleteIcon,
  SettingsIcon,
  AppsIcon,
  AlertCircleIcon,
  StarIcon,
  EmailIcon,
  BugIcon,
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

// Contact email
const CONTACT_EMAIL = "contact@rewardspro.io";

// Quick action categories for better UX
const QUICK_ACTIONS = [
  {
    category: "Getting Started",
    icon: StarIcon,
    type: "questions" as const,
    questions: [
      "How do I set up my first loyalty tier?",
      "What's the quickest way to launch my rewards program?",
    ],
  },
  {
    category: "Features",
    icon: AppsIcon,
    type: "questions" as const,
    questions: [
      "How does cashback work for my customers?",
      "Can I offer different rewards for VIP customers?",
    ],
  },
  {
    category: "Setup & Config",
    icon: SettingsIcon,
    type: "questions" as const,
    questions: [
      "How do I customize the customer widget?",
      "How do I configure email notifications?",
    ],
  },
  {
    category: "Troubleshooting",
    icon: AlertCircleIcon,
    type: "questions" as const,
    questions: [
      "Why isn't my widget showing on my store?",
      "How do I sync customer data from Shopify?",
    ],
  },
  {
    category: "Contact Us",
    icon: EmailIcon,
    type: "email" as const,
    emailSubject: "Rewards Pro Support Request",
    emailBody: "Hi Rewards Pro Team,\n\nI have a question about:\n\n",
  },
  {
    category: "Report a Bug",
    icon: BugIcon,
    type: "email" as const,
    emailSubject: "Bug Report - Rewards Pro",
    emailBody: "Hi Rewards Pro Team,\n\nI'd like to report a bug:\n\n**Steps to reproduce:**\n1. \n\n**Expected behavior:**\n\n**Actual behavior:**\n\n**Store URL:**\n\n",
  },
];

export function HelpAssistant({
  placeholder = "Type your question...",
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
    setSelectedCategory(null);
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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
          icon={isOpen ? XIcon : ChatIcon}
          onClick={toggleOpen}
          variant={isOpen ? "secondary" : "primary"}
          size="large"
          accessibilityLabel={isOpen ? "Close assistant" : "Open Rewards Pro Assistant"}
        >
          {isOpen ? undefined : "Need help?"}
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
              background: "linear-gradient(135deg, var(--p-color-bg-fill-brand) 0%, var(--p-color-bg-fill-brand-hover) 100%)",
            }}
          >
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 255, 255, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                  }}
                >
                  <Icon source={ChatIcon} />
                </div>
                <BlockStack gap="0">
                  <span style={{ color: "white", fontWeight: 600, fontSize: "14px" }}>
                    Rewards Pro Assistant
                  </span>
                  <span style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: "12px" }}>
                    Powered by GitBook
                  </span>
                </BlockStack>
              </InlineStack>
              <InlineStack gap="100">
                {messages.length > 0 && (
                  <Tooltip content="Start new conversation">
                    <Button
                      variant="monochromePlain"
                      size="slim"
                      icon={DeleteIcon}
                      onClick={clearChat}
                      accessibilityLabel="Clear chat"
                    />
                  </Tooltip>
                )}
                <Tooltip content="Browse documentation">
                  <Button
                    variant="monochromePlain"
                    size="slim"
                    icon={ExternalIcon}
                    onClick={() => window.open(docsUrl, "_blank")}
                    accessibilityLabel="View documentation"
                  />
                </Tooltip>
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
              <Box padding="300">
                <BlockStack gap="400">
                  {/* Welcome Message */}
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: "12px",
                      backgroundColor: "var(--p-color-bg-surface-secondary)",
                    }}
                  >
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Hi there! I'm your Rewards Pro Assistant.
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        I can help you set up your loyalty program, configure rewards, troubleshoot issues, and answer questions about any feature.
                      </Text>
                    </BlockStack>
                  </div>

                  {/* Quick Action Categories */}
                  {!selectedCategory ? (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" fontWeight="medium">
                        What can I help you with?
                      </Text>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "8px",
                        }}
                      >
                        {QUICK_ACTIONS.map((action) => (
                          <button
                            key={action.category}
                            onClick={() => {
                              if (action.type === "email") {
                                const subject = encodeURIComponent(action.emailSubject || "");
                                const body = encodeURIComponent(action.emailBody || "");
                                window.open(`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`, "_blank");

                                // Add a fallback message to the chat in case mailto doesn't work
                                const isContactUs = action.category === "Contact Us";
                                const fallbackMessage: Message = {
                                  id: `assistant-${Date.now()}`,
                                  type: "assistant",
                                  content: isContactUs
                                    ? `📧 **Contact Us**\n\nWe'd love to hear from you! Please send us an email at:\n\n**${CONTACT_EMAIL}**\n\nOur team typically responds within 24 hours.`
                                    : `🐛 **Report a Bug**\n\nThank you for helping us improve! Please send your bug report to:\n\n**${CONTACT_EMAIL}**\n\nInclude steps to reproduce, expected vs actual behavior, and your store URL if possible.`,
                                  timestamp: new Date(),
                                };
                                setMessages((prev) => [...prev, fallbackMessage]);
                              } else {
                                setSelectedCategory(action.category);
                              }
                            }}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "6px",
                              padding: "12px 8px",
                              borderRadius: "8px",
                              border: "1px solid var(--p-color-border)",
                              backgroundColor: action.type === "email"
                                ? "var(--p-color-bg-surface-secondary)"
                                : "var(--p-color-bg-surface)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--p-color-bg-surface-hover)";
                              e.currentTarget.style.borderColor = "var(--p-color-border-hover)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = action.type === "email"
                                ? "var(--p-color-bg-surface-secondary)"
                                : "var(--p-color-bg-surface)";
                              e.currentTarget.style.borderColor = "var(--p-color-border)";
                            }}
                          >
                            <Icon source={action.icon} tone={action.type === "email" ? "interactive" : "base"} />
                            <Text as="span" variant="bodySm" alignment="center">
                              {action.category}
                            </Text>
                          </button>
                        ))}
                      </div>
                    </BlockStack>
                  ) : (
                    /* Questions for Selected Category */
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Button
                          variant="plain"
                          size="slim"
                          onClick={() => setSelectedCategory(null)}
                        >
                          ← Back
                        </Button>
                        <Badge>{selectedCategory}</Badge>
                      </InlineStack>
                      <BlockStack gap="100">
                        {(QUICK_ACTIONS.find((a) => a.category === selectedCategory)?.questions ?? []).map(
                          (q) => (
                            <button
                              key={q}
                              onClick={() => {
                                setSelectedCategory(null);
                                handleSubmit(q);
                              }}
                              style={{
                                textAlign: "left",
                                padding: "10px 12px",
                                borderRadius: "8px",
                                border: "1px solid var(--p-color-border)",
                                backgroundColor: "var(--p-color-bg-surface)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--p-color-bg-surface-hover)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--p-color-bg-surface)";
                              }}
                            >
                              <Text as="span" variant="bodySm">
                                {q}
                              </Text>
                            </button>
                          )
                        )}
                      </BlockStack>
                    </BlockStack>
                  )}

                  {/* Quick tip */}
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      backgroundColor: "var(--p-color-bg-surface-info)",
                    }}
                  >
                    <Text as="p" variant="bodySm" tone="subdued">
                      Tip: You can ask follow-up questions for more details
                    </Text>
                  </div>
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
                        Searching docs and thinking...
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
