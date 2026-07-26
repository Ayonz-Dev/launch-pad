import Link from "next/link";
import { notFound } from "next/navigation";
import LiveShipmentMap from "@/components/LiveShipmentMap";
import MilestoneTimeline from "@/components/MilestoneTimeline";
import StatusPill from "@/components/StatusPill";
import { getShipment } from "@/lib/data";
import { aglHref, containerHref, modelHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

function fmtAud(n?: number): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtUsd(n?: number): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ShipmentDetail({
  params,
}: {
  params: { id: string };
}) {
  const s = await getShipment(params.id);
  if (!s) notFound();

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
      <Link href="/" className="text-sm text-slate-500 hover:text-harbor">
        ← Shipments
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-ink">
              {s.reference}
            </h1>
            <StatusPill status={s.status} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {s.brand}
            {s.po ? ` · ${s.po}` : ""} · {s.carrier}
            {s.vessel ? ` · ${s.vessel}${s.voyage ? ` ${s.voyage}` : ""}` : ""}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Current ETA
          </div>
          <div className="tnum font-display text-lg font-semibold text-ink">
            {fmtDate(s.etaCurrent)}
          </div>
          {s.etaSlipDays > 0 && (
            <div className="text-xs text-delayed">
              +{s.etaSlipDays}d vs plan ({fmtDate(s.etaOriginal)})
            </div>
          )}
        </div>
      </header>

      {s.deadlineRisk.breached && (
        <div className="mt-4 rounded-xl border border-atrisk/30 bg-atrisk/5 p-4 text-sm">
          <span className="font-semibold text-atrisk">Commercial risk. </span>
          <span className="text-ink">
            Current ETA lands {Math.abs(s.deadlineRisk.daysVsDeadline)} day
            {Math.abs(s.deadlineRisk.daysVsDeadline) > 1 ? "s" : ""} after the{" "}
            {s.retailer} on-shelf date of {fmtDate(s.retailerDeadline)}.{" "}
            {fmtAud(s.landedCostAud)} of landed value is exposed.
          </span>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <LiveShipmentMap shipment={s} />
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-display text-sm font-semibold text-ink">
              Commercial
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              {s.retailer && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Retailer</dt>
                  <dd className="text-ink">{s.retailer}</dd>
                </div>
              )}
              {s.retailerDeadline && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">On-shelf deadline</dt>
                  <dd className="tnum text-ink">{fmtDate(s.retailerDeadline)}</dd>
                </div>
              )}
              {s.salesReps && s.salesReps.length > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Sales</dt>
                  <dd className="text-ink">{s.salesReps.join(", ")}</dd>
                </div>
              )}
              {s.agent && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Warehouse</dt>
                  <dd className="text-ink">{s.agent}</dd>
                </div>
              )}
              {s.etdStatus && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Reported status</dt>
                  <dd className="text-ink">{s.etdStatus}</dd>
                </div>
              )}
              {s.landedCostAud != null && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Landed value</dt>
                  <dd className="tnum text-ink">{fmtAud(s.landedCostAud)}</dd>
                </div>
              )}
              {s.fobValueUsd != null && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">FOB value</dt>
                  <dd className="tnum text-ink">{fmtUsd(s.fobValueUsd)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Container</dt>
                <dd className="tnum text-ink">
                  {s.containerNo ? (
                    <Link
                      href={containerHref(s.containerNo)}
                      className="font-medium text-harbor hover:underline"
                    >
                      {s.containerNo}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">B/L</dt>
                <dd className="tnum text-ink">{s.blNo ?? "—"}</dd>
              </div>
            </dl>

            <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
              SKUs
            </h3>
            <ul className="mt-1.5 divide-y divide-slate-100">
              {s.skus.map((sku, i) => {
                const model = sku.model || sku.sku;
                return (
                  <li key={`${sku.agl ?? sku.sku}-${i}`} className="py-2.5 first:pt-1.5">
                    {sku.description && (
                      <div className="mb-1.5 text-sm text-ink">{sku.description}</div>
                    )}
                    <dl className="space-y-1 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">AGL</dt>
                        <dd className="tnum text-ink">
                          {sku.agl ? (
                            <Link
                              href={aglHref(sku.agl)}
                              className="font-medium text-harbor hover:underline"
                            >
                              {sku.agl}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Brand</dt>
                        <dd className="text-ink">{sku.brand || "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Model</dt>
                        <dd className="tnum text-ink">
                          {model ? (
                            <Link
                              href={modelHref(model)}
                              className="font-medium text-harbor hover:underline"
                            >
                              {model}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Quantity</dt>
                        <dd className="tnum text-ink">
                          {sku.qty.toLocaleString("en-AU")}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-ink">
          Journey
        </h2>
        <MilestoneTimeline shipment={s} />
      </div>
    </div>
  );
}
