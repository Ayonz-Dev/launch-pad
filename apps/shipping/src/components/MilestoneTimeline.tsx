import type { ShipmentDerived } from "@/lib/types";
import { LEG_LABEL } from "@/lib/exceptions";

function fmt(iso: string | null): string {
  if (!iso) return "Pending";
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MilestoneTimeline({
  shipment,
}: {
  shipment: ShipmentDerived;
}) {
  return (
    <ol className="relative ml-3 border-l border-slate-200">
      {shipment.milestones.map((m, i) => {
        const done = m.actual && m.timestamp;
        const isHold = m.code.includes("HOLD");
        return (
          <li key={`${m.code}-${i}`} className="mb-5 ml-5">
            <span
              className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full ring-4 ring-white ${
                isHold
                  ? "bg-delayed"
                  : done
                  ? "bg-ontrack"
                  : "bg-slate-300"
              }`}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div
                  className={`text-sm font-medium ${
                    done ? "text-ink" : "text-slate-400"
                  }`}
                >
                  {m.label}
                </div>
                <div className="text-xs text-slate-400">
                  {LEG_LABEL[m.leg]} · {m.location}
                </div>
              </div>
              <div
                className={`tnum text-xs ${
                  m.actual ? "text-slate-600" : "italic text-slate-400"
                }`}
              >
                {fmt(m.timestamp)}
                {!m.actual && m.timestamp ? " (est)" : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
