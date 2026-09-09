/**
 * Input / Select / Textarea — form controls in the quiet gallery voice.
 *
 * Standard styling: bg-surface, hairline border, accent focus ring
 * (docs/plans/the-quiet-gallery.md). These wrap raw HTML elements without
 * intercepting events — pages keep their own state management, controlled
 * or uncontrolled.
 */

import * as React from "react";

type ControlDensity = "default" | "comfortable";

function controlCls(density: ControlDensity = "default") {
  const spacing = density === "comfortable" ? "min-h-11 px-3 py-2" : "px-3 py-2";
  const textSize = density === "comfortable" ? "text-base" : "text-sm";
  return `w-full ${spacing} bg-surface border border-border-subtle rounded-lg ${textSize} text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 disabled:opacity-50`;
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Opt in to a 44px minimum height and 16px text for search forms. */
  density?: ControlDensity;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  density?: ControlDensity;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className = "", density, ...rest }, ref) {
    return <input ref={ref} className={`${controlCls(density)} ${className}`.trim()} {...rest} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className = "", density, children, ...rest }, ref) {
    return (
      <select ref={ref} className={`${controlCls(density)} ${className}`.trim()} {...rest}>
        {children}
      </select>
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...rest }, ref) {
    return <textarea ref={ref} className={`${controlCls()} resize-y ${className}`.trim()} {...rest} />;
  },
);

interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Field — label + control + optional hint/error wrapper.
 * Use for any form input where the label-input-hint stack is needed.
 */
export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-muted uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}
