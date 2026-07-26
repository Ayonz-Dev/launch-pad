'use client';

// Shared sign-in form. Supabase email/password against the platform identity.
// Self styled so it looks the same in every app without importing app globals.
//
// Australian English. No em dashes.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@launchpad/db/client';
import { theme } from './theme';

export interface LoginFormProps {
  // The eyebrow line above the heading, e.g. "Ayonz · Product Costing".
  brand: string;
  // Where to send the user on success. Defaults to '/'.
  redirectTo?: string;
}

export function LoginForm({ brand, redirectTo = '/' }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  const field: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 12,
  };
  const label: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: theme.ink2,
  };
  const input: React.CSSProperties = {
    font: 'inherit',
    padding: '8px 10px',
    border: `1px solid ${theme.line}`,
    borderRadius: 3,
    background: '#fff',
  };

  return (
    <div
      style={{
        maxWidth: 380,
        margin: '80px auto 0',
        padding: 20,
        fontFamily: theme.sans,
        color: theme.ink,
      }}
    >
      <div
        style={{
          background: theme.panel,
          border: `1px solid ${theme.line}`,
          borderRadius: 4,
          padding: 16,
        }}
      >
        <div
          style={{
            fontFamily: theme.mono,
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: theme.teal,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {brand}
        </div>
        <h1 style={{ fontSize: 20, margin: '0 0 16px' }}>Sign in</h1>
        <form onSubmit={signIn}>
          <div style={field}>
            <label htmlFor="email" style={label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={input}
            />
          </div>
          <div style={field}>
            <label htmlFor="password" style={label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={input}
            />
          </div>
          {error && (
            <div style={{ color: theme.neg, fontSize: 13, margin: '8px 0' }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            style={{
              font: 'inherit',
              fontWeight: 600,
              fontSize: 13,
              padding: '8px 14px',
              border: 0,
              borderRadius: 2,
              cursor: busy ? 'not-allowed' : 'pointer',
              background: theme.ink,
              color: theme.paper,
              opacity: busy ? 0.45 : 1,
            }}
          >
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
      <p style={{ color: theme.ink2, fontSize: 12, marginTop: 12 }}>
        Accounts are created in Supabase Auth by an administrator, who also sets
        each person's role.
      </p>
    </div>
  );
}
