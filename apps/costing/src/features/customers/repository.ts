import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getActiveMembership } from "@/lib/supabase/queries";
import type { CostingBasis, CostingInputs } from "@/lib/costing";

export type FreightModel = "container" | "distribution" | "wholesaler";

export const FREIGHT_MODEL_LABEL: Record<FreightModel, string> = {
  container: "Container-direct",
  distribution: "Store distribution",
  wholesaler: "Via wholesaler",
};

/** Customer trading programme — keys mirror CostingInputs so they prefill directly. */
export interface TradingTerms {
  rebateRate: number;
  coopMarketingRate: number;
  settlementDiscountRate: number;
  returnsAllowanceRate: number;
  warrantyRate: number;
  commissionRate: number;
  freightAllowanceUnitAud: number;
}

export const EMPTY_TRADING_TERMS: TradingTerms = {
  rebateRate: 0,
  coopMarketingRate: 0,
  settlementDiscountRate: 0,
  returnsAllowanceRate: 0,
  warrantyRate: 0,
  commissionRate: 0,
  freightAllowanceUnitAud: 0,
};

/** Account-level rate overrides that sit on top of the standard rate card. */
export interface AccountRates {
  freightModel: FreightModel;
  freightPerContainerAud: number; // 0 = use the rate-card standard
  distributionCostUnitAud: number;
  ewasteFeeUnitAud: number;
  costBufferRate: number;
  defaultCostingBasis: CostingBasis;
}

export const EMPTY_ACCOUNT_RATES: AccountRates = {
  freightModel: "container",
  freightPerContainerAud: 0,
  distributionCostUnitAud: 0,
  ewasteFeeUnitAud: 0,
  costBufferRate: 0,
  defaultCostingBasis: "FIW",
};

export interface CustomerRecord extends AccountRates {
  id: string;
  name: string;
  customerCode: string | null;
  contactName: string | null;
  contactEmail: string | null;
  paymentTerms: string | null;
  contactId: string | null;
  teamId: string | null;
  tradingTerms: TradingTerms;
}

export interface CustomerInput extends AccountRates {
  id?: string;
  name: string;
  customerCode: string;
  contactName: string;
  contactEmail: string;
  paymentTerms: string;
  contactId: string;
  teamId: string;
  tradingTerms: TradingTerms;
}

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  return createClient();
}

function normaliseTradingTerms(value: unknown): TradingTerms {
  const record = (value ?? {}) as Partial<TradingTerms>;
  return {
    rebateRate: Number(record.rebateRate) || 0,
    coopMarketingRate: Number(record.coopMarketingRate) || 0,
    settlementDiscountRate: Number(record.settlementDiscountRate) || 0,
    returnsAllowanceRate: Number(record.returnsAllowanceRate) || 0,
    warrantyRate: Number(record.warrantyRate) || 0,
    commissionRate: Number(record.commissionRate) || 0,
    freightAllowanceUnitAud: Number(record.freightAllowanceUnitAud) || 0,
  };
}

function mapRow(row: Record<string, unknown>): CustomerRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    customerCode: (row.customer_code as string) ?? null,
    contactName: (row.contact_name as string) ?? null,
    contactEmail: (row.contact_email as string) ?? null,
    paymentTerms: (row.payment_terms as string) ?? null,
    contactId: (row.contact_id as string) ?? null,
    teamId: (row.team_id as string) ?? null,
    tradingTerms: normaliseTradingTerms(row.trading_terms),
    freightModel: (row.freight_model as FreightModel) ?? "container",
    freightPerContainerAud: Number(row.freight_per_container_aud) || 0,
    distributionCostUnitAud: Number(row.distribution_cost_per_unit_aud) || 0,
    ewasteFeeUnitAud: Number(row.ewaste_fee_per_unit_aud) || 0,
    costBufferRate: Number(row.cost_buffer_rate) || 0,
    defaultCostingBasis: (row.default_costing_basis as CostingBasis) ?? "FIW",
  };
}

const CUSTOMER_COLUMNS =
  "id, name, customer_code, contact_name, contact_email, payment_terms, contact_id, team_id, trading_terms, " +
  "freight_model, freight_per_container_aud, distribution_cost_per_unit_aud, ewaste_fee_per_unit_aud, " +
  "cost_buffer_rate, default_costing_basis";

export async function listCustomers(): Promise<CustomerRecord[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .schema("costing")
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as unknown as Record<string, unknown>));
}

export async function saveCustomer(input: CustomerInput): Promise<string> {
  const supabase = requireClient();
  const payload = {
    name: input.name.trim(),
    customer_code: input.customerCode.trim() || null,
    contact_name: input.contactName.trim() || null,
    contact_email: input.contactEmail.trim() || null,
    payment_terms: input.paymentTerms.trim() || null,
    contact_id: input.contactId || null,
    team_id: input.teamId || null,
    trading_terms: input.tradingTerms,
    freight_model: input.freightModel,
    freight_per_container_aud: input.freightPerContainerAud > 0 ? input.freightPerContainerAud : null,
    distribution_cost_per_unit_aud: input.distributionCostUnitAud,
    ewaste_fee_per_unit_aud: input.ewasteFeeUnitAud,
    cost_buffer_rate: input.costBufferRate,
    default_costing_basis: input.defaultCostingBasis,
  };

  if (input.id) {
    const { error } = await supabase.schema("costing").from("customers").update(payload).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sign in before adding customers.");
  const membership = await getActiveMembership(supabase, userData.user.id);
  if (!membership) throw new Error("No active organisation membership was found.");

  const { data, error } = await supabase
    .schema("costing")
    .from("customers")
    .insert({ ...payload, organization_id: membership.organizationId, created_by: userData.user.id })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Find the address-book contact linked to a customer by name (for offer-sheet defaulting). */
export async function findCustomerContactByName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const supabase = requireClient();
  const { data, error } = await supabase
    .schema("costing")
    .from("customers")
    .select("contact_id")
    .eq("name", trimmed)
    .not("contact_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data?.contact_id as string) ?? null;
}

/** Map an already-loaded customer record into a CostingInputs prefill. */
export function customerToInputs(record: CustomerRecord): Partial<CostingInputs> & { customer: string } {
  const patch: Partial<CostingInputs> & { customer: string } = {
    customer: record.name,
    customerId: record.id,
    customerReference: record.customerCode ?? "",
    teamId: record.teamId ?? undefined,
    ...record.tradingTerms,
    costingBasis: record.defaultCostingBasis,
    costBufferRate: record.costBufferRate,
    ewasteFeeUnitAud: record.ewasteFeeUnitAud,
    // Distribution cost only applies to the store-distribution model.
    distributionCostUnitAud: record.freightModel === "distribution" ? record.distributionCostUnitAud : 0,
  };
  if (record.freightPerContainerAud > 0) patch.freightPerContainerAud = record.freightPerContainerAud;
  return patch;
}

/** Fetch a single customer as a CostingInputs prefill (used by the ?customer= link). */
export async function customerPrefill(customerId: string): Promise<Partial<CostingInputs> & { customer: string }> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .schema("costing")
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Customer not found.");
  return customerToInputs(mapRow(data as unknown as Record<string, unknown>));
}
