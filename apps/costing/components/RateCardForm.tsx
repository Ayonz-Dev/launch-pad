'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@launchpad/db/client';
import type { RateCard } from '@launchpad/db';

// The numeric rate card fields, grouped for a tidy form.
const GROUPS: { title: string; fields: { key: keyof RateCard; label: string; step: string }[] }[] = [
  {
    title: 'Units per container',
    fields: [
      { key: 'units_20', label: '20FT', step: '1' },
      { key: 'units_40', label: '40FT', step: '1' },
      { key: 'units_40hc', label: '40FT High', step: '1' },
    ],
  },
  {
    title: 'Sea freight per container (USD)',
    fields: [
      { key: 'freight_20_usd', label: '20FT', step: '1' },
      { key: 'freight_40_usd', label: '40FT', step: '1' },
      { key: 'freight_40hc_usd', label: '40FT High', step: '1' },
    ],
  },
  {
    title: 'Logistics and levies',
    fields: [
      { key: 'destuff_aud', label: 'De-stuff per unit (AUD)', step: '0.01' },
      { key: 'consultant_aud', label: 'Consultant fee per unit (AUD)', step: '0.01' },
      { key: 'ewaste_aud', label: 'E-waste levy per unit (AUD)', step: '0.001' },
      { key: 'gst_rate', label: 'GST rate', step: '0.01' },
    ],
  },
  {
    title: 'Finance cost by payment term (rate)',
    fields: [
      { key: 'finance_lc', label: 'LC at sight', step: '0.01' },
      { key: 'finance_30', label: 'TT 30 days', step: '0.01' },
      { key: 'finance_60', label: 'TT 60 days', step: '0.01' },
      { key: 'finance_90', label: 'TT 90 days', step: '0.01' },
    ],
  },
];

export function RateCardForm({ rateCard }: { rateCard: RateCard }) {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [rc, setRc] = useState<RateCard>(rateCard);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof RateCard, value: number) {
    setRc((p) => ({ ...p, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    const { id, created_at, ...fields } = rc;
    const { error } = await supabase
      .from('rate_cards')
      .update(fields)
      .eq('id', id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMsg('Saved.');
    router.refresh();
  }

  return (
    <form onSubmit={save}>
      {GROUPS.map((g) => (
        <div key={g.title} style={{ marginBottom: 14 }}>
          <div
            className="note"
            style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 11, marginBottom: 6 }}
          >
            {g.title}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {g.fields.map((f) => (
              <div className="field" key={String(f.key)} style={{ width: 150, marginBottom: 0 }}>
                <label>{f.label}</label>
                <input
                  type="number"
                  step={f.step}
                  value={rc[f.key] as number}
                  onChange={(e) => set(f.key, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Save rate card'}
        </button>
        {msg && <span className="note">{msg}</span>}
        {error && <span className="error">{error}</span>}
      </div>
    </form>
  );
}
