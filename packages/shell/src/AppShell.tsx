// The authenticated app chrome: a top nav with the brand, the app's links,
// the signed-in identity and a sign-out button, then the page below. Server
// compatible (no hooks); the interactive bits are the client ShellNav and
// SignOutButton it composes.
//
// Australian English. No em dashes.

import { theme } from './theme';
import { ShellNav, type NavLink } from './ShellNav';
import { SignOutButton } from './SignOutButton';

export interface AppShellProps {
  brand: string;
  links: NavLink[];
  // The signed-in identity line, e.g. "Jo Bloggs · Account Manager".
  whoami: string;
  loginPath?: string;
  children: React.ReactNode;
}

export function AppShell({
  brand,
  links,
  whoami,
  loginPath = '/login',
  children,
}: AppShellProps) {
  return (
    <div style={{ fontFamily: theme.sans, color: theme.ink }}>
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '10px 20px',
          background: theme.panel,
          borderBottom: `2px solid ${theme.ink}`,
        }}
      >
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: theme.teal,
            fontWeight: 600,
          }}
        >
          {brand}
        </span>
        <ShellNav links={links} />
        <span style={{ marginLeft: 'auto' }} />
        <span style={{ fontSize: 12, color: theme.ink2 }}>{whoami}</span>
        <SignOutButton loginPath={loginPath} />
      </nav>
      {children}
    </div>
  );
}
