"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Search error:", error);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorState
        type="server"
        title="Search Error"
        message="Unable to process your search right now. Please try again."
        actionLabel="Retry Search"
        onAction={reset}
        showBack={false}
      />
    </div>
  );
}
