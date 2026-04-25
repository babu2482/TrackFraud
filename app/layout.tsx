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
  verification: {
    google: "your-google-verification-code",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1e40af" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="antialiased">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}