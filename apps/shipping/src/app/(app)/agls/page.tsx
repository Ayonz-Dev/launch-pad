import Link from "next/link";
import { getAgls } from "@/lib/data";
import { aglHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function AglsPage() {
  const agls = await getAgls();

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
      <header className="mb-6">
        <p className="kicker mb-2">
          <span className="kicker-accent">Products</span> / by AGL
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">AGLs</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Follow every AGL product code across shipments and containers.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">AGL</th>
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">Models</th>
                <th className="px-4 py-3 font-medium">Shipments</th>
                <th className="px-4 py-3 font-medium">Containers</th>
                <th className="px-4 py-3 font-medium">Total units</th>
              </tr>
            </thead>
            <tbody>
              {agls.map((item) => (
                <tr
                  key={item.agl}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={aglHref(item.agl)}
                      className="tnum font-medium text-ink hover:text-harbor"
                    >
                      {item.agl}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">{item.description}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.brands.join(", ") || "—"}</td>
                  <td className="tnum px-4 py-3 text-slate-600">
                    {item.models.length > 0 ? item.models.join(", ") : "—"}
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
              {agls.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    No AGLs found yet.
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
