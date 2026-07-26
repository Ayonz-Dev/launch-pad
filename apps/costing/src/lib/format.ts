import type { QuoteStatus } from "@/lib/costing";

export const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

export const percent = new Intl.NumberFormat("en-AU", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : money.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : percent.format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

export const STATUS_ORDER: QuoteStatus[] = [
  "draft",
  "ready_for_review",
  "manager_approved",
  "ceo_approved",
  "ready_for_export",
];

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  ready_for_review: "Awaiting GM",
  manager_approved: "Awaiting CEO",
  ceo_approved: "CEO approved",
  ready_for_export: "Ready for PO",
};

export function statusClass(status: QuoteStatus): string {
  return `status status--${status}`;
}

export function generateQuoteNumber(): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `Q-${stamp}-${String(now.getTime()).slice(-5)}`;
}
