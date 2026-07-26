"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ACCESS_PERSONA_OPTIONS, isTeamScopedPersona } from "@/lib/accessPersona";
import { useAccessPersona } from "./AccessPersonaProvider";
import { useSession } from "./SessionProvider";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "◧" },
  { href: "/", label: "New costing", icon: "＋", exact: true },
  { href: "/quotes", label: "Recent quotes", icon: "▤" },
  { href: "/products", label: "Products", icon: "▦" },
  { href: "/rate-cards", label: "Rate cards", icon: "↗" },
  { href: "/customers", label: "Customers", icon: "◫" },
  { href: "/contacts", label: "Contacts", icon: "☏" },
  { href: "/admin", label: "Administration", icon: "⚙" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const session = useSession();
  const access = useAccessPersona();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sidebar">
      <div className="brand-mark">
        <span>A</span>
        <div>
          <b>AYONZ</b>
          <small>Costing platform</small>
        </div>
      </div>
      <nav>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item.href, item.exact) ? "active" : undefined}
          >
            <i aria-hidden>{item.icon}</i> {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-access">
        <label>
          <span>View as</span>
          <select
            value={access.persona}
            onChange={(event) => access.setPersona(event.target.value as typeof access.persona)}
          >
            {ACCESS_PERSONA_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {isTeamScopedPersona(access.persona) && (
          <label>
            <span>Team</span>
            <select
              value={access.teamId ?? ""}
              onChange={(event) => access.setTeamId(event.target.value || null)}
            >
              {access.teams.length === 0 ? (
                <option value="">No teams yet</option>
              ) : (
                access.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                    {team.salesRepLabel ? ` · ${team.salesRepLabel}` : ""}
                  </option>
                ))
              )}
            </select>
          </label>
        )}
        <p className="sidebar-access-note">
          Test harness — filters queues and actions before real logins are assigned.
        </p>
      </div>

      <div className="sidebar-note">
        {session.status === "authenticated" || session.status === "no_org" ? (
          <>
            <b>{session.organizationName ?? "No organisation"}</b>
            <span>{session.userEmail}</span>
            <button className="sidebar-signout" onClick={() => void session.signOut()}>
              Sign out
            </button>
          </>
        ) : session.status === "anonymous" ? (
          <>
            <b>Not signed in</b>
            <span>Sign in to save and collaborate.</span>
            <Link className="button-link sidebar-signin" href="/login">
              Sign in
            </Link>
          </>
        ) : session.status === "loading" ? (
          <>
            <b>Connecting…</b>
            <span>Checking your workspace access.</span>
          </>
        ) : (
          <>
            <b>Draft mode</b>
            <span>Calculations work offline. Connect Supabase to collaborate.</span>
          </>
        )}
      </div>
    </aside>
  );
}
