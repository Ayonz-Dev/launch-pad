'use client';

import { useState } from 'react';
import { SpotChartPanel } from './SpotChartPanel';

// The multi-currency live-spot section. Ayonz funds USD purchases from three
// currencies (AUD, GBP, EUR); this switcher swaps which pair's spot and forward
// projection are shown. Each pair is quoted USD per one unit of the funding
// currency, matching the app's USD-anchored convention.
//
// Australian English. No em dashes.

const CURRENCIES = [
  { code: 'AUD', pair: 'AUD/USD' },
  { code: 'GBP', pair: 'GBP/USD' },
  { code: 'EUR', pair: 'EUR/USD' },
] as const;

export function CurrencySpot() {
  const [code, setCode] = useState<(typeof CURRENCIES)[number]['code']>('AUD');
  const selected = CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {CURRENCIES.map((c) => {
          const active = c.code === code;
          return (
            <button
              key={c.code}
              onClick={() => setCode(c.code)}
              style={{
                font: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                padding: '6px 16px',
                borderRadius: 999,
                cursor: 'pointer',
                border: `1px solid ${active ? '#60a5fa' : '#26324f'}`,
                background: active ? '#1a2540' : 'transparent',
                color: active ? '#e8edf7' : '#93a1c0',
              }}
            >
              {c.pair}
            </button>
          );
        })}
      </div>
      <SpotChartPanel key={selected.code} pair={selected.pair} base={selected.code} />
    </div>
  );
}
