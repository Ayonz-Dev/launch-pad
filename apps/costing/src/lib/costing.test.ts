import assert from "node:assert/strict";
import test from "node:test";
import { calculateCosting, sampleInputs } from "./costing";

const approx = (actual: number, expected: number, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${actual} ≈ ${expected}`);

test("calculates the workbook sample from factory to retailer", () => {
  const result = calculateCosting(sampleInputs);
  assert.equal(result.containersRequired, 1);
  assert.equal(result.factoryCostUnitAud, 22.176);
  assert.ok(result.landedCostUnitAud > result.factoryCostUnitAud);
  assert.ok(result.fullyLoadedCostUnitAud > result.landedCostUnitAud);
  assert.equal(result.rrpExGstAud, 79 / 1.1);
  assert.ok(result.tradeTermsUnitAud > 0);
});

test("rounds physical container requirements up", () => {
  const result = calculateCosting({ ...sampleInputs, orderQuantity: 501 });
  assert.equal(result.containersRequired, 2);
});

test("returns warnings instead of invalid divisions", () => {
  const result = calculateCosting({ ...sampleInputs, orderQuantity: 0, unitsPerContainer: 0 });
  assert.equal(result.landedCostUnitAud, 0);
  assert.equal(result.grossProfitOrderAud, 0);
  assert.ok(result.warnings.length >= 2);
});

test("builds FOB from variable units, licences and fixed fees", () => {
  const result = calculateCosting({ ...sampleInputs, licenceCostUnitUsd: 1, fixedOrderFeesUsd: 200 });
  // (14.4 + 1) * 500 + 200 = 7900 USD; × 1.54 = 12166 AUD
  approx(result.fobTotalAud, 12166);
  approx(result.factoryCostUnitAud, 12166 / 500);
});

test("insurance, CIF and duty follow the landed-cost chain", () => {
  const result = calculateCosting({ ...sampleInputs, dutyRate: 0.05 });
  const cif = 11088 + 3600 + 55.44;
  approx(result.insuranceAud, 11088 * 0.005);
  approx(result.cifTotalAud, cif);
  approx(result.dutyAud, cif * 0.05);
});

test("applies internal overhead on top of landed cost", () => {
  const result = calculateCosting(sampleInputs);
  approx(result.fullyLoadedCostUnitAud, result.landedCostUnitAud * 1.1);
});

test("derives trade terms, net sales and gross profit", () => {
  const result = calculateCosting(sampleInputs);
  approx(result.tradeTermsUnitAud, 45 * 0.095);
  approx(result.netSalesUnitAud, 45 - 45 * 0.095);
  approx(result.grossProfitUnitAud, result.netSalesUnitAud - result.fullyLoadedCostUnitAud);
  approx(result.grossProfitRate, result.grossProfitUnitAud / result.netSalesUnitAud);
  approx(result.grossProfitOrderAud, result.grossProfitUnitAud * 500);
});

test("computes retailer margins from RRP ex GST", () => {
  const result = calculateCosting(sampleInputs);
  const rrpEx = 79 / 1.1;
  approx(result.rrpExGstAud, rrpEx);
  approx(result.retailerMarginRate, (rrpEx - 45) / rrpEx);
  approx(result.effectiveRetailerMarginRate, (rrpEx - result.netSalesUnitAud) / rrpEx);
});

test("flags GP below the approval threshold", () => {
  const result = calculateCosting(sampleInputs); // ~16.5% GP < 20% minimum
  assert.equal(result.passesGpGate, false);
  assert.ok(result.warnings.some((warning) => /GP/i.test(warning)));
});

test("passes the GP gate when margins are healthy", () => {
  const result = calculateCosting({ ...sampleInputs, sellExGstAud: 55, minimumGpRate: 0.1 });
  assert.equal(result.passesGpGate, true);
  assert.ok(!result.warnings.some((warning) => /below the approval/i.test(warning)));
});

test("warns when trading terms consume all revenue", () => {
  const result = calculateCosting({ ...sampleInputs, rebateRate: 0.7, coopMarketingRate: 0.4 });
  assert.ok(result.netSalesUnitAud <= 0);
  assert.ok(result.warnings.some((warning) => /revenue/i.test(warning)));
});

test("flags retailer margin below target", () => {
  const result = calculateCosting({ ...sampleInputs, rrpIncGstAud: 50 });
  // rrp ex GST = 45.45; margin ≈ 1% < 30% minimum
  assert.equal(result.passesRetailerGate, false);
  assert.ok(result.warnings.some((warning) => /retailer margin/i.test(warning)));
});

test("clamps negative order quantity to zero", () => {
  const result = calculateCosting({ ...sampleInputs, orderQuantity: -100 });
  assert.equal(result.containersRequired, 0);
  assert.equal(result.factoryCostUnitAud, 0);
  assert.ok(result.warnings.some((warning) => /greater than zero/i.test(warning)));
});

test("zero units-per-container yields no containers, no freight, and a warning", () => {
  const result = calculateCosting({ ...sampleInputs, unitsPerContainer: 0 });
  assert.equal(result.containersRequired, 0);
  assert.equal(result.freightTotalAud, 0);
  assert.ok(result.warnings.some((warning) => /container/i.test(warning)));
});

test("FOB basis excludes freight, insurance, duty and local charges", () => {
  const fiw = calculateCosting({ ...sampleInputs, dutyRate: 0.05 });
  const fob = calculateCosting({ ...sampleInputs, dutyRate: 0.05, costingBasis: "FOB" });
  approx(fob.freightTotalAud, 0);
  approx(fob.insuranceAud, 0);
  approx(fob.dutyAud, 0);
  approx(fob.landingChargesAud, 0);
  // FOB landed cost is just the FOB value (factory + licences + fees).
  approx(fob.landedCostUnitAud, fob.factoryCostUnitAud);
  assert.ok(fob.fullyLoadedCostUnitAud < fiw.fullyLoadedCostUnitAud);
});

test("cost buffer uplifts the fully-loaded cost", () => {
  const base = calculateCosting(sampleInputs);
  const buffered = calculateCosting({ ...sampleInputs, costBufferRate: 0.1 });
  approx(buffered.fullyLoadedCostUnitAud, base.fullyLoadedCostUnitAud * 1.1);
  approx(buffered.costBufferAud, base.fullyLoadedCostUnitAud * sampleInputs.orderQuantity * 0.1, 1e-3);
});

test("distribution and e-waste add per-unit local charges under FIW only", () => {
  const base = calculateCosting(sampleInputs);
  const withLocal = calculateCosting({
    ...sampleInputs,
    distributionCostUnitAud: 2,
    ewasteFeeUnitAud: 1,
    applyEwaste: true,
  });
  approx(withLocal.distributionTotalAud, 2 * sampleInputs.orderQuantity);
  approx(withLocal.ewasteTotalAud, 1 * sampleInputs.orderQuantity);
  approx(withLocal.landingChargesAud, base.landingChargesAud + 3 * sampleInputs.orderQuantity);

  const fob = calculateCosting({
    ...sampleInputs,
    distributionCostUnitAud: 2,
    ewasteFeeUnitAud: 1,
    applyEwaste: true,
    costingBasis: "FOB",
  });
  approx(fob.distributionTotalAud, 0);
  approx(fob.ewasteTotalAud, 0);
});

test("licence and duty checkboxes can exclude royalties and duty", () => {
  const withLicence = calculateCosting({ ...sampleInputs, licenceCostUnitUsd: 2, applyLicences: true });
  const withoutLicence = calculateCosting({ ...sampleInputs, licenceCostUnitUsd: 2, applyLicences: false });
  assert.ok(withLicence.fobTotalAud > withoutLicence.fobTotalAud);

  const withDuty = calculateCosting({ ...sampleInputs, dutyRate: 0.05, applyDuty: true });
  const withoutDuty = calculateCosting({ ...sampleInputs, dutyRate: 0.05, applyDuty: false });
  approx(withoutDuty.dutyAud, 0);
  assert.ok(withDuty.dutyAud > 0);
});
