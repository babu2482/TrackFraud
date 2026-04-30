"use client";

import dynamic from "next/dynamic";

// Dynamic import to avoid webpack issues in dev mode with react-simple-maps
const FraudMapInner = dynamic(
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
  }
);

// Re-export the same props interface
export { FraudMapInner as FraudMap };
