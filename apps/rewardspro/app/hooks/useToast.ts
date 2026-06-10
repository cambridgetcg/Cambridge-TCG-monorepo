import { useState, useCallback } from "react";

export interface ToastState {
  active: boolean;
  content: string;
  error?: boolean;
  duration?: number;
}

/**
 * Reusable toast notification hook
 *
 * @param defaultDuration - Default auto-dismiss duration in ms (default: 5000)
 * @returns Toast state and control functions
 *
 * @example
 * ```tsx
 * const { toast, showSuccess, showError, showInfo, hideToast } = useToast();
 *
 * // Show notifications
 * showSuccess("Operation completed!");
 * showError("Something went wrong");
 * showInfo("Processing in background...", 8000);
 *
 * // In JSX (requires Frame wrapper)
 * {toast.active && (
 *   <Toast
 *     content={toast.content}
 *     error={toast.error}
 *     duration={toast.duration}
 *     onDismiss={hideToast}
 *   />
 * )}
 * ```
 */
export function useToast(defaultDuration = 5000) {
  const [toast, setToast] = useState<ToastState>({
    active: false,
    content: '',
  });

  const showToast = useCallback((content: string, options?: {
    error?: boolean;
    duration?: number;
  }) => {
    setToast({
      active: true,
      content,
      error: options?.error ?? false,
      duration: options?.duration ?? defaultDuration,
    });
  }, [defaultDuration]);

  const showSuccess = useCallback((content: string, duration?: number) => {
    showToast(content, { error: false, duration: duration ?? defaultDuration });
  }, [showToast, defaultDuration]);

  const showError = useCallback((content: string, duration?: number) => {
    showToast(content, { error: true, duration: duration ?? 8000 });
  }, [showToast]);

  const showInfo = useCallback((content: string, duration?: number) => {
    showToast(content, { error: false, duration: duration ?? 8000 });
  }, [showToast]);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, active: false }));
  }, []);

  return {
    toast,
    setToast,
    showToast,
    showSuccess,
    showError,
    showInfo,
    hideToast,
  };
}
