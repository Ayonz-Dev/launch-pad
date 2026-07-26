import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export interface SalespersonProfile {
  userId: string;
  commissionRate: number;
  isActive: boolean;
}

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  return createClient();
}

/** Commission profiles for the org, keyed by user id. */
export async function listSalespeople(organizationId: string): Promise<Record<string, SalespersonProfile>> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .schema("costing")
    .from("salesperson_profiles")
    .select("user_id, commission_rate, is_active")
    .eq("organization_id", organizationId);
  if (error) throw error;
  const map: Record<string, SalespersonProfile> = {};
  (data ?? []).forEach((row) => {
    map[row.user_id as string] = {
      userId: row.user_id as string,
      commissionRate: Number(row.commission_rate) || 0,
      isActive: Boolean(row.is_active),
    };
  });
  return map;
}

/** Admin: set a user's commission rate (upsert on org+user). */
export async function setCommission(organizationId: string, userId: string, commissionRate: number): Promise<void> {
  const supabase = requireClient();
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .schema("costing")
    .from("salesperson_profiles")
    .upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        commission_rate: commissionRate,
        created_by: userData.user?.id ?? null,
      },
      { onConflict: "organization_id,user_id" },
    );
  if (error) throw error;
}

/** The signed-in user's own commission rate (0 if none / offline). */
export async function getMyCommissionRate(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return 0;
  const { data } = await supabase
    .schema("costing")
    .from("salesperson_profiles")
    .select("commission_rate")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return Number(data?.commission_rate) || 0;
}
