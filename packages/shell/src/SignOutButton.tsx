'use client';

// Shared sign-out control. Clears the Supabase session and returns to login.
//
// Australian English. No em dashes.

import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@launchpad/db/client';
import { theme } from './theme';

export function SignOutButton({ loginPath = '/login' }: { loginPath?: string }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push(loginPath);
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      style={{
        font: 'inherit',
        fontWeight: 600,
        fontSize: 12,
        padding: '5px 10px',
        border: `1px solid ${theme.line}`,
        borderRadius: 2,
        cursor: 'pointer',
        background: 'transparent',
        color: theme.ink,
      }}
    >
      Sign out
    </button>
  );
}
