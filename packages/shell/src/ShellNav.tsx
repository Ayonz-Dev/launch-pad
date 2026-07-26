'use client';

// Shared nav links with active-route highlighting. The link list is passed in
// by each app (the links are app specific; the chrome is not).
//
// Australian English. No em dashes.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { theme } from './theme';

export interface NavLink {
  href: string;
  label: string;
}

export function ShellNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <>
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + '/');
        return (
          <Link
            key={l.href}
            href={l.href}
            style={{
              fontWeight: 600,
              textDecoration: 'none',
              color: active ? theme.ink : theme.ink2,
            }}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
