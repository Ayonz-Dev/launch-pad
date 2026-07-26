// The approval trail. Renders costing_history newest first, showing notes on
// send-backs and the detail line on FX adjustments. Pure presentation.
//
// Australian English. No em dashes.

import type { CostingHistory } from '@launchpad/db';
import { roleLabel } from '@launchpad/auth';

const ACTION_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  sent_back: 'Sent back',
  fx_adjusted: 'FX adjusted',
  final_approved: 'Final approval',
};

export function Trail({ history }: { history: CostingHistory[] }) {
  if (history.length === 0) {
    return <p className="note">No activity yet.</p>;
  }

  const ordered = [...history].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {ordered.map((h) => (
        <li
          key={h.id}
          style={{
            padding: '10px 0',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <strong>{ACTION_LABEL[h.action] ?? h.action}</strong>
            {h.actor_role && (
              <span className="note">{roleLabel(h.actor_role)}</span>
            )}
            <span className="note" style={{ marginLeft: 'auto' }}>
              {new Date(h.created_at).toLocaleString('en-AU')}
            </span>
          </div>
          {h.notes && (
            <div style={{ fontSize: 13, color: 'var(--neg)' }}>
              Note: {h.notes}
            </div>
          )}
          {h.detail && (
            <div className="note" style={{ fontSize: 12 }}>
              {h.detail}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
