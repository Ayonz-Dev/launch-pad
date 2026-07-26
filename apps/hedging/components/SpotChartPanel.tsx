'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchDailySeries, intradaySeries } from '../lib/rates';
import { forecastFromSpot } from '../lib/forecast';
import type { SpotPoint } from '../lib/chart/series';
import { SpotRateChart, type SpotChartRow } from './SpotRateChart';

// The live-spot panel: a price-history chart with 1D / 1W / 1M / 1Y tabs beside
// a forward-projection chart (recent actual plus a damped-Holt projection with
// an 80% band, clearly a forecast, never a quote). Client-side off the keyless
// Frankfurter feed, so it renders without a backend. Parameterised by currency
// so the same panel serves AUD, GBP and EUR.
//
// Ported from the crossrate-rebuild dashboard. Australian English. No em dashes.

type Range = '1D' | '1W' | '1M' | '1Y';
const RANGES: Range[] = ['1D', '1W', '1M', '1Y'];
const FORECAST_MONTHS = 6;

function fmtDay(date: string): string {
  const dt = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return date;
  return dt.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

function domainOf(rows: SpotChartRow[]): [number, number] {
  const values = rows
    .flatMap((r) => [r.rate, r.forecast, r.band?.[0], r.band?.[1]])
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.12 || max * 0.01;
  return [Number((min - pad).toFixed(4)), Number((max + pad).toFixed(4))];
}

export function SpotChartPanel({
  pair,
  base,
}: {
  pair: string;
  base: string;
}) {
  const [series, setSeries] = useState<SpotPoint[]>([]);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('1Y');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDailySeries(base).then(({ series: s, live: isLive }) => {
      if (cancelled) return;
      setSeries(s);
      setLive(isLive);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [base]);

  const latest = series.length ? series[series.length - 1]!.rate : null;

  const historyData = useMemo<SpotChartRow[]>(() => {
    if (!series.length) return [];
    let hist: SpotPoint[];
    if (range === '1D') hist = latest != null ? intradaySeries(latest) : [];
    else if (range === '1W') hist = series.slice(-7);
    else if (range === '1M') hist = series.slice(-30);
    else hist = series.slice(-365);
    return hist.map((p) => ({
      label: range === '1D' ? p.date : fmtDay(p.date),
      rate: p.rate,
    }));
  }, [series, range, latest]);

  const forecastData = useMemo<SpotChartRow[]>(() => {
    if (series.length < 8) return [];
    const recent = series.slice(-90);
    const rows: SpotChartRow[] = recent.map((p) => ({ label: fmtDay(p.date), rate: p.rate }));
    const fc = forecastFromSpot(series, { horizonMonths: FORECAST_MONTHS });
    const last = rows[rows.length - 1];
    if (last && fc.length) {
      rows[rows.length - 1] = { ...last, forecast: last.rate, band: [last.rate!, last.rate!] };
      for (const f of fc) rows.push({ label: fmtDay(f.date), forecast: f.rate, band: [f.lower, f.upper] });
    }
    return rows;
  }, [series]);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    font: 'inherit',
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    border: `1px solid ${active ? '#60a5fa' : '#26324f'}`,
    borderRadius: 999,
    cursor: 'pointer',
    background: active ? '#1a2540' : 'transparent',
    color: active ? '#e8edf7' : '#93a1c0',
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
      <div className="card" style={{ minHeight: 300 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>
            {pair} {range === '1D' ? 'intraday' : 'daily close'}
            {!live && (
              <span style={{ marginLeft: 8, fontSize: 10, color: '#fbbf24' }}>sample</span>
            )}
          </h3>
          <div style={{ display: 'flex', gap: 4 }}>
            {RANGES.map((r) => (
              <button key={r} style={tabStyle(r === range)} onClick={() => setRange(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 240 }}>
          {loading ? (
            <p className="note">Loading spot history...</p>
          ) : (
            <SpotRateChart data={historyData} domain={domainOf(historyData)} />
          )}
        </div>
      </div>

      <div className="card" style={{ minHeight: 300 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>
          {pair} forward projection
          <span style={{ marginLeft: 8, fontSize: 10, color: '#93a1c0' }}>
            damped-Holt, 80% band
          </span>
        </h3>
        <div style={{ height: 240 }}>
          {loading ? (
            <p className="note">Loading projection...</p>
          ) : (
            <SpotRateChart data={forecastData} domain={domainOf(forecastData)} />
          )}
        </div>
      </div>
    </div>
  );
}
