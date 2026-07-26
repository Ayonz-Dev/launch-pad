import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { DestinationProvider } from "@/components/DestinationProvider";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Ayonz Control Tower",
  description:
    "Ayonz factory-to-retailer shipment visibility with commercial-risk surfacing.",
};

// Root layout only sets fonts, the destination filter context and the page
// background. The authenticated chrome (nav, identity, sign out) lives in the
// (app) group so the /login route can sit outside it.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-slate-50 text-ink antialiased">
        <DestinationProvider>{children}</DestinationProvider>
      </body>
    </html>
  );
}
