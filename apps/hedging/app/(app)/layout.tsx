// Server layout for the authenticated area. Identical pattern to the costing
// app: the session guard and chrome come from the shared shell, and this file
// only names the hedging app's nav links.
//
// The nav links are static placeholders for now. When Hedging-Tool is ported,
// they become role-derived the same way costing's are (see @launchpad/auth).
//
// Australian English. No em dashes.

import { requireUser } from '@launchpad/shell/server';
import { AppShell, type NavLink } from '@launchpad/shell';
import { roleLabel } from '@launchpad/auth';

const LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/positions', label: 'Positions' },
  { href: '/rates', label: 'Rates' },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser('/login');
  const whoami = `${user.profile.full_name ?? user.email} · ${roleLabel(
    user.profile.role,
  )}`;

  return (
    <AppShell brand="Ayonz · Hedging" links={LINKS} whoami={whoami}>
      {children}
    </AppShell>
  );
}
