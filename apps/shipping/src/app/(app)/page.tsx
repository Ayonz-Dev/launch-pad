import Link from "next/link";
import KpiBar from "@/components/KpiBar";
import ShipmentTable from "@/components/ShipmentTable";
import { getShipments } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const shipments = await getShipments();
  const atRisk = shipments.filter((s) => s.status === "at_risk");

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker mb-2">
            <span className="kicker-accent">Live ops</span> / factory to retailer
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">Shipments</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Every open PO from factory to retailer DC, ranked by commercial risk.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/table"
            className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-harbor hover:underline"
          >
            Open data table →
          </Link>
          <span className="rounded-md border border-slate-200 bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
            Data source · {process.env.DATA_SOURCE ?? "mock"}
          </span>
        </div>
      </header>

      <KpiBar shipments={shipments} />

      {atRisk.length > 0 && (
        <div className="mt-5 rounded-xl border border-atrisk/30 bg-atrisk/5 p-4">
          <div className="text-sm font-semibold text-atrisk">
            {atRisk.length} shipment{atRisk.length > 1 ? "s" : ""} will miss a retailer on-shelf date
          </div>
          <ul className="mt-1.5 space-y-1 text-sm text-ink">
            {atRisk.map((s) => (
              <li key={s.id} className="tnum">
                {s.reference} — {s.brand} for {s.retailer}, current ETA{" "}
                {new Date(s.etaCurrent).toLocaleDateString("en-AU", {
                  day: "2-digit",
                  month: "short",
                })}{" "}
                is {Math.abs(s.deadlineRisk.daysVsDeadline)} day
                {Math.abs(s.deadlineRisk.daysVsDeadline) > 1 ? "s" : ""} past the deadline
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <ShipmentTable shipments={shipments} />
      </div>
    </div>
  );
}
