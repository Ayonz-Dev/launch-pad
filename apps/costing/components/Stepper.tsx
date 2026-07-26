// Chain progress. Reads stage and status and renders the five-step approval
// chain, marking done / current / upcoming. Pure presentation.
//
// Australian English. No em dashes.

import type { CostingRole, CostingStatus } from '@launchpad/db';
import { COSTING_CHAIN, roleLabel } from '@launchpad/auth';

export function Stepper({
  stage,
  status,
}: {
  stage: CostingRole;
  status: CostingStatus;
}) {
  const currentIndex = COSTING_CHAIN.indexOf(stage);
  const approved = status === 'approved';
  const sentBack = status === 'sent_back';

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        margin: '4px 0 16px',
      }}
    >
      {COSTING_CHAIN.map((role, i) => {
        const done = approved || i < currentIndex;
        const current = !approved && i === currentIndex;
        const bg = done
          ? 'var(--teal)'
          : current
            ? sentBack
              ? 'var(--neg)'
              : 'var(--amber)'
            : '#fff';
        const color = done || current ? '#fff' : 'var(--ink-2)';
        return (
          <span key={role} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 12,
                border: '1px solid var(--line)',
                background: bg,
                color,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {roleLabel(role)}
            </span>
            {i < COSTING_CHAIN.length - 1 && (
              <span style={{ color: 'var(--line)' }}>-&gt;</span>
            )}
          </span>
        );
      })}
      <span
        style={{ marginLeft: 8 }}
        className={'badge ' + status}
      >
        {approved ? 'Approved' : status.replace('_', ' ')}
      </span>
    </div>
  );
}
