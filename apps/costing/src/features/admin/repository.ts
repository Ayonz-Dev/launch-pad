import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getCostingApplicationId } from "@/lib/supabase/queries";

export interface CostingRole {
  id: string;
  roleKey: string;
  name: string;
}

export interface Member {
  userId: string;
  status: string;
  isSelf: boolean;
  roleIds: string[];
}

export interface AdminSnapshot {
  roles: CostingRole[];
  members: Member[];
}

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  return createClient();
}

export async function loadAdminSnapshot(organizationId: string): Promise<AdminSnapshot> {
  const supabase = requireClient();
  const applicationId = await getCostingApplicationId(supabase);
  if (!applicationId) throw new Error("Costing application is not registered.");

  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id ?? null;

  const [{ data: roleRows, error: roleError }, { data: memberRows, error: memberError }, { data: assignmentRows, error: assignmentError }] =
    await Promise.all([
      supabase.schema("iam").from("roles").select("id, role_key, name").eq("application_id", applicationId),
      supabase.schema("iam").from("organization_memberships").select("user_id, status").eq("organization_id", organizationId),
      supabase
        .schema("iam")
        .from("user_role_assignments")
        .select("user_id, role_id")
        .eq("organization_id", organizationId)
        .eq("application_id", applicationId),
    ]);
  if (roleError) throw roleError;
  if (memberError) throw memberError;
  if (assignmentError) throw assignmentError;

  const rolesByUser = new Map<string, string[]>();
  (assignmentRows ?? []).forEach((row) => {
    const list = rolesByUser.get(row.user_id as string) ?? [];
    list.push(row.role_id as string);
    rolesByUser.set(row.user_id as string, list);
  });

  const roles: CostingRole[] = (roleRows ?? []).map((row) => ({
    id: row.id as string,
    roleKey: row.role_key as string,
    name: row.name as string,
  }));

  const members: Member[] = (memberRows ?? []).map((row) => ({
    userId: row.user_id as string,
    status: row.status as string,
    isSelf: row.user_id === selfId,
    roleIds: rolesByUser.get(row.user_id as string) ?? [],
  }));

  return { roles, members };
}

export interface MemberIdentity {
  email: string | null;
  displayName: string | null;
}

/**
 * Fetch a name/email directory for org members via the security-definer RPC.
 * Returns an empty map for non-admins or if the migration hasn't been applied,
 * so callers can fall back to showing the user ID.
 */
export async function loadMemberDirectory(organizationId: string): Promise<Record<string, MemberIdentity>> {
  const supabase = requireClient();
  try {
    const { data, error } = await supabase.rpc("costing_member_directory", {
      target_organization_id: organizationId,
    });
    if (error) return {};
    const map: Record<string, MemberIdentity> = {};
    (data ?? []).forEach((row: Record<string, unknown>) => {
      map[row.user_id as string] = {
        email: (row.email as string) ?? null,
        displayName: (row.display_name as string) ?? null,
      };
    });
    return map;
  } catch {
    return {};
  }
}

export async function assignRole(organizationId: string, userId: string, roleId: string): Promise<void> {
  const supabase = requireClient();
  const applicationId = await getCostingApplicationId(supabase);
  if (!applicationId) throw new Error("Costing application is not registered.");
  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase.schema("iam").from("user_role_assignments").insert({
    organization_id: organizationId,
    application_id: applicationId,
    user_id: userId,
    role_id: roleId,
    granted_by: userData.user?.id ?? null,
  });
  if (error) throw error;
}

export async function removeRole(organizationId: string, userId: string, roleId: string): Promise<void> {
  const supabase = requireClient();
  const applicationId = await getCostingApplicationId(supabase);
  if (!applicationId) throw new Error("Costing application is not registered.");

  const { error } = await supabase
    .schema("iam")
    .from("user_role_assignments")
    .delete()
    .eq("organization_id", organizationId)
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .eq("role_id", roleId);
  if (error) throw error;
}
