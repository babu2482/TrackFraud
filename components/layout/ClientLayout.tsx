"use client";

import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { ToastProvider } from "@/components/ui/Toast";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </ToastProvider>
  );
}
