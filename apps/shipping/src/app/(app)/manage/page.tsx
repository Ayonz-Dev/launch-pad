import Link from "next/link";
import { getShipments } from "@/lib/data";
import StatusPill from "@/components/StatusPill";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
}

export default async function ManagePage() {
  const shipments = await getShipments();

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Manage shipments</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Update status, ETA and voyage details. Changes are live to the sales team
          the moment you save.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-medium">Container</th>
                <th className="px-4 py-2.5 font-medium">Lane</th>
                <th className="px-4 py-2.5 font-medium">Reported</th>
                <th className="px-4 py-2.5 font-medium">ETA</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-ink tnum">
                    {s.containerNo ?? s.reference}
                  </td>
                  <td className="px-4 py-3 text-slate-600 tnum">
                    {s.origin.port || s.origin.name} → {s.destination.port || s.destination.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.etdStatus ?? "—"}</td>
                  <td className="px-4 py-3 tnum text-slate-600">{fmtDate(s.etaCurrent)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/manage/${s.id}`}
                      className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
