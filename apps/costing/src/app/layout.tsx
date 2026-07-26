import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ayonz Costing Platform",
  description: "Manufacturer-to-retail quote and margin modelling",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
