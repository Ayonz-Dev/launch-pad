import Link from "next/link";
import { notFound } from "next/navigation";
import MilestoneTimeline from "@/components/MilestoneTimeline";
import LiveShipmentMap from "@/components/LiveShipmentMap";
import StatusPill from "@/components/StatusPill";
import { getContainer } from "@/lib/data";
import { modelHref, shipmentHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ContainerDetail({ params }: { params: { id: string } }) {
  const container = await getContainer(params.id);
  if (!container) notFound();
  const current = container.currentShipment;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
      <Link href="/containers" className="text-sm text-slate-500 hover:text-harbor">
        ← Containers
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="tnum font-display text-2xl font-semibold text-ink">
              {container.containerNo}
            </h1>
            <StatusPill status={current.status} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {current.carrier}
            {current.vessel ? ` · ${current.vessel}` : ""} · {container.skus.length} SKU
            {container.skus.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">Current ETA</div>
          <div className="tnum font-display text-lg font-semibold text-ink">
            {fmtDate(current.etaCurrent)}
          </div>
        </div>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <LiveShipmentMap shipment={current} />
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-display text-sm font-semibold text-ink">Commercial</h2>

            <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Shipment{container.shipments.length === 1 ? "" : "s"}
            </h3>
            <ul className="mt-1.5 space-y-1.5 text-sm">
              {container.shipments.map((shipment) => (
                <li key={shipment.id} className="flex justify-between gap-3">
                  <Link
                    href={shipmentHref(shipment.id)}
                    className="font-medium text-harbor hover:underline"
                  >
                    {shipment.reference}
                  </Link>
                  <span className="tnum text-slate-500">{fmtDate(shipment.etaCurrent)}</span>
                </li>
              ))}
            </ul>

            <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
              Models
            </h3>
            <ul className="mt-1.5 space-y-1.5 text-sm">
              {container.skus.map((line) => {
                const model = line.model || line.sku;
                return (
                  <li key={model} className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={modelHref(model)}
                        className="tnum font-medium text-harbor hover:underline"
                      >
                        {model}
                      </Link>
                      <div className="truncate text-xs text-slate-500">{line.description}</div>
                    </div>
                    <span className="tnum shrink-0 text-slate-500">
                      {line.qty.toLocaleString("en-AU")}
                    </span>
                  </li>
                );
              })}
            </ul>

            <dl className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Total units</dt>
                <dd className="tnum font-medium text-ink">
                  {container.totalUnits.toLocaleString("en-AU")}
                </dd>
              </div>
              {current.retailer && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Retailer</dt>
                  <dd className="text-ink">{current.retailer}</dd>
                </div>
              )}
              {current.po && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">PO</dt>
                  <dd className="tnum text-ink">{current.po}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-ink">
          Current journey ·{" "}
          <Link href={shipmentHref(current.id)} className="text-harbor hover:underline">
            {current.reference}
          </Link>
        </h2>
        <MilestoneTimeline shipment={current} />
      </div>
    </div>
  );
}
