'use client';

// Client host for one costing. Owns the editable input state, hosts the sheet,
// the workflow bar, the stepper and the trail. Persists ONLY input columns (and
// the rate card, when role permitted) directly; every stage / status / FX
// change goes through the workflow bar's RPCs. After a save it re-reads the
// computed view so the locked cells reconcile to the source of truth.
//
// Australian English. No em dashes.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@launchpad/db/client';
import type {
  CostingComputed,
  CostingHistory,
  Licence,
  RateCard,
} from '@launchpad/db';
import {
  canEditInputs,
  canManageRateCards,
  isApproved,
  type CostingActorContext,
} from '@launchpad/auth';
import CostingSheet from './CostingSheet';
import { WorkflowBar } from './WorkflowBar';
import { Stepper } from './Stepper';
import { Trail } from './Trail';
import type { CostingInputs } from '@/lib/costing';
import { buildMyobCsv, downloadCsv } from '@/lib/csv';

type Tab = 'INPUTS' | 'RATES' | 'ENGINE' | 'EXPORT';

export function CostingEditor({
  costingId,
  initialInputs,
  initialLicences,
  initialRateCard,
  initialComputed,
  ctx,
  history,
}: {
  costingId: string;
  initialInputs: CostingInputs;
  initialLicences: Licence[];
  initialRateCard: RateCard;
  initialComputed: CostingComputed | null;
  ctx: CostingActorContext;
  history: CostingHistory[];
}) {
  const router = useRouter();
  const supabase = createBrowserSupabase();

  const [tab, setTab] = useState<Tab>('INPUTS');
  const [inputs, setInputs] = useState<CostingInputs>(initialInputs);
  const [licences, setLicences] = useState<Licence[]>(initialLicences);
  const [rateCard, setRateCard] = useState<RateCard>(initialRateCard);
  const [computed, setComputed] = useState<CostingComputed | null>(
    initialComputed,
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = canEditInputs(ctx);
  const canEditRates = canManageRateCards(ctx.role);
  const csvEnabled = isApproved(ctx.status) && computed != null;

  function patchInputs(patch: Partial<CostingInputs>) {
    setInputs((p) => ({ ...p, ...patch }));
    setDirty(true);
  }
  function patchLicences(next: Licence[]) {
    setLicences(next);
    setDirty(true);
  }
  function patchRateCard(patch: Partial<RateCard>) {
    setRateCard((p) => ({ ...p, ...patch }));
    setDirty(true);
  }

  async function refetchComputed() {
    const { data } = await supabase
      .from('costing_computed')
      .select('*')
      .eq('id', costingId)
      .single();
    if (data) setComputed(data as CostingComputed);
  }

  async function save() {
    setSaving(true);
    setError(null);

    if (editable) {
      const { error: e } = await supabase
        .from('costings')
        .update({
          sku: inputs.sku,
          description: inputs.description,
          brand: inputs.brand,
          vendor: inputs.vendor,
          fob_usd: inputs.fob_usd,
          duty_rate: inputs.duty_rate,
          payment_term: inputs.payment_term,
          container_config: inputs.container_config,
          sell_ex_gst: inputs.sell_ex_gst,
          rrp_inc_gst: inputs.rrp_inc_gst,
          licences,
          updated_at: new Date().toISOString(),
        })
        .eq('id', costingId);
      if (e) {
        setSaving(false);
        setError(e.message);
        return;
      }
    }

    if (canEditRates) {
      const { id, created_at, ...rateFields } = rateCard;
      const { error: e } = await supabase
        .from('rate_cards')
        .update(rateFields)
        .eq('id', id);
      if (e) {
        setSaving(false);
        setError(e.message);
        return;
      }
    }

    await refetchComputed();
    setDirty(false);
    setSaving(false);
    router.refresh();
  }

  function onDownloadCsv() {
    if (!computed) return;
    downloadCsv(`${computed.sku}_MYOB.csv`, buildMyobCsv([computed]));
  }

  return (
    <div className="page">
      <Stepper stage={ctx.stage} status={ctx.status} />

      {error && <div className="error">{error}</div>}

      <CostingSheet
        tab={tab}
        onTabChange={setTab}
        inputs={inputs}
        licences={licences}
        rateCard={rateCard}
        computed={computed}
        readOnly={!editable}
        canEditRates={canEditRates}
        dirty={dirty}
        csvEnabled={csvEnabled}
        onInputChange={patchInputs}
        onLicencesChange={patchLicences}
        onRateCardChange={patchRateCard}
        onDownloadCsv={onDownloadCsv}
      />

      <div style={{ height: 16 }} />

      <WorkflowBar
        costingId={costingId}
        ctx={ctx}
        dirty={dirty}
        saving={saving}
        onSave={save}
        computed={computed}
      />

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>Approval trail</h2>
        <Trail history={history} />
      </div>
    </div>
  );
}
