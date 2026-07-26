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

// Count and summarise the captured notes (cell comments, line notes, extras) so
// the queue can show a badge and a hover title without opening the shipment.
function noteSummary(s: ShipmentDerived): { count: number; title: string } {
  const n = s.notes;
  if (!n) return { count: 0, title: "" };
  const parts: string[] = [];
  for (const c of n.comments ?? []) parts.push(`${c.field}: ${c.text}`);
  for (const ln of n.lineNotes ?? []) parts.push(ln.agl ? `${ln.agl}: ${ln.text}` : ln.text);
  for (const [k, v] of Object.entries(n.extras ?? {})) parts.push(`${k}: ${v}`);
  return { count: parts.length, title: parts.join("\n") };
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
      const agls = (s.agls ?? []).join(" ");
      const hay = `${s.reference} ${s.brand} ${s.retailer ?? ""} ${s.po ?? ""} ${(s.salesReps ?? []).join(" ")} ${s.containerNo ?? ""} ${agls} ${s.etaNote ?? ""} ${noteSummary(s).title}`.toLowerCase();
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
            placeholder="Search PO, brand, retailer, container, AGL, notes…"
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
              <th className="px-4 py-2.5 font-medium">Notes</th>
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
                <td className="px-4 py-3 align-top text-slate-600">
                  {(() => {
                    const { count, title } = noteSummary(s);
                    if (!s.etaNote && count === 0) {
                      return <span className="text-slate-300">—</span>;
                    }
                    const extra = count - (s.etaNote ? 1 : 0);
                    return (
                      <div title={title} className="max-w-[16rem]">
                        {s.etaNote && (
                          <div className="truncate text-xs text-delayed">{s.etaNote}</div>
                        )}
                        {extra > 0 && (
                          <div className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            +{extra} note{extra > 1 ? "s" : ""}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
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
