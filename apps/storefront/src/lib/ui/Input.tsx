/**
 * Input / Select / Textarea — readable, theme-aware native controls.
 *
 * Visible borders, 16px text, a 44px minimum target and an accent focus ring.
 * These wrap raw HTML elements without
 * intercepting events — pages keep their own state management, controlled
 * or uncontrolled.
 */

import * as React from "react";

type ControlDensity = "default" | "comfortable";

function controlCls(density: ControlDensity = "default") {
  const spacing = density === "comfortable" ? "min-h-12 px-3 py-3" : "min-h-11 px-3 py-2";
  return `w-full ${spacing} bg-surface border border-border-strong rounded-md text-base text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50`;
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Comfortable adds spacing; both densities keep 16px text and a 44px minimum. */
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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : hint ? (
        <p className="text-sm text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
