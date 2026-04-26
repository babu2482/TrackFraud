"use client";

import { Button } from "./Button";

export type ErrorType = "network" | "not-found" | "server" | "unauthorized" | "generic";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  errorCode?: string | number;
  type?: ErrorType;
  actionLabel?: string;
  onAction?: () => void;
  backLabel?: string;
  onBack?: () => void;
  showBack?: boolean;
  className?: string;
}

const ERROR_CONFIG: Record<ErrorType, { icon: React.ReactNode; title: string; message: string }> = {
  network: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
      </svg>
    ),
    title: "Connection Error",
    message: "Unable to reach the server. Please check your internet connection and try again.",
  },
  "not-found": {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    ),
    title: "Page Not Found",
    message: "The page you're looking for doesn't exist or has been moved.",
  },
  server: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12">
        <path d="M12 2v20M2 12h20" />
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    ),
    title: "Server Error",
    message: "Something went wrong on our end. Please try again later.",
  },
  unauthorized: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "Authentication Required",
    message: "Please log in to access this page.",
  },
  generic: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    title: "Something Went Wrong",
    message: "An unexpected error occurred. Please try refreshing the page.",
  },
};

export function ErrorState({
  title,
  message,
  errorCode,
  type = "generic",
  actionLabel = "Try Again",
  onAction,
  backLabel = "Go Back",
  onBack,
  showBack = true,
  className = "",
}: ErrorStateProps) {
  const config = ERROR_CONFIG[type];

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className}`}>
      <div className="text-red-500 dark:text-red-400 mb-4">
        {config.icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title || config.title}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-1">
        {message || config.message}
      </p>
      {errorCode && (
        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-6">
          Error: {errorCode}
        </p>
      )}
      <div className="flex items-center gap-3">
        {onAction && (
          <Button variant="primary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
        {showBack && onBack && (
          <Button variant="secondary" size="sm" onClick={onBack}>
            {backLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---- Empty State ---- */

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: "primary" | "secondary" | "ghost";
  illustrations?: "search" | "data" | "general";
  className?: string;
}

const ILLUSTRATION_ICONS: Record<NonNullable<EmptyStateProps["illustrations"]>, React.ReactNode> = {
  search: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  data: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  general: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
};

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  actionVariant = "primary",
  illustrations = "general",
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className}`}>
      <div className="text-gray-400 dark:text-gray-500 mb-4">
        {icon || ILLUSTRATION_ICONS[illustrations]}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button variant={actionVariant} size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/* ---- Offline Banner ---- */

export function OfflineBanner({ className = "" }: { className?: string }) {
  return (
    <div className="bg-amber-500 dark:bg-amber-600 text-white px-4 py-2 text-center text-sm flex items-center justify-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
      </svg>
      <span>You're offline. Some features may not be available.</span>
    </div>
  );
}