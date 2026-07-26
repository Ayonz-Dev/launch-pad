'use client';

// Ayonz Costing Sheet - on-screen spreadsheet view.
//
// Ported from AyonzCostingSheet.jsx. The presentation, the four tabs
// (INPUTS / RATES / ENGINE / EXPORT), the locked/editable cell styling and the
// Excel-style chrome are kept as they were. What changed:
//   - It is now a controlled component. Inputs, licences and the rate card come
//     in as props and changes go out through callbacks, so the parent persists
//     them to Supabase.
//   - ENGINE and EXPORT render from costing_computed (the read-only view) when
//     the sheet is clean. While inputs are dirty, a TypeScript mirror
//     (computeCosting) gives instant feedback; on save the parent re-reads the
//     view and passes it back, and the view wins.
//   - readOnly renders inputs as locked cells (the reviewer view).
//   - RATES editing is role gated via canEditRates.
//
// No calculated value is ever written from here. Australian English, no em dashes.

import { useMemo } from 'react';
import type {
  ContainerConfig,
  CostingComputed,
  Licence,
  PaymentTerm,
  RateCard,
} from '@launchpad/db';
import { computeCosting, type CostingInputs, type Derived } from '@/lib/costing';

const CONFIGS: ContainerConfig[] = ['20FT', '40FT', '40FT High'];
const TERMS: PaymentTerm[] = [
  'LC at sight',
  'TT 30 days',
  'TT 60 days',
  'TT 90 days',
];
const TABS = ['INPUTS', 'RATES', 'ENGINE', 'EXPORT'] as const;
type Tab = (typeof TABS)[number];

const aud = (n: number) =>
  isFinite(n)
    ? n.toLocaleString('en-AU', {
        style: 'currency',
        currency: 'AUD',
        minimumFractionDigits: 2,
      })
    : '—';
const usd = (n: number) =>
  isFinite(n)
    ? n.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
      })
    : '—';
const pct = (n: number) => (isFinite(n) ? (n * 100).toFixed(1) + '%' : '—');
const num = (n: number, d = 2) =>
  isFinite(n) ? Number(n).toFixed(d) : '—';

// Map the view row onto the Derived shape (identical field names).
function fromComputed(c: CostingComputed): Derived {
  return {
    fx: c.fx,
    royalty_usd: c.royalty_usd,
    exworks_aud: c.exworks_aud,
    duty_aud: c.duty_aud,
    freight_per_unit_aud: c.freight_per_unit_aud,
    destuff_per_unit_aud: c.destuff_per_unit_aud,
    landed_aud: c.landed_aud,
    finance_aud: c.finance_aud,
    consultant_aud: c.consultant_aud,
    ewaste_aud: c.ewaste_aud,
    loaded_aud: c.loaded_aud,
    sell_ex_gst: c.sell_ex_gst,
    gross_profit_aud: c.gross_profit_aud,
    gp_pct: c.gp_pct,
    rrp_ex_gst: c.rrp_ex_gst,
    rrp_inc_gst: c.rrp_inc_gst,
    retailer_margin_pct: c.retailer_margin_pct,
  };
}

export interface CostingSheetProps {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  inputs: CostingInputs;
  licences: Licence[];
  rateCard: RateCard;
  computed: CostingComputed | null;
  readOnly: boolean;
  canEditRates: boolean;
  dirty: boolean;
  csvEnabled: boolean;
  onInputChange: (patch: Partial<CostingInputs>) => void;
  onLicencesChange: (next: Licence[]) => void;
  onRateCardChange: (patch: Partial<RateCard>) => void;
  onDownloadCsv: () => void;
}

export default function CostingSheet(props: CostingSheetProps) {
  const {
    tab,
    onTabChange,
    inputs,
    licences,
    rateCard,
    computed,
    readOnly,
    canEditRates,
    dirty,
    csvEnabled,
    onInputChange,
    onLicencesChange,
    onRateCardChange,
    onDownloadCsv,
  } = props;

  // Live figures while typing; the authoritative view figures when clean.
  const live = useMemo(
    () => computeCosting(inputs, licences, rateCard),
    [inputs, licences, rateCard],
  );
  const d: Derived = !dirty && computed ? fromComputed(computed) : live;

  const setI = (k: keyof CostingInputs, v: string | number) =>
    onInputChange({ [k]: v } as Partial<CostingInputs>);

  const setLicUsd = (i: number, v: number) =>
    onLicencesChange(licences.map((x, j) => (j === i ? { ...x, usd: v } : x)));
  const toggleLic = (i: number) =>
    onLicencesChange(
      licences.map((x, j) => (j === i ? { ...x, on: !x.on } : x)),
    );

  // Row builders --------------------------------------------------------------
  let rn = 0;
  const nextN = () => ++rn;

  type RowModel =
    | { t: 'section'; n: number; title: string }
    | { t: 'text'; n: number; label: string; value: string; on: (v: string) => void }
    | {
        t: 'num' | 'rnum';
        n: number;
        label: string;
        value: number;
        unit?: string;
        step?: string;
        on: (v: number) => void;
      }
    | {
        t: 'sel';
        n: number;
        label: string;
        value: string;
        opts: readonly string[];
        on: (v: string) => void;
      }
    | {
        t: 'lic';
        n: number;
        label: string;
        usd: number;
        on: boolean;
        toggle: () => void;
        setUsd: (v: number) => void;
      }
    | {
        t: 'calc';
        n: number;
        label: string;
        value: string;
        unit?: string;
        tone?: string;
      };

  const Section = (title: string): RowModel => ({
    t: 'section',
    n: nextN(),
    title,
  });
  const TextIn = (label: string, k: keyof CostingInputs): RowModel => ({
    t: 'text',
    n: nextN(),
    label,
    value: String(inputs[k] ?? ''),
    on: (v) => setI(k, v),
  });
  const NumIn = (
    label: string,
    k: keyof CostingInputs,
    unit?: string,
    step = '0.01',
  ): RowModel => ({
    t: 'num',
    n: nextN(),
    label,
    value: inputs[k] as number,
    unit,
    step,
    on: (v) => setI(k, v),
  });
  const Sel = (
    label: string,
    k: keyof CostingInputs,
    opts: readonly string[],
  ): RowModel => ({
    t: 'sel',
    n: nextN(),
    label,
    value: String(inputs[k]),
    opts,
    on: (v) => setI(k, v),
  });
  const Calc = (
    label: string,
    value: string,
    unit?: string,
    tone?: string,
  ): RowModel => ({ t: 'calc', n: nextN(), label, value, unit, tone });

  const effectiveFx = inputs.final_fx ?? inputs.working_fx;

  const inputsRows: RowModel[] = [
    Section('Product'),
    TextIn('SKU / Inventory ID', 'sku'),
    TextIn('Description', 'description'),
    TextIn('Brand', 'brand'),
    TextIn('Vendor', 'vendor'),
    Section('Deal terms'),
    NumIn('FOB price', 'fob_usd', 'USD'),
    Calc(
      inputs.final_fx != null ? 'Exchange rate (final)' : 'Exchange rate (working)',
      num(effectiveFx, 4),
      'USD/AUD',
    ),
    NumIn('Import duty', 'duty_rate', 'rate', '0.01'),
    Sel('Payment terms', 'payment_term', TERMS),
    Sel('Container config', 'container_config', CONFIGS),
    Section('Pricing'),
    NumIn('Sell price ex-GST', 'sell_ex_gst', 'AUD'),
    NumIn('RRP inc-GST', 'rrp_inc_gst', 'AUD'),
    Section('Technology licences'),
    ...licences.map(
      (l, i): RowModel => ({
        t: 'lic',
        n: nextN(),
        label: l.name,
        usd: l.usd,
        on: l.on,
        toggle: () => toggleLic(i),
        setUsd: (v) => setLicUsd(i, v),
      }),
    ),
    Calc('Royalties per unit (enabled)', usd(d.royalty_usd), 'USD'),
  ];

  const RNum = (
    label: string,
    val: number,
    on: (v: number) => void,
    unit?: string,
    step = '1',
  ): RowModel => ({ t: 'rnum', n: nextN(), label, value: val, on, unit, step });

  const setR = (k: keyof RateCard, v: number) => onRateCardChange({ [k]: v });

  const ratesRows: RowModel[] = [
    Section('Units per container'),
    RNum('20FT', rateCard.units_20, (v) => setR('units_20', v), 'units'),
    RNum('40FT', rateCard.units_40, (v) => setR('units_40', v), 'units'),
    RNum('40FT High', rateCard.units_40hc, (v) => setR('units_40hc', v), 'units'),
    Section('Sea freight per container'),
    RNum('20FT', rateCard.freight_20_usd, (v) => setR('freight_20_usd', v), 'USD'),
    RNum('40FT', rateCard.freight_40_usd, (v) => setR('freight_40_usd', v), 'USD'),
    RNum(
      '40FT High',
      rateCard.freight_40hc_usd,
      (v) => setR('freight_40hc_usd', v),
      'USD',
    ),
    Section('Logistics and levies'),
    RNum('De-stuff per unit', rateCard.destuff_aud, (v) => setR('destuff_aud', v), 'AUD', '0.01'),
    RNum('Consultant fee per unit', rateCard.consultant_aud, (v) => setR('consultant_aud', v), 'AUD', '0.01'),
    RNum('E-waste levy per unit', rateCard.ewaste_aud, (v) => setR('ewaste_aud', v), 'AUD', '0.001'),
    RNum('GST rate', rateCard.gst_rate, (v) => setR('gst_rate', v), 'rate', '0.01'),
    Section('Finance cost by payment term'),
    RNum('LC at sight', rateCard.finance_lc, (v) => setR('finance_lc', v), 'rate', '0.01'),
    RNum('TT 30 days', rateCard.finance_30, (v) => setR('finance_30', v), 'rate', '0.01'),
    RNum('TT 60 days', rateCard.finance_60, (v) => setR('finance_60', v), 'rate', '0.01'),
    RNum('TT 90 days', rateCard.finance_90, (v) => setR('finance_90', v), 'rate', '0.01'),
  ];

  const engineRows: RowModel[] = [
    Section(`Cost waterfall · ${inputs.container_config} @ ${num(d.fx, 4)}`),
    Calc('FOB (converted)', aud(inputs.fob_usd / d.fx)),
    Calc('Technology royalties', aud(d.royalty_usd / d.fx)),
    Calc('Ex-works subtotal', aud(d.exworks_aud), '', 'strong'),
    Calc(`Import duty @ ${pct(inputs.duty_rate)}`, aud(d.duty_aud)),
    Calc('Sea freight / unit', aud(d.freight_per_unit_aud)),
    Calc('De-stuff / unit', aud(d.destuff_per_unit_aud)),
    Calc('Landed cost', aud(d.landed_aud), '', 'emph'),
    Calc(`Finance · ${inputs.payment_term}`, aud(d.finance_aud)),
    Calc('Consultant fee', aud(d.consultant_aud)),
    Calc('E-waste levy', aud(d.ewaste_aud)),
    Calc('Fully loaded cost', aud(d.loaded_aud), '', 'emph'),
    Section('Margin'),
    Calc('Sell price ex-GST', aud(inputs.sell_ex_gst)),
    Calc('Gross profit', aud(d.gross_profit_aud), '', d.gross_profit_aud >= 0 ? 'pos' : 'neg'),
    Calc('Gross profit %', pct(d.gp_pct), '', d.gp_pct >= 0 ? 'pos' : 'neg'),
    Calc('RRP ex-GST', aud(d.rrp_ex_gst)),
    Calc('Retailer margin on RRP ex', pct(d.retailer_margin_pct)),
  ];

  const exportRows: RowModel[] = [
    Section('MYOB Acumatica contract (StockItem)'),
    Calc('InventoryID', inputs.sku || '—'),
    Calc('Description', inputs.description || '—'),
    Calc('Brand attribute', inputs.brand || '—'),
    Calc('Vendor', inputs.vendor || '—'),
    Calc('Vendor price · FOB USD', usd(inputs.fob_usd)),
    Calc('Royalty total USD', usd(d.royalty_usd)),
    Calc('Landed cost AUD', aud(d.landed_aud)),
    Calc('Std cost · fully loaded AUD', aud(d.loaded_aud)),
    Calc('Sales price ex-GST', aud(inputs.sell_ex_gst)),
    Calc('RRP ex-GST', aud(d.rrp_ex_gst)),
    Calc('RRP inc-GST', aud(inputs.rrp_inc_gst)),
    Calc('GP %', pct(d.gp_pct)),
    Calc('Container config', inputs.container_config),
  ];

  const rowsByTab: Record<Tab, RowModel[]> = {
    INPUTS: inputsRows,
    RATES: ratesRows,
    ENGINE: engineRows,
    EXPORT: exportRows,
  };
  const rows = rowsByTab[tab];
  const inputsLocked = readOnly;
  const ratesLocked = !canEditRates;

  return (
    <div className="cs-root">
      <style>{css}</style>

      <div className="cs-bar">
        <div>
          <span className="cs-eyebrow">Ayonz · Product Costing</span>
          <div className="cs-title">
            {inputs.sku || 'New costing'} <span>{inputs.description}</span>
          </div>
        </div>
        <div className="cs-bar-right">
          <div className="cs-legend">
            <span>
              <i className="cs-sw cs-sw-in" /> editable input
            </span>
            <span>
              <i className="cs-sw cs-sw-lock" /> calculated (locked)
            </span>
          </div>
          <div className="cs-headline">
            <span>
              Landed <b>{aud(d.landed_aud)}</b>
            </span>
            <span>
              Loaded <b>{aud(d.loaded_aud)}</b>
            </span>
            <span>
              GP{' '}
              <b
                style={{
                  color: d.gp_pct >= 0 ? 'var(--pos)' : 'var(--neg)',
                }}
              >
                {pct(d.gp_pct)}
              </b>
            </span>
          </div>
        </div>
      </div>

      <div className="cs-sheet">
        <div className="cs-colhead">
          <span className="cs-corner" />
          <span>A</span>
          <span>B</span>
          <span>C</span>
        </div>
        <div className="cs-rows">
          {rows.map((r) => (
            <Row
              key={tab + r.n}
              r={r}
              locked={tab === 'INPUTS' ? inputsLocked : tab === 'RATES' ? ratesLocked : false}
            />
          ))}
        </div>
      </div>

      <div className="cs-tabbar">
        <div className="cs-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={'cs-tab' + (tab === t ? ' on' : '')}
              onClick={() => onTabChange(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === 'EXPORT' && (
          <button
            className="cs-csv"
            onClick={onDownloadCsv}
            disabled={!csvEnabled}
            title={
              csvEnabled
                ? 'Download the MYOB CSV'
                : 'Available once the costing is approved'
            }
          >
            Download MYOB CSV
          </button>
        )}
      </div>
    </div>
  );
}

function Row({
  r,
  locked,
}: {
  r: {
    t: string;
    n: number;
    title?: string;
    label?: string;
    value?: string | number;
    unit?: string;
    step?: string;
    tone?: string;
    opts?: readonly string[];
    usd?: number;
    on?: ((v: never) => void) | boolean;
    toggle?: () => void;
    setUsd?: (v: number) => void;
  };
  locked: boolean;
}) {
  if (r.t === 'section') {
    return (
      <div className="cs-row cs-sec">
        <span className="cs-gut">{r.n}</span>
        <span className="cs-sec-band">{r.title}</span>
      </div>
    );
  }
  const gut = <span className="cs-gut">{r.n}</span>;
  const label = <span className="cs-lbl">{r.label}</span>;

  // A locked editable cell renders as a calc cell (the reviewer / role-gated view).
  const asLocked = (value: string, unit?: string) => (
    <div className="cs-row">
      {gut}
      {label}
      <span className="cs-val cs-lock">{value}</span>
      <span className="cs-unit">{unit || ''}</span>
    </div>
  );

  if (r.t === 'text') {
    if (locked) return asLocked(String(r.value ?? '—'));
    const on = r.on as (v: string) => void;
    return (
      <div className="cs-row">
        {gut}
        {label}
        <span className="cs-val cs-in-cell" style={{ gridColumn: '3 / span 2' }}>
          <input
            className="cs-in cs-in-text"
            value={String(r.value ?? '')}
            onChange={(e) => on(e.target.value)}
          />
        </span>
      </div>
    );
  }

  if (r.t === 'num' || r.t === 'rnum') {
    const numVal = r.value as number;
    if (locked)
      return asLocked(
        Number.isFinite(numVal) ? String(numVal) : '—',
        r.unit,
      );
    const on = r.on as (v: number) => void;
    return (
      <div className="cs-row">
        {gut}
        {label}
        <span className="cs-val cs-in-cell">
          <input
            className="cs-in cs-in-num"
            type="number"
            step={r.step}
            value={Number.isFinite(numVal) ? numVal : ''}
            onChange={(e) =>
              on(e.target.value === '' ? NaN : Number(e.target.value))
            }
          />
        </span>
        <span className="cs-unit">{r.unit}</span>
      </div>
    );
  }

  if (r.t === 'sel') {
    if (locked) return asLocked(String(r.value));
    const on = r.on as (v: string) => void;
    return (
      <div className="cs-row">
        {gut}
        {label}
        <span className="cs-val cs-in-cell" style={{ gridColumn: '3 / span 2' }}>
          <select
            className="cs-in cs-in-sel"
            value={String(r.value)}
            onChange={(e) => on(e.target.value)}
          >
            {r.opts?.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </span>
      </div>
    );
  }

  if (r.t === 'lic') {
    if (locked)
      return (
        <div className="cs-row">
          {gut}
          <span className="cs-lbl cs-lic-lbl">
            <span style={{ opacity: r.on ? 1 : 0.5 }}>
              {r.on ? '✓ ' : '— '}
              {r.label}
            </span>
          </span>
          <span className="cs-val cs-lock">{num(r.usd ?? 0)}</span>
          <span className="cs-unit">USD</span>
        </div>
      );
    return (
      <div className="cs-row">
        {gut}
        <span className="cs-lbl cs-lic-lbl">
          <input type="checkbox" checked={!!r.on} onChange={r.toggle} />
          <span style={{ opacity: r.on ? 1 : 0.5 }}>{r.label}</span>
        </span>
        <span className="cs-val cs-in-cell">
          <input
            className="cs-in cs-in-num"
            type="number"
            step="0.01"
            value={r.usd}
            onChange={(e) =>
              r.setUsd?.(e.target.value === '' ? NaN : Number(e.target.value))
            }
          />
        </span>
        <span className="cs-unit">USD</span>
      </div>
    );
  }

  // calc (locked)
  return (
    <div className="cs-row">
      {gut}
      {label}
      <span className={'cs-val cs-lock ' + (r.tone || '')}>{r.value}</span>
      <span className="cs-unit">{r.unit || ''}</span>
    </div>
  );
}

const css = `
.cs-root{
  --paper:#E8E9E3; --panel:#FBFBF8; --ink:#191C1F; --ink-2:#5C605C; --line:#CFD0C8;
  --grid:#E1E2DB; --teal:#0F5257; --amber:#B67A1E; --pos:#1E7A46; --neg:#A83227;
  --input:#1B4E8A; --lockbg:#F0F0EA; --secbg:#0F5257;
  --mono:ui-monospace,"SF Mono","Cascadia Code",Menlo,monospace;
  background:var(--paper); color:var(--ink); padding:16px; box-sizing:border-box;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; font-size:13px;
}
.cs-root *{box-sizing:border-box;}

.cs-bar{display:flex; justify-content:space-between; align-items:flex-end; gap:20px; flex-wrap:wrap; padding-bottom:12px; border-bottom:2px solid var(--ink); margin-bottom:12px;}
.cs-eyebrow{font-family:var(--mono); font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--teal); font-weight:600;}
.cs-title{font-size:20px; font-weight:700; margin-top:3px;} .cs-title span{font-weight:400; color:var(--ink-2); font-size:15px;}
.cs-bar-right{display:flex; flex-direction:column; gap:8px; align-items:flex-end;}
.cs-legend{display:flex; gap:16px; font-size:11.5px; color:var(--ink-2);}
.cs-legend span{display:flex; align-items:center; gap:6px;}
.cs-sw{width:13px; height:13px; border-radius:2px; display:inline-block; border:1px solid var(--line);}
.cs-sw-in{background:#fff; box-shadow:inset 0 0 0 2px #DCE6F2;}
.cs-sw-lock{background:var(--lockbg);}
.cs-headline{display:flex; gap:16px; font-size:13px; font-family:var(--mono);}
.cs-headline b{font-weight:700;}

.cs-sheet{border:1px solid var(--line); border-radius:4px 4px 0 0; overflow:hidden; background:#fff;}
.cs-colhead,.cs-row{display:grid; grid-template-columns:34px 320px 150px 110px; align-items:stretch;}
.cs-colhead{background:#EDEEE8; border-bottom:1px solid var(--line);}
.cs-colhead>span{padding:3px 8px; font-size:10.5px; font-weight:600; color:var(--ink-2); text-align:center; border-right:1px solid var(--grid); font-family:var(--mono);}
.cs-corner{background:#E1E2DB;}
.cs-rows{max-height:60vh; overflow:auto;}

.cs-row{border-bottom:1px solid var(--grid); min-height:30px;}
.cs-gut{background:#EDEEE8; border-right:1px solid var(--line); color:var(--ink-2); font-size:10.5px; font-family:var(--mono); display:flex; align-items:center; justify-content:center;}
.cs-lbl{display:flex; align-items:center; padding:4px 10px; border-right:1px solid var(--grid); color:var(--ink);}
.cs-lic-lbl{gap:8px;}
.cs-val{display:flex; align-items:center; border-right:1px solid var(--grid); font-family:var(--mono); justify-content:flex-end;}
.cs-in-cell{background:#fff; padding:0;}
.cs-unit{display:flex; align-items:center; padding:0 8px; font-size:10.5px; color:var(--ink-2); font-family:var(--mono);}

.cs-in{font:inherit; font-family:var(--mono); border:0; background:transparent; width:100%; height:100%; padding:5px 9px; color:var(--input); font-weight:600;}
.cs-in:focus{outline:2px solid var(--teal); outline-offset:-2px; background:#F7FAFC;}
.cs-in-text{text-align:left;} .cs-in-num{text-align:right;} .cs-in-sel{text-align:left; cursor:pointer; color:var(--input); font-weight:600;}
.cs-in-cell{box-shadow:inset 0 0 0 2px #DCE6F2;}

.cs-lock{background:var(--lockbg); color:var(--ink); padding:5px 9px; width:100%; justify-content:flex-end;}
.cs-lock.strong{font-weight:700;}
.cs-lock.emph{background:#FBF3E4; color:var(--amber); font-weight:700;}
.cs-lock.pos{color:var(--pos); font-weight:700;} .cs-lock.neg{color:var(--neg); font-weight:700;}

.cs-sec{grid-template-columns:34px 1fr;}
.cs-sec-band{background:var(--secbg); color:#fff; font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; font-weight:700; padding:5px 10px; display:flex; align-items:center;}

.cs-tabbar{display:flex; justify-content:space-between; align-items:center; background:#EDEEE8; border:1px solid var(--line); border-top:0; border-radius:0 0 4px 4px; padding:0 8px;}
.cs-tabs{display:flex;}
.cs-tab{font:inherit; font-size:11.5px; font-weight:600; letter-spacing:.06em; padding:8px 16px; border:0; background:transparent; color:var(--ink-2); cursor:pointer; border-right:1px solid var(--line); font-family:var(--mono);}
.cs-tab.on{background:#fff; color:var(--teal); box-shadow:inset 0 2px 0 var(--teal);}
.cs-csv{font:inherit; font-weight:600; font-size:12px; margin:6px 0; padding:7px 14px; background:var(--ink); color:var(--paper); border:0; border-radius:2px; cursor:pointer;}
.cs-csv:hover{background:var(--teal);}
.cs-csv:disabled{opacity:.45; cursor:not-allowed;}

@media (max-width:640px){
  .cs-colhead,.cs-row{grid-template-columns:28px 1fr 110px 66px;}
  .cs-colhead>span:nth-child(2){text-align:left;}
  .cs-headline{flex-wrap:wrap; gap:10px;}
}
`;
