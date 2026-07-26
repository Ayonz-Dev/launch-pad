import type { ReactNode } from 'react';

type Tone = 'neutral' | 'good' | 'warn' | 'bad';

export interface KpiCardProps {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: Tone;
}

/** A single headline metric. Tone tints the value, not the whole card. */
export function KpiCard({ label, value, sub, tone = 'neutral' }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value tone-${tone}`}>{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}
