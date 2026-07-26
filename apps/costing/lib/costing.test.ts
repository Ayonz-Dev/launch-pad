// Guardrail 5: a sample costing must match between the TypeScript compute() and
// the SQL costing_computed view. We cannot run Postgres here, so the expected
// numbers below ARE the view's output for this sample, computed from the same
// formulas in 0001_costing_schema.sql. If you change the view or compute(),
// re-derive these and update both. A drift here means the sheet's live feedback
// would disagree with the saved, authoritative figures.
//
// Australian English. No em dashes.

import { describe, it, expect } from 'vitest';
import { computeCosting, type CostingInputs } from './costing';
import type { Licence, RateCard } from '@launchpad/db';

const rateCard: RateCard = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Standard rate card',
  is_default: true,
  units_20: 800,
  units_40: 1700,
  units_40hc: 1800,
  freight_20_usd: 3100,
  freight_40_usd: 5900,
  freight_40hc_usd: 6444,
  destuff_aud: 0.35,
  consultant_aud: 3.5,
  ewaste_aud: 1.137,
  gst_rate: 0.1,
  finance_lc: 0.02,
  finance_30: 0.04,
  finance_60: 0.06,
  finance_90: 0.08,
  created_at: '2026-01-01T00:00:00Z',
};

const inputs: CostingInputs = {
  sku: 'AGL4635',
  description: 'Blaupunkt DVD Player',
  brand: 'Blaupunkt',
  vendor: 'Factory (CN)',
  fob_usd: 9.5,
  duty_rate: 0.05,
  payment_term: 'TT 60 days',
  container_config: '40FT High',
  sell_ex_gst: 25.0,
  rrp_inc_gst: 79.0,
  working_fx: 0.65,
  final_fx: null,
};

const licences: Licence[] = [
  { name: 'Dolby Audio', usd: 0.5, on: true },
  { name: 'Sisvel (DVD)', usd: 0.45, on: true },
  { name: 'DTS', usd: 0.25, on: true },
  { name: 'MPEG-LA', usd: 0.2, on: false },
];

describe('computeCosting mirrors costing_computed', () => {
  const d = computeCosting(inputs, licences, rateCard);

  it('uses the working fx when no final fx is set', () => {
    expect(d.fx).toBe(0.65);
  });

  it('sums only the enabled licences', () => {
    // 0.5 + 0.45 + 0.25 = 1.2 (MPEG-LA off)
    expect(d.royalty_usd).toBeCloseTo(1.2, 10);
  });

  it('derives the landed cost', () => {
    // exworks = (9.5 + 1.2) / 0.65        = 16.4615...
    // duty    = 0.05 * (9.5 / 0.65)        = 0.7308...
    // freight = (6444 / 1800) / 0.65       = 5.5077...
    // destuff = 0.35
    // landed  = 23.05 (rounded to 2dp)
    expect(d.exworks_aud).toBe(16.46);
    expect(d.duty_aud).toBe(0.73);
    expect(d.freight_per_unit_aud).toBe(5.51);
    expect(d.destuff_per_unit_aud).toBe(0.35);
    expect(d.landed_aud).toBe(23.05);
  });

  it('derives the fully loaded cost', () => {
    // finance = 0.06 * 23.0501...          = 1.383...
    // loaded  = 23.0501 + 1.383 + 3.5 + 1.137 = 29.07 (2dp)
    expect(d.finance_aud).toBe(1.38);
    expect(d.loaded_aud).toBe(29.07);
  });

  it('derives margin figures', () => {
    // gp     = 25 - 29.0701...             = -4.07
    // gp_pct = -4.07 / 25                  = -0.1628
    // rrp_ex = 79 / 1.1                    = 71.82
    expect(d.gross_profit_aud).toBe(-4.07);
    expect(d.gp_pct).toBe(-0.1628);
    expect(d.rrp_ex_gst).toBe(71.82);
  });

  it('honours a final fx override', () => {
    const withFinal = computeCosting(
      { ...inputs, final_fx: 0.6 },
      licences,
      rateCard,
    );
    expect(withFinal.fx).toBe(0.6);
    // A weaker AUD raises the landed cost.
    expect(withFinal.landed_aud).toBeGreaterThan(d.landed_aud);
  });
});
