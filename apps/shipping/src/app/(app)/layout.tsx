// Server layout for the authenticated area.
//
// Two modes, matching the app's data source:
//   - mock (default, no keys): the app runs on bundled sample data with no auth,
//     so the "60 seconds, no keys" dev experience is preserved. All nav shows.
//   - supabase: requires a signed-in IAM identity and gates the write-only nav
//     (Import, Manage) on the visibility 'shipments.write' permission. The
//     database RLS still enforces the truth on every query; this only hides
//     controls a viewer cannot use.
//
// Authorisation is the shared IAM model (not the costing profiles model), so we
// load the IAM user and read their permissions.
//
// Australian English. No em dashes.

import { AppShell, type NavLink } from "@launchpad/shell";
import { requireIamUser } from "@launchpad/shell/server";
import {
  APP,
  VISIBILITY_PERMISSIONS,
  authorized,
} from "@launchpad/auth";

const READ_LINKS: NavLink[] = [
  { href: "/", label: "Shipments" },
  { href: "/containers", label: "Containers" },
  { href: "/skus", label: "SKUs" },
  { href: "/agls", label: "AGLs" },
  { href: "/table", label: "Data table" },
];

const WRITE_LINKS: NavLink[] = [
  { href: "/import", label: "Import report" },
  { href: "/manage", label: "Manage" },
];

function isMock(): boolean {
  return (process.env.DATA_SOURCE ?? "mock") !== "supabase";
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const main = (
    <main className="min-h-screen bg-workspace-grid bg-grid">{children}</main>
  );

  // Mock / demo mode: no auth, everything visible.
  if (isMock()) {
    return (
      <AppShell
        brand="Ayonz · Control Tower"
        links={[...READ_LINKS, ...WRITE_LINKS]}
        whoami="Demo (mock data)"
      >
        {main}
      </AppShell>
    );
  }

  // Supabase mode: require an IAM identity and gate the write nav.
  const user = await requireIamUser("/login");
  const canWrite = authorized(
    user,
    APP.visibility,
    VISIBILITY_PERMISSIONS.write,
  );
  const links = canWrite ? [...READ_LINKS, ...WRITE_LINKS] : READ_LINKS;

  return (
    <AppShell
      brand="Ayonz · Control Tower"
      links={links}
      whoami={user.email ?? "Signed in"}
    >
      {main}
    </AppShell>
  );
}
