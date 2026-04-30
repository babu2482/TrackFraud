"use client";

import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { ToastProvider } from "@/components/ui/Toast";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);

  // Delay pathname-dependent rendering until client is mounted
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Use pathname directly for layout structure, only use isMounted for animated background
  const isHome = pathname === "/";
  const showAnimatedBg = isMounted && isHome;

  return (
    <ToastProvider>
      <div
        className="flex flex-col min-h-screen bg-gray-950 text-white relative"
        suppressHydrationWarning
      >
        {/* Animated background — only on home page, after mount */}
        {showAnimatedBg && (
          <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
            <AnimatedBackground />
            {/* Subtle gradient overlay for depth */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(239, 68, 68, 0.04) 0%, transparent 70%)",
              }}
              aria-hidden="true"
            />
          </div>
        )}

        {/* Content */}
        <div className="relative z-10 flex flex-col min-h-screen">
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </div>
    </ToastProvider>
  );
}
