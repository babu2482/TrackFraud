"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HealthcarePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to unified search - healthcare provider data is handled in unified search
    router.push("/search?type=healthcare_provider");
  }, [router]);

  return (
    <div className="text-center py-12">
      <p className="text-gray-600 dark:text-gray-400">Redirecting to unified search...</p>
    </div>
  );
}