// Server layout for the authenticated area. Session gating and chrome come from
// the shared shell. Unlike costing, this app does NOT use the costing profiles
// model: it authorises through the visibility schema's IAM RLS, so it only
// requires a signed-in session here and lets the database decide the rest.
//
// Australian English. No em dashes.

import { requireSession } from "@launchpad/shell/server";
import { AppShell, type NavLink } from "@launchpad/shell";

const LINKS: NavLink[] = [
  { href: "/", label: "Shipments" },
  { href: "/containers", label: "Containers" },
  { href: "/skus", label: "SKUs" },
  { href: "/agls", label: "AGLs" },
  { href: "/table", label: "Data table" },
  { href: "/import", label: "Import report" },
  { href: "/manage", label: "Manage" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession("/login");

  return (
    <AppShell
      brand="Ayonz · Control Tower"
      links={LINKS}
      whoami={session.email ?? "Signed in"}
    >
      <main className="min-h-screen bg-workspace-grid bg-grid">{children}</main>
    </AppShell>
  );
}
