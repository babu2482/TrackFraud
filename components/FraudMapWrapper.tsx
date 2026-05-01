"use client";

import React, { Suspense, type ComponentType, type ReactNode } from "react";
import dynamic from "next/dynamic";

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
      <div className="text-3xl">🗺️</div>
      <p>Fraud map unavailable</p>
    </div>
  </div>
);

// Dynamic import with loading fallback
const FraudMapInner = dynamic<{}>(
  () =>
    import("@/components/FraudMap").then((mod) => ({ default: mod.FraudMap })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-[60vh] text-gray-400">
        <div className="text-center space-y-3">
          <div className="animate-spin text-3xl">🗺️</div>
          <p>Loading fraud map…</p>
        </div>
      </div>
    ),
    ssr: false,
  },
);

// Wrap with error boundary
export const FraudMap: ComponentType<{ platformCategories?: unknown }> = (
  props,
) => {
  return (
    <FraudMapErrorBoundary fallback={FallbackUI}>
      <Suspense fallback={FallbackUI}>
        {/* @ts-expect-error - dynamic import type mismatch */}
        <FraudMapInner {...props} />
      </Suspense>
    </FraudMapErrorBoundary>
  );
};
