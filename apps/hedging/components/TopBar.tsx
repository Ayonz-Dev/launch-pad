'use client';

import { usePathname } from 'next/navigation';
import { SignOutButton } from '@launchpad/shell';

// A slim top bar with the brand and a shared sign-out control, on every page
// except the login screen. The login gate lives in middleware; this only gives
// a signed-in user a way out.
//
// Australian English. No em dashes.

export function TopBar() {
  const pathname = usePathname();
  if (pathname === '/login') return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '8px 20px',
        borderBottom: '1px solid #26324f',
        background: '#131c31',
      }}
    >
      <span
        style={{
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#60a5fa',
          fontWeight: 600,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        Ayonz · Hedging
      </span>
      <span style={{ marginLeft: 'auto' }} />
      <SignOutButton loginPath="/login" />
    </div>
  );
}
