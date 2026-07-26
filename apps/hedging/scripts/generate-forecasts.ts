/**
 * Generate model spot forecasts and write them to spot_forecasts.
 *
 * Reads spot_history per active pair, fits the shared damped-Holt model, and
 * upserts one run (stamped with today's as_of) into spot_forecasts. Intended to
 * run on a schedule, for example a daily n8n job or a cron, after new spot data
 * lands. It reuses lib/forecast so the maths matches the chart exactly.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Run: npm run forecast   (optionally: npm run forecast -- AUD/USD EUR/USD)
 */
import { createClient } from '@supabase/supabase-js';
import { forecastFromSpot } from '../lib/forecast';
import type { SpotPoint } from '../lib/chart/series';

const HORIZON_MONTHS = 12;

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const asOf = new Date().toISOString().slice(0, 10);

  // Pairs from the command line, or every active pair.
  const requested = process.argv.slice(2);
  let pairs = requested;
  if (pairs.length === 0) {
    const { data, error } = await client
      .from('currency_pairs')
      .select('pair')
      .eq('is_active', true);
    if (error) throw new Error(`load pairs: ${error.message}`);
    pairs = (data ?? []).map((r) => r.pair as string);
  }

  for (const pair of pairs) {
    const { data, error } = await client
      .from('spot_history')
      .select('date, rate')
      .eq('pair', pair)
      .order('date', { ascending: true });
    if (error) throw new Error(`load spot ${pair}: ${error.message}`);

    const spot: SpotPoint[] = (data ?? []).map((r) => ({
      date: r.date as string,
      rate: typeof r.rate === 'string' ? Number(r.rate) : (r.rate as number),
    }));

    const forecasts = forecastFromSpot(spot, { horizonMonths: HORIZON_MONTHS });
    if (forecasts.length === 0) {
      console.log(`${pair}: not enough spot history, skipped`);
      continue;
    }

    const rows = forecasts.map((f) => ({
      pair,
      as_of: asOf,
      target_date: f.date,
      forecast_rate: f.rate,
      lower_rate: f.lower,
      upper_rate: f.upper,
      model: 'damped_holt',
    }));

    const { error: upsertError } = await client
      .from('spot_forecasts')
      .upsert(rows, { onConflict: 'pair,as_of,target_date' });
    if (upsertError) throw new Error(`upsert ${pair}: ${upsertError.message}`);

    console.log(`${pair}: wrote ${rows.length} forecast rows for as_of ${asOf}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
