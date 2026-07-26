import type { QuoteStatus } from "@/lib/costing";

export type AccessPersona =
  | "team_member"
  | "team_leader"
  | "general_manager"
  | "ceo"
  | "finance"
  | "admin";

export const ACCESS_PERSONA_STORAGE_KEY = "ayonz.costing.accessPersona";
export const ACCESS_TEAM_STORAGE_KEY = "ayonz.costing.accessTeam";
export const DEFAULT_ACCESS_PERSONA: AccessPersona = "admin";

export const ACCESS_PERSONA_OPTIONS: Array<{ value: AccessPersona; label: string }> = [
  { value: "team_member", label: "Team Member" },
  { value: "team_leader", label: "Team Leader" },
  { value: "general_manager", label: "General Manager" },
  { value: "ceo", label: "CEO" },
  { value: "finance", label: "Finance" },
  { value: "admin", label: "Admin" },
];

export function isTeamScopedPersona(persona: AccessPersona): boolean {
  return persona === "team_member" || persona === "team_leader";
}

export type PersonaCapability =
  | "create_quote"
  | "submit_review"
  | "approve_gm"
  | "approve_ceo"
  | "finance_export"
  | "manage_rates"
  | "manage_iam"
  | "see_all_teams"
  | "edit_any_quote";

const PERSONA_CAPS: Record<AccessPersona, PersonaCapability[]> = {
  team_member: ["create_quote"],
  team_leader: ["create_quote", "submit_review"],
  general_manager: ["create_quote", "approve_gm", "manage_rates", "see_all_teams", "edit_any_quote"],
  ceo: ["approve_ceo", "see_all_teams", "edit_any_quote"],
  finance: ["finance_export", "manage_rates", "see_all_teams"],
  admin: [
    "create_quote",
    "submit_review",
    "approve_gm",
    "approve_ceo",
    "finance_export",
    "manage_rates",
    "manage_iam",
    "see_all_teams",
    "edit_any_quote",
  ],
};

export function personaCan(persona: AccessPersona, capability: PersonaCapability): boolean {
  return PERSONA_CAPS[persona].includes(capability);
}

export interface QuoteAccessFields {
  status: QuoteStatus;
  teamId: string | null;
  hasRejection: boolean;
}

export function quoteVisibleToPersona(
  quote: QuoteAccessFields,
  persona: AccessPersona,
  selectedTeamId: string | null,
): boolean {
  if (persona === "finance") {
    return quote.status === "ceo_approved" || quote.status === "ready_for_export";
  }
  if (personaCan(persona, "see_all_teams")) return true;
  if (!selectedTeamId) return false;
  return quote.teamId === selectedTeamId;
}

/** Pipeline columns matching the sales approval process. */
export type QuoteQueueKey =
  | "drafts"
  | "awaiting_gm"
  | "awaiting_ceo"
  | "ceo_approved"
  | "ready_for_po";

export const QUEUE_ORDER: QuoteQueueKey[] = [
  "drafts",
  "awaiting_gm",
  "awaiting_ceo",
  "ceo_approved",
  "ready_for_po",
];

export function quoteQueueKey(quote: QuoteAccessFields): QuoteQueueKey | null {
  if (quote.status === "draft") return "drafts";
  if (quote.status === "ready_for_review") return "awaiting_gm";
  if (quote.status === "manager_approved") return "awaiting_ceo";
  if (quote.status === "ceo_approved") return "ceo_approved";
  if (quote.status === "ready_for_export") return "ready_for_po";
  return null;
}

export const QUEUE_LABEL: Record<QuoteQueueKey, string> = {
  drafts: "Draft",
  awaiting_gm: "Awaiting GM",
  awaiting_ceo: "Awaiting CEO",
  ceo_approved: "CEO approved",
  ready_for_po: "Ready for PO",
};

export const QUEUE_HINT: Record<QuoteQueueKey, string> = {
  drafts: "Team drafting / Team Leader submit",
  awaiting_gm: "General Manager review",
  awaiting_ceo: "CEO final approval",
  ceo_approved: "Finance to convert",
  ready_for_po: "PO export ready",
};
