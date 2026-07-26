import Link from "next/link";
import { notFound } from "next/navigation";
import { getShipment } from "@/lib/data";
import ShipmentEditor from "@/components/ShipmentEditor";

export const dynamic = "force-dynamic";

export default async function ManageShipment({
  params,
}: {
  params: { id: string };
}) {
  const s = await getShipment(params.id);
  if (!s) notFound();

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
      <Link href="/manage" className="text-sm text-slate-500 hover:text-harbor">
        ← Manage shipments
      </Link>
      <header className="mt-3 mb-5">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {s.containerNo ?? s.reference}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {s.origin.name} → {s.destination.name}
          {s.salesReps?.length ? ` · Sales: ${s.salesReps.join(", ")}` : ""}
        </p>
      </header>

      <ShipmentEditor shipment={s} />
    </div>
  );
}
