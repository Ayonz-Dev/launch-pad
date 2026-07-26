'use client';

import { useEffect, useState } from 'react';
import { fetchDailySeries } from '../lib/rates';
import { summariseExposure, fundingNeeded } from '../lib/exposure';
import { formatUsd } from '../lib/format';

// Maps the total incoming USD requirement (from shipping) against USD already
// held (hedged forwards + offshore accounts) and shows the uncovered shortfall,
// with what it costs to buy that shortfall in each funding currency at live
// spot. All payments are in USD, so AUD/GBP/EUR are alternatives, shown side by
// side rather than split. Live spot from the keyless Frankfurter feed.
//
// Australian English. No em dashes.

const FUNDING = ['AUD', 'GBP', 'EUR'] as const;

function fundingUnits(code: string, units: number): string {
  return units.toLocaleString('en-AU', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  });
}

export function UncoveredExposure({
  requiredUsd,
  hedgedUsd,
  cashUsd,
}: {
  requiredUsd: number;
  hedgedUsd: number;
  cashUsd: number;
}) {
  const [spots, setSpots] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(FUNDING.map((c) => fetchDailySeries(c))).then((results) => {
      if (cancelled) return;
      const next: Record<string, number> = {};
      FUNDING.forEach((c, i) => {
        const series = results[i]?.series ?? [];
        const last = series[series.length - 1];
        if (last) next[c] = last.rate;
      });
      setSpots(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const s = summariseExposure({ requiredUsd, hedgedUsd, cashUsd });

  const stat = (label: string, value: string, tone?: string) => (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="card">
      <section className="kpi-grid" style={{ marginBottom: 12 }}>
        {stat('Required (incoming USD)', formatUsd(s.requiredUsd))}
        {stat('Hedged forwards', formatUsd(s.hedgedUsd))}
        {stat('Offshore USD cash', formatUsd(s.cashUsd))}
        {stat(
          'Uncovered USD',
          formatUsd(s.uncoveredUsd),
          s.uncoveredUsd > 0 ? '#fbbf24' : '#4ade80',
        )}
      </section>

      <div style={{ fontSize: 13, color: '#93a1c0', marginBottom: 8 }}>
        To cover the uncovered {formatUsd(s.uncoveredUsd)} at live spot:
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {FUNDING.map((c) => {
          const rate = spots?.[c];
          const units = rate ? fundingNeeded(s.uncoveredUsd, rate) : NaN;
          return (
            <div
              key={c}
              style={{
                border: '1px solid #26324f',
                borderRadius: 10,
                padding: '10px 14px',
                minWidth: 150,
                background: '#131c31',
              }}
            >
              <div style={{ fontSize: 12, color: '#93a1c0' }}>
                {c}/USD {rate ? `@ ${rate.toFixed(4)}` : ''}
              </div>
              <div style={{ fontSize: 18, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
                {spots == null ? '...' : Number.isFinite(units) ? fundingUnits(c, units) : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
