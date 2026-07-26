'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CostingRole } from '@launchpad/db';
import { canManageRateCards, canSetWorkingFx } from '@launchpad/auth';

export function NavLinks({ role }: { role: CostingRole }) {
  const pathname = usePathname();
  const showSettings = canManageRateCards(role) || canSetWorkingFx(role);

  const links: { href: string; label: string }[] = [
    { href: '/queue', label: 'Queue' },
  ];
  if (role === 'account_coordinator') {
    links.push({ href: '/new', label: 'New costing' });
  }
  if (showSettings) {
    links.push({ href: '/settings', label: 'Settings' });
  }

  return (
    <>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={pathname.startsWith(l.href) ? 'active' : ''}
        >
          {l.label}
        </Link>
      ))}
    </>
  );
}
