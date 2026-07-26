"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState, PageHeader, RequireOrg, Workspace } from "@/components/PageShell";
import { useSession } from "@/components/SessionProvider";
import { listQuotes, type QuoteListItem } from "@/features/quotes/repository";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  formatMoney,
  formatPercent,
  formatDate,
  statusClass,
} from "@/lib/format";
import type { QuoteStatus } from "@/lib/costing";

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function QuotesPage() {
  return (
    <Workspace>
      <PageHeader
        eyebrow="QUOTES"
        title="Recent quotes"
        subtitle="Every costing saved to your workspace, newest first."
        actions={<Link className="button-link" href="/">＋ New costing</Link>}
      />
      <div className="page">
        <RequireOrg>
          <QuotesList />
        </RequireOrg>
      </div>
    </Workspace>
  );
}

function QuotesList() {
  const session = useSession();
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuoteStatus | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    listQuotes()
      .then((rows) => !cancelled && setQuotes(rows))
      .catch((cause) => !cancelled && setError(cause instanceof Error ? cause.message : "Could not load quotes."));
    return () => {
      cancelled = true;
    };
  }, [session.organizationId]);

  const visible = useMemo(() => {
    if (!quotes) return [];
    const term = search.trim().toLowerCase();
    return quotes.filter((quote) => {
      if (filter !== "all" && quote.status !== filter) return false;
      if (!term) return true;
      return (
        quote.quoteNumber.toLowerCase().includes(term) ||
        quote.sku.toLowerCase().includes(term) ||
        (quote.customerName ?? "").toLowerCase().includes(term)
      );
    });
  }, [quotes, filter, search]);

  function exportCsv() {
    const header = [
      "Quote",
      "SKU",
      "Customer",
      "Status",
      "Fully loaded (AUD)",
      "Net sell (AUD)",
      "GP %",
      "Retailer margin %",
      "Updated",
    ];
    const rows = visible.map((quote) => [
      quote.quoteNumber,
      quote.sku,
      quote.customerName ?? "",
      STATUS_LABEL[quote.status],
      quote.fullyLoadedCost ?? "",
      quote.netSellPrice ?? "",
      quote.grossProfitRate != null ? (quote.grossProfitRate * 100).toFixed(1) : "",
      quote.retailerMarginRate != null ? (quote.retailerMarginRate * 100).toFixed(1) : "",
      quote.updatedAt,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `quotes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return <EmptyState icon="⚠️" title="Could not load quotes">{error}</EmptyState>;
  }

  if (!quotes) {
    return <EmptyState icon="⏳" title="Loading quotes…" />;
  }

  return (
    <>
      <div className="toolbar">
        <div className="chips">
          <button className={filter === "all" ? "chip active" : "chip"} onClick={() => setFilter("all")}>
            All
          </button>
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              className={filter === status ? "chip active" : "chip"}
              onClick={() => setFilter(status)}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            className="search-input"
            placeholder="Search SKU, customer or quote #"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="secondary" onClick={exportCsv} disabled={visible.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Quote</th>
              <th>SKU</th>
              <th>Customer</th>
              <th>Status</th>
              <th className="num">Fully loaded</th>
              <th className="num">Net sell</th>
              <th className="num">GP</th>
              <th className="num">Updated</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className="row-empty" colSpan={8}>
                  {quotes.length === 0
                    ? "No quotes yet. Build one from the New costing workspace and save it."
                    : "No quotes match this filter."}
                </td>
              </tr>
            ) : (
              visible.map((quote) => (
                <tr key={quote.id} onClick={() => router.push(`/quotes/${quote.id}`)}>
                  <td className="strong">{quote.quoteNumber}</td>
                  <td>{quote.sku}</td>
                  <td>{quote.customerName ?? "—"}</td>
                  <td>
                    <span className={statusClass(quote.status)}>{STATUS_LABEL[quote.status]}</span>
                  </td>
                  <td className="num">{formatMoney(quote.fullyLoadedCost)}</td>
                  <td className="num">{formatMoney(quote.netSellPrice)}</td>
                  <td className="num">{formatPercent(quote.grossProfitRate)}</td>
                  <td className="num">{formatDate(quote.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
