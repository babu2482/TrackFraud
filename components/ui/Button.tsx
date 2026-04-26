"use client";

import { ReactNode } from "react";

export interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "link";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit" | "reset";
  className?: string;
  ariaLabel?: string;
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-500 disabled:bg-red-400",
  secondary:
    "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:bg-gray-50 dark:disabled:bg-gray-900",
  ghost:
    "bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600",
  danger:
    "bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-500 disabled:bg-red-400",
  link:
    "bg-transparent text-red-600 dark:text-red-400 hover:underline disabled:text-red-300 dark:disabled:text-red-800 font-medium",
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2.5",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  iconPosition = "left",
  onClick,
  href,
  type = "button",
  className = "",
  ariaLabel,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const baseClasses =
    "inline-flex items-center justify-center font-medium rounded-lg transition-colors-smooth focus-ring disabled:opacity-50 disabled:pointer-events-none";

  const classes = `${baseClasses} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? "w-full" : ""} ${className}`;

  const content = (
    <>
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {!loading && icon && iconPosition === "left" && icon}
      {children}
      {!loading && icon && iconPosition === "right" && icon}
    </>
  );

  if (href) {
    return (
      <a href={href} className={classes} onClick={onClick} aria-label={ariaLabel}>
        {content}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={isDisabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={loading}
    >
      {content}
    </button>
  );
}

/* ---- Quick-use presets ---- */

export function SubmitButton({ children, loading, ...rest }: Omit<ButtonProps, "variant" | "size"> & { loading?: boolean }) {
  return (
    <Button variant="primary" size="md" loading={loading} {...rest}>
      {children}
    </Button>
  );
}

export function SecondaryButton({ children, ...rest }: Omit<ButtonProps, "variant">) {
  return (
    <Button variant="secondary" size="md" {...rest}>
      {children}
    </Button>
  );
}

export function GhostButton({ children, ...rest }: Omit<ButtonProps, "variant">) {
  return (
    <Button variant="ghost" size="md" {...rest}>
      {children}
    </Button>
  );
}

export function DangerButton({ children, ...rest }: Omit<ButtonProps, "variant">) {
  return (
    <Button variant="danger" size="md" {...rest}>
      {children}
    </Button>
  );
}