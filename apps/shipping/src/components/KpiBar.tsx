import type { ShipmentDerived } from "@/lib/types";

function fmtAud(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function KpiBar({ shipments }: { shipments: ShipmentDerived[] }) {
  const inTransit = shipments.filter((s) => s.status !== "delivered").length;
  const atRisk = shipments.filter((s) => s.status === "at_risk").length;
  const delayed = shipments.filter((s) => s.status === "delayed").length;
  const valueAtRisk = shipments
    .filter((s) => s.status === "at_risk")
    .reduce((sum, s) => sum + (s.landedCostAud ?? 0), 0);

  const cards = [
    { label: "In transit", value: String(inTransit), tone: "text-ink", live: true },
    { label: "Deadline risk", value: String(atRisk), tone: "text-atrisk", live: false },
    { label: "Delayed", value: String(delayed), tone: "text-delayed", live: false },
    {
      label: "Landed value at risk",
      value: fmtAud(valueAtRisk),
      tone: "text-atrisk",
      live: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="panel-frame p-4">
          <div className="kicker flex items-center gap-2">
            <span>{c.label}</span>
            {c.live && <span className="live-dot" aria-hidden />}
          </div>
          <div className={`mt-2 font-display text-2xl font-semibold tnum ${c.tone}`}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}
