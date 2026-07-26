// Create a costing. Coordinator only. Inserts the input columns against the
// default rate card; the costings_defaults trigger snapshots working_fx and
// pins stage / status. Redirects to the new costing.
//
// Australian English. No em dashes.

import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { loadSessionUser } from '@launchpad/auth';
import { NewCostingForm } from '@/components/NewCostingForm';

export const dynamic = 'force-dynamic';

export default async function NewCostingPage() {
  const supabase = getServerSupabase();
  const user = await loadSessionUser(supabase);
  if (!user) redirect('/login');
  if (user.profile.role !== 'account_coordinator') redirect('/queue');

  const { data: rateCards } = await supabase
    .from('rate_cards')
    .select('id, name, is_default')
    .order('is_default', { ascending: false });

  if (!rateCards || rateCards.length === 0) {
    return (
      <div className="page">
        <h1>New costing</h1>
        <p className="error">
          No rate card exists yet. Ask an administrator to add one (migration
          0003 seeds a default) before creating a costing.
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>New costing</h1>
      <p className="sub">
        Enter the inputs. Everything else is calculated once you save.
      </p>
      <NewCostingForm
        rateCards={rateCards}
        defaultRateCardId={
          rateCards.find((r) => r.is_default)?.id ?? rateCards[0]!.id
        }
      />
    </div>
  );
}
