import Link from "next/link";
import { notFound } from "next/navigation";
import StatusPill from "@/components/StatusPill";
import { getAgl } from "@/lib/data";
import { containerHref, modelHref, shipmentHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtUsd(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function AglDetail({ params }: { params: { id: string } }) {
  const item = await getAgl(params.id);
  if (!item) notFound();

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
      <Link href="/agls" className="text-sm text-slate-500 hover:text-harbor">
        ← AGLs
      </Link>

      <header className="mt-3">
        <p className="kicker mb-2">
          <span className="kicker-accent">AGL</span>
        </p>
        <h1 className="tnum font-display text-2xl font-semibold text-ink">{item.agl}</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {item.description}
          {item.brands.length > 0 ? ` · ${item.brands.join(", ")}` : ""}
        </p>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <h2 className="font-display text-sm font-semibold text-ink">Commercial</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Total units</dt>
              <dd className="tnum font-medium text-ink">
                {item.totalUnits.toLocaleString("en-AU")}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Line value</dt>
              <dd className="tnum text-ink">{fmtUsd(item.totalLineValue)}</dd>
            </div>
          </dl>

          <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
            Models
          </h3>
          <ul className="mt-1.5 space-y-1.5 text-sm">
            {item.models.length > 0 ? (
              item.models.map((model) => (
                <li key={model}>
                  <Link
                    href={modelHref(model)}
                    className="tnum font-medium text-harbor hover:underline"
                  >
                    {model}
                  </Link>
                </li>
              ))
            ) : (
              <li className="text-slate-400">—</li>
            )}
          </ul>

          <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
            Shipments
          </h3>
          <ul className="mt-1.5 space-y-1.5 text-sm">
            {item.occurrences.map(({ shipment }) => (
              <li key={shipment.id}>
                <Link
                  href={shipmentHref(shipment.id)}
                  className="font-medium text-harbor hover:underline"
                >
                  {shipment.reference}
                </Link>
              </li>
            ))}
          </ul>

          <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
            Containers
          </h3>
          <ul className="mt-1.5 space-y-1.5 text-sm">
            {item.containers.map((containerNo) => (
              <li key={containerNo}>
                <Link
                  href={containerHref(containerNo)}
                  className="tnum font-medium text-harbor hover:underline"
                >
                  {containerNo}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-display text-sm font-semibold text-ink">Tracking</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Every shipment and container carrying this AGL.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Shipment</th>
                  <th className="px-4 py-2.5 font-medium">Container</th>
                  <th className="px-4 py-2.5 font-medium">Model</th>
                  <th className="px-4 py-2.5 font-medium">Qty</th>
                  <th className="px-4 py-2.5 font-medium">ETA</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {item.occurrences.map(({ shipment, line }) => {
                  const model = line.model || line.sku;
                  return (
                    <tr
                      key={`${shipment.id}-${model}`}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={shipmentHref(shipment.id)}
                          className="font-medium text-harbor hover:underline"
                        >
                          {shipment.reference}
                        </Link>
                        <div className="mt-0.5 text-xs text-slate-400">
                          {shipment.retailer ?? shipment.brand}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {shipment.containerNo ? (
                          <Link
                            href={containerHref(shipment.containerNo)}
                            className="tnum font-medium text-harbor hover:underline"
                          >
                            {shipment.containerNo}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="tnum px-4 py-3 text-slate-700">
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
                      </td>
                      <td className="tnum px-4 py-3 text-ink">
                        {line.qty.toLocaleString("en-AU")}
                      </td>
                      <td className="tnum px-4 py-3 text-ink">{fmtDate(shipment.etaCurrent)}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={shipment.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
