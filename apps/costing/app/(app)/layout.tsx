// Server layout for the authenticated area. The session guard and the chrome
// come from the shared shell; this file only decides the costing app's nav
// links from the user's role.
//
// Australian English. No em dashes.

import { requireUser } from '@launchpad/shell/server';
import { AppShell, type NavLink } from '@launchpad/shell';
import { canManageRateCards, canSetWorkingFx, roleLabel } from '@launchpad/auth';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser('/login');
  const role = user.profile.role;

  const links: NavLink[] = [{ href: '/queue', label: 'Queue' }];
  if (role === 'account_coordinator') {
    links.push({ href: '/new', label: 'New costing' });
  }
  if (canManageRateCards(role) || canSetWorkingFx(role)) {
    links.push({ href: '/settings', label: 'Settings' });
  }

  const whoami = `${user.profile.full_name ?? user.email} · ${roleLabel(role)}`;

  return (
    <AppShell brand="Ayonz · Costing" links={links} whoami={whoami}>
      {children}
    </AppShell>
  );
}
