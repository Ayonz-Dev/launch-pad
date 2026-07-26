'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@launchpad/db/client';

export default function LoginPage() {
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
    router.push('/queue');
    router.refresh();
  }

  return (
    <div className="page" style={{ maxWidth: 380, marginTop: 80 }}>
      <div className="card">
        <div
          className="brand"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--teal)',
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Ayonz · Product Costing
        </div>
        <h1 style={{ fontSize: 20, margin: '0 0 16px' }}>Sign in</h1>
        <form onSubmit={signIn}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
      <p className="note">
        Accounts are created in Supabase Auth by an administrator, who also sets
        each person's role.
      </p>
    </div>
  );
}
