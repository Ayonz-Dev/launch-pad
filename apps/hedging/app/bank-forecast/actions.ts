'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../../lib/supabase/server';

// Server action that persists parsed bank forecast ranges. Kept separate from
// the read-only query layer because it writes, so it needs a key with insert
// rights (the service-role key). mid_rate is a generated column, so it is never
// inserted. One paste is one run: upsert on (pair, as_of, bank, horizon_label)
// so re-saving the same email updates rather than duplicates.

export interface SaveRange {
  horizonLabel: string;
  startDate: string;
  endDate: string;
  low: number;
  high: number;
}

export interface SaveBankForecastInput {
  pair: string;
  bank: string;
  asOf: string;
  commentary: string;
  ranges: SaveRange[];
}

export interface SaveResult {
  ok: boolean;
  savedCount?: number;
  error?: string;
}

export async function saveBankForecast(input: SaveBankForecastInput): Promise<SaveResult> {
  if (input.ranges.length === 0) {
    return { ok: false, error: 'No forecast ranges to save.' };
  }
  const client = getServerClient();
  if (!client) {
    return { ok: false, error: 'Supabase is not configured on the server.' };
  }

  const bank = input.bank.trim() || 'Bank';
  const rows = input.ranges.map((r) => ({
    pair: input.pair,
    as_of: input.asOf,
    bank,
    horizon_label: r.horizonLabel,
    start_date: r.startDate,
    end_date: r.endDate,
    low_rate: r.low,
    high_rate: r.high,
    commentary: input.commentary || null,
  }));

  const { error } = await client
    .from('bank_forecast_ranges')
    .upsert(rows, { onConflict: 'pair,as_of,bank,horizon_label' });
  if (error) {
    return { ok: false, error: error.message };
  }

  // Refresh the dashboard and chart so the new band shows immediately.
  revalidatePath('/');
  revalidatePath('/bank-forecast');
  revalidatePath('/forex');
  return { ok: true, savedCount: rows.length };
}
