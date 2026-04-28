import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Cambridge TCG Admin",
    template: "%s — Cambridge TCG Admin",
  },
  description: "Internal admin dashboard",
  robots: { index: false, follow: false },
};

/**
 * Root layout — provides html/body only.
 * Actual UI chrome (sidebar + header vs. bare login page) is handled
 * by the (dashboard) and (auth) route group layouts.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-neutral-900 text-neutral-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
