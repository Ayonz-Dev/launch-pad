"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSession } from "./SessionProvider";

export function Workspace({ children }: { children: ReactNode }) {
  return <section className="workspace">{children}</section>;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="top-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-empty">
      {icon && <div className="page-empty-icon" aria-hidden>{icon}</div>}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && <div className="page-empty-action">{action}</div>}
    </div>
  );
}

/**
 * Gate for organisation-scoped pages. Renders a clear empty state for every
 * non-ready session status so no page ever shows a blank screen or crashes when
 * Supabase is unconfigured, the user is signed out, or setup is incomplete.
 */
export function RequireOrg({ children }: { children: ReactNode }) {
  const session = useSession();

  if (session.status === "authenticated") return <>{children}</>;

  if (session.status === "loading") {
    return <EmptyState icon="⏳" title="Loading your workspace…">Checking organisation access.</EmptyState>;
  }

  if (session.status === "offline") {
    return (
      <EmptyState icon="🔌" title="Connect Supabase to use this area">
        The costing calculator works offline, but quotes, customers, rate cards and administration
        need the shared Supabase project. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and the
        publishable key to <code>.env.local</code>, then reload.
      </EmptyState>
    );
  }

  if (session.status === "anonymous") {
    return (
      <EmptyState
        icon="🔑"
        title="Sign in to continue"
        action={<Link className="button-link" href="/login">Sign in</Link>}
      >
        This area is only available to signed-in members of your workspace.
      </EmptyState>
    );
  }

  // no_org
  return (
    <EmptyState
      icon="🏁"
      title="Finish workspace setup"
      action={<Link className="button-link" href="/setup">Create the workspace</Link>}
    >
      You are signed in but not yet a member of an organisation. Run the one-time setup to create it
      and assign your administrator role.
    </EmptyState>
  );
}
