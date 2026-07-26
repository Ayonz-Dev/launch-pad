// The queue. Lists costings with landed / loaded / GP from the computed view,
// with a client-side "awaiting me" filter. Server component.
//
// Australian English. No em dashes.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@launchpad/shell/server';
import { loadSessionUser } from '@launchpad/auth';
import { QueueTable, type QueueRow } from '@/components/QueueTable';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const supabase = getServerSupabase();
  const user = await loadSessionUser(supabase);
  if (!user) redirect('/login');

  const { data: costings } = await supabase
    .from('costings')
    .select('id, sku, description, stage, status, created_by')
    .order('updated_at', { ascending: false });

  const { data: computed } = await supabase
    .from('costing_computed')
    .select('id, landed_aud, loaded_aud, gp_pct');

  const byId = new Map(
    (computed ?? []).map((c) => [c.id, c] as const),
  );

  const rows: QueueRow[] = (costings ?? []).map((c) => {
    const comp = byId.get(c.id);
    return {
      id: c.id,
      sku: c.sku,
      description: c.description,
      stage: c.stage,
      status: c.status,
      created_by: c.created_by,
      landed_aud: comp?.landed_aud ?? null,
      loaded_aud: comp?.loaded_aud ?? null,
      gp_pct: comp?.gp_pct ?? null,
    };
  });

  return (
    <div className="page">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1>Costings</h1>
          <p className="sub">Every costing and where it sits in the chain.</p>
        </div>
        {user.profile.role === 'account_coordinator' && (
          <Link href="/new" className="btn">
            New costing
          </Link>
        )}
      </div>

      <QueueTable rows={rows} role={user.profile.role} userId={user.id} />
    </div>
  );
}
