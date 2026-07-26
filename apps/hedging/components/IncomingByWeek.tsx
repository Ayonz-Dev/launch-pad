import type { WeekBucket } from '../lib/incoming';
import { formatUsd } from '../lib/format';

// Incoming USD requirements from shipping, grouped by ISO week of ETA. The
// demand curve: how much USD falls due each week. A simple horizontal bar per
// week, scaled to the largest week, with the total and order count.

export function IncomingByWeek({
  buckets,
  weeks = 16,
}: {
  buckets: WeekBucket[];
  weeks?: number;
}) {
  const shown = buckets.slice(0, weeks);
  if (shown.length === 0) {
    return (
      <p className="note">
        No incoming orders from shipping yet. They appear here once shipments with
        a USD value and an ETA exist in the visibility schema.
      </p>
    );
  }
  const max = Math.max(...shown.map((b) => b.totalUsd), 1);

  return (
    <div className="card">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map((b) => (
          <div key={b.weekStart} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 130px', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#93a1c0', fontVariantNumeric: 'tabular-nums' }}>
              {b.label}
            </span>
            <span style={{ background: '#1a2540', borderRadius: 4, height: 18, position: 'relative', overflow: 'hidden' }}>
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${Math.max(2, (b.totalUsd / max) * 100)}%`,
                  background: 'linear-gradient(90deg,#60a5fa,#4ade80)',
                  borderRadius: 4,
                }}
              />
            </span>
            <span style={{ textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              {formatUsd(b.totalUsd)}
              <span style={{ color: '#93a1c0', marginLeft: 6, fontSize: 11 }}>
                {b.count}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
