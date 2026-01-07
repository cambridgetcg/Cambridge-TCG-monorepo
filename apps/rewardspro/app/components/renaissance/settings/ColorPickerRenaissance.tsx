/**
 * Color Picker - Renaissance Edition
 *
 * Enhanced color picker with preset swatches based on Vermeer's palette.
 */

import React, { useState, useCallback } from 'react';

export interface ColorPickerProps {
  /** Current color value */
  value: string;
  /** Change handler */
  onChange: (color: string) => void;
  /** Label */
  label?: string;
  /** Show preset swatches */
  showPresets?: boolean;
  /** Allow custom colors */
  allowCustom?: boolean;
  /** Additional CSS class */
  className?: string;
}

// Vermeer-inspired color presets
const PRESET_COLORS = {
  'Merchant Blue': [
    { name: 'Deep Navy', value: '#1a365d' },
    { name: 'Velvet Navy', value: '#2c5282' },
    { name: 'Ocean', value: '#3182ce' },
    { name: 'Sky', value: '#63b3ed' },
  ],
  'Ducal Gold': [
    { name: 'Amber', value: '#d69e2e' },
    { name: 'Gold', value: '#ecc94b' },
    { name: 'Honey', value: '#f6e05e' },
    { name: 'Butter', value: '#faf089' },
  ],
  'Natural': [
    { name: 'Cream', value: '#fefcf8' },
    { name: 'Parchment', value: '#fffaf0' },
    { name: 'Ivory', value: '#f7fafc' },
    { name: 'Pearl', value: '#edf2f7' },
  ],
  'Accents': [
    { name: 'Success', value: '#276749' },
    { name: 'Warning', value: '#ed8936' },
    { name: 'Error', value: '#c53030' },
    { name: 'Grape', value: '#9f7aea' },
  ],
};

export function ColorPickerRenaissance({
  value,
  onChange,
  label,
  showPresets = true,
  allowCustom = true,
  className = '',
}: ColorPickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [customColor, setCustomColor] = useState(value);

  const handlePresetClick = useCallback((color: string) => {
    onChange(color);
    setCustomColor(color);
  }, [onChange]);

  const handleCustomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setCustomColor(color);
    onChange(color);
  }, [onChange]);

  return (
    <div className={`color-picker-renaissance ${className}`}>
      {/* Current color display */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm, 8px)',
          padding: 'var(--space-sm, 8px) var(--space-md, 13px)',
          background: 'var(--color-cream, #fefcf8)',
          border: '1px solid rgba(45, 55, 72, 0.15)',
          borderRadius: 'var(--radius-md, 6px)',
          cursor: 'pointer',
          transition: 'border-color 150ms ease-out',
        }}
      >
        {/* Color swatch */}
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: 'var(--radius-sm, 4px)',
            background: value,
            border: '1px solid rgba(0, 0, 0, 0.1)',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.1)',
          }}
        />

        {/* Label and value */}
        <div style={{ flex: 1 }}>
          {label && (
            <div style={{
              fontSize: 'var(--text-xs, 11px)',
              color: 'var(--color-velvet-navy, #2c5282)',
              opacity: 0.7,
            }}>
              {label}
            </div>
          )}
          <div style={{
            fontSize: 'var(--text-sm, 13px)',
            fontWeight: 500,
            color: 'var(--color-merchant-blue, #1a365d)',
            fontFamily: 'monospace',
          }}>
            {value}
          </div>
        </div>

        {/* Expand indicator */}
        <span style={{
          fontSize: '12px',
          color: 'var(--color-velvet-navy, #2c5282)',
          opacity: 0.5,
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 200ms ease-out',
        }}>
          ▼
        </span>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div
          style={{
            marginTop: 'var(--space-sm, 8px)',
            padding: 'var(--space-md, 13px)',
            background: 'white',
            border: '1px solid rgba(45, 55, 72, 0.1)',
            borderRadius: 'var(--radius-md, 6px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          }}
        >
          {/* Presets */}
          {showPresets && (
            <div style={{ marginBottom: 'var(--space-md, 13px)' }}>
              {Object.entries(PRESET_COLORS).map(([category, colors]) => (
                <div key={category} style={{ marginBottom: 'var(--space-sm, 8px)' }}>
                  <div style={{
                    fontSize: 'var(--text-xs, 11px)',
                    color: 'var(--color-velvet-navy, #2c5282)',
                    opacity: 0.6,
                    marginBottom: 'var(--space-xs, 5px)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    {category}
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: 'var(--space-xs, 5px)',
                  }}>
                    {colors.map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => handlePresetClick(preset.value)}
                        title={preset.name}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-sm, 4px)',
                          background: preset.value,
                          border: value === preset.value
                            ? '2px solid var(--color-ducal-gold, #d69e2e)'
                            : '1px solid rgba(0, 0, 0, 0.1)',
                          cursor: 'pointer',
                          transition: 'transform 150ms ease-out',
                          boxShadow: value === preset.value
                            ? '0 0 0 2px rgba(214, 158, 46, 0.2)'
                            : 'none',
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Custom color input */}
          {allowCustom && (
            <>
              <div style={{
                height: '1px',
                background: 'rgba(45, 55, 72, 0.08)',
                margin: 'var(--space-md, 13px) 0',
              }} />

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm, 8px)',
              }}>
                {/* Native color picker */}
                <input
                  type="color"
                  value={customColor}
                  onChange={handleCustomChange}
                  style={{
                    width: '40px',
                    height: '40px',
                    padding: 0,
                    border: '1px solid rgba(45, 55, 72, 0.15)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    cursor: 'pointer',
                  }}
                />

                {/* Hex input */}
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomColor(val);
                    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                      onChange(val);
                    }
                  }}
                  placeholder="#000000"
                  style={{
                    flex: 1,
                    padding: 'var(--space-sm, 8px)',
                    border: '1px solid rgba(45, 55, 72, 0.15)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    fontSize: 'var(--text-sm, 13px)',
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        .color-picker-renaissance input[type="color"]::-webkit-color-swatch-wrapper {
          padding: 0;
        }
        .color-picker-renaissance input[type="color"]::-webkit-color-swatch {
          border: none;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}

/**
 * Simple color swatch for display only
 */
export function ColorSwatch({
  color,
  size = 'md',
  label,
}: {
  color: string;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const sizeMap = { sm: '20px', md: '28px', lg: '40px' };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs, 5px)' }}>
      <div
        style={{
          width: sizeMap[size],
          height: sizeMap[size],
          borderRadius: 'var(--radius-sm, 4px)',
          background: color,
          border: '1px solid rgba(0, 0, 0, 0.1)',
          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.1)',
        }}
      />
      {label && (
        <span style={{
          fontSize: 'var(--text-xs, 11px)',
          color: 'var(--color-merchant-blue, #1a365d)',
        }}>
          {label}
        </span>
      )}
    </div>
  );
}
