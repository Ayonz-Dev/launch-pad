// MYOB Acumatica CSV builder.
//
// Phase 1 (now): a single approved costing becomes one CSV row. The builder
// already takes an ARRAY so Phase 2 (batch export of many approved costings
// into one multi-line CSV) is a caller change, not a rewrite. Phase 3 replaces
// the CSV entirely with contract-based REST PUTs to MYOB; a marked no-op for
// that lives in lib/myob.ts.
//
// Every value comes from costing_computed (the read-only view), never from a
// client calculation. Australian English. No em dashes.

import type { CostingComputed } from '@launchpad/db';

// Column order maps to the EXPORT tab, targeting StockItem /
// VendorPriceWorksheet / SalesPriceWorksheet fields in MYOB.
const COLUMNS: { header: string; value: (r: CostingComputed) => string }[] = [
  { header: 'InventoryID', value: (r) => r.sku },
  { header: 'Description', value: (r) => r.description ?? '' },
  { header: 'Brand', value: (r) => r.brand ?? '' },
  { header: 'Vendor', value: (r) => r.vendor ?? '' },
  { header: 'FOB_USD', value: (r) => fixed(r.fob_usd, 2) },
  { header: 'FX', value: (r) => fixed(r.fx, 4) },
  { header: 'Container', value: (r) => r.container_config },
  { header: 'Royalty_USD', value: (r) => fixed(r.royalty_usd, 2) },
  { header: 'Landed_AUD', value: (r) => fixed(r.landed_aud, 2) },
  { header: 'Loaded_AUD', value: (r) => fixed(r.loaded_aud, 2) },
  { header: 'Sell_Ex', value: (r) => fixed(r.sell_ex_gst, 2) },
  { header: 'RRP_Ex', value: (r) => fixed(r.rrp_ex_gst, 2) },
  { header: 'RRP_Inc', value: (r) => fixed(r.rrp_inc_gst, 2) },
  { header: 'GP_Pct', value: (r) => fixed(r.gp_pct * 100, 1) },
];

function fixed(n: number, d: number): string {
  return isFinite(n) ? Number(n).toFixed(d) : '';
}

function esc(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

// Build a MYOB CSV from one or more computed rows. Header line plus one line per
// row. Passing a single row (Phase 1) yields a two-line file.
export function buildMyobCsv(rows: CostingComputed[]): string {
  const header = COLUMNS.map((c) => esc(c.header)).join(',');
  const body = rows
    .map((r) => COLUMNS.map((c) => esc(c.value(r))).join(','))
    .join('\n');
  return header + '\n' + body + '\n';
}

// Trigger a browser download of the CSV. Client-only helper.
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
