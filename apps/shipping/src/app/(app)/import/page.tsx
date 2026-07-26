"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { parseReport, type ParseResult } from "@/lib/import/parseReport";

type ImportState =
  | { phase: "idle" }
  | { phase: "parsing" }
  | { phase: "parsed"; fileName: string; result: ParseResult }
  | { phase: "importing"; fileName: string; result: ParseResult }
  | { phase: "done"; fileName: string; result: ParseResult; message: string; ok: boolean };

function fmtUsd(n?: number): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ImportPage() {
  const [state, setState] = useState<ImportState>({ phase: "idle" });
  const [token, setToken] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("manageToken");
    if (saved) setToken(saved);
  }, []);

  async function handleFile(file: File) {
    setState({ phase: "parsing" });
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      // Pick the sheet whose header row mentions a container column.
      const sheetName =
        wb.SheetNames.find((n) => {
          const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], {
            header: 1,
            blankrows: false,
          });
          return rows
            .slice(0, 10)
            .some((r) => (r || []).some((c) => String(c).toLowerCase().includes("container")));
        }) ?? wb.SheetNames[0];

      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        blankrows: false,
      });
      const today = new Date().toISOString().slice(0, 10);
      const result = parseReport(rows, today);
      setState({ phase: "parsed", fileName: file.name, result });
    } catch (err: any) {
      setState({
        phase: "done",
        fileName: file.name,
        result: { shipments: [], warnings: [], stats: { lineItems: 0, shipments: 0, arrived: 0, onWater: 0, planned: 0, unknownPorts: [], salesReps: [] } },
        message: `Couldn't read the file: ${err.message}`,
        ok: false,
      });
    }
  }

  async function doImport() {
    if (state.phase !== "parsed") return;
    const { fileName, result } = state;
    setState({ phase: "importing", fileName, result });
    if (token) window.localStorage.setItem("manageToken", token);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-manage-token": token } : {}),
        },
        body: JSON.stringify({ shipments: result.shipments }),
      });
      const data = await res.json();
      const message = data.ok
        ? `Imported ${data.persisted} shipments into the database.`
        : res.status === 401
          ? "Access token required or incorrect."
        : data.reason || data.error || "Import failed.";
      setState({ phase: "done", fileName, result, message, ok: !!data.ok });
    } catch (err: any) {
      setState({ phase: "done", fileName, result, message: err.message, ok: false });
    }
  }

  const result =
    state.phase === "parsed" || state.phase === "importing" || state.phase === "done"
      ? state.result
      : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Import daily report</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Drop the logistics team&apos;s Australia shipment report. It&apos;s grouped by
          container, mapped to shipments, and previewed before anything is saved.
        </p>
      </header>

      {/* Dropzone */}
      <label
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center transition hover:border-harbor hover:bg-harbor/5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        <div className="font-display text-sm font-semibold text-ink">
          Drop the .xlsx here, or click to choose
        </div>
        <div className="mt-1 text-xs text-slate-500">
          e.g. Australia_shipment_-_14_Jul.xlsx
        </div>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>

      {state.phase === "parsing" && (
        <p className="mt-4 text-sm text-slate-500">Reading the workbook…</p>
      )}

      {result && (
        <div className="mt-6 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Shipments", value: result.stats.shipments },
              { label: "Line items", value: result.stats.lineItems },
              { label: "Arrived", value: result.stats.arrived },
              { label: "On water", value: result.stats.onWater },
              { label: "Planned", value: result.stats.planned },
              { label: "Sales reps", value: result.stats.salesReps.length },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {c.label}
                </div>
                <div className="mt-0.5 font-display text-xl font-semibold tnum text-ink">
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="rounded-xl border border-atrisk/30 bg-atrisk/5 p-4">
              <div className="text-sm font-semibold text-atrisk">
                {result.warnings.length} thing{result.warnings.length > 1 ? "s" : ""} to check
              </div>
              <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm text-ink">
                {result.warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {result.warnings.length > 8 && (
                  <li className="text-slate-500">
                    …and {result.warnings.length - 8} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Preview table */}
          {result.shipments.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-ink">
                Preview — first 12 of {result.shipments.length}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2 font-medium">Container</th>
                      <th className="px-4 py-2 font-medium">Lane</th>
                      <th className="px-4 py-2 font-medium">Vessel</th>
                      <th className="px-4 py-2 font-medium">ETA</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Lines</th>
                      <th className="px-4 py-2 font-medium">Reps</th>
                      <th className="px-4 py-2 font-medium">FOB (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.shipments.slice(0, 12).map((s) => (
                      <tr key={s.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2 font-medium text-ink tnum">{s.containerNo}</td>
                        <td className="px-4 py-2 text-slate-600 tnum">
                          {s.origin.name} → {s.destination.name}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{s.vessel ?? "—"}</td>
                        <td className="px-4 py-2 tnum text-slate-600">{s.etaCurrent}</td>
                        <td className="px-4 py-2 text-slate-600">{s.etdStatus ?? "—"}</td>
                        <td className="px-4 py-2 tnum text-slate-600">{s.skus.length}</td>
                        <td className="px-4 py-2 text-slate-600">
                          {(s.salesReps ?? []).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-2 tnum text-slate-600">{fmtUsd(s.fobValueUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action */}
          <div className="flex items-center gap-3">
            <button
              onClick={doImport}
              disabled={state.phase === "importing" || result.shipments.length === 0 || state.phase === "done"}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-soft disabled:opacity-50"
            >
              {state.phase === "importing"
                ? "Importing…"
                : `Import ${result.shipments.length} shipments`}
            </button>
            {state.phase === "done" && (
              <span className={`text-sm ${state.ok ? "text-ontrack" : "text-atrisk"}`}>
                {state.message}
              </span>
            )}
            {state.phase === "done" && state.ok && (
              <Link href="/" className="text-sm font-medium text-harbor hover:underline">
                View shipments →
              </Link>
            )}
            <input
              type="password"
              autoComplete="current-password"
              className="ml-auto w-52 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-harbor focus:ring-2 focus:ring-harbor/20"
              placeholder="Manager access token"
              aria-label="Manager access token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
