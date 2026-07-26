import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TopBar } from '../components/TopBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'FX Hedging & Cash Analytics',
  description: 'Corporate FX hedging coverage and USD cash analytics.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <body>
        <TopBar />
        {children}
      </body>
    </html>
  );
}
