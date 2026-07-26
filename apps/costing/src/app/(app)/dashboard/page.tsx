"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState, PageHeader, RequireOrg, Workspace } from "@/components/PageShell";
import { useSession } from "@/components/SessionProvider";
import { useAccessPersona } from "@/components/AccessPersonaProvider";
import { listQuotes, type QuoteListItem } from "@/features/quotes/repository";
import {
  QUEUE_HINT,
  QUEUE_LABEL,
  QUEUE_ORDER,
  quoteQueueKey,
  quoteVisibleToPersona,
  type QuoteQueueKey,
} from "@/lib/accessPersona";
import { STATUS_LABEL, formatDate, formatMoney, statusClass } from "@/lib/format";

export default function DashboardPage() {
  return (
    <Workspace>
      <PageHeader
        eyebrow="OVERVIEW"
        title="Costing dashboard"
        subtitle="Quotes by approval stage — Draft → GM → CEO → Finance / PO."
        actions={<Link className="button-link" href="/">＋ New costing</Link>}
      />
      <div className="page">
        <RequireOrg>
          <DashboardView />
        </RequireOrg>
      </div>
    </Workspace>
  );
}

function DashboardView() {
  const session = useSession();
  const access = useAccessPersona();
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listQuotes()
      .then((rows) => {
        if (!cancelled) setQuotes(rows);
      })
      .catch((cause) => {
        if (cancelled) return;
        const message =
          cause instanceof Error
            ? cause.message
            : typeof cause === "object" && cause && "message" in cause
              ? String((cause as { message: unknown }).message)
              : "Could not load the dashboard.";
        setError(message || "Could not load the dashboard.");
      });
    return () => {
      cancelled = true;
    };
  }, [session.organizationId]);

  const visible = useMemo(
    () =>
      (quotes ?? []).filter((quote) =>
        quoteVisibleToPersona(
          { status: quote.status, teamId: quote.teamId, hasRejection: quote.hasRejection },
          access.persona,
          access.teamId,
        ),
      ),
    [quotes, access.persona, access.teamId],
  );

  const attention = useMemo(
    () => visible.filter((quote) => quote.status === "draft" && quote.hasRejection),
    [visible],
  );

  const queues = useMemo(() => {
    const buckets: Record<QuoteQueueKey, QuoteListItem[]> = {
      drafts: [],
      awaiting_gm: [],
      awaiting_ceo: [],
      ceo_approved: [],
      ready_for_po: [],
    };
    visible.forEach((quote) => {
      const key = quoteQueueKey({
        status: quote.status,
        teamId: quote.teamId,
        hasRejection: quote.hasRejection,
      });
      if (key) buckets[key].push(quote);
    });
    return buckets;
  }, [visible]);

  if (error) return <EmptyState icon="⚠️" title="Could not load the dashboard">{error}</EmptyState>;
  if (!quotes) return <EmptyState icon="⏳" title="Loading dashboard…" />;

  return (
    <div className="stack">
      <div className="persona-banner">
        Viewing as <b>{access.personaLabel}</b>
        {access.isTeamScoped && access.teamId
          ? ` · ${access.teams.find((team) => team.id === access.teamId)?.name ?? "team"}`
          : null}
      </div>

      {attention.length > 0 && (
        <div className="attention-banner">
          <b>{attention.length} quote{attention.length === 1 ? "" : "s"} need changes</b>
          <span>
            Rejected submissions stay in Draft until revised and resubmitted.{" "}
            {attention
              .slice(0, 4)
              .map((quote) => quote.quoteNumber)
              .join(", ")}
            {attention.length > 4 ? ` +${attention.length - 4} more` : ""}
          </span>
        </div>
      )}

      <section className="queue-grid queue-grid--pipeline">
        {QUEUE_ORDER.map((key) => {
          const rows = queues[key];
          const total = rows.reduce((sum, quote) => sum + quote.netSalesOrderAud, 0);
          return (
            <article key={key} className={`queue-card queue-card--${key}`}>
              <header>
                <div>
                  <span>{QUEUE_LABEL[key]}</span>
                  <strong>{rows.length}</strong>
                  <em className="queue-hint">{QUEUE_HINT[key]}</em>
                </div>
                <small>{formatMoney(total)} net sales</small>
              </header>
              <div className="queue-list">
                {rows.length === 0 ? (
                  <p className="muted">No quotes at this stage.</p>
                ) : (
                  rows.map((quote) => (
                    <button
                      key={quote.id}
                      type="button"
                      className="queue-row"
                      onClick={() => router.push(`/quotes/${quote.id}`)}
                    >
                      <div>
                        <b>
                          {quote.quoteNumber}
                          {quote.hasRejection && quote.status === "draft" ? (
                            <span className="queue-flag">Needs changes</span>
                          ) : null}
                        </b>
                        <span>
                          {quote.sku}
                          {quote.customerName ? ` · ${quote.customerName}` : ""}
                        </span>
                      </div>
                      <div className="queue-row-meta">
                        <span className={statusClass(quote.status)}>{STATUS_LABEL[quote.status]}</span>
                        <em>{formatMoney(quote.netSalesOrderAud)}</em>
                        <small>{formatDate(quote.updatedAt)}</small>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
