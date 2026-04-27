"use client";

import { useState, useCallback, createContext, useContext, type ReactNode } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const typeStyles: Record<ToastType, string> = {
    success: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
    error: "bg-red-500/15 border-red-500/30 text-red-400",
    warning: "bg-amber-500/15 border-amber-500/30 text-amber-400",
    info: "bg-blue-500/15 border-blue-500/30 text-blue-400",
  };

  const icons: Record<ToastType, string> = {
    success: "\u2713",
    error: "\u2717",
    warning: "\u26A0",
    info: "\u2139",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 border rounded-xl backdrop-blur-sm shadow-lg transition-all duration-300 ${typeStyles[t.type]}`}
            role="alert"
          >
            <span className="text-lg shrink-0">{icons[t.type]}</span>
            <p className="text-sm font-medium flex-1">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition text-sm"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
