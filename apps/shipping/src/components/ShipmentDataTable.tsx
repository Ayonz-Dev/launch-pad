"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ShipmentDerived, ShipmentStatus } from "@/lib/types";
import { LEG_LABEL, STATUS_LABEL } from "@/lib/exceptions";
import { shipmentHref, containerHref } from "@/lib/routes";
import StatusPill from "./StatusPill";

type SortKey =
  | "reference"
  | "containerNo"
  | "brand"
  | "origin"
  | "destination"
  | "carrier"
  | "vessel"
  | "etdStatus"
  | "etaCurrent"
  | "status"
  | "sales"
  | "agent"
  | "fobValueUsd"
  | "units"
  | "stage";

type SortDir = "asc" | "desc";

const STATUS_OPTIONS: ShipmentStatus[] = [
  "at_risk",
  "delayed",
  "on_track",
  "delivered",
];

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtUsd(n?: number): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function units(s: ShipmentDerived): number {
  return s.skus.reduce((sum, line) => sum + (line.qty || 0), 0);
}

function sortValue(s: ShipmentDerived, key: SortKey): string | number {
  switch (key) {
    case "reference":
      return s.reference.toLowerCase();
    case "containerNo":
      return (s.containerNo ?? "").toLowerCase();
    case "brand":
      return s.brand.toLowerCase();
    case "origin":
      return (s.origin.name || s.origin.port).toLowerCase();
    case "destination":
      return (s.destination.name || s.destination.port).toLowerCase();
    case "carrier":
      return s.carrier.toLowerCase();
    case "vessel":
      return (s.vessel ?? "").toLowerCase();
    case "etdStatus":
      return (s.etdStatus ?? "").toLowerCase();
    case "etaCurrent":
      return s.etaCurrent;
    case "status":
      return s.status;
    case "sales":
      return (s.salesReps ?? []).join(", ").toLowerCase();
    case "agent":
      return (s.agent ?? "").toLowerCase();
    case "fobValueUsd":
      return s.fobValueUsd ?? -1;
    case "units":
      return units(s);
    case "stage":
      return LEG_LABEL[s.currentLeg].toLowerCase();
  }
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "reference", label: "Shipment" },
  { key: "containerNo", label: "Container" },
  { key: "brand", label: "Brand" },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
  { key: "carrier", label: "Carrier" },
  { key: "vessel", label: "Vessel" },
  { key: "etdStatus", label: "Reported" },
  { key: "etaCurrent", label: "ETA" },
  { key: "status", label: "Status" },
  { key: "stage", label: "Stage" },
  { key: "sales", label: "Sales" },
  { key: "agent", label: "Warehouse" },
  { key: "units", label: "Units", className: "text-right" },
  { key: "fobValueUsd", label: "FOB (USD)", className: "text-right" },
];

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-harbor focus:ring-2 focus:ring-harbor/20";

export default function ShipmentDataTable({
  shipments,
}: {
  shipments: ShipmentDerived[];
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ShipmentStatus | "all">("all");
  const [carrier, setCarrier] = useState("all");
  const [destination, setDestination] = useState("all");
  const [reported, setReported] = useState("all");
  const [rep, setRep] = useState("all");
  const [brand, setBrand] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("etaCurrent");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filterOptions = useMemo(() => {
    const carriers = uniqueSorted(shipments.map((s) => s.carrier));
    const destinations = uniqueSorted(
      shipments.map((s) => s.destination.name || s.destination.port),
    );
    const reporteds = uniqueSorted(shipments.map((s) => s.etdStatus ?? ""));
    const reps = uniqueSorted(shipments.flatMap((s) => s.salesReps ?? []));
    const brands = uniqueSorted(
      shipments.map((s) => s.brand).filter((b) => b && b !== "—"),
    );
    return { carriers, destinations, reporteds, reps, brands };
  }, [shipments]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = shipments.filter((s) => {
      if (status !== "all" && s.status !== status) return false;
      if (carrier !== "all" && s.carrier !== carrier) return false;
      if (
        destination !== "all" &&
        (s.destination.name || s.destination.port) !== destination
      ) {
        return false;
      }
      if (reported !== "all" && (s.etdStatus || "") !== reported) return false;
      if (rep !== "all" && !(s.salesReps ?? []).includes(rep)) return false;
      if (brand !== "all" && s.brand !== brand) return false;
      if (!query) return true;
      const hay = [
        s.reference,
        s.containerNo,
        s.brand,
        s.carrier,
        s.vessel,
        s.voyage,
        s.agent,
        s.liner,
        s.etdStatus,
        s.retailer,
        s.po,
        s.origin.name,
        s.origin.port,
        s.destination.name,
        s.destination.port,
        ...(s.salesReps ?? []),
        ...s.skus.flatMap((line) => [
          line.sku,
          line.agl,
          line.brand,
          line.model,
          line.description,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * dir;
    });
  }, [
    shipments,
    q,
    status,
    carrier,
    destination,
    reported,
    rep,
    brand,
    sortKey,
    sortDir,
  ]);

  const activeFilterCount = [
    status !== "all",
    carrier !== "all",
    destination !== "all",
    reported !== "all",
    rep !== "all",
    brand !== "all",
    q.trim() !== "",
  ].filter(Boolean).length;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function clearFilters() {
    setQ("");
    setStatus("all");
    setCarrier("all");
    setDestination("all");
    setReported("all");
    setRep("all");
    setBrand("all");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="space-y-3 border-b border-slate-100 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium text-ink">
              {rows.length.toLocaleString("en-AU")} of{" "}
              {shipments.length.toLocaleString("en-AU")} shipments
            </div>
            <p className="text-xs text-slate-500">
              Click a column header to sort. Use filters to narrow the set.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search container, brand, AGL, vessel, rep…"
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-harbor focus:ring-2 focus:ring-harbor/20 sm:min-w-[280px]"
            />
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Clear ({activeFilterCount})
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ShipmentStatus | "all")}
            className={selectClass}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {STATUS_LABEL[key]}
              </option>
            ))}
          </select>

          <select
            value={reported}
            onChange={(e) => setReported(e.target.value)}
            className={selectClass}
            aria-label="Filter by reported status"
          >
            <option value="all">All reported</option>
            {filterOptions.reporteds.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className={selectClass}
            aria-label="Filter by carrier"
          >
            <option value="all">All carriers</option>
            {filterOptions.carriers.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className={selectClass}
            aria-label="Filter by destination"
          >
            <option value="all">All destinations</option>
            {filterOptions.destinations.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className={selectClass}
            aria-label="Filter by brand"
          >
            <option value="all">All brands</option>
            {filterOptions.brands.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            className={selectClass}
            aria-label="Filter by sales rep"
          >
            <option value="all">All reps</option>
            {filterOptions.reps.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1400px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              {COLUMNS.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th key={col.key} className={`px-3 py-2.5 font-medium ${col.className ?? ""}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`inline-flex items-center gap-1 transition hover:text-ink ${
                        active ? "text-ink" : ""
                      }`}
                    >
                      {col.label}
                      <span className="tnum text-[10px] text-slate-400">
                        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.id}
                className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={shipmentHref(s.id)}
                    className="font-medium text-harbor hover:underline"
                  >
                    {s.reference}
                  </Link>
                </td>
                <td className="px-3 py-2.5 tnum text-slate-700">
                  {s.containerNo ? (
                    <Link
                      href={containerHref(s.containerNo)}
                      className="hover:text-harbor hover:underline"
                    >
                      {s.containerNo}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2.5 text-slate-700">{s.brand || "—"}</td>
                <td className="px-3 py-2.5 text-slate-700">
                  <div>{s.origin.name || "—"}</div>
                  <div className="tnum text-xs text-slate-400">{s.origin.port}</div>
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  <div>{s.destination.name || "—"}</div>
                  <div className="tnum text-xs text-slate-400">{s.destination.port}</div>
                </td>
                <td className="px-3 py-2.5 text-slate-700">{s.carrier}</td>
                <td className="px-3 py-2.5 text-slate-700">
                  <div>{s.vessel || "—"}</div>
                  {s.voyage && (
                    <div className="tnum text-xs text-slate-400">{s.voyage}</div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-slate-700">{s.etdStatus || "—"}</td>
                <td className="px-3 py-2.5">
                  <div className="tnum text-ink">{fmtDate(s.etaCurrent)}</div>
                  {s.etaSlipDays > 0 && (
                    <div className="text-xs text-delayed">+{s.etaSlipDays}d</div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill status={s.status} />
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  {LEG_LABEL[s.currentLeg]}
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  {(s.salesReps ?? []).join(", ") || "—"}
                </td>
                <td className="px-3 py-2.5 text-slate-700">{s.agent || "—"}</td>
                <td className="px-3 py-2.5 tnum text-right text-slate-700">
                  {units(s).toLocaleString("en-AU")}
                </td>
                <td className="px-3 py-2.5 tnum text-right text-slate-700">
                  {fmtUsd(s.fobValueUsd)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-4 py-12 text-center text-sm text-slate-400"
                >
                  {shipments.length === 0 ? (
                    <>
                      No shipments loaded yet.{" "}
                      <Link href="/import" className="font-medium text-harbor hover:underline">
                        Import a daily report
                      </Link>
                      .
                    </>
                  ) : (
                    "No rows match. Clear filters or broaden your search."
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
