"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CharitiesPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to unified search with charity type filter
    router.push("/search?type=charity");
  }, [router]);

  return (
    <div className="text-center py-12">
      <p className="text-gray-600 dark:text-gray-400">Redirecting to unified search...</p>
    </div>
  );
}