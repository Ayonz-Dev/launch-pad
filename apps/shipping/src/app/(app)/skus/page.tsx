import Link from "next/link";
import { getSkus } from "@/lib/data";
import { modelHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function SkusPage() {
  const models = await getSkus();

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
      <header className="mb-6">
        <p className="kicker mb-2">
          <span className="kicker-accent">Products</span> / by model
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">SKUs</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Follow every model across the shipments and containers carrying it.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">AGLs</th>
                <th className="px-4 py-3 font-medium">Shipments</th>
                <th className="px-4 py-3 font-medium">Containers</th>
                <th className="px-4 py-3 font-medium">Total units</th>
              </tr>
            </thead>
            <tbody>
              {models.map((item) => (
                <tr
                  key={item.model}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={modelHref(item.model)}
                      className="tnum font-medium text-ink hover:text-harbor"
                    >
                      {item.model}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">{item.description}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.brands.join(", ") || "—"}</td>
                  <td className="tnum px-4 py-3 text-slate-600">
                    {item.agls.length > 0 ? item.agls.join(", ") : "—"}
                  </td>
                  <td className="tnum px-4 py-3 text-slate-600">
                    {item.occurrences.length}
                  </td>
                  <td className="tnum px-4 py-3 text-slate-600">
                    {item.containers.length}
                  </td>
                  <td className="tnum px-4 py-3 font-medium text-ink">
                    {item.totalUnits.toLocaleString("en-AU")}
                  </td>
                </tr>
              ))}
              {models.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    No models found yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
