// Settings. The CEO (Final Check) sets the working FX rate that every new
// costing inherits at insert. Final Check and Accounts manage the rate cards.
// Server component loads current values and gates the client editors by role.
//
// Australian English. No em dashes.

import { redirect } from 'next/navigation';
import { getServerSupabase } from '@launchpad/shell/server';
import {
  canManageRateCards,
  canSetWorkingFx,
  loadSessionUser,
} from '@launchpad/auth';
import { WorkingFxForm } from '@/components/WorkingFxForm';
import { RateCardForm } from '@/components/RateCardForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = getServerSupabase();
  const user = await loadSessionUser(supabase);
  if (!user) redirect('/login');

  const role = user.profile.role;
  if (!canSetWorkingFx(role) && !canManageRateCards(role)) redirect('/queue');

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .single();

  const { data: rateCard } = await supabase
    .from('rate_cards')
    .select('*')
    .order('is_default', { ascending: false })
    .limit(1)
    .single();

  return (
    <div className="page">
      <h1>Settings</h1>
      <p className="sub">Working FX and shared rate assumptions.</p>

      {canSetWorkingFx(role) && settings && (
        <div className="card">
          <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Working FX rate</h2>
          <p className="note" style={{ marginBottom: 12 }}>
            Snapshotted onto every new costing at creation. Existing costings
            keep the rate they were created with.
          </p>
          <WorkingFxForm workingFx={settings.working_fx} />
        </div>
      )}

      {canManageRateCards(role) && rateCard && (
        <div className="card">
          <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>
            Rate card: {rateCard.name}
          </h2>
          <p className="note" style={{ marginBottom: 12 }}>
            Shared cost assumptions used by the costing engine.
          </p>
          <RateCardForm rateCard={rateCard} />
        </div>
      )}
    </div>
  );
}
