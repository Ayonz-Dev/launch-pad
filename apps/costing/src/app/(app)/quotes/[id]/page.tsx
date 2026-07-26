"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { EmptyState, PageHeader, RequireOrg, Workspace } from "@/components/PageShell";
import { useSession } from "@/components/SessionProvider";
import { useAccessPersona } from "@/components/AccessPersonaProvider";
import {
  downloadPurchaseOrderCsv,
  duplicateQuote,
  getQuote,
  recordApproval,
  transitionStatus,
  type QuoteDetail,
} from "@/features/quotes/repository";
import { downloadFactoryPurchaseOrder } from "@/features/quotes/purchaseOrderExcel";
import { quoteVisibleToPersona } from "@/lib/accessPersona";
import { STATUS_LABEL, formatDate, formatMoney, formatPercent, statusClass } from "@/lib/format";

export default function QuoteDetailPage() {
  return (
    <Workspace>
      <RequireOrg>
        <QuoteDetailView />
      </RequireOrg>
    </Workspace>
  );
}

function QuoteDetailView() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const access = useAccessPersona();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error" | "denied">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await getQuote(params.id);
      if (!detail) {
        setStatus("missing");
        return;
      }
      const visible = quoteVisibleToPersona(
        { status: detail.status, teamId: detail.teamId, hasRejection: detail.hasRejection },
        access.persona,
        access.teamId,
      );
      if (!visible) {
        setStatus("denied");
        return;
      }
      setQuote(detail);
      setStatus("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this quote.");
      setStatus("error");
    }
  }, [params.id, access.persona, access.teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <EmptyState icon="⏳" title="Loading quote…" />;
  if (status === "denied")
    return (
      <EmptyState
        icon="🔒"
        title="Not visible in this persona"
        action={<Link className="button-link" href="/quotes">Back to quotes</Link>}
      >
        Switch View as / Team in the sidebar to open this quote.
      </EmptyState>
    );
  if (status === "missing")
    return (
      <EmptyState
        icon="🔍"
        title="Quote not found"
        action={<Link className="button-link" href="/quotes">Back to quotes</Link>}
      >
        It may have been removed, or you may not have access to it.
      </EmptyState>
    );
  if (status === "error" || !quote)
    return <EmptyState icon="⚠️" title="Could not load this quote">{error}</EmptyState>;

  const { inputs, result } = quote;
  const freightUnit = inputs.orderQuantity > 0 ? result.freightTotalAud / inputs.orderQuantity : 0;
  const bridge: Array<[string, number, boolean?]> = [
    ["Factory cost", result.factoryCostUnitAud],
    ["Ocean freight", freightUnit],
    ["Insurance, duty & landing", result.landedCostUnitAud - result.factoryCostUnitAud - freightUnit],
    ["Internal overhead", result.fullyLoadedCostUnitAud - result.landedCostUnitAud],
    ["Fully loaded cost", result.fullyLoadedCostUnitAud, true],
    ["Customer trading terms", -result.tradeTermsUnitAud],
    ["Net gross profit", result.grossProfitUnitAud, true],
  ];

  const canSubmit = access.can("submit_review");
  const canGm = access.can("approve_gm");
  const canCeo = access.can("approve_ceo");
  const canFinance = access.can("finance_export");
  const canRevise = quote.isOwner || access.can("edit_any_quote") || session.can("quotes.update_all");

  function reject(level: "manager" | "ceo") {
    const notes = window.prompt("Add a note for the quote owner (optional):") ?? undefined;
    void run(() => recordApproval(quote!.id, level, "rejected", quote!.status, notes));
  }

  async function duplicate() {
    setBusy(true);
    setError(null);
    try {
      const newId = await duplicateQuote(quote!.id);
      router.push(`/quotes/${newId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not duplicate this quote.");
      setBusy(false);
    }
  }

  async function generateFactoryPo() {
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      const salesManagerName =
        session.userEmail?.split("@")[0]?.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? null;
      await downloadFactoryPurchaseOrder(quote, { salesManagerName });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate the factory PO.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="QUOTE"
        title={
          <>
            {quote.quoteNumber} <span className={statusClass(quote.status)}>{STATUS_LABEL[quote.status]}</span>
          </>
        }
        subtitle={`${quote.sku}${quote.customerName ? ` · ${quote.customerName}` : ""} · updated ${formatDate(quote.updatedAt)}`}
        actions={
          <>
            <Link className="button-link secondary" href="/quotes">← All quotes</Link>
            <Link className="button-link" href={`/quotes/${quote.id}/offer`}>Offer sheet</Link>
            <button className="secondary" disabled={busy} onClick={duplicate}>Duplicate</button>
            {canRevise && (
              <Link className="button-link" href={`/?quote=${quote.id}`}>Revise</Link>
            )}
          </>
        }
      />

      <div className="page">
        {error && <EmptyState icon="⚠️" title="Action failed">{error}</EmptyState>}

        {quote.status === "draft" && quote.hasRejection && (
          <div className="attention-banner">
            <b>Requires attention</b>
            <span>{quote.latestRejectionNotes || "Changes were requested on the previous submission."}</span>
          </div>
        )}

        <section className="scoreboard" style={{ padding: "0 0 20px" }}>
          <Metric label="Fully loaded cost" value={formatMoney(result.fullyLoadedCostUnitAud)} detail="per unit" />
          <Metric label="Net sell price" value={formatMoney(result.netSalesUnitAud)} detail={`${formatMoney(result.tradeTermsUnitAud)} in terms`} />
          <Metric label="Net gross profit" value={formatPercent(result.grossProfitRate)} tone={result.passesGpGate ? "good" : "warn"} detail={`${formatMoney(result.grossProfitUnitAud)} per unit`} />
          <Metric label="Retailer margin" value={formatPercent(result.retailerMarginRate)} tone={result.passesRetailerGate ? "good" : "warn"} detail={`${formatMoney(result.rrpExGstAud)} RRP ex GST`} />
        </section>

        <div className="grid-2">
          <div className="stack">
            <div className="panel">
              <h3 className="with-border">Cost bridge</h3>
              {bridge.map(([label, value, total]) => (
                <div key={label} className="kv">
                  <span style={total ? { fontWeight: 700, color: "var(--ink)" } : undefined}>{label}</span>
                  <b>{formatMoney(value)}</b>
                </div>
              ))}
            </div>

            <div className="panel">
              <h3 className="with-border">Order economics</h3>
              <div className="kv"><span>Order quantity</span><b>{inputs.orderQuantity.toLocaleString("en-AU")} units</b></div>
              <div className="kv"><span>Containers required</span><b>{result.containersRequired}</b></div>
              <div className="kv"><span>Sell price ex GST</span><b>{formatMoney(inputs.sellExGstAud)}</b></div>
              <div className="kv"><span>Gross profit (order)</span><b>{formatMoney(result.grossProfitOrderAud)}</b></div>
              <div className="kv"><span>RRP inc GST</span><b>{formatMoney(inputs.rrpIncGstAud)}</b></div>
            </div>
          </div>

          <div className="stack">
            <div className="panel">
              <h3 className="with-border">Workflow</h3>
              <div className="kv"><span>Net GP threshold</span><b>{result.passesGpGate ? "✓ Pass" : "⚠ Below"}</b></div>
              <div className="kv"><span>Retailer margin target</span><b>{result.passesRetailerGate ? "✓ Pass" : "⚠ Below"}</b></div>
              <div className="kv"><span>Viewing as</span><b>{access.personaLabel}</b></div>

              <div className="action-bar">
                {quote.status === "draft" && canSubmit && (
                  <button className="button-sm" disabled={busy} onClick={() => run(() => transitionStatus(quote.id, "ready_for_review"))}>
                    Submit to General Manager
                  </button>
                )}
                {quote.status === "ready_for_review" && canGm && (
                  <>
                    <button className="button-sm" disabled={busy} onClick={() => run(() => recordApproval(quote.id, "manager", "approved", quote.status))}>
                      Send to CEO
                    </button>
                    <button className="button-sm secondary" disabled={busy} onClick={() => reject("manager")}>
                      Request changes
                    </button>
                  </>
                )}
                {quote.status === "manager_approved" && canCeo && (
                  <>
                    <button className="button-sm" disabled={busy} onClick={() => run(() => recordApproval(quote.id, "ceo", "approved", quote.status))}>
                      Approve (CEO)
                    </button>
                    <button className="button-sm secondary" disabled={busy} onClick={() => reject("ceo")}>
                      Reject with notes
                    </button>
                  </>
                )}
                {quote.status === "ceo_approved" && canFinance && (
                  <>
                    <button className="button-sm" disabled={busy} onClick={() => run(() => transitionStatus(quote.id, "ready_for_export"))}>
                      Mark ready for PO
                    </button>
                    <button className="button-sm" disabled={busy} onClick={() => void generateFactoryPo()}>
                      Generate factory PO
                    </button>
                    <button className="button-sm secondary" disabled={busy} onClick={() => downloadPurchaseOrderCsv(quote)}>
                      Download PO CSV
                    </button>
                  </>
                )}
                {quote.status === "ready_for_export" && canFinance && (
                  <>
                    <button className="button-sm" disabled={busy} onClick={() => void generateFactoryPo()}>
                      Generate factory PO
                    </button>
                    <button className="button-sm secondary" disabled={busy} onClick={() => downloadPurchaseOrderCsv(quote)}>
                      Download PO CSV
                    </button>
                  </>
                )}
                {quote.status === "ready_for_export" && !canFinance && (
                  <span className="inline-note">Approved and ready for finance PO export.</span>
                )}
              </div>
              {quote.status === "draft" && !canSubmit && (
                <p className="inline-note">Only a Team Leader can submit this quote to the General Manager.</p>
              )}
              {quote.status === "ready_for_review" && !canGm && (
                <p className="inline-note">Waiting on the General Manager.</p>
              )}
              {quote.status === "manager_approved" && !canCeo && (
                <p className="inline-note">Waiting on final CEO approval.</p>
              )}
              {quote.status === "ceo_approved" && !canFinance && (
                <p className="inline-note">Waiting on Finance to convert to a purchase order.</p>
              )}
            </div>

            <div className="panel">
              <h3 className="with-border">Approvals</h3>
              {quote.approvals.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>No decisions recorded yet.</p>
              ) : (
                <ul className="timeline">
                  {quote.approvals.map((approval, index) => (
                    <li key={index} className={approval.decision === "rejected" ? "reject" : undefined}>
                      <b>
                        {approval.level === "manager" ? "General Manager" : "CEO"}{" "}
                        {approval.decision === "approved" ? "approved" : "requested changes"}
                      </b>
                      <small>
                        {approval.decidedByName} · {formatDate(approval.decidedAt)}
                      </small>
                      {approval.notes && <p>{approval.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="panel">
              <h3 className="with-border">Version history</h3>
              {quote.versions.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>No versions recorded.</p>
              ) : (
                <ul className="timeline">
                  {quote.versions.map((version) => (
                    <li key={version.versionNumber}>
                      <b>Version {version.versionNumber}</b>
                      <small>{formatDate(version.createdAt)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, tone, detail }: { label: string; value: string; tone?: "good" | "warn"; detail?: string }) {
  return (
    <article className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}
