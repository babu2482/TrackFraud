import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/layout/ClientLayout";

export const metadata: Metadata = {
  title: {
    default: "TrackFraud - Unified Financial Fraud Tracking Platform",
    template: "%s | TrackFraud",
  },
  description:
    "TrackFraud is a unified fraud tracking and government transparency platform that ingests data from 50+ government sources, correlates and analyzes data across categories to detect financial fraud patterns, and scores entities for fraud risk.",
  keywords: [
    "fraud tracking",
    "government transparency",
    "fraud detection",
    "charity fraud",
    "corporate fraud",
    "political fraud",
    "healthcare fraud",
    "consumer protection",
    "IRS",
    "SEC",
    "FEC",
    "CFPB",
    "CMS",
    "OFAC",
    "EPA",
    "FDA",
    "HHS",
    "SAM.gov",
    "Congress.gov",
    "USASpending",
  ],
  authors: [{ name: "TrackFraud Team" }],
  creator: "TrackFraud",
  publisher: "TrackFraud",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"
  ),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "TrackFraud",
    title: "TrackFraud - Unified Financial Fraud Tracking Platform",
    description:
      "TrackFraud ingests data from 50+ government sources to detect and track financial fraud patterns across charities, corporations, government, healthcare, and political entities.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "TrackFraud Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TrackFraud - Unified Financial Fraud Tracking Platform",
    description:
      "TrackFraud ingests data from 50+ government sources to detect and track financial fraud patterns.",
    images: ["/og-image.png"],
    creator: "@trackfraud",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  ...(process.env.GOOGLE_SITE_VERIFICATION && {
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION,
    },
  }),
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  themeColor: "#1e40af",
  viewport: { width: "device-width", initialScale: 1 },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}