"use client";

import React, { Suspense, type ComponentType, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { FraudMapPlatformCategory } from "@/components/FraudMap";

// Error boundary wrapper for FraudMap
class FraudMapErrorBoundary extends React.Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("FraudMap Error:", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

const FallbackUI = (
  <div className="flex items-center justify-center h-[60vh] text-gray-400">
    <div className="text-center space-y-3">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-10 h-10 mx-auto text-gray-600"
      >
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      <p>Fraud map unavailable</p>
    </div>
  </div>
);

// Dynamic import with loading fallback
// Type the component props explicitly to avoid TypeScript mismatches
type FraudMapProps = {
  platformCategories?: FraudMapPlatformCategory[];
};

const FraudMapInner: ComponentType<FraudMapProps> = dynamic(
  () =>
    import("@/components/FraudMap").then((mod) => {
      // Return a wrapper component that matches the dynamic import's expected shape
      const Wrapped = (props: FraudMapProps) => <mod.FraudMap {...props} />;
      return { default: Wrapped };
    }),
  {
    loading: () => (
      <div className="flex items-center justify-center h-[60vh] text-gray-400">
        <div className="text-center space-y-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-10 h-10 mx-auto animate-spin text-gray-600"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <p>Loading fraud map…</p>
        </div>
      </div>
    ),
    ssr: false,
  },
);

// Wrap with error boundary
export const FraudMap: ComponentType<FraudMapProps> = (props) => {
  return (
    <FraudMapErrorBoundary fallback={FallbackUI}>
      <Suspense fallback={FallbackUI}>
        <FraudMapInner {...props} />
      </Suspense>
    </FraudMapErrorBoundary>
  );
};
