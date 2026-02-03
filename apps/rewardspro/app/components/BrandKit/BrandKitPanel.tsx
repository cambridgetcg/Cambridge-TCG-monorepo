/**
 * BrandKitPanel Component
 *
 * Manages email brand kit settings and applies them to templates.
 */

import {
  BlockStack,
  Select,
  Button,
  Text,
  Box,
  InlineStack,
  Divider,
  Banner,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { ColorPickerFieldInline } from "~/components/ColorPickerField";

export interface BrandKit {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  contentBgColor: string;
  textColor: string;
  linkColor: string;
  fontFamily: string;
  logoUrl?: string;
}

interface BrandKitPanelProps {
  brandKit: BrandKit | null;
  currentStyles: {
    primaryColor: string;
    backgroundColor: string;
    textColor: string;
    linkColor: string;
    fontFamily: string;
  };
  onApplyBrandKit: (brandKit: BrandKit) => void;
  onStyleChange: (key: string, value: string) => void;
  brandKitEnabled?: boolean;
}

const FONT_OPTIONS = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
];

export function BrandKitPanel({
  brandKit,
  currentStyles,
  onApplyBrandKit,
  onStyleChange,
  brandKitEnabled = false,
}: BrandKitPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleApplyBrandKit = useCallback(() => {
    if (brandKit) {
      onApplyBrandKit(brandKit);
    }
  }, [brandKit, onApplyBrandKit]);

  return (
    <BlockStack gap="400">
      {/* Brand Kit Section */}
      {brandKitEnabled && brandKit && (
        <>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">Brand Kit</Text>
              <Button size="slim" onClick={handleApplyBrandKit}>
                Apply Brand Kit
              </Button>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Use your saved brand colors and fonts
            </Text>
            {/* Brand Kit Preview */}
            <Box padding="300" background="bg-surface-secondary" borderRadius="150">
              <InlineStack gap="200" blockAlign="center">
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                  }}
                >
                  <ColorSwatch color={brandKit.primaryColor} label="Primary" />
                  <ColorSwatch color={brandKit.secondaryColor} label="Secondary" />
                  <ColorSwatch color={brandKit.backgroundColor} label="Background" />
                  <ColorSwatch color={brandKit.textColor} label="Text" />
                </div>
                <Text as="span" variant="bodySm" tone="subdued">
                  {brandKit.fontFamily?.split(",")[0] || "Arial"}
                </Text>
              </InlineStack>
            </Box>
          </BlockStack>
          <Divider />
        </>
      )}

      {!brandKitEnabled && (
        <Banner tone="info">
          <p>
            Enable Brand Kit in Marketing Settings to save and reuse your brand
            colors across all templates.
          </p>
        </Banner>
      )}

      {/* Manual Style Settings */}
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Design Settings</Text>

        <ColorPickerFieldInline
          label="Background Color"
          color={currentStyles.backgroundColor}
          onChange={(v) => onStyleChange("backgroundColor", v)}
        />

        <ColorPickerFieldInline
          label="Button/Accent Color"
          color={currentStyles.primaryColor}
          onChange={(v) => onStyleChange("primaryColor", v)}
        />

        <ColorPickerFieldInline
          label="Text Color"
          color={currentStyles.textColor}
          onChange={(v) => onStyleChange("textColor", v)}
        />

        <Select
          label="Font Family"
          options={FONT_OPTIONS}
          value={currentStyles.fontFamily}
          onChange={(v) => onStyleChange("fontFamily", v)}
        />

        <Button
          variant="plain"
          onClick={() => setShowAdvanced(!showAdvanced)}
          size="slim"
        >
          {showAdvanced ? "Hide advanced" : "Show advanced"}
        </Button>

        {showAdvanced && (
          <BlockStack gap="200">
            <ColorPickerFieldInline
              label="Link Color"
              color={currentStyles.linkColor}
              onChange={(v) => onStyleChange("linkColor", v)}
            />
          </BlockStack>
        )}
      </BlockStack>

      {/* Color Preview */}
      <Box padding="300" background="bg-surface-secondary" borderRadius="150">
        <BlockStack gap="200">
          <Text as="span" variant="bodySm" fontWeight="medium">Preview</Text>
          <div
            style={{
              backgroundColor: currentStyles.backgroundColor,
              padding: "12px",
              borderRadius: "4px",
            }}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                padding: "12px",
                borderRadius: "4px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: currentStyles.textColor,
                  fontFamily: currentStyles.fontFamily,
                  fontSize: "14px",
                }}
              >
                Sample text content
              </p>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                style={{
                  color: currentStyles.linkColor,
                  fontSize: "14px",
                }}
              >
                Sample link
              </a>
              <div style={{ marginTop: "8px" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "6px 12px",
                    backgroundColor: currentStyles.primaryColor,
                    color: "#fff",
                    borderRadius: "4px",
                    fontSize: "12px",
                  }}
                >
                  Button
                </span>
              </div>
            </div>
          </div>
        </BlockStack>
      </Box>
    </BlockStack>
  );
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div
      title={`${label}: ${color}`}
      style={{
        width: 20,
        height: 20,
        borderRadius: 4,
        backgroundColor: color,
        border: "1px solid rgba(0,0,0,0.1)",
      }}
    />
  );
}

export default BrandKitPanel;
