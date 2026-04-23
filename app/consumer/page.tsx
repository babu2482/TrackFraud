"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ConsumerPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to unified search - consumer entity data is handled in unified search
    router.push("/search?type=consumer_entity");
  }, [router]);

  return (
    <div className="text-center py-12">
      <p className="text-gray-600 dark:text-gray-400">Redirecting to unified search...</p>
    </div>
  );
}