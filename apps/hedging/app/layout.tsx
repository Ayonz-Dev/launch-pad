import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ayonz Hedging',
  description: 'FX hedging (placeholder on the shared platform shell).',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
