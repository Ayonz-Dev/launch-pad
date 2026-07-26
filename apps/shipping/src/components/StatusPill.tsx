import type { ShipmentStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/exceptions";

const STYLES: Record<ShipmentStatus, string> = {
  on_track: "bg-ontrack/10 text-ontrack ring-ontrack/20",
  at_risk: "bg-atrisk/10 text-atrisk ring-atrisk/20",
  delayed: "bg-delayed/10 text-delayed ring-delayed/20",
  delivered: "bg-delivered/10 text-delivered ring-delivered/20",
};

export default function StatusPill({ status }: { status: ShipmentStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}
