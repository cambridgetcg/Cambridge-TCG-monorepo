/**
 * ColorPickerField Component
 *
 * A reusable color picker that combines Polaris ColorPicker with a TextField.
 * Displays a clickable color swatch that opens a popover with the color picker.
 */

import { useState, useCallback, useEffect } from "react";
import {
  Popover,
  ColorPicker,
  TextField,
  BlockStack,
  InlineStack,
  Box,
  Text,
} from "@shopify/polaris";
import {
  hexToHsb,
  hsbToHex,
  isValidHex,
  normalizeHex,
  type HSBColor,
} from "~/utils/color-utils";

interface ColorPickerFieldProps {
  /** Label for the field */
  label: string;
  /** Current color value in hex format (e.g., "#5C6AC4") */
  color: string;
  /** Callback when color changes */
  onChange: (color: string) => void;
  /** Optional help text */
  helpText?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
}

export function ColorPickerField({
  label,
  color,
  onChange,
  helpText,
  disabled = false,
}: ColorPickerFieldProps) {
  const [popoverActive, setPopoverActive] = useState(false);
  const [inputValue, setInputValue] = useState(color);
  const [hsbColor, setHsbColor] = useState<HSBColor>(() => {
    const hsb = hexToHsb(color);
    return hsb || { hue: 0, saturation: 0, brightness: 1 };
  });

  // Sync input value when color prop changes externally
  useEffect(() => {
    setInputValue(color);
    const hsb = hexToHsb(color);
    if (hsb) {
      setHsbColor(hsb);
    }
  }, [color]);

  const togglePopover = useCallback(() => {
    if (!disabled) {
      setPopoverActive((active) => !active);
    }
  }, [disabled]);

  const closePopover = useCallback(() => {
    setPopoverActive(false);
  }, []);

  // Handle color picker change (HSB format)
  const handleColorPickerChange = useCallback(
    (newHsbColor: HSBColor) => {
      setHsbColor(newHsbColor);
      const hex = hsbToHex(newHsbColor);
      setInputValue(hex);
      onChange(hex);
    },
    [onChange]
  );

  // Handle text input change
  const handleInputChange = useCallback(
    (value: string) => {
      // Allow typing without immediate validation
      setInputValue(value);

      // Normalize and validate
      const normalizedValue = value.startsWith("#") ? value : `#${value}`;

      if (isValidHex(normalizedValue)) {
        const normalized = normalizeHex(normalizedValue);
        const hsb = hexToHsb(normalized);
        if (hsb) {
          setHsbColor(hsb);
          onChange(normalized);
        }
      }
    },
    [onChange]
  );

  // Handle input blur - normalize the value
  const handleInputBlur = useCallback(() => {
    if (isValidHex(inputValue)) {
      const normalized = normalizeHex(inputValue);
      setInputValue(normalized);
      onChange(normalized);
    } else {
      // Reset to current valid color
      setInputValue(color);
    }
  }, [inputValue, color, onChange]);

  // Color swatch as activator
  const activator = (
    <button
      type="button"
      onClick={togglePopover}
      disabled={disabled}
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "6px",
        backgroundColor: color,
        border: "1px solid rgba(0, 0, 0, 0.1)",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.1)",
        transition: "box-shadow 0.2s ease",
        opacity: disabled ? 0.5 : 1,
      }}
      aria-label={`Select ${label} color`}
    />
  );

  return (
    <BlockStack gap="100">
      <Text as="span" variant="bodyMd" fontWeight="medium">
        {label}
      </Text>
      <InlineStack gap="200" align="start" blockAlign="center">
        <Popover
          active={popoverActive}
          activator={activator}
          onClose={closePopover}
          preferredAlignment="left"
          preferredPosition="below"
        >
          <Box padding="300">
            <BlockStack gap="300">
              <ColorPicker onChange={handleColorPickerChange} color={hsbColor} />
              <InlineStack gap="200" align="start" blockAlign="center">
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "4px",
                    backgroundColor: color,
                    border: "1px solid rgba(0, 0, 0, 0.1)",
                    flexShrink: 0,
                  }}
                />
                <Text as="span" variant="bodySm" tone="subdued">
                  {color}
                </Text>
              </InlineStack>
            </BlockStack>
          </Box>
        </Popover>
        <div style={{ flex: 1, maxWidth: "120px" }}>
          <TextField
            label={`${label} hex color`}
            labelHidden
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            autoComplete="off"
            disabled={disabled}
            placeholder="#000000"
            error={!isValidHex(inputValue) && inputValue !== color}
          />
        </div>
      </InlineStack>
      {helpText && (
        <Text as="span" variant="bodySm" tone="subdued">
          {helpText}
        </Text>
      )}
    </BlockStack>
  );
}

/**
 * Inline version of ColorPickerField for use in form groups
 * Uses FormLayout-compatible structure
 */
export function ColorPickerFieldInline({
  label,
  color,
  onChange,
  disabled = false,
}: Omit<ColorPickerFieldProps, "helpText">) {
  const [popoverActive, setPopoverActive] = useState(false);
  const [inputValue, setInputValue] = useState(color);
  const [hsbColor, setHsbColor] = useState<HSBColor>(() => {
    const hsb = hexToHsb(color);
    return hsb || { hue: 0, saturation: 0, brightness: 1 };
  });

  useEffect(() => {
    setInputValue(color);
    const hsb = hexToHsb(color);
    if (hsb) {
      setHsbColor(hsb);
    }
  }, [color]);

  const togglePopover = useCallback(() => {
    if (!disabled) {
      setPopoverActive((active) => !active);
    }
  }, [disabled]);

  const closePopover = useCallback(() => {
    setPopoverActive(false);
  }, []);

  const handleColorPickerChange = useCallback(
    (newHsbColor: HSBColor) => {
      setHsbColor(newHsbColor);
      const hex = hsbToHex(newHsbColor);
      setInputValue(hex);
      onChange(hex);
    },
    [onChange]
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      const normalizedValue = value.startsWith("#") ? value : `#${value}`;
      if (isValidHex(normalizedValue)) {
        const normalized = normalizeHex(normalizedValue);
        const hsb = hexToHsb(normalized);
        if (hsb) {
          setHsbColor(hsb);
          onChange(normalized);
        }
      }
    },
    [onChange]
  );

  const handleInputBlur = useCallback(() => {
    if (isValidHex(inputValue)) {
      const normalized = normalizeHex(inputValue);
      setInputValue(normalized);
      onChange(normalized);
    } else {
      setInputValue(color);
    }
  }, [inputValue, color, onChange]);

  const swatchButton = (
    <button
      type="button"
      onClick={togglePopover}
      disabled={disabled}
      style={{
        width: "24px",
        height: "24px",
        borderRadius: "4px",
        backgroundColor: color,
        border: "1px solid #DFE3E8",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
        opacity: disabled ? 0.5 : 1,
      }}
      aria-label={`Select ${label} color`}
    />
  );

  return (
    <Popover
      active={popoverActive}
      activator={
        <TextField
          label={label}
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          autoComplete="off"
          disabled={disabled}
          prefix={swatchButton}
          error={!isValidHex(inputValue) && inputValue !== color ? "Invalid color" : undefined}
        />
      }
      onClose={closePopover}
      preferredAlignment="left"
      preferredPosition="below"
    >
      <Box padding="300">
        <BlockStack gap="300">
          <ColorPicker onChange={handleColorPickerChange} color={hsbColor} />
          <InlineStack gap="200" align="start" blockAlign="center">
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "4px",
                backgroundColor: color,
                border: "1px solid rgba(0, 0, 0, 0.1)",
                flexShrink: 0,
              }}
            />
            <Text as="span" variant="bodySm" tone="subdued">
              {color}
            </Text>
          </InlineStack>
        </BlockStack>
      </Box>
    </Popover>
  );
}

export default ColorPickerField;
