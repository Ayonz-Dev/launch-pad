import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getActiveMembership } from "@/lib/supabase/queries";

export interface TeamRecord {
  id: string;
  name: string;
  salesRepLabel: string | null;
  leaderUserId: string | null;
}

export interface TeamMemberRecord {
  userId: string;
  isLeader: boolean;
}

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  return createClient();
}

function throwQueryError(error: unknown, fallback: string): never {
  if (error instanceof Error) throw error;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) throw new Error(message);
  }
  throw new Error(fallback);
}

export async function listTeams(): Promise<TeamRecord[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = requireClient();
  const { data, error } = await supabase
    .schema("costing")
    .from("teams")
    .select("id, name, sales_rep_label, leader_user_id")
    .order("name", { ascending: true });
  if (error) {
    // Migration may not be applied yet.
    if (error.message.includes("does not exist") || error.code === "42P01" || error.code === "PGRST205") {
      return [];
    }
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    salesRepLabel: (row.sales_rep_label as string) ?? null,
    leaderUserId: (row.leader_user_id as string) ?? null,
  }));
}

export async function listTeamMemberships(teamId: string): Promise<TeamMemberRecord[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .schema("costing")
    .from("team_memberships")
    .select("user_id, is_leader")
    .eq("team_id", teamId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    isLeader: Boolean(row.is_leader),
  }));
}

export async function createTeam(input: {
  name: string;
  salesRepLabel?: string;
  leaderUserId?: string | null;
}): Promise<TeamRecord> {
  const { supabase, user } = await (async () => {
    const client = requireClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error("Sign in before continuing.");
    return { supabase: client, user: data.user };
  })();
  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) throw new Error("No active organisation membership was found.");

  const { data, error } = await supabase
    .schema("costing")
    .from("teams")
    .insert({
      organization_id: membership.organizationId,
      name: input.name.trim(),
      sales_rep_label: input.salesRepLabel?.trim() || null,
      leader_user_id: input.leaderUserId || null,
    })
    .select("id, name, sales_rep_label, leader_user_id")
    .single();
  if (error) throwQueryError(error, "Could not create team.");

  if (input.leaderUserId) {
    await supabase.schema("costing").from("team_memberships").upsert(
      {
        team_id: data.id,
        user_id: input.leaderUserId,
        is_leader: true,
      },
      { onConflict: "team_id,user_id" },
    );
  }

  return {
    id: data.id as string,
    name: data.name as string,
    salesRepLabel: (data.sales_rep_label as string) ?? null,
    leaderUserId: (data.leader_user_id as string) ?? null,
  };
}

export async function updateTeam(
  teamId: string,
  patch: { name?: string; salesRepLabel?: string | null; leaderUserId?: string | null },
): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .schema("costing")
    .from("teams")
    .update({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.salesRepLabel !== undefined ? { sales_rep_label: patch.salesRepLabel?.trim() || null } : {}),
      ...(patch.leaderUserId !== undefined ? { leader_user_id: patch.leaderUserId || null } : {}),
    })
    .eq("id", teamId);
  if (error) throw error;

  if (patch.leaderUserId) {
    await supabase.schema("costing").from("team_memberships").upsert(
      { team_id: teamId, user_id: patch.leaderUserId, is_leader: true },
      { onConflict: "team_id,user_id" },
    );
  }
}

export async function deleteTeam(teamId: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.schema("costing").from("teams").delete().eq("id", teamId);
  if (error) throw error;
}

export async function setTeamMembership(
  teamId: string,
  userId: string,
  isLeader: boolean,
): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.schema("costing").from("team_memberships").upsert(
    { team_id: teamId, user_id: userId, is_leader: isLeader },
    { onConflict: "team_id,user_id" },
  );
  if (error) throw error;
  if (isLeader) {
    await supabase.schema("costing").from("teams").update({ leader_user_id: userId }).eq("id", teamId);
  }
}

export async function removeTeamMembership(teamId: string, userId: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .schema("costing")
    .from("team_memberships")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId);
  if (error) throw error;
}
