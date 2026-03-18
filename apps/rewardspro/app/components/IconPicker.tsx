/**
 * IconPicker Component
 *
 * A clean icon selection component for points currency branding.
 * DESIGN GUIDELINE: Minimalistic solid LINE icons only.
 *
 * Supports two modes:
 * - Upload: Custom image upload (SVG/PNG)
 * - Library: Vector icons with color customization
 *
 * Note: Emoji mode has been deprecated in favor of clean vector icons.
 */

import { useState, useCallback } from "react";
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Tabs,
  TextField,
  DropZone,
  Thumbnail,
  Banner,
  Box,
  Divider,
  Badge,
  Popover,
} from "@shopify/polaris";
import {
  VECTOR_ICON_CATEGORIES,
  POPULAR_VECTOR_ICONS,
  COLOR_PRESETS,
  getVectorIcon,
  isValidHexColor,
  DEFAULT_ICON_CONFIG,
} from "../utils/points-icon-library";
import type { CurrencyIconType } from "../services/points-config.server";

// ============================================
// TYPES
// ============================================

export interface IconPickerValue {
  iconType: CurrencyIconType;
  iconEmoji: string; // Deprecated, kept for backwards compatibility
  iconUrl: string | null;
  iconId: string | null;
  iconColor: string | null;
}

export interface IconPickerProps {
  value: IconPickerValue;
  onChange: (value: IconPickerValue) => void;
  onUpload?: (file: File) => Promise<string | null>;
  uploadError?: string | null;
  disabled?: boolean;
}

// ============================================
// SUB-COMPONENTS
// ============================================

/**
 * Live preview of the selected icon
 */
function IconPreview({ value }: { value: IconPickerValue }) {
  const size = 64;

  const renderIcon = () => {
    // Handle upload type
    if (value.iconType === "upload" && value.iconUrl) {
      return (
        <img
          src={value.iconUrl}
          alt="Custom icon"
          style={{
            width: size,
            height: size,
            objectFit: "contain",
          }}
        />
      );
    }

    // Default to library icon
    const iconId = value.iconId || DEFAULT_ICON_CONFIG.iconId;
    const icon = getVectorIcon(iconId);
    const color = value.iconColor || DEFAULT_ICON_CONFIG.iconColor;

    if (icon) {
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={icon.path} />
        </svg>
      );
    }

    // Ultimate fallback - star icon
    const starIcon = getVectorIcon("star")!;
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={starIcon.path} />
      </svg>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size + 24,
        height: size + 24,
        borderRadius: 12,
        backgroundColor: "var(--p-color-bg-surface-secondary)",
        border: "2px solid var(--p-color-border)",
      }}
    >
      {renderIcon()}
    </div>
  );
}

/**
 * Quick select grid with popular icons
 */
function QuickSelectTab({
  value,
  onChange,
}: {
  value: IconPickerValue;
  onChange: (value: IconPickerValue) => void;
}) {
  const currentColor = value.iconColor || DEFAULT_ICON_CONFIG.iconColor;

  return (
    <BlockStack gap="400">
      <Text variant="headingMd" as="h2">
        Popular Icons
      </Text>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
          gap: 10,
        }}
      >
        {POPULAR_VECTOR_ICONS.map((iconId) => {
          const icon = getVectorIcon(iconId);
          if (!icon) return null;
          const isSelected =
            value.iconType === "library" && value.iconId === iconId;
          const displayColor = isSelected ? currentColor : "var(--p-color-icon)";

          return (
            <button
              key={iconId}
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  iconType: "library",
                  iconId: iconId,
                  iconColor: currentColor,
                })
              }
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: 8,
                border: isSelected
                  ? "2px solid var(--p-color-border-interactive)"
                  : "1px solid var(--p-color-border)",
                borderRadius: 8,
                backgroundColor: isSelected
                  ? "var(--p-color-bg-surface-selected)"
                  : "var(--p-color-bg-surface)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <svg
                width={28}
                height={28}
                viewBox="0 0 24 24"
                fill="none"
                stroke={displayColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={icon.path} />
              </svg>
              <Text variant="bodySm" as="span" tone={isSelected ? undefined : "subdued"}>
                {icon.name}
              </Text>
            </button>
          );
        })}
      </div>
    </BlockStack>
  );
}

/**
 * Custom upload tab
 */
function UploadTab({
  value,
  onChange,
  onUpload,
  uploadError,
}: {
  value: IconPickerValue;
  onChange: (value: IconPickerValue) => void;
  onUpload?: (file: File) => Promise<string | null>;
  uploadError?: string | null;
}) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      // Validate file type
      const validTypes = ["image/svg+xml", "image/png", "image/jpeg", "image/gif", "image/webp"];
      if (!validTypes.includes(file.type)) {
        setLocalError("Please upload an SVG, PNG, JPEG, GIF, or WebP file");
        return;
      }

      // Validate file size (max 1MB)
      if (file.size > 1024 * 1024) {
        setLocalError("File size must be less than 1MB");
        return;
      }

      setLocalError(null);

      if (onUpload) {
        setUploading(true);
        try {
          const url = await onUpload(file);
          if (url) {
            onChange({ ...value, iconType: "upload", iconUrl: url });
          }
        } catch (err) {
          setLocalError("Failed to upload file");
        } finally {
          setUploading(false);
        }
      } else {
        // For preview without server upload, use local data URL
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          onChange({ ...value, iconType: "upload", iconUrl: dataUrl });
        };
        reader.readAsDataURL(file);
      }
    },
    [onUpload, onChange, value]
  );

  const error = localError || uploadError;

  return (
    <BlockStack gap="400">
      {error && (
        <Banner tone="critical" onDismiss={() => setLocalError(null)}>
          {error}
        </Banner>
      )}

      <DropZone
        accept="image/*"
        type="image"
        onDrop={(files) => handleDrop(files)}
        allowMultiple={false}
      >
        {uploading ? (
          <DropZone.FileUpload actionHint="Uploading..." />
        ) : value.iconType === "upload" && value.iconUrl ? (
          <BlockStack gap="200" inlineAlign="center">
            <Thumbnail source={value.iconUrl} alt="Uploaded icon" size="large" />
            <Text variant="bodySm" as="span" tone="subdued">
              Drop a new file to replace
            </Text>
          </BlockStack>
        ) : (
          <DropZone.FileUpload actionHint="or drop files to upload" />
        )}
      </DropZone>

      <BlockStack gap="200">
        <Text variant="headingSm" as="h3">
          Requirements
        </Text>
        <Text variant="bodySm" as="span" tone="subdued">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>SVG, PNG, JPEG, GIF, or WebP format</li>
            <li>Maximum file size: 1MB</li>
            <li>Recommended: Square image (1:1 ratio)</li>
            <li>Transparent background works best</li>
          </ul>
        </Text>
      </BlockStack>

      {value.iconType === "upload" && value.iconUrl && (
        <Button
          variant="plain"
          tone="critical"
          onClick={() =>
            onChange({
              ...value,
              iconType: "library",
              iconUrl: null,
              iconId: DEFAULT_ICON_CONFIG.iconId,
              iconColor: DEFAULT_ICON_CONFIG.iconColor,
            })
          }
        >
          Remove custom icon
        </Button>
      )}
    </BlockStack>
  );
}

/**
 * Icon library tab with color customization
 */
function IconLibraryTab({
  value,
  onChange,
}: {
  value: IconPickerValue;
  onChange: (value: IconPickerValue) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [customColor, setCustomColor] = useState(value.iconColor || DEFAULT_ICON_CONFIG.iconColor);
  const [colorPopoverActive, setColorPopoverActive] = useState(false);

  const handleColorChange = (color: string) => {
    setCustomColor(color);
    if (value.iconType === "library") {
      onChange({ ...value, iconColor: color });
    }
  };

  const handleIconSelect = (iconId: string) => {
    onChange({
      ...value,
      iconType: "library",
      iconId: iconId,
      iconColor: customColor,
    });
  };

  const currentColor = value.iconType === "library" ? value.iconColor || DEFAULT_ICON_CONFIG.iconColor : customColor;

  return (
    <BlockStack gap="400">
      {/* Color picker */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingSm" as="h3">
            Icon Color
          </Text>
          <InlineStack gap="200" align="start" blockAlign="center">
            {/* Color presets */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {COLOR_PRESETS.slice(0, 12).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleColorChange(preset.color)}
                  title={preset.name}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    backgroundColor: preset.color,
                    border:
                      currentColor === preset.color
                        ? "3px solid var(--p-color-border-interactive)"
                        : "2px solid transparent",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                />
              ))}
            </div>

            {/* Custom color input */}
            <div style={{ position: "relative" }}>
              <Popover
                active={colorPopoverActive}
                activator={
                  <Button
                    onClick={() => setColorPopoverActive(!colorPopoverActive)}
                    disclosure={colorPopoverActive ? "up" : "down"}
                  >
                    <InlineStack gap="200" blockAlign="center">
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          backgroundColor: currentColor,
                          border: "1px solid var(--p-color-border)",
                        }}
                      />
                      Custom
                    </InlineStack>
                  </Button>
                }
                onClose={() => setColorPopoverActive(false)}
              >
                <div style={{ padding: 16, width: 200 }}>
                  <BlockStack gap="300">
                    <TextField
                      label="Hex color"
                      value={customColor}
                      onChange={(val) => {
                        setCustomColor(val);
                        if (isValidHexColor(val)) {
                          handleColorChange(val);
                        }
                      }}
                      placeholder="#5C6AC4"
                      autoComplete="off"
                      error={
                        customColor && !isValidHexColor(customColor)
                          ? "Invalid hex color"
                          : undefined
                      }
                    />
                    <input
                      type="color"
                      value={currentColor}
                      onChange={(e) => handleColorChange(e.target.value)}
                      style={{
                        width: "100%",
                        height: 40,
                        padding: 0,
                        border: "none",
                        cursor: "pointer",
                      }}
                    />
                  </BlockStack>
                </div>
              </Popover>
            </div>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* Category tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {VECTOR_ICON_CATEGORIES.map((category, idx) => (
          <Button
            key={category.name}
            variant={selectedCategory === idx ? "primary" : "secondary"}
            size="slim"
            onClick={() => setSelectedCategory(idx)}
          >
            {category.name}
          </Button>
        ))}
      </div>

      {/* Selected category icons */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingSm" as="h3">
            {VECTOR_ICON_CATEGORIES[selectedCategory].description}
          </Text>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
              gap: 12,
            }}
          >
            {VECTOR_ICON_CATEGORIES[selectedCategory].icons.map((icon) => {
              const isSelected =
                value.iconType === "library" && value.iconId === icon.id;
              const displayColor = isSelected ? currentColor : "var(--p-color-icon)";

              return (
                <button
                  key={icon.id}
                  type="button"
                  onClick={() => handleIconSelect(icon.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: 10,
                    border: isSelected
                      ? "2px solid var(--p-color-border-interactive)"
                      : "1px solid var(--p-color-border)",
                    borderRadius: 8,
                    backgroundColor: isSelected
                      ? "var(--p-color-bg-surface-selected)"
                      : "var(--p-color-bg-surface)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <svg
                    width={32}
                    height={32}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={displayColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={icon.path} />
                  </svg>
                  <Text variant="bodySm" as="span" tone={isSelected ? undefined : "subdued"}>
                    {icon.name}
                  </Text>
                </button>
              );
            })}
          </div>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function IconPicker({
  value,
  onChange,
  onUpload,
  uploadError,
  disabled = false,
}: IconPickerProps) {
  const [selectedTab, setSelectedTab] = useState(0);

  const tabs = [
    {
      id: "quick",
      content: "Quick Select",
      accessibilityLabel: "Quick icon selection",
      panelID: "quick-panel",
    },
    {
      id: "library",
      content: "Icon Library",
      accessibilityLabel: "Vector icon library",
      panelID: "library-panel",
    },
    {
      id: "upload",
      content: "Upload",
      accessibilityLabel: "Upload custom icon",
      panelID: "upload-panel",
    },
  ];

  const renderTabContent = () => {
    switch (selectedTab) {
      case 0:
        return <QuickSelectTab value={value} onChange={onChange} />;
      case 1:
        return <IconLibraryTab value={value} onChange={onChange} />;
      case 2:
        return (
          <UploadTab
            value={value}
            onChange={onChange}
            onUpload={onUpload}
            uploadError={uploadError}
          />
        );
      default:
        return null;
    }
  };

  const getTypeLabel = () => {
    switch (value.iconType) {
      case "upload":
        return "Custom Upload";
      case "library":
      default:
        return "Icon Library";
    }
  };

  return (
    <Card>
      <BlockStack gap="400">
        {/* Header with preview */}
        <InlineStack gap="400" align="space-between" blockAlign="start">
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">
              Points Currency Icon
            </Text>
            <InlineStack gap="200">
              <Badge tone="info">{getTypeLabel()}</Badge>
              {value.iconType === "library" && value.iconColor && (
                <Badge>
                  <InlineStack gap="100" blockAlign="center">
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: value.iconColor,
                      }}
                    />
                    {value.iconColor}
                  </InlineStack>
                </Badge>
              )}
            </InlineStack>
          </BlockStack>
          <IconPreview value={value} />
        </InlineStack>

        <Divider />

        {/* Tabs */}
        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} fitted>
          <Box paddingBlockStart="400">{renderTabContent()}</Box>
        </Tabs>
      </BlockStack>
    </Card>
  );
}

export default IconPicker;
