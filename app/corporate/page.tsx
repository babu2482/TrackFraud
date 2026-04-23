"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CorporatePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to unified search with corporation type filter
    router.push("/search?type=corporation");
  }, [router]);

  return (
    <div className="text-center py-12">
      <p className="text-gray-600 dark:text-gray-400">Redirecting to unified search...</p>
    </div>
  );
}