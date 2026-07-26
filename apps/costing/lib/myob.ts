// Phase 3 seam (do NOT build now).
//
// After final approval, each approved costing will be PUT to the MYOB Acumatica
// contract-based REST API (/entity/Default/{version}/StockItem, plus the vendor
// and sales price worksheets). That call will be triggered from an n8n flow or
// a Supabase edge function, not from the browser. This is the clearly marked
// no-op where that integration will live so the shape is visible today.
//
// Australian English. No em dashes.

import type { CostingComputed } from '@launchpad/db';

export interface MyobPutResult {
  ok: boolean;
  detail: string;
}

// Intentionally does nothing yet. Phase 1 ships the CSV; Phase 3 replaces it.
export async function putStockItemToMyob(
  _row: CostingComputed,
): Promise<MyobPutResult> {
  // TODO Phase 3: authenticate against MYOB, PUT StockItem /
  // VendorPriceWorksheet / SalesPriceWorksheet from the contract mapping.
  return {
    ok: false,
    detail: 'MYOB REST integration is not built yet (Phase 3). Use the CSV.',
  };
}
