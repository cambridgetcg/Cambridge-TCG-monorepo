"use client";

/**
 * Modal — the canonical dialog shell.
 *
 * Owns what every dialog on the surface kept re-implementing (four subtly
 * different copies on the deck builder alone): the backdrop, the panel
 * chrome, dialog semantics (role/aria-modal/aria-labelledby), Escape to
 * close, focus capture on open + restore on close, and a first/last Tab
 * trap. Pages keep their own state; this only renders while `open`.
 *
 * `dismissOnOverlay` exists for dialogs holding unsaved user input (e.g.
 * a pasted decklist) — pass false to make a stray overlay click harmless.
 */

import * as React from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible title. Rendered as the dialog heading unless `labelledBy` points elsewhere. */
  title?: React.ReactNode;
  /** id of an element inside that labels the dialog — alternative to `title`. */
  labelledBy?: string;
  /** Tailwind max-width class for the panel. */
  maxWidth?: string;
  /** Close when the backdrop is clicked. Default true. */
  dismissOnOverlay?: boolean;
  children: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  labelledBy,
  maxWidth = "max-w-md",
  dismissOnOverlay = true,
  children,
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (dismissOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? titleId : undefined)}
        tabIndex={-1}
        className={`relative bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl ${maxWidth} w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto focus:outline-none`}
      >
        {title && (
          <h3 id={titleId} className="text-lg font-bold text-white mb-4">
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}
