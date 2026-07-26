import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getActiveMembership } from "@/lib/supabase/queries";
import type { CostingBasis, CostingInputs } from "@/lib/costing";

export interface CurrencyRates {
  /** AUD per 1 USD — purchase orders are always USD, so forex is cost per US$. */
  audPerUsd: number;
  /** Currency applied to costings when this rate card is selected. */
  selectedCurrency?: string;
  /** ISO timestamp of last live spot pull (optional). */
  fxFetchedAt?: string | null;
  fxBase?: "USD";
}
export interface LogisticsRates {
  freightPerContainerAud: number;
  insuranceRate: number;
  dutyRate: number;
  wharfRate: number;
  customsClearanceAud: number;
  biosecurityAud: number;
  cartageAud: number;
  overheadRate: number;
  /** Default e-waste levy per unit (AUD); costing can toggle apply. */
  ewasteFeeUnitAud: number;
}
export interface LicenceRates {
  licenceCostUnitUsd: number;
}
/** Baseline customer trading programme applied to every new costing. */
export interface BaselineTerms {
  rebateRate: number;
  coopMarketingRate: number;
  settlementDiscountRate: number;
  returnsAllowanceRate: number;
  warrantyRate: number;
  commissionRate: number;
}
/** Approval floors (keys mirror CostingInputs). */
export interface Thresholds {
  minimumGpRate: number;
  minimumRetailerMarginRate: number;
}

export const EMPTY_TERMS: BaselineTerms = {
  rebateRate: 0.03,
  coopMarketingRate: 0.02,
  settlementDiscountRate: 0.025,
  returnsAllowanceRate: 0.01,
  warrantyRate: 0.01,
  commissionRate: 0,
};
export const EMPTY_THRESHOLDS: Thresholds = { minimumGpRate: 0.2, minimumRetailerMarginRate: 0.3 };

/** Reference tables (from the source workbook's RATES sheet). */
export interface CurrencyRate {
  code: string;
  /** AUD per 1 unit of this currency (engine rate). */
  rate: number;
  /** Last live spot AUD per unit (display only until applied). */
  spotRate?: number | null;
  /** Units of this currency per 1 USD at last spot pull. */
  spotUnitsPerUsd?: number | null;
  spotFetchedAt?: string | null;
}
export interface LicenceRate {
  key: string;
  name: string;
  /** Royalty per unit in USD. */
  rate: number;
}
export interface DutyCategory {
  name: string;
  rate: number;
  hsCodes: string;
}

export const DEFAULT_CURRENCIES: CurrencyRate[] = [
  { code: "USD", rate: 1.54 },
  { code: "CNY", rate: 0.21 },
  { code: "EUR", rate: 1.72 },
  { code: "GBP", rate: 1.98 },
  { code: "NZD", rate: 0.91 },
  { code: "HKD", rate: 0.2 },
  { code: "VND", rate: 0.062 },
  { code: "INR", rate: 0.018 },
];

/**
 * Workbook INPUTS lists these licences (Y/N) with “rates from RATES card”.
 * The spreadsheet has no royalty $ amounts — rates stay editable USD stubs until commercial rates are entered.
 */
export const DEFAULT_LICENCES: LicenceRate[] = [
  { key: "dolby", name: "Dolby", rate: 0 },
  { key: "mpegla", name: "MPEG LA", rate: 0 },
  { key: "sisvel", name: "Sisvel", rate: 0 },
  { key: "wifi", name: "WiFi", rate: 0 },
  { key: "hdmi", name: "HDMI", rate: 0 },
  { key: "bluetooth", name: "Bluetooth", rate: 0 },
];
export const DEFAULT_DUTY_CATEGORIES: DutyCategory[] = [
  { name: "General Merchandise", rate: 0.05, hsCodes: "Various" },
  { name: "Clothing & Textiles", rate: 0.1, hsCodes: "61xx, 62xx, 63xx" },
  { name: "Footwear", rate: 0.1, hsCodes: "64xx" },
  { name: "Electronics / ICT", rate: 0, hsCodes: "84xx, 85xx" },
  { name: "Food & Beverages", rate: 0, hsCodes: "02xx-21xx" },
  { name: "Toys & Games", rate: 0, hsCodes: "9503, 9506" },
  { name: "Furniture / Homewares", rate: 0.05, hsCodes: "9401-9406, 7013" },
  { name: "Custom (check broker)", rate: 0.05, hsCodes: "—" },
];

export const EMPTY_CURRENCY: CurrencyRates = {
  audPerUsd: 1.54,
  selectedCurrency: "USD",
  fxBase: "USD",
  fxFetchedAt: null,
};
export const EMPTY_LOGISTICS: LogisticsRates = {
  freightPerContainerAud: 3600,
  insuranceRate: 0.005,
  dutyRate: 0.05,
  wharfRate: 0.015,
  customsClearanceAud: 250,
  biosecurityAud: 100,
  cartageAud: 150,
  overheadRate: 0.1,
  ewasteFeeUnitAud: 0,
};
export const EMPTY_LICENCE: LicenceRates = { licenceCostUnitUsd: 0 };

export interface RateCardRecord {
  id: string;
  name: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  costingBasis: CostingBasis;
  currency: CurrencyRates;
  logistics: LogisticsRates;
  licence: LicenceRates;
  terms: BaselineTerms;
  thresholds: Thresholds;
  currencies: CurrencyRate[];
  licences: LicenceRate[];
  dutyCategories: DutyCategory[];
}

export interface RateCardInput {
  id?: string;
  name: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  costingBasis: CostingBasis;
  currency: CurrencyRates;
  logistics: LogisticsRates;
  licence: LicenceRates;
  terms: BaselineTerms;
  thresholds: Thresholds;
  currencies: CurrencyRate[];
  licences: LicenceRate[];
  dutyCategories: DutyCategory[];
}

export interface CustomerRateCardLink {
  id: string;
  customerId: string;
  rateCardId: string;
  isDefault: boolean;
}

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  return createClient();
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normCurrencies(value: unknown): CurrencyRate[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_CURRENCIES.map((row) => ({ ...row }));
  return value
    .map((row) => {
      const raw = obj(row);
      return {
        code: String(raw.code ?? "").toUpperCase(),
        rate: num(raw.rate),
        spotRate: raw.spotRate == null || raw.spotRate === "" ? null : num(raw.spotRate),
        spotUnitsPerUsd: raw.spotUnitsPerUsd == null || raw.spotUnitsPerUsd === "" ? null : num(raw.spotUnitsPerUsd),
        spotFetchedAt: raw.spotFetchedAt ? String(raw.spotFetchedAt) : null,
      };
    })
    .filter((row) => row.code);
}

/** Ensure workbook licence keys are always present (preserve existing rates). */
export function mergeDefaultLicences(value: unknown): LicenceRate[] {
  const existing = normLicences(value);
  const byKey = new Map(existing.map((row) => [row.key, row]));
  return DEFAULT_LICENCES.map((fallback) => {
    const hit = byKey.get(fallback.key);
    if (hit) return hit;
    const byName = existing.find((row) => row.name.toLowerCase() === fallback.name.toLowerCase());
    return byName ?? { ...fallback };
  }).concat(existing.filter((row) => !DEFAULT_LICENCES.some((d) => d.key === row.key)));
}

function normLicences(value: unknown): LicenceRate[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_LICENCES.map((row) => ({ ...row }));
  return value
    .map((row) => {
      const name = String(obj(row).name ?? "");
      return { key: String(obj(row).key ?? name).toLowerCase().replace(/\s+/g, "_"), name, rate: num(obj(row).rate) };
    })
    .filter((row) => row.name);
}
function normDutyCategories(value: unknown): DutyCategory[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_DUTY_CATEGORIES.map((row) => ({ ...row }));
  return value
    .map((row) => ({ name: String(obj(row).name ?? ""), rate: num(obj(row).rate), hsCodes: String(obj(row).hsCodes ?? "") }))
    .filter((row) => row.name);
}

function mapRow(row: Record<string, unknown>): RateCardRecord {
  const currency = (row.currency_rates ?? {}) as Partial<CurrencyRates>;
  const logistics = (row.logistics_rates ?? {}) as Partial<LogisticsRates>;
  const licence = (row.licence_rates ?? {}) as Partial<LicenceRates>;
  const terms = (row.trading_terms ?? {}) as Partial<BaselineTerms>;
  const thresholds = (row.thresholds ?? {}) as Partial<Thresholds>;
  const currencies = normCurrencies(obj(row.currency_rates).currencies);
  const usdRow = currencies.find((item) => item.code === "USD");
  const selectedRaw = String(currency.selectedCurrency ?? "USD").toUpperCase();
  const selectedCurrency = currencies.some((item) => item.code === selectedRaw) ? selectedRaw : "USD";
  const basisRaw = String(row.costing_basis ?? "FIW").toUpperCase();
  const costingBasis: CostingBasis = basisRaw === "FOB" ? "FOB" : "FIW";
  return {
    id: row.id as string,
    name: row.name as string,
    isActive: Boolean(row.is_active),
    effectiveFrom: row.effective_from as string,
    effectiveTo: (row.effective_to as string) ?? null,
    costingBasis,
    currency: {
      audPerUsd: num(currency.audPerUsd, usdRow?.rate ?? EMPTY_CURRENCY.audPerUsd),
      selectedCurrency,
      fxBase: "USD",
      fxFetchedAt: currency.fxFetchedAt ? String(currency.fxFetchedAt) : null,
    },
    logistics: {
      freightPerContainerAud: num(logistics.freightPerContainerAud),
      insuranceRate: num(logistics.insuranceRate),
      dutyRate: num(logistics.dutyRate),
      wharfRate: num(logistics.wharfRate),
      customsClearanceAud: num(logistics.customsClearanceAud),
      biosecurityAud: num(logistics.biosecurityAud),
      cartageAud: num(logistics.cartageAud),
      overheadRate: num(logistics.overheadRate),
      ewasteFeeUnitAud: num(logistics.ewasteFeeUnitAud),
    },
    licence: { licenceCostUnitUsd: num(licence.licenceCostUnitUsd) },
    terms: {
      rebateRate: num(terms.rebateRate),
      coopMarketingRate: num(terms.coopMarketingRate),
      settlementDiscountRate: num(terms.settlementDiscountRate),
      returnsAllowanceRate: num(terms.returnsAllowanceRate),
      warrantyRate: num(terms.warrantyRate),
      commissionRate: num(terms.commissionRate),
    },
    thresholds: {
      minimumGpRate: num(thresholds.minimumGpRate, EMPTY_THRESHOLDS.minimumGpRate),
      minimumRetailerMarginRate: num(thresholds.minimumRetailerMarginRate, EMPTY_THRESHOLDS.minimumRetailerMarginRate),
    },
    currencies,
    licences: mergeDefaultLicences(obj(row.licence_rates).licences),
    dutyCategories: normDutyCategories(obj(row.logistics_rates).dutyCategories),
  };
}

const RATE_CARD_COLUMNS =
  "id, name, is_active, effective_from, effective_to, costing_basis, currency_rates, logistics_rates, licence_rates, trading_terms, thresholds";

export async function listRateCards(): Promise<RateCardRecord[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .schema("costing")
    .from("rate_cards")
    .select(RATE_CARD_COLUMNS)
    .order("is_active", { ascending: false })
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function listCustomerRateCardLinks(customerId: string): Promise<CustomerRateCardLink[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .schema("costing")
    .from("customer_rate_cards")
    .select("id, customer_id, rate_card_id, is_default")
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    customerId: row.customer_id as string,
    rateCardId: row.rate_card_id as string,
    isDefault: Boolean(row.is_default),
  }));
}

/** Replace a customer's associated rate cards. `defaultRateCardId` must be in `rateCardIds` when set. */
export async function setCustomerRateCards(
  customerId: string,
  rateCardIds: string[],
  defaultRateCardId: string | null = null,
): Promise<void> {
  const supabase = requireClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sign in before updating customer rate cards.");
  const membership = await getActiveMembership(supabase, userData.user.id);
  if (!membership) throw new Error("No active organisation membership was found.");

  const uniqueIds = [...new Set(rateCardIds.filter(Boolean))];
  const defaultId =
    defaultRateCardId && uniqueIds.includes(defaultRateCardId) ? defaultRateCardId : uniqueIds[0] ?? null;

  const { error: deleteError } = await supabase
    .schema("costing")
    .from("customer_rate_cards")
    .delete()
    .eq("customer_id", customerId);
  if (deleteError) throw deleteError;

  if (uniqueIds.length === 0) return;

  const { error: insertError } = await supabase.schema("costing").from("customer_rate_cards").insert(
    uniqueIds.map((rateCardId) => ({
      organization_id: membership.organizationId,
      customer_id: customerId,
      rate_card_id: rateCardId,
      is_default: rateCardId === defaultId,
    })),
  );
  if (insertError) throw insertError;
}

export async function addCustomerRateCard(
  customerId: string,
  rateCardId: string,
  asDefault = false,
): Promise<void> {
  const links = await listCustomerRateCardLinks(customerId);
  const ids = [...new Set([...links.map((link) => link.rateCardId), rateCardId])];
  const defaultId = asDefault
    ? rateCardId
    : links.find((link) => link.isDefault)?.rateCardId ?? rateCardId;
  await setCustomerRateCards(customerId, ids, defaultId);
}

export async function removeCustomerRateCard(customerId: string, rateCardId: string): Promise<void> {
  const links = await listCustomerRateCardLinks(customerId);
  const remaining = links.filter((link) => link.rateCardId !== rateCardId);
  const defaultId = remaining.find((link) => link.isDefault)?.rateCardId ?? remaining[0]?.rateCardId ?? null;
  await setCustomerRateCards(
    customerId,
    remaining.map((link) => link.rateCardId),
    defaultId,
  );
}

export async function saveRateCard(input: RateCardInput): Promise<void> {
  const supabase = requireClient();
  const usd = input.currencies.find((row) => row.code === "USD");
  const audPerUsd = usd?.rate ?? input.currency.audPerUsd;
  const selectedRaw = String(input.currency.selectedCurrency ?? "USD").toUpperCase();
  const selectedCurrency = input.currencies.some((row) => row.code === selectedRaw) ? selectedRaw : "USD";
  const payload = {
    name: input.name.trim(),
    is_active: input.isActive,
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo ? input.effectiveTo : null,
    costing_basis: input.costingBasis === "FOB" ? "FOB" : "FIW",
    currency_rates: {
      audPerUsd,
      selectedCurrency,
      fxBase: "USD",
      fxFetchedAt: input.currency.fxFetchedAt ?? null,
      currencies: input.currencies,
    },
    logistics_rates: { ...input.logistics, dutyCategories: input.dutyCategories },
    licence_rates: {
      licenceCostUnitUsd: input.licence.licenceCostUnitUsd,
      licences: mergeDefaultLicences(input.licences),
    },
    trading_terms: input.terms,
    thresholds: input.thresholds,
  };

  if (input.id) {
    const { error } = await supabase.schema("costing").from("rate_cards").update(payload).eq("id", input.id);
    if (error) throw error;
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sign in before adding rate cards.");
  const membership = await getActiveMembership(supabase, userData.user.id);
  if (!membership) throw new Error("No active organisation membership was found.");

  const { error } = await supabase
    .schema("costing")
    .from("rate_cards")
    .insert({ ...payload, organization_id: membership.organizationId, created_by: userData.user.id });
  if (error) throw error;
}

export async function deleteRateCard(id: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.schema("costing").from("rate_cards").delete().eq("id", id);
  if (error) throw error;
}

/** Map an already-loaded rate card into a CostingInputs prefill. */
export function rateCardToInputs(record: RateCardRecord): Partial<CostingInputs> {
  const usdRate =
    record.currencies.find((row) => row.code === "USD")?.rate ?? record.currency.audPerUsd;
  const selected = (record.currency.selectedCurrency ?? "USD").toUpperCase();
  return {
    costingBasis: record.costingBasis,
    audPerUsd: usdRate,
    freightPerContainerAud: record.logistics.freightPerContainerAud,
    insuranceRate: record.logistics.insuranceRate,
    dutyRate: record.logistics.dutyRate,
    wharfRate: record.logistics.wharfRate,
    customsClearanceAud: record.logistics.customsClearanceAud,
    biosecurityAud: record.logistics.biosecurityAud,
    cartageAud: record.logistics.cartageAud,
    overheadRate: record.logistics.overheadRate,
    ewasteFeeUnitAud: record.logistics.ewasteFeeUnitAud,
    licenceCostUnitUsd: record.licence.licenceCostUnitUsd,
    rebateRate: record.terms.rebateRate,
    coopMarketingRate: record.terms.coopMarketingRate,
    settlementDiscountRate: record.terms.settlementDiscountRate,
    returnsAllowanceRate: record.terms.returnsAllowanceRate,
    warrantyRate: record.terms.warrantyRate,
    commissionRate: record.terms.commissionRate,
    minimumGpRate: record.thresholds.minimumGpRate,
    minimumRetailerMarginRate: record.thresholds.minimumRetailerMarginRate,
    // POs are always USD — factory amounts and FX stay on USD even if the card
    // tracks another selected currency for reference.
    factoryCurrency: selected,
    applyLicences: true,
    applyDuty: true,
    applyEwaste: (record.logistics.ewasteFeeUnitAud ?? 0) > 0,
  };
}

/** Fetch a rate card mapped into a CostingInputs prefill. */
export async function rateCardPrefill(id: string): Promise<Partial<CostingInputs>> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .schema("costing")
    .from("rate_cards")
    .select(RATE_CARD_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Rate card not found.");
  return rateCardToInputs(mapRow(data as Record<string, unknown>));
}

/** Baseline trading terms shaped for a customer programme (adds freight allowance = 0). */
export function rateCardTermsForCustomer(record: RateCardRecord) {
  return {
    rebateRate: record.terms.rebateRate,
    coopMarketingRate: record.terms.coopMarketingRate,
    settlementDiscountRate: record.terms.settlementDiscountRate,
    returnsAllowanceRate: record.terms.returnsAllowanceRate,
    warrantyRate: record.terms.warrantyRate,
    commissionRate: record.terms.commissionRate,
    freightAllowanceUnitAud: 0,
  };
}
