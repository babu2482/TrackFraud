"use client";

import { HTMLAttributes } from "react";

/* ---- Skeleton Text ---- */

export interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  lines?: number;
  width?: string;
  className?: string;
}

export function SkeletonText({
  lines = 1,
  width,
  className = "",
}: SkeletonTextProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`shimmer rounded ${width || i === lines - 1 ? "w-3/4" : "w-full"}`}
          style={{ height: i === lines - 1 ? "0.875rem" : "1rem" }}
        />
      ))}
    </div>
  );
}

/* ---- Skeleton Card ---- */

export interface SkeletonCardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "sm" | "md" | "lg";
  header?: boolean;
  footer?: boolean;
  className?: string;
}

export function SkeletonCard({
  padding = "md",
  header = false,
  footer = false,
  className = "",
}: SkeletonCardProps) {
  const paddingMap = { sm: "p-3", md: "p-4", lg: "p-6" };

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 ${className}`}>
      {header && (
        <div className="shimmer rounded w-2/3 h-5 mb-3" />
      )}
      <div className="space-y-2">
        <div className="shimmer rounded w-full h-4" />
        <div className="shimmer rounded w-5/6 h-4" />
        <div className="shimmer rounded w-3/4 h-4" />
      </div>
      {footer && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="shimmer rounded w-1/3 h-4" />
        </div>
      )}
    </div>
  );
}

/* ---- Skeleton Table Row ---- */

export interface SkeletonTableRowProps {
  columns?: number;
  className?: string;
}

export function SkeletonTableRow({ columns = 4 }: SkeletonTableRowProps) {
  return (
    <div className="flex gap-4 p-4 border-b border-gray-100 dark:border-gray-800">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="flex-1">
          <div className="shimmer rounded h-4" />
        </div>
      ))}
    </div>
  );
}

/* ---- Skeleton Table ---- */

export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  withHeader?: boolean;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  withHeader = true,
}: SkeletonTableProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      {withHeader && (
        <div className="flex gap-4 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="flex-1">
              <div className="shimmer rounded h-3 w-20" />
            </div>
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} columns={columns} />
      ))}
    </div>
  );
}

/* ---- Skeleton List ---- */

export interface SkeletonListProps {
  items?: number;
  className?: string;
}

export function SkeletonList({ items = 5 }: SkeletonListProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
          <div className="shimmer rounded-full h-10 w-10 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="shimmer rounded h-4 w-3/4" />
            <div className="shimmer rounded h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Skeleton Avatar ---- */

export interface SkeletonAvatarProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function SkeletonAvatar({
  size = "md",
  className = "",
}: SkeletonAvatarProps) {
  const sizeMap = { xs: "h-6 w-6", sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12", xl: "h-16 w-16" };

  return (
    <div className={`shimmer rounded-full ${sizeMap[size]} ${className}`} />
  );
}

/* ---- Full Page Skeleton ---- */

export interface PageSkeletonProps {
  className?: string;
}

export function PageSkeleton({ className = "" }: PageSkeletonProps) {
  return (
    <div className={`space-y-6 animate-pulse ${className}`}>
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="shimmer rounded h-8 w-48" />
        <div className="shimmer rounded h-4 w-96 max-w-full" />
      </div>

      {/* Content skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

/* ---- Spinner (alternative loading) ---- */

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

export function Spinner({
  size = "md",
  label,
  className = "",
}: SpinnerProps) {
  const sizeMap = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-8 w-8" };

  return (
    <div className={`inline-flex flex-col items-center gap-2 ${className}`}>
      <svg
        className={`animate-spin ${sizeMap[size]}`}
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
      {label && (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {label}
        </span>
      )}
    </div>
  );
}

/* ---- Centered Loading ---- */

export interface CenteredLoadingProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function CenteredLoading({
  size = "md",
  label = "Loading...",
}: CenteredLoadingProps) {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner size={size} label={label} />
    </div>
  );
}