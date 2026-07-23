import React, { useState, useCallback } from "react";
import {
  Card,
  Box,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Icon,
  Badge,
} from "@shopify/polaris";
import {
  StarIcon,
  StarFilledIcon,
  ExternalIcon,
} from "@shopify/polaris-icons";

interface FeedbackSectionProps {
  onFeedbackSubmit?: (rating: number) => void;
}

export function FeedbackSection({ onFeedbackSubmit }: FeedbackSectionProps) {
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const handleRatingClick = useCallback((rating: number) => {
    setSelectedRating(rating);
    setFeedbackSubmitted(true);
    onFeedbackSubmit?.(rating);
    
    // Reset after 3 seconds
    setTimeout(() => {
      setFeedbackSubmitted(false);
      setSelectedRating(0);
    }, 3000);
  }, [onFeedbackSubmit]);

  return (
    <BlockStack gap="400">
      {/* Have a question or comment? header */}
      <Text variant="headingLg" as="h2">
        Have a question or comment?
      </Text>

      <BlockStack gap="400">
        {/* Help Center Card */}
        <Card>
          <Box padding="600">
            <InlineStack gap="600" align="start" blockAlign="center">
              <Box minWidth="200px">
                <BlockStack gap="400" align="center">
                  {/* Illustration SVG */}
                  <svg
                    width="120"
                    height="120"
                    viewBox="0 0 120 120"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Simple illustration of person with laptop and question mark */}
                    <rect x="30" y="70" width="60" height="40" rx="4" fill="#E3E5F0" />
                    <rect x="35" y="75" width="50" height="30" rx="2" fill="#FFFFFF" />
                    <circle cx="60" cy="40" r="15" fill="#FFE4B5" />
                    <rect x="45" y="55" width="30" height="20" rx="4" fill="#6C47FF" />
                    <rect x="50" y="105" width="20" height="5" fill="#C1C4D6" />
                    
                    {/* Question mark bubble */}
                    <rect x="85" y="20" width="30" height="30" rx="15" fill="#F0F1F3" stroke="#6C47FF" strokeWidth="2" />
                    <text x="100" y="40" fontSize="16" fontWeight="bold" textAnchor="middle" fill="#6C47FF">?</text>
                    
                    {/* Exclamation mark bubble */}
                    <rect x="75" y="55" width="25" height="25" rx="12" fill="#F0F1F3" stroke="#00AA5B" strokeWidth="2" />
                    <text x="87.5" y="72" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#00AA5B">!</text>
                  </svg>
                </BlockStack>
              </Box>

              <BlockStack gap="400" align="start">
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h3">
                    Have a question? Check out our Help Center!
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Our help center has everything you need to get the most out of your RewardsPro program.
                  </Text>
                </BlockStack>
                
                <Button
                  url="https://help.rewardspro.com"
                  external
                  icon={ExternalIcon}
                >
                  Visit the Help Center
                </Button>
              </BlockStack>
            </InlineStack>
          </Box>
        </Card>

        {/* Feedback Rating Card */}
        <Card>
          <Box padding="400">
            <InlineStack gap="400" align="space-between" wrap={false}>
              <InlineStack gap="300" align="center">
                <Text variant="headingMd" as="h3">
                  How are we doing?
                </Text>
                
                {/* Star Rating */}
                <InlineStack gap="100">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => handleRatingClick(rating)}
                      onMouseEnter={() => setHoveredRating(rating)}
                      onMouseLeave={() => setHoveredRating(0)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "transform 0.15s ease",
                        transform: hoveredRating === rating ? "scale(1.2)" : "scale(1)",
                      }}
                      aria-label={`Rate ${rating} star${rating > 1 ? 's' : ''}`}
                    >
                      <Icon
                        source={
                          rating <= (hoveredRating || selectedRating)
                            ? StarFilledIcon
                            : StarIcon
                        }
                        tone={
                          rating <= (hoveredRating || selectedRating)
                            ? "warning"
                            : "subdued"
                        }
                      />
                    </button>
                  ))}
                </InlineStack>

                {feedbackSubmitted ? (
                  <Badge tone="success">Thanks for your feedback!</Badge>
                ) : (
                  <InlineStack gap="200" align="center">
                    <span style={{ fontSize: "20px" }}>😊</span>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Leave us your feedback!
                    </Text>
                  </InlineStack>
                )}
              </InlineStack>
            </InlineStack>
          </Box>
        </Card>
      </BlockStack>
    </BlockStack>
  );
}
