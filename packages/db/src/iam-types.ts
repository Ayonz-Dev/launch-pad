// Types for the shared IAM schema (the real identity and access model of the
// Ayonz platform: organisations, memberships, applications, roles, permissions
// and role assignments). Mirrors costing-app's initial migration, now the
// schema of record in packages/db/migrations/0001_iam_and_costing_platform.sql.
//
// A signed-in user can read exactly these tables under the IAM RLS: the global
// catalogues (applications, roles, permissions, role_permissions), their own
// user_profiles row, and the memberships / role assignments of organisations
// they belong to. That is enough to compute their effective permissions in
// TypeScript, mirroring iam_private.authorized, without a privileged call.
//
// Australian English. No em dashes.

// Application keys registered on the shared project.
export type ApplicationKey = 'costing' | 'visibility';

export type MembershipStatus = 'invited' | 'active' | 'suspended';

export interface IamApplication {
  id: string;
  application_key: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface IamOrganization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface IamUserProfile {
  user_id: string;
  display_name: string | null;
  job_title: string | null;
  phone: string | null;
  default_organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface IamMembership {
  id: string;
  organization_id: string;
  user_id: string;
  status: MembershipStatus;
  created_at: string;
}

export interface IamRole {
  id: string;
  application_id: string;
  role_key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface IamPermission {
  id: string;
  application_id: string;
  permission_key: string;
  description: string | null;
  created_at: string;
}

export interface IamRolePermission {
  role_id: string;
  permission_id: string;
  application_id: string;
  created_at: string;
}

export interface IamRoleAssignment {
  id: string;
  organization_id: string;
  application_id: string;
  user_id: string;
  role_id: string;
  granted_by: string | null;
  created_at: string;
}

// Minimal Supabase Database shape for the iam schema, so a client created with
// db.schema = 'iam' is typed. Only the columns the platform reads are modelled.
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface IamDatabase {
  iam: {
    Tables: {
      applications: Table<IamApplication>;
      organizations: Table<IamOrganization>;
      user_profiles: Table<IamUserProfile>;
      organization_memberships: Table<IamMembership>;
      roles: Table<IamRole>;
      permissions: Table<IamPermission>;
      role_permissions: Table<IamRolePermission>;
      user_role_assignments: Table<IamRoleAssignment>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
