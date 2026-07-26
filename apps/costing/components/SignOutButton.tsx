'use client';

import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@launchpad/db/client';

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      className="btn secondary"
      style={{ padding: '5px 10px', fontSize: 12 }}
      onClick={signOut}
    >
      Sign out
    </button>
  );
}
