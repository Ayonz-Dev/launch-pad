import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ayonz Costing',
  description: 'Product costing and MYOB approval chain.',
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
