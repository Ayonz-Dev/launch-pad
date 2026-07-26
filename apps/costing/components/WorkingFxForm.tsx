'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@launchpad/db/client';

export function WorkingFxForm({ workingFx }: { workingFx: number }) {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [fx, setFx] = useState(String(workingFx));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(fx);
    if (!isFinite(value) || value <= 0) {
      setError('Enter a valid FX rate.');
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    const { error } = await supabase
      .from('settings')
      .update({ working_fx: value, updated_at: new Date().toISOString() })
      .eq('id', true);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMsg('Saved.');
    router.refresh();
  }

  return (
    <form onSubmit={save} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
      <div className="field" style={{ maxWidth: 220, marginBottom: 0 }}>
        <label htmlFor="workingFx">Working FX (USD/AUD)</label>
        <input
          id="workingFx"
          type="number"
          step="0.0001"
          value={fx}
          onChange={(e) => setFx(e.target.value)}
        />
      </div>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Saving...' : 'Save'}
      </button>
      {msg && <span className="note">{msg}</span>}
      {error && <span className="error">{error}</span>}
    </form>
  );
}
