// Shared IAM identity and authorisation, in TypeScript.
//
// This is the platform's real identity model: a person belongs to one or more
// organisations and holds role assignments per application, and each role
// grants permissions. It replaces the prototype profiles.role model as the
// canonical shared identity (the prototype costing app keeps its own local
// model until it is migrated).
//
// loadIamUser reads the user's own IAM rows through the per-user iam client and
// computes their effective permissions the same way the database function
// iam_private.authorized does, so app code can gate UI without a privileged
// call and the database RLS still enforces the truth on every query.
//
// Australian English. No em dashes.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IamDatabase,
  IamOrganization,
  IamRoleAssignment,
  IamUserProfile,
} from '@launchpad/db';

export type IamClient = SupabaseClient<IamDatabase, 'iam'>;

// Application keys and their permission keys, as seeded on the shared project.
export const APP = {
  costing: 'costing',
  visibility: 'visibility',
} as const;

export const VISIBILITY_PERMISSIONS = {
  read: 'shipments.read',
  write: 'shipments.write',
  manage: 'shipments.manage',
  iamManage: 'iam.manage',
} as const;

export const COSTING_PERMISSIONS = {
  quotesCreate: 'quotes.create',
  quotesReadAll: 'quotes.read_all',
  quotesUpdateAll: 'quotes.update_all',
  approveManager: 'quotes.approve_manager',
  approveCeo: 'quotes.approve_ceo',
  ratesManage: 'rates.manage',
  iamManage: 'iam.manage',
} as const;

export interface IamUser {
  id: string;
  email: string | null;
  profile: IamUserProfile | null;
  defaultOrganizationId: string | null;
  organizations: IamOrganization[];
  roleAssignments: IamRoleAssignment[];
  // permissions.get(applicationKey)?.get(organizationId) -> set of permission keys
  permissions: Map<string, Map<string, Set<string>>>;
}

// Load the signed-in user's IAM identity and compute their permissions. Returns
// null when there is no session. The client must be scoped to the iam schema
// (createIamServerSupabase).
export async function loadIamUser(client: IamClient): Promise<IamUser | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const [
    profileRes,
    membershipsRes,
    assignmentsRes,
    appsRes,
    permsRes,
    rolePermsRes,
  ] = await Promise.all([
    client.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    client
      .from('organization_memberships')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active'),
    client.from('user_role_assignments').select('*').eq('user_id', user.id),
    client.from('applications').select('*'),
    client.from('permissions').select('*'),
    client.from('role_permissions').select('*'),
  ]);

  const profile = profileRes.data ?? null;
  const assignments = assignmentsRes.data ?? [];
  const orgIds = [
    ...new Set((membershipsRes.data ?? []).map((m) => m.organization_id)),
  ];

  const orgsRes = orgIds.length
    ? await client.from('organizations').select('*').in('id', orgIds)
    : { data: [] as IamOrganization[] };

  // Lookups.
  const appKeyById = new Map(
    (appsRes.data ?? []).map((a) => [a.id, a.application_key] as const),
  );
  const permKeyById = new Map(
    (permsRes.data ?? []).map((p) => [p.id, p.permission_key] as const),
  );
  const permIdsByRole = new Map<string, string[]>();
  for (const rp of rolePermsRes.data ?? []) {
    const list = permIdsByRole.get(rp.role_id) ?? [];
    list.push(rp.permission_id);
    permIdsByRole.set(rp.role_id, list);
  }

  // permissions[appKey][orgId] = set of permission keys, from this user's
  // assignments. Mirrors iam_private.authorized.
  const permissions = new Map<string, Map<string, Set<string>>>();
  for (const a of assignments) {
    const appKey = appKeyById.get(a.application_id);
    if (!appKey) continue;
    const byOrg = permissions.get(appKey) ?? new Map<string, Set<string>>();
    const set = byOrg.get(a.organization_id) ?? new Set<string>();
    for (const permId of permIdsByRole.get(a.role_id) ?? []) {
      const key = permKeyById.get(permId);
      if (key) set.add(key);
    }
    byOrg.set(a.organization_id, set);
    permissions.set(appKey, byOrg);
  }

  return {
    id: user.id,
    email: user.email ?? null,
    profile,
    defaultOrganizationId: profile?.default_organization_id ?? null,
    organizations: orgsRes.data ?? [],
    roleAssignments: assignments,
    permissions,
  };
}

// The organisation to act in: the user's default, else their first membership.
export function activeOrganizationId(user: IamUser): string | null {
  if (user.defaultOrganizationId) return user.defaultOrganizationId;
  return user.organizations[0]?.id ?? null;
}

// Does the user hold a permission for an application, in a given organisation?
// When orgId is omitted, checks the active organisation. Mirrors the database
// iam_private.authorized(applicationKey, permissionKey, organizationId).
export function authorized(
  user: IamUser,
  applicationKey: string,
  permissionKey: string,
  orgId?: string,
): boolean {
  const org = orgId ?? activeOrganizationId(user);
  if (!org) return false;
  return Boolean(user.permissions.get(applicationKey)?.get(org)?.has(permissionKey));
}

// All permission keys the user holds for an application, in a given (or the
// active) organisation.
export function permissionsFor(
  user: IamUser,
  applicationKey: string,
  orgId?: string,
): Set<string> {
  const org = orgId ?? activeOrganizationId(user);
  if (!org) return new Set();
  return user.permissions.get(applicationKey)?.get(org) ?? new Set();
}
