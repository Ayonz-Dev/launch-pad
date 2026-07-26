// Server layout for the authenticated area. Requires a session and profile;
// otherwise redirects to /login. Loads the role and renders the nav.
//
// Australian English. No em dashes.

import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { loadSessionUser } from '@launchpad/auth';
import { roleLabel } from '@launchpad/auth';
import { NavLinks } from '@/components/NavLinks';
import { SignOutButton } from '@/components/SignOutButton';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = getServerSupabase();
  const user = await loadSessionUser(supabase);
  if (!user) redirect('/login');

  const role = user.profile.role;

  return (
    <>
      <nav className="nav">
        <span className="brand">Ayonz · Costing</span>
        <NavLinks role={role} />
        <span className="spacer" />
        <span className="whoami">
          {user.profile.full_name ?? user.email} · {roleLabel(role)}
        </span>
        <SignOutButton />
      </nav>
      {children}
    </>
  );
}
