import Link from "next/link";
import ShipmentDataTable from "@/components/ShipmentDataTable";
import { getShipments } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DataTablePage() {
  const shipments = await getShipments();

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker mb-2">
            <span className="kicker-accent">Data</span> / full grid
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">Data table</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Full shipment grid with column sorting, filters, and search.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-harbor hover:underline"
        >
          ← Risk view
        </Link>
      </header>

      <ShipmentDataTable shipments={shipments} />
    </div>
  );
}
