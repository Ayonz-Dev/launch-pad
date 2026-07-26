"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ShipmentDerived, ShipmentStatus } from "@/lib/types";
import { LEG_LABEL } from "@/lib/exceptions";
import StatusPill from "./StatusPill";

const FILTERS: { key: ShipmentStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "at_risk", label: "Deadline risk" },
  { key: "delayed", label: "Delayed" },
  { key: "on_track", label: "On track" },
  { key: "delivered", label: "Delivered" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
  });
}

export default function ShipmentTable({
  shipments,
}: {
  shipments: ShipmentDerived[];
}) {
  const [filter, setFilter] = useState<ShipmentStatus | "all">("all");
  const [rep, setRep] = useState<string>("all");
  const [q, setQ] = useState("");

  const reps = useMemo(() => {
    const set = new Set<string>();
    shipments.forEach((s) => (s.salesReps ?? []).forEach((r) => set.add(r)));
    return [...set].sort();
  }, [shipments]);

  const rows = useMemo(() => {
    return shipments.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (rep !== "all" && !(s.salesReps ?? []).includes(rep)) return false;
      if (!q) return true;
      const hay = `${s.reference} ${s.brand} ${s.retailer ?? ""} ${s.po ?? ""} ${(s.salesReps ?? []).join(" ")} ${s.containerNo ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [shipments, filter, rep, q]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === f.key
                  ? "bg-ink text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {reps.length > 0 && (
            <select
              value={rep}
              onChange={(e) => setRep(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-harbor focus:ring-2 focus:ring-harbor/20"
              title="Filter by sales rep"
            >
              <option value="all">All reps</option>
              {reps.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search PO, brand, retailer, container…"
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-harbor focus:ring-2 focus:ring-harbor/20 sm:w-72"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-medium">Shipment</th>
              <th className="px-4 py-2.5 font-medium">Lane</th>
              <th className="px-4 py-2.5 font-medium">Retailer</th>
              <th className="px-4 py-2.5 font-medium">Stage</th>
              <th className="px-4 py-2.5 font-medium">ETA</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.id}
                className="group border-b border-slate-50 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  <Link href={`/shipments/${s.id}`} className="block">
                    <div className="font-medium text-ink group-hover:text-harbor">
                      {s.reference}
                    </div>
                    <div className="text-xs text-slate-500">
                      {s.brand}
                      {s.po ? ` · ${s.po}` : ""}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="tnum">{s.origin.port} → {s.destination.port}</div>
                  <div className="text-xs text-slate-400">{s.carrier}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {s.retailer ?? (s.salesReps?.length ? s.salesReps.join(", ") : "—")}
                </td>
                <td className="px-4 py-3 text-slate-600">{LEG_LABEL[s.currentLeg]}</td>
                <td className="px-4 py-3">
                  <div className="tnum text-ink">{fmtDate(s.etaCurrent)}</div>
                  {s.etaSlipDays > 0 && (
                    <div className="text-xs text-delayed">+{s.etaSlipDays}d vs plan</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={s.status} />
                  {s.deadlineRisk.breached && (
                    <div className="mt-1 text-xs text-atrisk">
                      Misses {s.retailer ?? "deadline"} by {Math.abs(s.deadlineRisk.daysVsDeadline)}d
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  {shipments.length === 0 ? (
                    <>
                      No shipments loaded yet.{" "}
                      <Link href="/import" className="font-medium text-harbor hover:underline">
                        Import a daily report
                      </Link>{" "}
                      to populate this view.
                    </>
                  ) : (
                    "No shipments match this view. Clear the filter or search to see all."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
