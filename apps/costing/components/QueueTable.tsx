'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CostingRole, CostingStatus } from '@launchpad/db';
import { isAwaitingMe } from '@launchpad/auth';

export interface QueueRow {
  id: string;
  sku: string;
  description: string | null;
  stage: CostingRole;
  status: CostingStatus;
  created_by: string;
  landed_aud: number | null;
  loaded_aud: number | null;
  gp_pct: number | null;
}

const aud = (n: number | null) =>
  n == null || !isFinite(n)
    ? '—'
    : n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const pct = (n: number | null) =>
  n == null || !isFinite(n) ? '—' : (n * 100).toFixed(1) + '%';

export function QueueTable({
  rows,
  role,
  userId,
}: {
  rows: QueueRow[];
  role: CostingRole;
  userId: string;
}) {
  const [mineOnly, setMineOnly] = useState(true);

  const visible = mineOnly
    ? rows.filter((r) =>
        isAwaitingMe({
          role,
          isOwner: r.created_by === userId,
          stage: r.stage,
          status: r.status,
        }),
      )
    : rows;

  return (
    <>
      <label
        style={{
          display: 'inline-flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
          fontSize: 13,
        }}
      >
        <input
          type="checkbox"
          checked={mineOnly}
          onChange={(e) => setMineOnly(e.target.checked)}
        />
        Awaiting me
      </label>

      {visible.length === 0 ? (
        <p className="note">
          {mineOnly
            ? 'Nothing is awaiting you right now.'
            : 'No costings yet.'}
        </p>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Description</th>
              <th>Stage</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Landed</th>
              <th style={{ textAlign: 'right' }}>Loaded</th>
              <th style={{ textAlign: 'right' }}>GP %</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/costing/${r.id}`}>{r.sku}</Link>
                </td>
                <td>{r.description ?? ''}</td>
                <td>{r.stage.replace(/_/g, ' ')}</td>
                <td>
                  <span className={'badge ' + r.status}>
                    {r.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="num">{aud(r.landed_aud)}</td>
                <td className="num">{aud(r.loaded_aud)}</td>
                <td className="num">{pct(r.gp_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
