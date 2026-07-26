// One costing: the sheet, the workflow bar, the stepper and the trail. Server
// component loads the inputs from costings, the locked cells from
// costing_computed and the history, then hands off to the client editor.
//
// Australian English. No em dashes.

import { notFound, redirect } from 'next/navigation';
import { getServerSupabase } from '@launchpad/shell/server';
import { loadSessionUser } from '@launchpad/auth';
import type {
  ContainerConfig,
  CostingComputed,
  Licence,
  PaymentTerm,
} from '@launchpad/db';
import { CostingEditor } from '@/components/CostingEditor';
import type { CostingInputs } from '@/lib/costing';

export const dynamic = 'force-dynamic';

export default async function CostingPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = getServerSupabase();
  const user = await loadSessionUser(supabase);
  if (!user) redirect('/login');

  const { data: costing } = await supabase
    .from('costings')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!costing) notFound();

  const { data: rateCard } = await supabase
    .from('rate_cards')
    .select('*')
    .eq('id', costing.rate_card_id)
    .single();

  if (!rateCard) notFound();

  const { data: computed } = await supabase
    .from('costing_computed')
    .select('*')
    .eq('id', params.id)
    .single();

  const { data: history } = await supabase
    .from('costing_history')
    .select('*')
    .eq('costing_id', params.id)
    .order('created_at', { ascending: false });

  const inputs: CostingInputs = {
    sku: costing.sku,
    description: costing.description ?? '',
    brand: costing.brand ?? '',
    vendor: costing.vendor ?? '',
    fob_usd: costing.fob_usd,
    duty_rate: costing.duty_rate,
    payment_term: costing.payment_term as PaymentTerm,
    container_config: costing.container_config as ContainerConfig,
    sell_ex_gst: costing.sell_ex_gst,
    rrp_inc_gst: costing.rrp_inc_gst,
    working_fx: costing.working_fx,
    final_fx: costing.final_fx,
  };

  return (
    <CostingEditor
      costingId={costing.id}
      initialInputs={inputs}
      initialLicences={(costing.licences ?? []) as Licence[]}
      initialRateCard={rateCard}
      initialComputed={(computed ?? null) as CostingComputed | null}
      ctx={{
        role: user.profile.role,
        isOwner: costing.created_by === user.id,
        stage: costing.stage,
        status: costing.status,
      }}
      history={history ?? []}
    />
  );
}
