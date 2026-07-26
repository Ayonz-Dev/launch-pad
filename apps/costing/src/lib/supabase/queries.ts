import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActiveMembership {
  organizationId: string;
  organizationName: string | null;
  organizationSlug: string | null;
}

/**
 * Resolve the signed-in user's single active organisation membership.
 * Returns null when the user is authenticated but not yet a member of any
 * organisation (i.e. before the one-time /setup bootstrap has run).
 */
export async function getActiveMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveMembership | null> {
  const { data, error } = await supabase
    .schema("iam")
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const organizationId = data.organization_id as string;

  // Fetch the org name separately — more robust than a nested embed, which can
  // return an unexpected shape or fail relationship detection.
  const { data: org } = await supabase
    .schema("iam")
    .from("organizations")
    .select("name, slug")
    .eq("id", organizationId)
    .maybeSingle();

  return {
    organizationId,
    organizationName: (org?.name as string) ?? null,
    organizationSlug: (org?.slug as string) ?? null,
  };
}

let costingApplicationIdCache: string | null = null;

export async function getCostingApplicationId(supabase: SupabaseClient): Promise<string | null> {
  if (costingApplicationIdCache) return costingApplicationIdCache;
  const { data, error } = await supabase
    .schema("iam")
    .from("applications")
    .select("id")
    .eq("application_key", "costing")
    .maybeSingle();
  if (error) throw error;
  costingApplicationIdCache = (data?.id as string) ?? null;
  return costingApplicationIdCache;
}

/**
 * All Costing permission keys granted to the user in the given organisation,
 * resolved through their role assignments. Uses explicit queries rather than
 * nested PostgREST embedding so the path is easy to reason about and debug.
 */
export async function getCostingPermissions(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<string[]> {
  const applicationId = await getCostingApplicationId(supabase);
  if (!applicationId) return [];

  const { data: assignments, error: assignmentError } = await supabase
    .schema("iam")
    .from("user_role_assignments")
    .select("role_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("application_id", applicationId);
  if (assignmentError) throw assignmentError;

  const roleIds = [...new Set((assignments ?? []).map((row) => row.role_id as string))];
  if (roleIds.length === 0) return [];

  const { data: rolePermissions, error: rolePermissionError } = await supabase
    .schema("iam")
    .from("role_permissions")
    .select("permission_id")
    .in("role_id", roleIds);
  if (rolePermissionError) throw rolePermissionError;

  const permissionIds = [...new Set((rolePermissions ?? []).map((row) => row.permission_id as string))];
  if (permissionIds.length === 0) return [];

  const { data: permissions, error: permissionError } = await supabase
    .schema("iam")
    .from("permissions")
    .select("permission_key")
    .in("id", permissionIds);
  if (permissionError) throw permissionError;

  return (permissions ?? []).map((row) => row.permission_key as string);
}
