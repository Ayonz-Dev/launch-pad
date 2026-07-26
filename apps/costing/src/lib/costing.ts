export type ContainerConfig = "20 FT" | "40 FT" | "40FT High";
/**
 * FIW (Free Into Warehouse) — Ayonz bears the full landed + distribution cost.
 * FOB (Free On Board) — Ayonz's cost stops at the origin port: factory +
 * technology royalties/licences + fixed fees + overhead + buffer, but NOT ocean
 * freight, marine insurance, or local charges (duty, customs, biosecurity,
 * wharf, cartage, e-waste levy, distribution) — the customer bears those.
 */
export type CostingBasis = "FOB" | "FIW";
export type QuoteStatus =
  | "draft"
  | "ready_for_review"
  | "manager_approved"
  | "ceo_approved"
  | "ready_for_export";

export interface CostingInputs {
  sku: string;
  description: string;
  brand: string;
  customer: string;
  orderQuantity: number;
  factoryUnitUsd: number;
  fixedOrderFeesUsd: number;
  licenceCostUnitUsd: number;
  audPerUsd: number;
  dutyRate: number;
  containerConfig: ContainerConfig;
  unitsPerContainer: number;
  freightPerContainerAud: number;
  insuranceRate: number;
  customsClearanceAud: number;
  biosecurityAud: number;
  wharfRate: number;
  cartageAud: number;
  overheadRate: number;
  costingBasis: CostingBasis;
  costBufferRate: number;
  distributionCostUnitAud: number;
  ewasteFeeUnitAud: number;
  sellExGstAud: number;
  rrpIncGstAud: number;
  gstRate: number;
  rebateRate: number;
  coopMarketingRate: number;
  settlementDiscountRate: number;
  returnsAllowanceRate: number;
  warrantyRate: number;
  commissionRate: number;
  freightAllowanceUnitAud: number;
  minimumGpRate: number;
  minimumRetailerMarginRate: number;
  /** When false, licence royalties are excluded from FOB. */
  applyLicences?: boolean;
  /** When false, import duty is excluded from landing. */
  applyDuty?: boolean;
  /** When false, e-waste levy is excluded from landing. */
  applyEwaste?: boolean;
  // Optional metadata (drive resolution/display; not used directly in the maths).
  factoryCurrency?: string;
  licences?: string[];
  dutyCategory?: string;
  hsCode?: string;
  /** Canonical Monday/catalogue product UUID when selected from autocomplete. */
  catalogProductId?: string;
  agl?: string;
  factoryName?: string;
  /** Linked costing.customers row when chosen from the account list. */
  customerId?: string;
  /** Customer account / PO reference code. */
  customerReference?: string;
  /** Quote / offer due date (ISO yyyy-mm-dd). */
  dueDate?: string;
  /** Team that owns the customer / quote (for access scoping). */
  teamId?: string;
}

export interface CostingResult {
  containersRequired: number;
  factoryCostUnitAud: number;
  fobTotalAud: number;
  freightTotalAud: number;
  insuranceAud: number;
  cifTotalAud: number;
  dutyAud: number;
  landingChargesAud: number;
  distributionTotalAud: number;
  ewasteTotalAud: number;
  costBufferAud: number;
  landedCostUnitAud: number;
  fullyLoadedCostUnitAud: number;
  costingBasis: CostingBasis;
  tradeTermsUnitAud: number;
  netSalesUnitAud: number;
  grossProfitUnitAud: number;
  grossProfitRate: number;
  rrpExGstAud: number;
  retailerMarginRate: number;
  effectiveRetailerMarginRate: number;
  grossProfitOrderAud: number;
  passesGpGate: boolean;
  passesRetailerGate: boolean;
  warnings: string[];
}

const safeDivide = (numerator: number, denominator: number) =>
  denominator > 0 ? numerator / denominator : 0;

export function calculateCosting(input: CostingInputs): CostingResult {
  const quantity = Math.max(0, input.orderQuantity);
  const applyLicences = input.applyLicences !== false;
  const applyDuty = input.applyDuty !== false;
  const applyEwaste = input.applyEwaste !== false;
  const licenceCostUnitUsd = applyLicences ? input.licenceCostUnitUsd : 0;
  const variableUnitUsd = input.factoryUnitUsd + licenceCostUnitUsd;
  const totalFactoryUsd = variableUnitUsd * quantity + input.fixedOrderFeesUsd;
  const fobTotalAud = totalFactoryUsd * input.audPerUsd;
  const factoryCostUnitAud = safeDivide(fobTotalAud, quantity);
  const containersRequired = input.unitsPerContainer > 0
    ? Math.ceil(quantity / input.unitsPerContainer)
    : 0;

  // On an FOB sheet the customer bears freight, insurance and all local /
  // destination charges, so those are excluded from Ayonz's cost build.
  // Coalesce fields that may be absent from older stored quote snapshots.
  const isFob = (input.costingBasis ?? "FIW") === "FOB";
  const freightTotalAud = isFob ? 0 : containersRequired * input.freightPerContainerAud;
  const insuranceAud = isFob ? 0 : fobTotalAud * input.insuranceRate;
  const cifTotalAud = fobTotalAud + freightTotalAud + insuranceAud;
  const dutyAud = isFob || !applyDuty ? 0 : cifTotalAud * input.dutyRate;
  const distributionTotalAud = isFob ? 0 : (input.distributionCostUnitAud ?? 0) * quantity;
  const ewasteTotalAud = isFob || !applyEwaste ? 0 : (input.ewasteFeeUnitAud ?? 0) * quantity;
  const landingChargesAud = isFob
    ? 0
    : input.customsClearanceAud +
      input.biosecurityAud +
      cifTotalAud * input.wharfRate +
      input.cartageAud +
      distributionTotalAud +
      ewasteTotalAud;
  const landedTotalAud = cifTotalAud + dutyAud + landingChargesAud;
  const landedCostUnitAud = safeDivide(landedTotalAud, quantity);
  const overheadAppliedTotalAud = landedTotalAud * (1 + input.overheadRate);
  const costBufferAud = overheadAppliedTotalAud * (input.costBufferRate ?? 0);
  const fullyLoadedTotalAud = overheadAppliedTotalAud + costBufferAud;
  const fullyLoadedCostUnitAud = safeDivide(fullyLoadedTotalAud, quantity);

  const percentageTerms =
    input.rebateRate +
    input.coopMarketingRate +
    input.settlementDiscountRate +
    input.returnsAllowanceRate +
    input.warrantyRate +
    input.commissionRate;
  const tradeTermsUnitAud =
    input.sellExGstAud * percentageTerms + input.freightAllowanceUnitAud;
  const netSalesUnitAud = input.sellExGstAud - tradeTermsUnitAud;
  const grossProfitUnitAud = netSalesUnitAud - fullyLoadedCostUnitAud;
  const grossProfitRate = safeDivide(grossProfitUnitAud, netSalesUnitAud);
  const rrpExGstAud = safeDivide(input.rrpIncGstAud, 1 + input.gstRate);
  const retailerMarginRate = safeDivide(rrpExGstAud - input.sellExGstAud, rrpExGstAud);
  const effectiveRetailerMarginRate = safeDivide(rrpExGstAud - netSalesUnitAud, rrpExGstAud);

  const warnings: string[] = [];
  if (quantity <= 0) warnings.push("Order quantity must be greater than zero.");
  if (input.unitsPerContainer <= 0) warnings.push("Units per container is required.");
  if (netSalesUnitAud <= 0) warnings.push("Trading terms consume all invoice revenue.");
  if (grossProfitRate < input.minimumGpRate) warnings.push("Net GP is below the approval threshold.");
  if (retailerMarginRate < input.minimumRetailerMarginRate) warnings.push("Retailer margin is below target.");

  return {
    containersRequired,
    factoryCostUnitAud,
    fobTotalAud,
    freightTotalAud,
    insuranceAud,
    cifTotalAud,
    dutyAud,
    landingChargesAud,
    distributionTotalAud,
    ewasteTotalAud,
    costBufferAud,
    landedCostUnitAud,
    fullyLoadedCostUnitAud,
    costingBasis: input.costingBasis ?? "FIW",
    tradeTermsUnitAud,
    netSalesUnitAud,
    grossProfitUnitAud,
    grossProfitRate,
    rrpExGstAud,
    retailerMarginRate,
    effectiveRetailerMarginRate,
    grossProfitOrderAud: grossProfitUnitAud * quantity,
    passesGpGate: grossProfitRate >= input.minimumGpRate,
    passesRetailerGate: retailerMarginRate >= input.minimumRetailerMarginRate,
    warnings,
  };
}

/** Empty quote used when starting New costing. */
export const blankInputs: CostingInputs = {
  sku: "",
  description: "",
  brand: "",
  customer: "",
  orderQuantity: 0,
  factoryUnitUsd: 0,
  fixedOrderFeesUsd: 0,
  licenceCostUnitUsd: 0,
  audPerUsd: 1.54,
  dutyRate: 0,
  containerConfig: "20 FT",
  unitsPerContainer: 0,
  freightPerContainerAud: 0,
  insuranceRate: 0.005,
  customsClearanceAud: 0,
  biosecurityAud: 0,
  wharfRate: 0.015,
  cartageAud: 0,
  overheadRate: 0.1,
  costingBasis: "FIW",
  costBufferRate: 0,
  distributionCostUnitAud: 0,
  ewasteFeeUnitAud: 0,
  sellExGstAud: 0,
  rrpIncGstAud: 0,
  gstRate: 0.1,
  rebateRate: 0,
  coopMarketingRate: 0,
  settlementDiscountRate: 0,
  returnsAllowanceRate: 0,
  warrantyRate: 0,
  commissionRate: 0,
  freightAllowanceUnitAud: 0,
  minimumGpRate: 0.2,
  minimumRetailerMarginRate: 0.3,
  applyLicences: true,
  applyDuty: true,
  applyEwaste: false,
  licences: [],
  factoryCurrency: "USD",
  customerId: undefined,
  customerReference: "",
  dueDate: "",
  teamId: undefined,
  catalogProductId: undefined,
  agl: undefined,
  factoryName: undefined,
};

/** sessionStorage flag: clicking New costing clears the workspace even on /new. */
export const FORCE_NEW_COSTING_KEY = "ayonz.costing.forceNew";

export const sampleInputs: CostingInputs = {
  sku: "AGL4635",
  description: "Blaupunkt DVD Player",
  brand: "Blaupunkt",
  customer: "Demo retailer",
  orderQuantity: 500,
  factoryUnitUsd: 14.4,
  fixedOrderFeesUsd: 0,
  licenceCostUnitUsd: 0,
  audPerUsd: 1.54,
  dutyRate: 0,
  containerConfig: "20 FT",
  unitsPerContainer: 500,
  freightPerContainerAud: 3600,
  insuranceRate: 0.005,
  customsClearanceAud: 250,
  biosecurityAud: 100,
  wharfRate: 0.015,
  cartageAud: 150,
  overheadRate: 0.1,
  costingBasis: "FIW",
  costBufferRate: 0,
  distributionCostUnitAud: 0,
  ewasteFeeUnitAud: 0,
  sellExGstAud: 45,
  rrpIncGstAud: 79,
  gstRate: 0.1,
  rebateRate: 0.03,
  coopMarketingRate: 0.02,
  settlementDiscountRate: 0.025,
  returnsAllowanceRate: 0.01,
  warrantyRate: 0.01,
  commissionRate: 0,
  freightAllowanceUnitAud: 0,
  minimumGpRate: 0.2,
  minimumRetailerMarginRate: 0.3,
  applyLicences: true,
  applyDuty: true,
  applyEwaste: false,
  factoryCurrency: "USD",
  licences: ["sisvel"],
};
