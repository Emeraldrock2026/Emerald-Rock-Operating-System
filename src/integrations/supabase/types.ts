export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      allocations: {
        Row: {
          allocation_date: string
          client_request_id: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          hours: number
          id: string
          needs_review: boolean
          note: string | null
          project_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          allocation_date: string
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          hours: number
          id?: string
          needs_review?: boolean
          note?: string | null
          project_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          allocation_date?: string
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          hours?: number
          id?: string
          needs_review?: boolean
          note?: string | null
          project_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "allocations_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "allocations_tenant_id_project_id_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          category: string
          id: number
          new_values: Json | null
          occurred_at: string
          old_values: Json | null
          record_id: string | null
          record_table: string
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          category: string
          id?: never
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          record_id?: string | null
          record_table: string
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          category?: string
          id?: never
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          record_id?: string | null
          record_table?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          contact_email: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          job_title: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          job_title?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          job_title?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          depends_on: string[]
          description: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          depends_on?: string[]
          description: string
          id: string
          name: string
          sort_order: number
        }
        Update: {
          depends_on?: string[]
          description?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      platform_admin_bootstrap: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          user_id?: string
        }
        Relationships: []
      }
      project_commercials: {
        Row: {
          agreed_fee: number | null
          budget_hours: number | null
          created_at: string
          created_by: string | null
          project_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          agreed_fee?: number | null
          budget_hours?: number | null
          created_at?: string
          created_by?: string | null
          project_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          agreed_fee?: number | null
          budget_hours?: number | null
          created_at?: string
          created_by?: string | null
          project_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_commercials_tenant_id_project_id_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      project_reference_counters: {
        Row: {
          last_value: number
          tenant_id: string
        }
        Insert: {
          last_value?: number
          tenant_id: string
        }
        Update: {
          last_value?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_reference_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          planned_finish_date: string
          project_manager_id: string | null
          reference: string
          scope: string
          start_date: string
          status: Database["public"]["Enums"]["project_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          planned_finish_date: string
          project_manager_id?: string | null
          reference: string
          scope?: string
          start_date: string
          status?: Database["public"]["Enums"]["project_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          planned_finish_date?: string
          project_manager_id?: string | null
          reference?: string
          scope?: string
          start_date?: string
          status?: Database["public"]["Enums"]["project_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_tenant_id_client_id_fkey"
            columns: ["tenant_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_tenant_id_project_manager_id_fkey"
            columns: ["tenant_id", "project_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          activated_at: string | null
          commercial_access: boolean
          created_at: string
          created_by: string | null
          email: string
          id: string
          invited_at: string
          invited_by: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          commercial_access?: boolean
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          version?: number
        }
        Update: {
          activated_at?: string | null
          commercial_access?: boolean
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_modules: {
        Row: {
          changed_at: string
          changed_by: string | null
          enabled: boolean
          module_id: string
          tenant_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          enabled?: boolean
          module_id: string
          tenant_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          enabled?: boolean
          module_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          base_currency: string
          brand_colour: string
          business_name: string
          created_at: string
          created_by: string | null
          date_format: string
          default_weekly_hours: number[]
          display_name: string
          id: string
          is_demo: boolean
          logo_path: string | null
          project_prefix: string
          status: Database["public"]["Enums"]["tenant_status"]
          timezone: string
          updated_at: string
          updated_by: string | null
          version: number
          week_starts_on: string
        }
        Insert: {
          base_currency?: string
          brand_colour?: string
          business_name: string
          created_at?: string
          created_by?: string | null
          date_format?: string
          default_weekly_hours?: number[]
          display_name: string
          id?: string
          is_demo?: boolean
          logo_path?: string | null
          project_prefix?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          week_starts_on?: string
        }
        Update: {
          base_currency?: string
          brand_colour?: string
          business_name?: string
          created_at?: string
          created_by?: string | null
          date_format?: string
          default_weekly_hours?: number[]
          display_name?: string
          id?: string
          is_demo?: boolean
          logo_path?: string | null
          project_prefix?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          week_starts_on?: string
        }
        Relationships: []
      }
      working_patterns: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          employee_id: string
          fri_hours: number
          id: string
          mon_hours: number
          sat_hours: number
          sun_hours: number
          tenant_id: string
          thu_hours: number
          tue_hours: number
          updated_at: string
          updated_by: string | null
          version: number
          wed_hours: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          employee_id: string
          fri_hours?: number
          id?: string
          mon_hours?: number
          sat_hours?: number
          sun_hours?: number
          tenant_id: string
          thu_hours?: number
          tue_hours?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          wed_hours?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          employee_id?: string
          fri_hours?: number
          id?: string
          mon_hours?: number
          sat_hours?: number
          sun_hours?: number
          tenant_id?: string
          thu_hours?: number
          tue_hours?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          wed_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "working_patterns_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_my_memberships: { Args: never; Returns: number }
      claim_platform_admin: { Args: never; Returns: boolean }
      current_employee_id: { Args: { _tenant: string }; Returns: string }
      employee_allocated_to: {
        Args: { _project: string; _tenant: string }
        Returns: boolean
      }
      has_commercial_access: { Args: { _tenant: string }; Returns: boolean }
      has_membership: { Args: { _tenant: string }; Returns: boolean }
      has_tenant_role: {
        Args: {
          _roles: Database["public"]["Enums"]["tenant_role"][]
          _tenant: string
        }
        Returns: boolean
      }
      is_active_member: { Args: { _tenant: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: { _tenant: string }; Returns: boolean }
      is_tenant_manager: { Args: { _tenant: string }; Returns: boolean }
      module_enabled: {
        Args: { _module: string; _tenant: string }
        Returns: boolean
      }
      tenant_today: { Args: { _tenant: string }; Returns: string }
    }
    Enums: {
      membership_status: "invited" | "active" | "suspended" | "removed"
      project_status: "draft" | "active" | "on_hold" | "completed" | "archived"
      tenant_role: "owner_admin" | "resource_manager" | "employee"
      tenant_status: "active" | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      membership_status: ["invited", "active", "suspended", "removed"],
      project_status: ["draft", "active", "on_hold", "completed", "archived"],
      tenant_role: ["owner_admin", "resource_manager", "employee"],
      tenant_status: ["active", "suspended"],
    },
  },
} as const
