'use client';

// The workflow bar. Every action calls a security definer RPC, never a direct
// table write to stage / status / final_fx. After each action the queue and the
// costing page are revalidated by a full refresh.
//
// Australian English. No em dashes.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@launchpad/db/client';
import type { CostingComputed } from '@launchpad/db';
import {
  canAdjustFxNow,
  canReview,
  canSubmit,
  type CostingActorContext,
} from '@launchpad/auth';

export function WorkflowBar({
  costingId,
  ctx,
  dirty,
  saving,
  onSave,
  computed,
}: {
  costingId: string;
  ctx: CostingActorContext;
  dirty: boolean;
  saving: boolean;
  onSave: () => Promise<void> | void;
  computed: CostingComputed | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [showSendBack, setShowSendBack] = useState(false);
  const [fx, setFx] = useState<string>(
    computed?.fx != null ? String(computed.fx) : '',
  );

  const supabase = createBrowserSupabase();

  async function run(label: string, fn: () => Promise<{ error: unknown }>) {
    setBusy(label);
    setError(null);
    const { error } = await fn();
    setBusy(null);
    if (error) {
      setError(
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Something went wrong.',
      );
      return false;
    }
    router.push('/queue');
    router.refresh();
    return true;
  }

  const submit = () =>
    run('submit', async () =>
      supabase.rpc('submit_costing', { p_id: costingId }),
    );
  const approve = () =>
    run('approve', async () =>
      supabase.rpc('approve_costing', { p_id: costingId }),
    );
  const sendBack = () =>
    run('sendback', async () =>
      supabase.rpc('send_back_costing', { p_id: costingId, p_notes: notes }),
    );

  async function setFinalFx() {
    const value = Number(fx);
    if (!isFinite(value) || value <= 0) {
      setError('Enter a valid FX rate.');
      return;
    }
    setBusy('fx');
    setError(null);
    const { error } = await supabase.rpc('set_final_fx', {
      p_id: costingId,
      p_fx: value,
    });
    setBusy(null);
    if (error) {
      setError(error.message);
      return;
    }
    // Stay on the page and refresh so the recomputed view is shown.
    router.refresh();
  }

  const showSubmit = canSubmit(ctx);
  const showReview = canReview(ctx);
  const showFx = canAdjustFxNow(ctx);

  return (
    <div className="card">
      {error && <div className="error">{error}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {showSubmit && (
          <>
            <button
              className="btn secondary"
              onClick={() => onSave()}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              className="btn"
              onClick={submit}
              disabled={busy !== null || dirty}
              title={dirty ? 'Save your changes before submitting' : undefined}
            >
              {busy === 'submit' ? 'Submitting...' : 'Submit'}
            </button>
          </>
        )}

        {showReview && (
          <>
            <button
              className="btn"
              onClick={approve}
              disabled={busy !== null}
            >
              {busy === 'approve' ? 'Approving...' : 'Approve'}
            </button>
            <button
              className="btn secondary"
              onClick={() => setShowSendBack((s) => !s)}
              disabled={busy !== null}
            >
              Send back
            </button>
          </>
        )}
      </div>

      {showReview && showSendBack && (
        <div style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="notes">Revision note (required)</label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What needs to change before this can proceed"
            />
          </div>
          <button
            className="btn danger"
            onClick={sendBack}
            disabled={busy !== null || notes.trim() === ''}
          >
            {busy === 'sendback' ? 'Sending...' : 'Confirm send back'}
          </button>
        </div>
      )}

      {showFx && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--line)',
          }}
        >
          <div className="field" style={{ maxWidth: 260 }}>
            <label htmlFor="fx">Set final FX rate (USD/AUD)</label>
            <input
              id="fx"
              type="number"
              step="0.0001"
              value={fx}
              onChange={(e) => setFx(e.target.value)}
            />
          </div>
          <button className="btn" onClick={setFinalFx} disabled={busy === 'fx'}>
            {busy === 'fx' ? 'Applying...' : 'Set final rate'}
          </button>
          <p className="note" style={{ marginTop: 6 }}>
            Applying a final rate recalculates the locked cells from the view.
          </p>
        </div>
      )}
    </div>
  );
}
