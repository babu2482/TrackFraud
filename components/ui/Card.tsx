"use client";

import { ReactNode, HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "bordered" | "glass";
  padding?: "sm" | "md" | "lg";
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  hover?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<CardProps["variant"]>, string> = {
  default: "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm",
  elevated: "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-md",
  bordered: "rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900",
  glass: "rounded-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-sm",
};

const PADDING_CLASSES: Record<NonNullable<CardProps["padding"]>, string> = {
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function Card({
  variant = "default",
  padding = "md",
  header,
  footer,
  children,
  hover = false,
  className = "",
  ...rest
}: CardProps) {
  const baseClasses = `${VARIANT_CLASSES[variant]} ${hover ? "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer" : ""} ${className}`;

  return (
    <div className={baseClasses} {...rest}>
      {header && (
        <div className={`${padding === "sm" ? "px-3 pb-3" : padding === "lg" ? "px-6 pb-6" : "px-4 pb-4"} ${footer || children ? "border-b border-gray-100 dark:border-gray-800 mb-3" : ""}`}>
          {header}
        </div>
      )}
      {padding && children && (
        <div className={header || footer ? "" : ""}>
          {children}
        </div>
      )}
      {!padding && children && <div>{children}</div>}
      {footer && (
        <div className={`${padding === "sm" ? "px-3 pt-3" : padding === "lg" ? "px-6 pt-6" : "px-4 pt-4"} border-t border-gray-100 dark:border-gray-800`}>
          {footer}
        </div>
      )}
    </div>
  );
}

/* ---- Card sections ---- */

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`font-semibold text-gray-900 dark:text-white ${className}`}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
      {children}
    </div>
  );
}

/* ---- Presets ---- */

export function StatCard({
  value,
  label,
  trend,
  icon,
  color = "brand",
}: {
  value: string | number;
  label: string;
  trend?: { value: number; label: string };
  icon?: ReactNode;
  color?: "brand" | "success" | "warning" | "danger" | "accent";
}) {
  const colorClasses: Record<string, string> = {
    brand: "text-red-600 dark:text-red-400",
    success: "text-green-600 dark:text-green-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
    accent: "text-blue-600 dark:text-blue-400",
  };

  const trendClasses: Record<string, string> = {
    up: "text-green-600 dark:text-green-400",
    down: "text-red-600 dark:text-red-400",
    neutral: "text-gray-500 dark:text-gray-400",
  };

  return (
    <Card variant="elevated" hover className="min-w-0">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            {value}
          </p>
          {trend && (
            <div className={`mt-1 flex items-center gap-1 text-xs ${trendClasses[trend.value > 0 ? "up" : trend.value < 0 ? "down" : "neutral"]}`}>
              {trend.value > 0 ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                </svg>
              ) : trend.value < 0 ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                </svg>
              ) : null}
              <span>{Math.abs(trend.value).toLocaleString()}{trend.label ? ` ${trend.label}` : ""}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={`ml-3 p-2 rounded-lg ${colorClasses[color]} bg-opacity-10`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}