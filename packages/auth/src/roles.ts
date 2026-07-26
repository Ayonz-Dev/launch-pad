// Shared identity and RBAC, expressed as data.
//
// No business rule about a role lives in app code. App code asks questions of
// this model (roleLabel, nextStage, canActOnCosting) rather than hardcoding
// role logic inline. When another app needs different roles, extend the model
// here rather than inventing a parallel one in the app.
//
// The first role set is the costing approval chain. A person has one
// profiles.role (see the costing schema). If apps later need per-app roles,
// that becomes a join table modelled in this package, not app-local state.
//
// Australian English. No em dashes.

import type { CostingRole, CostingStatus } from '@launchpad/db';

// The approval chain, in order. The array order IS the workflow order, so
// nextStage and the stepper both derive from it and cannot drift apart.
export const COSTING_CHAIN: readonly CostingRole[] = [
  'account_coordinator',
  'account_manager',
  'general_manager',
  'final_check',
  'accounts',
] as const;

export const ROLE_LABELS: Record<CostingRole, string> = {
  account_coordinator: 'Account Coordinator',
  account_manager: 'Account Manager',
  general_manager: 'General Manager',
  final_check: 'Final Check (CEO)',
  accounts: 'Accounts',
};

export function roleLabel(role: CostingRole): string {
  return ROLE_LABELS[role];
}

// The stage a costing moves to when the current stage approves. Returns null at
// the end of the chain (an approve there means final approval). Mirrors the
// approve_costing RPC exactly; the database remains the enforcer.
export function nextStage(stage: CostingRole): CostingRole | null {
  const i = COSTING_CHAIN.indexOf(stage);
  if (i < 0 || i >= COSTING_CHAIN.length - 1) return null;
  return COSTING_CHAIN[i + 1] ?? null;
}

// Roles allowed to set the final FX rate (Final Check and Accounts). Kept as a
// set so the check reads the same in the UI as the set_final_fx RPC enforces.
export const FX_ADJUSTERS: readonly CostingRole[] = [
  'final_check',
  'accounts',
] as const;

export function canSetFinalFx(role: CostingRole): boolean {
  return FX_ADJUSTERS.includes(role);
}

// Roles allowed to manage rate cards (the RATES tab and Settings screen).
export const RATE_CARD_MANAGERS: readonly CostingRole[] = [
  'final_check',
  'accounts',
] as const;

export function canManageRateCards(role: CostingRole): boolean {
  return RATE_CARD_MANAGERS.includes(role);
}

// Only the CEO (Final Check) sets the working FX on the Settings screen.
export function canSetWorkingFx(role: CostingRole): boolean {
  return role === 'final_check';
}

// What a user may do with a costing, given their role and the costing's current
// stage / status / ownership. This is the single source of truth the workflow
// bar and the sheet read; the database RPCs enforce the same rules server side.
export interface CostingActorContext {
  role: CostingRole;
  isOwner: boolean;
  stage: CostingRole;
  status: CostingStatus;
}

// The coordinator who owns a draft or sent-back job may edit its input cells.
export function canEditInputs(ctx: CostingActorContext): boolean {
  return (
    ctx.role === 'account_coordinator' &&
    ctx.isOwner &&
    (ctx.status === 'draft' || ctx.status === 'sent_back')
  );
}

// The coordinator who owns a draft or sent-back job may submit it.
export function canSubmit(ctx: CostingActorContext): boolean {
  return canEditInputs(ctx);
}

// A reviewer sitting at the job's current stage, while it is pending, may act
// on it (approve or send back).
export function canReview(ctx: CostingActorContext): boolean {
  return ctx.status === 'pending' && ctx.stage === ctx.role;
}

// The reviewer may set the final FX only at their own pending step, and only if
// their role is an FX adjuster.
export function canAdjustFxNow(ctx: CostingActorContext): boolean {
  return canReview(ctx) && canSetFinalFx(ctx.role);
}

// True once the job has cleared the whole chain. CSV export is unlocked here.
export function isApproved(status: CostingStatus): boolean {
  return status === 'approved';
}

// Whether a given costing is awaiting this user's action, for the queue filter.
// Reviewers see their pending stage; coordinators additionally see their
// sent-back jobs to revise.
export function isAwaitingMe(ctx: CostingActorContext): boolean {
  if (canReview(ctx)) return true;
  if (ctx.role === 'account_coordinator' && ctx.isOwner) {
    return ctx.status === 'sent_back';
  }
  return false;
}
