// Database types for the shared Supabase project.
//
// Hand written to match packages/db/migrations. Regenerate from the live schema
// with the Supabase CLI whenever the schema changes and replace this file:
//
//   supabase gen types typescript --project-id <id> > packages/db/src/types.ts
//
// Australian English. No em dashes.

export type CostingRole =
  | 'account_coordinator'
  | 'account_manager'
  | 'general_manager'
  | 'final_check'
  | 'accounts';

export type CostingStatus = 'draft' | 'pending' | 'sent_back' | 'approved';

export type PaymentTerm =
  | 'LC at sight'
  | 'TT 30 days'
  | 'TT 60 days'
  | 'TT 90 days';

export type ContainerConfig = '20FT' | '40FT' | '40FT High';

// A single technology licence line stored in costings.licences (jsonb).
export interface Licence {
  name: string;
  usd: number;
  on: boolean;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: CostingRole;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: CostingRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: CostingRole;
          created_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: boolean;
          working_fx: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          working_fx?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          working_fx?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      rate_cards: {
        Row: {
          id: string;
          name: string;
          is_default: boolean;
          units_20: number;
          units_40: number;
          units_40hc: number;
          freight_20_usd: number;
          freight_40_usd: number;
          freight_40hc_usd: number;
          destuff_aud: number;
          consultant_aud: number;
          ewaste_aud: number;
          gst_rate: number;
          finance_lc: number;
          finance_30: number;
          finance_60: number;
          finance_90: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          is_default?: boolean;
          units_20: number;
          units_40: number;
          units_40hc: number;
          freight_20_usd: number;
          freight_40_usd: number;
          freight_40hc_usd: number;
          destuff_aud: number;
          consultant_aud: number;
          ewaste_aud: number;
          gst_rate?: number;
          finance_lc?: number;
          finance_30?: number;
          finance_60?: number;
          finance_90?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['rate_cards']['Insert']>;
        Relationships: [];
      };
      costings: {
        Row: {
          id: string;
          sku: string;
          description: string | null;
          brand: string | null;
          vendor: string | null;
          fob_usd: number;
          duty_rate: number;
          payment_term: string;
          container_config: string;
          sell_ex_gst: number;
          rrp_inc_gst: number;
          licences: Licence[];
          rate_card_id: string;
          working_fx: number;
          final_fx: number | null;
          stage: CostingRole;
          status: CostingStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        // Only the input columns are grantable to the client (see migration
        // 0002). stage / status / working_fx / final_fx are set by triggers and
        // RPCs, never by a direct insert or update from the app.
        Insert: {
          id?: string;
          sku: string;
          description?: string | null;
          brand?: string | null;
          vendor?: string | null;
          fob_usd: number;
          duty_rate?: number;
          payment_term?: string;
          container_config?: string;
          sell_ex_gst: number;
          rrp_inc_gst: number;
          licences?: Licence[];
          rate_card_id: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          sku?: string;
          description?: string | null;
          brand?: string | null;
          vendor?: string | null;
          fob_usd?: number;
          duty_rate?: number;
          payment_term?: string;
          container_config?: string;
          sell_ex_gst?: number;
          rrp_inc_gst?: number;
          licences?: Licence[];
          rate_card_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'costings_rate_card_id_fkey';
            columns: ['rate_card_id'];
            referencedRelation: 'rate_cards';
            referencedColumns: ['id'];
          },
        ];
      };
      costing_history: {
        Row: {
          id: string;
          costing_id: string;
          action: string;
          actor: string | null;
          actor_role: CostingRole | null;
          notes: string | null;
          detail: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          costing_id: string;
          action: string;
          actor?: string | null;
          actor_role?: CostingRole | null;
          notes?: string | null;
          detail?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database['public']['Tables']['costing_history']['Insert']
        >;
        Relationships: [
          {
            foreignKeyName: 'costing_history_costing_id_fkey';
            columns: ['costing_id'];
            referencedRelation: 'costings';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      costing_computed: {
        Row: {
          id: string;
          sku: string;
          description: string | null;
          brand: string | null;
          vendor: string | null;
          container_config: string;
          payment_term: string;
          fob_usd: number;
          fx: number;
          royalty_usd: number;
          exworks_aud: number;
          duty_aud: number;
          freight_per_unit_aud: number;
          destuff_per_unit_aud: number;
          landed_aud: number;
          finance_aud: number;
          consultant_aud: number;
          ewaste_aud: number;
          loaded_aud: number;
          sell_ex_gst: number;
          gross_profit_aud: number;
          gp_pct: number;
          rrp_ex_gst: number;
          rrp_inc_gst: number;
          retailer_margin_pct: number;
          stage: CostingRole;
          status: CostingStatus;
        };
        Relationships: [];
      };
    };
    Functions: {
      submit_costing: {
        Args: { p_id: string };
        Returns: undefined;
      };
      approve_costing: {
        Args: { p_id: string };
        Returns: undefined;
      };
      send_back_costing: {
        Args: { p_id: string; p_notes: string };
        Returns: undefined;
      };
      set_final_fx: {
        Args: { p_id: string; p_fx: number };
        Returns: undefined;
      };
    };
    Enums: {
      costing_role: CostingRole;
      costing_status: CostingStatus;
    };
  };
}

// Convenience row aliases used across the apps.
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Settings = Database['public']['Tables']['settings']['Row'];
export type RateCard = Database['public']['Tables']['rate_cards']['Row'];
export type Costing = Database['public']['Tables']['costings']['Row'];
export type CostingHistory =
  Database['public']['Tables']['costing_history']['Row'];
export type CostingComputed =
  Database['public']['Views']['costing_computed']['Row'];
