"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log the error
  console.error("Application error:", error);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorState
        type="server"
        title="Something Went Wrong"
        message="An unexpected error occurred while loading this page. Please try again."
        actionLabel="Try Again"
        onAction={reset}
        showBack={false}
      />
    </div>
  );
}
