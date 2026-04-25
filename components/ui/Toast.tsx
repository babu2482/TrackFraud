"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

// ---- Types ----

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

// ---- Context ----

interface ToastContextValue {
  toast: (data: Omit<ToastData, "id"> & { id?: string }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ---- Provider ----

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const toast = useCallback((data: Omit<ToastData, "id"> & { id?: string }) => {
    const id = data.id || Math.random().toString(36).slice(2, 9);
    const newToast: ToastData = { ...data, id };
    setToasts((prev) => [...prev, newToast]);

    const duration = data.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Convenience methods
  const success = useCallback((title: string, message?: string, opts?: { duration?: number }) =>
    toast({ type: "success", title, message, ...opts }), []);
  const error = useCallback((title: string, message?: string, opts?: { duration?: number }) =>
    toast({ type: "error", title, message, ...opts }), []);
  const warning = useCallback((title: string, message?: string, opts?: { duration?: number }) =>
    toast({ type: "warning", title, message, ...opts }), []);
  const info = useCallback((title: string, message?: string, opts?: { duration?: number }) =>
    toast({ type: "info", title, message, ...opts }), []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ---- Container ----

function ToastContainer({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[var(--z-toast)] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// ---- Individual Toast ----

function ToastItem({ toast: t, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  const config = TOAST_CONFIG[t.type];

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border animate-slide-in-right ${config.bg} ${config.border}`}
      role="alert"
    >
      <div className={`flex-shrink-0 mt-0.5 ${config.iconColor}`}>
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${config.textColor}`}>{t.title}</p>
        {t.message && (
          <p className={`text-xs mt-0.5 ${config.textColor} opacity-80`}>{t.message}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(t.id)}
        className={`flex-shrink-0 p-1 rounded-md transition-colors ${config.dismissBg} ${config.dismissColor} hover:${config.dismissHover}`}
        aria-label="Dismiss"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ---- Config ----

const TOAST_CONFIG: Record<ToastType, {
  bg: string;
  border: string;
  iconColor: string;
  textColor: string;
  dismissBg: string;
  dismissColor: string;
  dismissHover: string;
  icon: ReactNode;
}> = {
  success: {
    bg: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-200 dark:border-green-800",
    iconColor: "text-green-600 dark:text-green-400",
    textColor: "text-green-900 dark:text-green-100",
    dismissBg: "hover:bg-green-100 dark:hover:bg-green-800/50",
    dismissColor: "text-green-500 dark:text-green-400",
    dismissHover: "hover:text-green-700 dark:hover:text-green-300",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  error: {
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    iconColor: "text-red-600 dark:text-red-400",
    textColor: "text-red-900 dark:text-red-100",
    dismissBg: "hover:bg-red-100 dark:hover:bg-red-800/50",
    dismissColor: "text-red-500 dark:text-red-400",
    dismissHover: "hover:text-red-700 dark:hover:text-red-300",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    iconColor: "text-amber-600 dark:text-amber-400",
    textColor: "text-amber-900 dark:text-amber-100",
    dismissBg: "hover:bg-amber-100 dark:hover:bg-amber-800/50",
    dismissColor: "text-amber-500 dark:text-amber-400",
    dismissHover: "hover:text-amber-700 dark:hover:text-amber-300",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  info: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    iconColor: "text-blue-600 dark:text-blue-400",
    textColor: "text-blue-900 dark:text-blue-100",
    dismissBg: "hover:bg-blue-100 dark:hover:bg-blue-800/50",
    dismissColor: "text-blue-500 dark:text-blue-400",
    dismissHover: "hover:text-blue-700 dark:hover:text-blue-300",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
};