"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ShipmentDerived } from "@/lib/types";

const STATUS_OPTIONS = ["PLANNED", "ON WATER", "ARRIVED"];

export default function ShipmentEditor({ shipment }: { shipment: ShipmentDerived }) {
  const [form, setForm] = useState({
    etdStatus: shipment.etdStatus ?? "",
    etaCurrent: shipment.etaCurrent ?? "",
    vessel: shipment.vessel ?? "",
    voyage: shipment.voyage ?? "",
    carrier: shipment.carrier ?? "",
    retailer: shipment.retailer ?? "",
    retailerDeadline: shipment.retailerDeadline ?? "",
    po: shipment.po ?? "",
  });
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Persist the access token locally so she enters it once (only used if the
  // server has MANAGE_TOKEN set).
  useEffect(() => {
    const t = window.localStorage.getItem("manageToken");
    if (t) setToken(t);
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setResult(null);
    if (token) window.localStorage.setItem("manageToken", token);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-manage-token": token } : {}),
        },
        body: JSON.stringify({
          etdStatus: form.etdStatus || undefined,
          etaCurrent: form.etaCurrent || undefined,
          vessel: form.vessel,
          voyage: form.voyage,
          carrier: form.carrier || undefined,
          retailer: form.retailer,
          retailerDeadline: form.retailerDeadline || null,
          po: form.po,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResult({ ok: true, msg: "Saved. The sales team sees this now." });
      } else if (res.status === 401) {
        setResult({ ok: false, msg: "Access token required or incorrect." });
      } else {
        setResult({ ok: false, msg: data.error || "Save failed." });
      }
    } catch (err: any) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-harbor focus:ring-2 focus:ring-harbor/20";
  const label = "text-xs font-medium uppercase tracking-wide text-slate-500";

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Live status — the fields the sales team reads */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-display text-sm font-semibold text-ink">Live status</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          What the sales team sees. Status drives the timeline and map.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <div className={label}>Reported status</div>
            <select
              className={field}
              value={form.etdStatus}
              onChange={(e) => set("etdStatus", e.target.value)}
            >
              <option value="">—</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={label}>Current ETA</div>
            <input
              type="date"
              className={field}
              value={form.etaCurrent}
              onChange={(e) => set("etaCurrent", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Voyage details */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-display text-sm font-semibold text-ink">Voyage</h2>
        <div className="mt-3 space-y-3">
          <div>
            <div className={label}>Vessel</div>
            <input className={field} value={form.vessel} onChange={(e) => set("vessel", e.target.value)} />
          </div>
          <div>
            <div className={label}>Voyage no.</div>
            <input className={field} value={form.voyage} onChange={(e) => set("voyage", e.target.value)} />
          </div>
          <div>
            <div className={label}>Carrier</div>
            <input className={field} value={form.carrier} onChange={(e) => set("carrier", e.target.value)} />
          </div>
        </div>
      </section>

      {/* Commercial link — turns on deadline-risk flags for report shipments */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-display text-sm font-semibold text-ink">Order link</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Add a retailer and on-shelf date to switch on commercial-risk alerts.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <div className={label}>Retailer</div>
            <input className={field} value={form.retailer} onChange={(e) => set("retailer", e.target.value)} />
          </div>
          <div>
            <div className={label}>On-shelf deadline</div>
            <input
              type="date"
              className={field}
              value={form.retailerDeadline}
              onChange={(e) => set("retailerDeadline", e.target.value)}
            />
          </div>
          <div>
            <div className={label}>PO</div>
            <input className={field} value={form.po} onChange={(e) => set("po", e.target.value)} />
          </div>
        </div>
      </section>

      {/* Save bar */}
      <div className="lg:col-span-3">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-soft disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link
            href={`/shipments/${shipment.id}`}
            className="text-sm font-medium text-harbor hover:underline"
          >
            View as sales sees it →
          </Link>
          <input
            className="ml-auto w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-harbor"
            placeholder="Access token (if set)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          {result && (
            <span className={`text-sm ${result.ok ? "text-ontrack" : "text-atrisk"}`}>
              {result.msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
