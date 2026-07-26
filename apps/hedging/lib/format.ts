// Presentation helpers. Australian English, Australian locale.

const usd = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const usdCents = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat('en-AU', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Whole-dollar USD, for headline magnitudes. */
export function formatUsd(value: number): string {
  return usd.format(value);
}

/** USD to the cent, for precise balances. */
export function formatUsdCents(value: number): string {
  return usdCents.format(value);
}

/** A ratio as a percentage. Null renders as a dash. */
export function formatPercent(value: number | null): string {
  return value == null ? '—' : percent.format(value);
}

/** A rate at six decimal places, matching numeric(12,6). */
export function formatRate(value: number | null): string {
  return value == null ? '—' : value.toFixed(6);
}

/** A YYYY-MM-01 bucket as a short month label, for example Aug 2026. */
export function formatMonth(bucket: string): string {
  const parsed = new Date(`${bucket}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return bucket;
  return parsed.toLocaleDateString('en-AU', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
