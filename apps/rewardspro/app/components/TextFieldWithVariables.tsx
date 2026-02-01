/**
 * TextFieldWithVariables Component
 *
 * A TextField wrapper that includes a popover for inserting personalization variables.
 * Click the {⋯} button to open a menu of available merge tags.
 */

import { useState, useCallback, useRef, useMemo } from "react";
import {
  TextField,
  Popover,
  ActionList,
  Icon,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { CodeIcon } from "@shopify/polaris-icons";
import {
  getVariablesByCategory,
  EMAIL_VARIABLE_CATEGORIES,
  type EmailVariable,
  type EmailVariableCategory,
} from "~/constants/email-variables";

interface TextFieldWithVariablesProps {
  /** Field label */
  label: string;
  /** Current value */
  value: string;
  /** Called when value changes */
  onChange: (value: string) => void;
  /** Number of lines for multiline input */
  multiline?: number;
  /** Placeholder text */
  placeholder?: string;
  /** Help text below field */
  helpText?: string;
  /** Autocomplete setting */
  autoComplete?: string;
  /** Use monospace font */
  monospaced?: boolean;
  /** Disable the field */
  disabled?: boolean;
}

export function TextFieldWithVariables({
  label,
  value,
  onChange,
  multiline,
  placeholder,
  helpText,
  autoComplete = "off",
  monospaced,
  disabled = false,
}: TextFieldWithVariablesProps) {
  const [popoverActive, setPopoverActive] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const cursorPositionRef = useRef<number>(value.length);

  const togglePopover = useCallback(() => {
    // Save cursor position before opening popover
    if (inputRef.current) {
      cursorPositionRef.current = inputRef.current.selectionStart || value.length;
    }
    setPopoverActive((active) => !active);
  }, [value.length]);

  const closePopover = useCallback(() => {
    setPopoverActive(false);
  }, []);

  const insertVariable = useCallback(
    (variable: string) => {
      const pos = cursorPositionRef.current;
      const newValue =
        value.substring(0, pos) + variable + value.substring(pos);
      onChange(newValue);
      closePopover();

      // Update cursor position for next insertion
      cursorPositionRef.current = pos + variable.length;
    },
    [value, onChange, closePopover]
  );

  // Build action list sections from categories
  const variablesByCategory = useMemo(() => getVariablesByCategory(), []);

  const sections = useMemo(() => {
    const categoryOrder: EmailVariableCategory[] = [
      "customer",
      "tier",
      "spending",
      "points",
      "raffle",
      "mystery_box",
      "challenge",
      "store",
    ];

    return categoryOrder
      .filter((category) => variablesByCategory[category]?.length > 0)
      .map((category) => ({
        title: EMAIL_VARIABLE_CATEGORIES[category],
        items: variablesByCategory[category].map((v: EmailVariable) => ({
          content: (
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <Text as="span" variant="bodySm" fontWeight="semibold">
                {v.variable}
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {v.description}
              </Text>
            </InlineStack>
          ),
          onAction: () => insertVariable(v.variable),
        })),
      }));
  }, [variablesByCategory, insertVariable]);

  // Variable button for suffix
  const variableButton = (
    <button
      type="button"
      onClick={togglePopover}
      disabled={disabled}
      style={{
        background: "none",
        border: "none",
        padding: "4px 8px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        color: "#5c6ac4",
      }}
      title="Insert personalization variable"
      aria-label="Insert personalization variable"
    >
      <Icon source={CodeIcon} tone="base" />
    </button>
  );

  return (
    <Popover
      active={popoverActive}
      activator={
        <TextField
          label={label}
          value={value}
          onChange={onChange}
          multiline={multiline}
          placeholder={placeholder}
          helpText={helpText}
          autoComplete={autoComplete}
          monospaced={monospaced}
          disabled={disabled}
          suffix={variableButton}
          onFocus={(e) => {
            // Store reference to input element
            inputRef.current = e.target as HTMLTextAreaElement | HTMLInputElement;
          }}
          onBlur={() => {
            // Save cursor position on blur
            if (inputRef.current) {
              cursorPositionRef.current =
                inputRef.current.selectionStart || value.length;
            }
          }}
        />
      }
      onClose={closePopover}
      preferredAlignment="right"
      preferredPosition="below"
    >
      <div style={{ minWidth: "300px", maxHeight: "400px", overflowY: "auto" }}>
        <ActionList actionRole="menuitem" sections={sections} />
      </div>
    </Popover>
  );
}

export default TextFieldWithVariables;
