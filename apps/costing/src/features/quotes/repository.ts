import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getActiveMembership } from "@/lib/supabase/queries";
import { generateQuoteNumber } from "@/lib/format";
import type { CostingInputs, CostingResult, QuoteStatus } from "@/lib/costing";

export interface QuoteRecord {
  id?: string;
  quoteNumber: string;
  status: QuoteStatus;
  inputs: CostingInputs;
  result: CostingResult;
}

export interface QuoteListItem {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  sku: string;
  customerName: string | null;
  teamId: string | null;
  fullyLoadedCost: number | null;
  netSellPrice: number | null;
  grossProfitRate: number | null;
  retailerMarginRate: number | null;
  netSalesOrderAud: number;
  hasRejection: boolean;
  updatedAt: string;
  isOwner: boolean;
}

export interface QuoteVersion {
  versionNumber: number;
  createdAt: string;
  createdBy: string;
}

export interface QuoteApproval {
  level: "manager" | "ceo";
  decision: "approved" | "rejected";
  notes: string | null;
  decidedAt: string;
  decidedByName: string;
}

export interface QuoteDetail {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  sku: string;
  customerName: string | null;
  teamId: string | null;
  customerId: string | null;
  inputs: CostingInputs;
  result: CostingResult;
  updatedAt: string;
  createdAt: string;
  isOwner: boolean;
  hasRejection: boolean;
  latestRejectionNotes: string | null;
  customerContactId: string | null;
  representativeContactId: string | null;
  versions: QuoteVersion[];
  approvals: QuoteApproval[];
}

const LOCAL_KEY = "ayonz-costing-drafts";

function derivedColumns(inputs: CostingInputs, result: CostingResult) {
  return {
    sku: inputs.sku,
    customer_name: inputs.customer,
    customer_id: inputs.customerId || null,
    team_id: inputs.teamId || null,
    input_snapshot: inputs,
    result_snapshot: result,
    fully_loaded_cost: result.fullyLoadedCostUnitAud,
    net_sell_price: result.netSalesUnitAud,
    gross_profit_rate: result.grossProfitRate,
    retailer_margin_rate: result.retailerMarginRate,
  };
}

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  return createClient();
}

async function requireUser() {
  const supabase = requireClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in before continuing.");
  return { supabase, user: data.user };
}

/** Save a brand-new quote (Supabase when configured, otherwise a browser draft). */
export async function saveQuote(quote: QuoteRecord): Promise<"supabase" | "browser"> {
  if (isSupabaseConfigured()) {
    const { supabase, user } = await requireUser();
    const membership = await getActiveMembership(supabase, user.id);
    if (!membership) throw new Error("No active organisation membership was found.");

    const { data: inserted, error } = await supabase
      .schema("costing")
      .from("quotes")
      .insert({
        organization_id: membership.organizationId,
        quote_number: quote.quoteNumber,
        status: quote.status,
        created_by: user.id,
        ...derivedColumns(quote.inputs, quote.result),
      })
      .select("id")
      .single();
    if (error) throw error;

    // Record the immutable first version. Non-fatal if it fails.
    await supabase.schema("costing").from("quote_versions").insert({
      quote_id: inserted.id,
      version_number: 1,
      input_snapshot: quote.inputs,
      result_snapshot: quote.result,
      created_by: user.id,
    });
    return "supabase";
  }

  const drafts = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as QuoteRecord[];
  drafts.unshift(quote);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(drafts.slice(0, 20)));
  return "browser";
}

/** Duplicate an existing quote as a fresh draft and return the new quote id. */
export async function duplicateQuote(quoteId: string): Promise<string> {
  const source = await getQuote(quoteId);
  if (!source) throw new Error("Quote not found.");
  const { supabase, user } = await requireUser();
  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) throw new Error("No active organisation membership was found.");

  const inputs = {
    ...source.inputs,
    customerId: source.customerId ?? source.inputs.customerId,
    teamId: source.teamId ?? source.inputs.teamId,
  };
  const { data: inserted, error } = await supabase
    .schema("costing")
    .from("quotes")
    .insert({
      organization_id: membership.organizationId,
      quote_number: generateQuoteNumber(),
      status: "draft",
      created_by: user.id,
      ...derivedColumns(inputs, source.result),
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabase.schema("costing").from("quote_versions").insert({
    quote_id: inserted.id,
    version_number: 1,
    input_snapshot: inputs,
    result_snapshot: source.result,
    created_by: user.id,
  });
  return inserted.id as string;
}

/** Save a revision of an existing quote as the next immutable version. */
export async function reviseQuote(
  quoteId: string,
  inputs: CostingInputs,
  result: CostingResult,
): Promise<void> {
  const { supabase, user } = await requireUser();

  const { data: latest } = await supabase
    .schema("costing")
    .from("quote_versions")
    .select("version_number")
    .eq("quote_id", quoteId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((latest?.version_number as number) ?? 0) + 1;

  const { error: versionError } = await supabase.schema("costing").from("quote_versions").insert({
    quote_id: quoteId,
    version_number: nextVersion,
    input_snapshot: inputs,
    result_snapshot: result,
    created_by: user.id,
  });
  if (versionError) throw versionError;

  const { error } = await supabase
    .schema("costing")
    .from("quotes")
    .update(derivedColumns(inputs, result))
    .eq("id", quoteId);
  if (error) throw error;
}

export async function listQuotes(): Promise<QuoteListItem[]> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .schema("costing")
    .from("quotes")
    .select(
      "id, quote_number, status, sku, customer_name, team_id, fully_loaded_cost, net_sell_price, gross_profit_rate, retailer_margin_rate, input_snapshot, result_snapshot, updated_at, created_by",
    )
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const ids = (data ?? []).map((row) => row.id as string);
  const rejected = new Set<string>();
  if (ids.length > 0) {
    const { data: approvals } = await supabase
      .schema("costing")
      .from("quote_approvals")
      .select("quote_id")
      .eq("decision", "rejected")
      .in("quote_id", ids);
    (approvals ?? []).forEach((row) => rejected.add(row.quote_id as string));
  }

  return (data ?? []).map((row) => {
    const input = row.input_snapshot as CostingInputs | null;
    const result = row.result_snapshot as CostingResult | null;
    const quantity = Number(input?.orderQuantity) || 0;
    return {
      id: row.id as string,
      quoteNumber: row.quote_number as string,
      status: row.status as QuoteStatus,
      sku: row.sku as string,
      customerName: (row.customer_name as string) ?? null,
      teamId: (row.team_id as string) ?? null,
      fullyLoadedCost: row.fully_loaded_cost as number | null,
      netSellPrice: row.net_sell_price as number | null,
      grossProfitRate: row.gross_profit_rate as number | null,
      retailerMarginRate: row.retailer_margin_rate as number | null,
      netSalesOrderAud: (Number(result?.netSalesUnitAud) || 0) * quantity,
      hasRejection: rejected.has(row.id as string),
      updatedAt: row.updated_at as string,
      isOwner: row.created_by === user.id,
    };
  });
}

export interface QuoteMetric {
  status: QuoteStatus;
  grossProfitRate: number | null;
  grossProfitOrderAud: number;
  netSalesOrderAud: number;
}

/** Lightweight per-quote figures for the dashboard, derived from stored snapshots. */
export async function listQuoteMetrics(): Promise<QuoteMetric[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .schema("costing")
    .from("quotes")
    .select("status, gross_profit_rate, input_snapshot, result_snapshot");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const input = row.input_snapshot as CostingInputs | null;
    const result = row.result_snapshot as CostingResult | null;
    const quantity = Number(input?.orderQuantity) || 0;
    return {
      status: row.status as QuoteStatus,
      grossProfitRate: row.gross_profit_rate as number | null,
      grossProfitOrderAud: Number(result?.grossProfitOrderAud) || 0,
      netSalesOrderAud: (Number(result?.netSalesUnitAud) || 0) * quantity,
    };
  });
}

export async function getQuote(quoteId: string): Promise<QuoteDetail | null> {
  const { supabase, user } = await requireUser();
  const { data: quote, error } = await supabase
    .schema("costing")
    .from("quotes")
    .select(
      "id, quote_number, status, sku, customer_name, customer_id, team_id, input_snapshot, result_snapshot, updated_at, created_at, created_by, customer_contact_id, representative_contact_id",
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw error;
  if (!quote) return null;

  const [{ data: versions }, { data: approvals }] = await Promise.all([
    supabase
      .schema("costing")
      .from("quote_versions")
      .select("version_number, created_at, created_by")
      .eq("quote_id", quoteId)
      .order("version_number", { ascending: false }),
    supabase
      .schema("costing")
      .from("quote_approvals")
      .select("approval_level, decision, notes, decided_at, decided_by")
      .eq("quote_id", quoteId)
      .order("decided_at", { ascending: false }),
  ]);

  // Resolve decision-maker display names in one query.
  const deciderIds = [...new Set((approvals ?? []).map((row) => row.decided_by as string))];
  const nameById = new Map<string, string>();
  if (deciderIds.length > 0) {
    const { data: profiles } = await supabase
      .schema("iam")
      .from("user_profiles")
      .select("user_id, display_name")
      .in("user_id", deciderIds);
    (profiles ?? []).forEach((row) => {
      if (row.display_name) nameById.set(row.user_id as string, row.display_name as string);
    });
  }

  const mappedApprovals = (approvals ?? []).map((row) => ({
    level: row.approval_level as "manager" | "ceo",
    decision: row.decision as "approved" | "rejected",
    notes: (row.notes as string) ?? null,
    decidedAt: row.decided_at as string,
    decidedByName: nameById.get(row.decided_by as string) ?? "Team member",
  }));
  const latestRejection = mappedApprovals.find((row) => row.decision === "rejected") ?? null;

  return {
    id: quote.id as string,
    quoteNumber: quote.quote_number as string,
    status: quote.status as QuoteStatus,
    sku: quote.sku as string,
    customerName: (quote.customer_name as string) ?? null,
    teamId: (quote.team_id as string) ?? null,
    customerId: (quote.customer_id as string) ?? null,
    inputs: quote.input_snapshot as CostingInputs,
    result: quote.result_snapshot as CostingResult,
    updatedAt: quote.updated_at as string,
    createdAt: quote.created_at as string,
    isOwner: quote.created_by === user.id,
    hasRejection: Boolean(latestRejection),
    latestRejectionNotes: latestRejection?.notes ?? null,
    customerContactId: (quote.customer_contact_id as string) ?? null,
    representativeContactId: (quote.representative_contact_id as string) ?? null,
    versions: (versions ?? []).map((row) => ({
      versionNumber: row.version_number as number,
      createdAt: row.created_at as string,
      createdBy: row.created_by as string,
    })),
    approvals: mappedApprovals,
  };
}

/** Persist the customer + representative contacts chosen for a quote's offer sheet. */
export async function setQuoteOfferContacts(
  quoteId: string,
  customerContactId: string | null,
  representativeContactId: string | null,
): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .schema("costing")
    .from("quotes")
    .update({
      customer_contact_id: customerContactId,
      representative_contact_id: representativeContactId,
    })
    .eq("id", quoteId);
  if (error) throw error;
}

/** Move a quote to the next status. The database trigger enforces legality. */
export async function transitionStatus(quoteId: string, nextStatus: QuoteStatus): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .schema("costing")
    .from("quotes")
    .update({ status: nextStatus })
    .eq("id", quoteId);
  if (error) throw error;
}

/**
 * Record a manager/CEO decision. On approval the status advances; a rejection is
 * logged for the owner to action (the schema only permits forward transitions,
 * so a rejected quote stays put until it is revised and resubmitted).
 */
export async function recordApproval(
  quoteId: string,
  level: "manager" | "ceo",
  decision: "approved" | "rejected",
  currentStatus: QuoteStatus,
  notes?: string,
): Promise<void> {
  const { supabase, user } = await requireUser();
  const { error: approvalError } = await supabase.schema("costing").from("quote_approvals").insert({
    quote_id: quoteId,
    approval_level: level,
    decision,
    notes: notes?.trim() ? notes.trim() : null,
    decided_by: user.id,
  });
  if (approvalError) throw approvalError;

  if (decision === "approved") {
    const next: QuoteStatus =
      level === "manager" ? "manager_approved" : currentStatus === "manager_approved" ? "ceo_approved" : currentStatus;
    if (next !== currentStatus) await transitionStatus(quoteId, next);
  } else {
    // Rejection sends the quote back to draft for the owner to revise.
    await transitionStatus(quoteId, "draft");
  }
}

/** Build a PO handoff CSV for finance from an approved quote. */
export function buildPurchaseOrderCsv(quote: QuoteDetail): string {
  const { inputs, result } = quote;
  const rows: string[][] = [
    ["quote_number", "sku", "customer", "quantity", "factory_unit_usd", "fully_loaded_unit_aud", "net_sell_unit_aud", "net_sales_order_aud", "gross_profit_rate", "status"],
    [
      quote.quoteNumber,
      quote.sku,
      quote.customerName ?? inputs.customer,
      String(inputs.orderQuantity),
      String(inputs.factoryUnitUsd),
      String(result.fullyLoadedCostUnitAud),
      String(result.netSalesUnitAud),
      String(result.grossProfitOrderAud ? result.netSalesUnitAud * inputs.orderQuantity : result.netSalesUnitAud * inputs.orderQuantity),
      String(result.grossProfitRate),
      quote.status,
    ],
  ];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function downloadPurchaseOrderCsv(quote: QuoteDetail): void {
  const csv = buildPurchaseOrderCsv(quote);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${quote.quoteNumber}-po.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
