"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GovernmentPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to unified search - government contractor data is handled in unified search
    router.push("/search?type=government_contractor");
  }, [router]);

  return (
    <div className="text-center py-12">
      <p className="text-gray-600 dark:text-gray-400">Redirecting to unified search...</p>
    </div>
  );
}