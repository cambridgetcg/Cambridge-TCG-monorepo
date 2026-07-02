/**
 * Input / Select / Textarea — form controls with the storefront's dark theme.
 *
 * Standard styling: bg-surface, border-border-subtle, focus ring amber.
 * These wrap raw HTML elements without intercepting events — pages keep
 * their own state management, controlled or uncontrolled.
 */

import * as React from "react";

const baseCls =
  "w-full px-3 py-2 bg-surface border border-border-subtle rounded-lg text-sm text-ink placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/40 disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`${baseCls} ${className}`.trim()} {...rest} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...rest }, ref) {
    return (
      <select ref={ref} className={`${baseCls} ${className}`.trim()} {...rest}>
        {children}
      </select>
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...rest }, ref) {
    return <textarea ref={ref} className={`${baseCls} resize-y ${className}`.trim()} {...rest} />;
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
