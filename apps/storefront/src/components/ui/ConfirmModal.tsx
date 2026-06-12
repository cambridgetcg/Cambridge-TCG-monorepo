"use client";

import { Modal } from "@/lib/ui";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmColors = {
    danger: "bg-red-500 hover:bg-red-400 text-white",
    warning: "bg-amber-500 hover:bg-amber-400 text-black",
    default: "bg-emerald-500 hover:bg-emerald-400 text-black",
  };

  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-sm">
      <p className="text-sm text-neutral-400 mb-6">{message}</p>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 px-4 bg-neutral-800 text-neutral-300 text-sm font-medium rounded-lg hover:bg-neutral-700 transition"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={`flex-1 py-2.5 px-4 text-sm font-bold rounded-lg transition ${confirmColors[variant]}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
