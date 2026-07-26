import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getActiveMembership } from "@/lib/supabase/queries";

export type ContactType = "supplier" | "customer" | "representative";

export const CONTACT_TYPES: ContactType[] = ["supplier", "customer", "representative"];

export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  supplier: "Supplier",
  customer: "Customer",
  representative: "Representative",
};

export interface ContactRecord {
  id: string;
  contactType: ContactType;
  companyName: string | null;
  personName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  address: string | null;
  notes: string | null;
  isDefault: boolean;
}

export interface ContactInput {
  id?: string;
  contactType: ContactType;
  companyName: string;
  personName: string;
  email: string;
  phone: string;
  jobTitle: string;
  address: string;
  notes: string;
  isDefault: boolean;
}

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  return createClient();
}

function mapRow(row: Record<string, unknown>): ContactRecord {
  return {
    id: row.id as string,
    contactType: row.contact_type as ContactType,
    companyName: (row.company_name as string) ?? null,
    personName: (row.person_name as string) ?? null,
    email: (row.email as string) ?? null,
    phone: (row.phone as string) ?? null,
    jobTitle: (row.job_title as string) ?? null,
    address: (row.address as string) ?? null,
    notes: (row.notes as string) ?? null,
    isDefault: Boolean(row.is_default),
  };
}

export function contactLabel(contact: ContactRecord): string {
  return contact.companyName || contact.personName || "Untitled contact";
}

export async function listContacts(type?: ContactType): Promise<ContactRecord[]> {
  const supabase = requireClient();
  let query = supabase
    .schema("costing")
    .from("contacts")
    .select("id, contact_type, company_name, person_name, email, phone, job_title, address, notes, is_default")
    .order("is_default", { ascending: false })
    .order("company_name", { ascending: true });
  if (type) query = query.eq("contact_type", type);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function saveContact(input: ContactInput): Promise<void> {
  const supabase = requireClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sign in before saving contacts.");
  const membership = await getActiveMembership(supabase, userData.user.id);
  if (!membership) throw new Error("No active organisation membership was found.");

  const payload = {
    contact_type: input.contactType,
    company_name: input.companyName.trim() || null,
    person_name: input.personName.trim() || null,
    email: input.email.trim() || null,
    phone: input.phone.trim() || null,
    job_title: input.jobTitle.trim() || null,
    address: input.address.trim() || null,
    notes: input.notes.trim() || null,
    is_default: input.isDefault,
  };

  let savedId = input.id;
  if (input.id) {
    const { error } = await supabase.schema("costing").from("contacts").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .schema("costing")
      .from("contacts")
      .insert({ ...payload, organization_id: membership.organizationId, created_by: userData.user.id })
      .select("id")
      .single();
    if (error) throw error;
    savedId = data.id as string;
  }

  // Only one representative can be the default; clear the flag on the others.
  if (input.isDefault && input.contactType === "representative" && savedId) {
    await supabase
      .schema("costing")
      .from("contacts")
      .update({ is_default: false })
      .eq("organization_id", membership.organizationId)
      .eq("contact_type", "representative")
      .neq("id", savedId);
  }
}

export async function deleteContact(id: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.schema("costing").from("contacts").delete().eq("id", id);
  if (error) throw error;
}
