import type { SpotPoint } from './chart/series';

// Live daily spot history for a funding currency against USD, from the
// Frankfurter API (ECB reference rates, no key, daily granularity). Every pair
// is quoted as USD per one unit of the funding currency, matching the app's
// USD-anchored convention. Falls back to a deterministic synthetic series so
// the page always renders, even offline.
//
// Ported and generalised from the crossrate-rebuild branch (which was AUD/USD
// only) to support AUD, GBP and EUR. Australian English. No em dashes.

const DAY_MS = 86_400_000;

// Rough current levels (USD per 1 unit) used only to anchor the synthetic
// fallback so it looks plausible per currency.
const SYNTH_ANCHOR: Record<string, number> = {
  AUD: 0.662,
  GBP: 1.27,
  EUR: 1.08,
};

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function syntheticSeries(base: string, days: number, endMs: number): SpotPoint[] {
  const out: SpotPoint[] = [];
  let rate = SYNTH_ANCHOR[base] ?? 1;
  const band = rate * 0.08;
  let seed = 20260724 + base.charCodeAt(0);
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  for (let i = days - 1; i >= 0; i -= 1) {
    const ms = endMs - i * DAY_MS;
    rate += rand() * (band * 0.006) + rate * 0.00003;
    rate = Math.max((SYNTH_ANCHOR[base] ?? 1) - band, Math.min((SYNTH_ANCHOR[base] ?? 1) + band, rate));
    out.push({ date: iso(ms), rate: Number(rate.toFixed(5)) });
  }
  return out;
}

// Fetch ~13 months of daily <base>/USD closes. `live` is false on fallback.
export async function fetchDailySeries(
  base = 'AUD',
): Promise<{ series: SpotPoint[]; live: boolean }> {
  const endMs = Date.now();
  const startMs = endMs - 400 * DAY_MS;
  const url = `https://api.frankfurter.app/${iso(startMs)}..${iso(endMs)}?from=${base}&to=USD`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = (await res.json()) as { rates?: Record<string, { USD?: number }> };
    const rates = json.rates ?? {};
    const series: SpotPoint[] = Object.keys(rates)
      .sort()
      .map((date) => ({ date, rate: rates[date]?.USD ?? NaN }))
      .filter((p) => Number.isFinite(p.rate));
    if (series.length < 5) throw new Error('too few points');
    return { series, live: true };
  } catch {
    return { series: syntheticSeries(base, 400, endMs), live: false };
  }
}

// A plausible intraday walk anchored to the latest close, for the 1D view
// (Frankfurter is daily only, so 1D is reconstructed rather than sourced).
export function intradaySeries(anchor: number): SpotPoint[] {
  const out: SpotPoint[] = [];
  let rate = anchor - anchor * 0.0014;
  let seed = Math.floor(anchor * 1e5);
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  for (let h = 0; h < 24; h += 1) {
    rate += rand() * (anchor * 0.0016);
    const hh = String(h).padStart(2, '0');
    out.push({ date: `${hh}:00`, rate: Number(rate.toFixed(5)) });
  }
  out.push({ date: 'now', rate: anchor });
  return out;
}
