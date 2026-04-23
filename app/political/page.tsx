"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PoliticalPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to unified search - political data is handled in the unified search
    router.push("/search?type=politician");
  }, [router]);

  return (
    <div className="text-center py-12">
      <p className="text-gray-600 dark:text-gray-400">Redirecting to unified search...</p>
    </div>
  );
}