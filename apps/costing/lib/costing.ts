// TypeScript mirror of the costing_computed SQL view.
//
// This exists ONLY for live editing feel: as the coordinator types, the ENGINE
// and EXPORT tabs update instantly without a round trip. On save we persist the
// inputs and re-read costing_computed, which is the source of truth. If this
// function and the view ever disagree, the view wins and this has a bug. There
// is a test (lib/costing.test.ts) that a sample costing matches between them.
//
// Keep this identical to packages/db/migrations/0001_costing_schema.sql. If you
// change one, change both.
//
// Australian English. No em dashes.

import type {
  ContainerConfig,
  Licence,
  PaymentTerm,
  RateCard,
} from '@launchpad/db';

// The editable input columns of a costing, plus the two FX values (which are
// display only in the sheet: working_fx is snapshotted from settings, final_fx
// is set through the set_final_fx RPC).
export interface CostingInputs {
  sku: string;
  description: string;
  brand: string;
  vendor: string;
  fob_usd: number;
  duty_rate: number;
  payment_term: PaymentTerm;
  container_config: ContainerConfig;
  sell_ex_gst: number;
  rrp_inc_gst: number;
  working_fx: number;
  final_fx: number | null;
}

// The derived numbers, named exactly as the columns in costing_computed so the
// two are interchangeable in the sheet.
export interface Derived {
  fx: number;
  royalty_usd: number;
  exworks_aud: number;
  duty_aud: number;
  freight_per_unit_aud: number;
  destuff_per_unit_aud: number;
  landed_aud: number;
  finance_aud: number;
  consultant_aud: number;
  ewaste_aud: number;
  loaded_aud: number;
  sell_ex_gst: number;
  gross_profit_aud: number;
  gp_pct: number;
  rrp_ex_gst: number;
  rrp_inc_gst: number;
  retailer_margin_pct: number;
}

// Round to d decimal places, half away from zero, matching Postgres numeric
// round(). JS Math.round is half toward +Infinity, so operate on the magnitude
// and reapply the sign.
function round(x: number, d: number): number {
  if (!isFinite(x)) return NaN;
  const p = Math.pow(10, d);
  return Math.sign(x) * Math.round(Math.abs(x) * p) / p;
}

function unitsForConfig(config: ContainerConfig, rc: RateCard): number {
  switch (config) {
    case '20FT':
      return rc.units_20;
    case '40FT':
      return rc.units_40;
    default:
      return rc.units_40hc;
  }
}

function freightForConfig(config: ContainerConfig, rc: RateCard): number {
  switch (config) {
    case '20FT':
      return rc.freight_20_usd;
    case '40FT':
      return rc.freight_40_usd;
    default:
      return rc.freight_40hc_usd;
  }
}

function financeRateForTerm(term: PaymentTerm, rc: RateCard): number {
  switch (term) {
    case 'LC at sight':
      return rc.finance_lc;
    case 'TT 30 days':
      return rc.finance_30;
    case 'TT 90 days':
      return rc.finance_90;
    default:
      // TT 60 days
      return rc.finance_60;
  }
}

// Compute the derived cells from inputs, licences and the chosen rate card.
// Intermediate values are kept unrounded (as the SQL CTEs do); rounding is
// applied only at the output, exactly as the view does.
export function computeCosting(
  inputs: CostingInputs,
  licences: Licence[],
  rc: RateCard,
): Derived {
  const fx = inputs.final_fx ?? inputs.working_fx;
  const royaltyUsd = licences.reduce(
    (sum, l) => sum + (l.on ? Number(l.usd) || 0 : 0),
    0,
  );

  const units = unitsForConfig(inputs.container_config, rc) || NaN;
  const freightCtrUsd = freightForConfig(inputs.container_config, rc);
  const financeRate = financeRateForTerm(inputs.payment_term, rc);

  const exworksAud = (inputs.fob_usd + royaltyUsd) / fx;
  const dutyAud = inputs.duty_rate * (inputs.fob_usd / fx);
  const freightAud = freightCtrUsd / units / fx;
  const destuffAud = rc.destuff_aud;

  const landedAud = exworksAud + dutyAud + freightAud + destuffAud;
  const financeAud = financeRate * landedAud;
  const loadedAud = landedAud + financeAud + rc.consultant_aud + rc.ewaste_aud;
  const rrpExGst = inputs.rrp_inc_gst / (1 + rc.gst_rate);
  const grossProfitAud = inputs.sell_ex_gst - loadedAud;

  return {
    fx,
    royalty_usd: royaltyUsd,
    exworks_aud: round(exworksAud, 2),
    duty_aud: round(dutyAud, 2),
    freight_per_unit_aud: round(freightAud, 2),
    destuff_per_unit_aud: round(destuffAud, 2),
    landed_aud: round(landedAud, 2),
    finance_aud: round(financeAud, 2),
    consultant_aud: round(rc.consultant_aud, 2),
    ewaste_aud: round(rc.ewaste_aud, 2),
    loaded_aud: round(loadedAud, 2),
    sell_ex_gst: inputs.sell_ex_gst,
    gross_profit_aud: round(grossProfitAud, 2),
    gp_pct: round(grossProfitAud / (inputs.sell_ex_gst || NaN), 4),
    rrp_ex_gst: round(rrpExGst, 2),
    rrp_inc_gst: inputs.rrp_inc_gst,
    retailer_margin_pct: round(
      (rrpExGst - inputs.sell_ex_gst) / (rrpExGst || NaN),
      4,
    ),
  };
}
