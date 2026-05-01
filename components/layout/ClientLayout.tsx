"use client";

import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { ToastProvider } from "@/components/ui/Toast";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

// Dynamic import to avoid webpack issues with canvas-based animation
const AnimatedBackground = dynamic(
  () =>
    import("@/components/ui/AnimatedBackground").then((mod) => ({
      default: mod.AnimatedBackground,
    })),
  { ssr: false, loading: () => null },
);

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isHome = pathname === "/";

  return (
    <ToastProvider>
      <div
        className="flex flex-col min-h-screen bg-gray-950 text-white relative"
        suppressHydrationWarning
      >
        {/* Animated background — only on home page */}
        {isHome && (
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
