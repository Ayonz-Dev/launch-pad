'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@launchpad/db/client';
import type { ContainerConfig, PaymentTerm } from '@launchpad/db';

const TERMS: PaymentTerm[] = [
  'LC at sight',
  'TT 30 days',
  'TT 60 days',
  'TT 90 days',
];
const CONFIGS: ContainerConfig[] = ['20FT', '40FT', '40FT High'];

export function NewCostingForm({
  rateCards,
  defaultRateCardId,
}: {
  rateCards: { id: string; name: string; is_default: boolean }[];
  defaultRateCardId: string;
}) {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState({
    sku: '',
    description: '',
    brand: '',
    vendor: '',
    fob_usd: 0,
    duty_rate: 0.05,
    payment_term: 'TT 60 days' as PaymentTerm,
    container_config: '40FT High' as ContainerConfig,
    sell_ex_gst: 0,
    rrp_inc_gst: 0,
    rate_card_id: defaultRateCardId,
  });

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setError('Your session has expired. Sign in again.');
      return;
    }

    const { data, error } = await supabase
      .from('costings')
      .insert({
        sku: f.sku,
        description: f.description || null,
        brand: f.brand || null,
        vendor: f.vendor || null,
        fob_usd: f.fob_usd,
        duty_rate: f.duty_rate,
        payment_term: f.payment_term,
        container_config: f.container_config,
        sell_ex_gst: f.sell_ex_gst,
        rrp_inc_gst: f.rrp_inc_gst,
        licences: [],
        rate_card_id: f.rate_card_id,
        created_by: user.id,
      })
      .select('id')
      .single();

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/costing/${data!.id}`);
    router.refresh();
  }

  return (
    <form className="card" onSubmit={create} style={{ maxWidth: 560 }}>
      {error && <div className="error">{error}</div>}

      <div className="field">
        <label>SKU / Inventory ID</label>
        <input
          required
          value={f.sku}
          onChange={(e) => set('sku', e.target.value)}
        />
      </div>
      <div className="field">
        <label>Description</label>
        <input
          value={f.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Brand</label>
          <input value={f.brand} onChange={(e) => set('brand', e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Vendor</label>
          <input
            value={f.vendor}
            onChange={(e) => set('vendor', e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>FOB price (USD)</label>
          <input
            type="number"
            step="0.01"
            required
            value={f.fob_usd}
            onChange={(e) => set('fob_usd', Number(e.target.value))}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Import duty (rate)</label>
          <input
            type="number"
            step="0.01"
            value={f.duty_rate}
            onChange={(e) => set('duty_rate', Number(e.target.value))}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Payment terms</label>
          <select
            value={f.payment_term}
            onChange={(e) => set('payment_term', e.target.value as PaymentTerm)}
          >
            {TERMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Container config</label>
          <select
            value={f.container_config}
            onChange={(e) =>
              set('container_config', e.target.value as ContainerConfig)
            }
          >
            {CONFIGS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Sell price ex-GST (AUD)</label>
          <input
            type="number"
            step="0.01"
            required
            value={f.sell_ex_gst}
            onChange={(e) => set('sell_ex_gst', Number(e.target.value))}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>RRP inc-GST (AUD)</label>
          <input
            type="number"
            step="0.01"
            required
            value={f.rrp_inc_gst}
            onChange={(e) => set('rrp_inc_gst', Number(e.target.value))}
          />
        </div>
      </div>

      {rateCards.length > 1 && (
        <div className="field">
          <label>Rate card</label>
          <select
            value={f.rate_card_id}
            onChange={(e) => set('rate_card_id', e.target.value)}
          >
            {rateCards.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.is_default ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Creating...' : 'Create costing'}
      </button>
    </form>
  );
}
