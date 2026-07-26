import Link from "next/link";
import StatusPill from "@/components/StatusPill";
import { getContainers } from "@/lib/data";
import { containerHref, shipmentHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ContainersPage() {
  const containers = await getContainers();

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Containers</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Track each physical container across its shipments, contents, and current ETA.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Container</th>
                <th className="px-4 py-3 font-medium">Shipment</th>
                <th className="px-4 py-3 font-medium">Contents</th>
                <th className="px-4 py-3 font-medium">Current ETA</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => {
                const current = container.currentShipment;
                return (
                  <tr
                    key={container.containerNo}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={containerHref(container.containerNo)}
                        className="tnum font-medium text-ink hover:text-harbor"
                      >
                        {container.containerNo}
                      </Link>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {current.carrier}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={shipmentHref(current.id)}
                        className="font-medium text-harbor hover:underline"
                      >
                        {current.reference}
                      </Link>
                      {container.shipments.length > 1 && (
                        <div className="mt-0.5 text-xs text-slate-400">
                          {container.shipments.length} linked shipments
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {container.skus.length} SKU{container.skus.length === 1 ? "" : "s"}
                      <div className="tnum text-xs text-slate-400">
                        {container.totalUnits.toLocaleString("en-AU")} units
                      </div>
                    </td>
                    <td className="tnum px-4 py-3 text-ink">
                      {fmtDate(current.etaCurrent)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={current.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
