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
      comparison_findings: {
        Row: {
          amended_summary: string | null
          category: string
          change_record_id: string | null
          created_at: string
          created_by: string | null
          decision: string
          fingerprint: string
          first_comparison_id: string
          from_revision_id: string
          id: string
          last_seen_comparison_id: string
          location: string
          project_id: string
          record_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          summary: string
          tenant_id: string
          to_revision_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          amended_summary?: string | null
          category: string
          change_record_id?: string | null
          created_at?: string
          created_by?: string | null
          decision?: string
          fingerprint: string
          first_comparison_id: string
          from_revision_id: string
          id?: string
          last_seen_comparison_id: string
          location?: string
          project_id: string
          record_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          summary: string
          tenant_id: string
          to_revision_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          amended_summary?: string | null
          category?: string
          change_record_id?: string | null
          created_at?: string
          created_by?: string | null
          decision?: string
          fingerprint?: string
          first_comparison_id?: string
          from_revision_id?: string
          id?: string
          last_seen_comparison_id?: string
          location?: string
          project_id?: string
          record_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          summary?: string
          tenant_id?: string
          to_revision_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "comparison_findings_tenant_id_change_record_id_fkey"
            columns: ["tenant_id", "change_record_id"]
            isOneToOne: false
            referencedRelation: "project_records"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "comparison_findings_tenant_id_first_comparison_id_fkey"
            columns: ["tenant_id", "first_comparison_id"]
            isOneToOne: false
            referencedRelation: "drawing_comparisons"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "comparison_findings_tenant_id_last_seen_comparison_id_fkey"
            columns: ["tenant_id", "last_seen_comparison_id"]
            isOneToOne: false
            referencedRelation: "drawing_comparisons"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "comparison_findings_tenant_id_record_id_fkey"
            columns: ["tenant_id", "record_id"]
            isOneToOne: false
            referencedRelation: "project_records"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      drawing_comparisons: {
        Row: {
          error: string | null
          finding_count: number
          from_revision_id: string
          id: string
          model: string
          new_count: number
          project_id: string
          ran_at: string
          ran_by: string | null
          record_id: string
          status: string
          tenant_id: string
          to_revision_id: string
        }
        Insert: {
          error?: string | null
          finding_count?: number
          from_revision_id: string
          id?: string
          model?: string
          new_count?: number
          project_id: string
          ran_at?: string
          ran_by?: string | null
          record_id: string
          status: string
          tenant_id: string
          to_revision_id: string
        }
        Update: {
          error?: string | null
          finding_count?: number
          from_revision_id?: string
          id?: string
          model?: string
          new_count?: number
          project_id?: string
          ran_at?: string
          ran_by?: string | null
          record_id?: string
          status?: string
          tenant_id?: string
          to_revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_comparisons_tenant_id_from_revision_id_fkey"
            columns: ["tenant_id", "from_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "drawing_comparisons_tenant_id_record_id_fkey"
            columns: ["tenant_id", "record_id"]
            isOneToOne: false
            referencedRelation: "project_records"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "drawing_comparisons_tenant_id_to_revision_id_fkey"
            columns: ["tenant_id", "to_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      drawing_register_settings: {
        Row: {
          created_at: string
          created_by: string | null
          digits: number
          project_id: string
          series: string[]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          digits?: number
          project_id: string
          series?: string[]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          digits?: number
          project_id?: string
          series?: string[]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "drawing_register_settings_tenant_id_project_id_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      drawing_revisions: {
        Row: {
          authorised: boolean
          authorised_at: string | null
          authorised_by: string | null
          created_at: string
          created_by: string | null
          file_id: string
          file_version: number
          id: string
          note: string
          project_id: string
          purpose: string
          rank: number
          received_on: string
          record_id: string
          revision: string
          revision_date: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          authorised?: boolean
          authorised_at?: string | null
          authorised_by?: string | null
          created_at?: string
          created_by?: string | null
          file_id: string
          file_version: number
          id?: string
          note?: string
          project_id: string
          purpose?: string
          rank: number
          received_on: string
          record_id: string
          revision: string
          revision_date: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          authorised?: boolean
          authorised_at?: string | null
          authorised_by?: string | null
          created_at?: string
          created_by?: string | null
          file_id?: string
          file_version?: number
          id?: string
          note?: string
          project_id?: string
          purpose?: string
          rank?: number
          received_on?: string
          record_id?: string
          revision?: string
          revision_date?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "drawing_revisions_tenant_id_file_id_fkey"
            columns: ["tenant_id", "file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "drawing_revisions_tenant_id_project_id_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "drawing_revisions_tenant_id_record_id_fkey"
            columns: ["tenant_id", "record_id"]
            isOneToOne: false
            referencedRelation: "project_records"
            referencedColumns: ["tenant_id", "id"]
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
          built: boolean
          depends_on: string[]
          description: string
          id: string
          kind: string
          name: string
          sort_order: number
        }
        Insert: {
          built?: boolean
          depends_on?: string[]
          description: string
          id: string
          kind?: string
          name: string
          sort_order: number
        }
        Update: {
          built?: boolean
          depends_on?: string[]
          description?: string
          id?: string
          kind?: string
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
      project_file_versions: {
        Row: {
          file_id: string
          file_name: string
          id: string
          mime_type: string
          note: string
          size_bytes: number
          storage_path: string
          tenant_id: string
          uploaded_at: string
          uploaded_by: string | null
          version_no: number
        }
        Insert: {
          file_id: string
          file_name: string
          id?: string
          mime_type?: string
          note?: string
          size_bytes?: number
          storage_path: string
          tenant_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          version_no: number
        }
        Update: {
          file_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          note?: string
          size_bytes?: number
          storage_path?: string
          tenant_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_file_versions_tenant_id_file_id_fkey"
            columns: ["tenant_id", "file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      project_files: {
        Row: {
          caption: string
          created_at: string
          created_by: string | null
          current_version: number
          folder_id: string | null
          id: string
          module_id: string
          project_id: string
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          caption?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          folder_id?: string | null
          id?: string
          module_id: string
          project_id: string
          tags?: string[]
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          caption?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          folder_id?: string | null
          id?: string
          module_id?: string
          project_id?: string
          tags?: string[]
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_files_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_tenant_id_folder_id_fkey"
            columns: ["tenant_id", "folder_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "project_files_tenant_id_project_id_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      project_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          project_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          project_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          project_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_folders_tenant_id_parent_id_fkey"
            columns: ["tenant_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "project_folders_tenant_id_project_id_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      project_key_dates: {
        Row: {
          achieved_on: string | null
          created_at: string
          created_by: string | null
          due_on: string
          id: string
          label: string
          project_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          achieved_on?: string | null
          created_at?: string
          created_by?: string | null
          due_on: string
          id?: string
          label: string
          project_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          achieved_on?: string | null
          created_at?: string
          created_by?: string | null
          due_on?: string
          id?: string
          label?: string
          project_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_key_dates_tenant_id_project_id_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      project_modules: {
        Row: {
          changed_at: string
          changed_by: string | null
          enabled: boolean
          module_id: string
          project_id: string
          tenant_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          enabled?: boolean
          module_id: string
          project_id: string
          tenant_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          enabled?: boolean
          module_id?: string
          project_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_modules_tenant_id_project_id_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      project_organisations: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_role: string
          project_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_role?: string
          project_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_role?: string
          project_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_organisations_tenant_id_project_id_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      project_record_counters: {
        Row: {
          last_value: number
          module_id: string
          project_id: string
        }
        Insert: {
          last_value?: number
          module_id: string
          project_id: string
        }
        Update: {
          last_value?: number
          module_id?: string
          project_id?: string
        }
        Relationships: []
      }
      project_records: {
        Row: {
          completed_on: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          event_date: string | null
          fields: Json
          id: string
          is_closed: boolean
          location: string
          module_id: string
          project_id: string
          reference: string
          responsible_employee_id: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          completed_on?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          event_date?: string | null
          fields?: Json
          id?: string
          is_closed?: boolean
          location?: string
          module_id: string
          project_id: string
          reference?: string
          responsible_employee_id?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          completed_on?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          event_date?: string | null
          fields?: Json
          id?: string
          is_closed?: boolean
          location?: string
          module_id?: string
          project_id?: string
          reference?: string
          responsible_employee_id?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_records_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_records_tenant_id_project_id_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "project_records_tenant_id_responsible_employee_id_fkey"
            columns: ["tenant_id", "responsible_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      project_team: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          project_id: string
          project_role: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          project_id: string
          project_role?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          project_id?: string
          project_role?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_team_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "project_team_tenant_id_project_id_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      project_templates: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string
          folder_paths: string[]
          id: string
          module_ids: string[]
          name: string
          settings: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string
          folder_paths?: string[]
          id?: string
          module_ids?: string[]
          name: string
          settings?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string
          folder_paths?: string[]
          id?: string
          module_ids?: string[]
          name?: string
          settings?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string | null
          contract_form: string
          contract_notes: string
          contract_reference: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          planned_finish_date: string
          project_manager_id: string | null
          reference: string
          scope: string
          site_address: string
          start_date: string
          status: Database["public"]["Enums"]["project_status"]
          template_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          client_id?: string | null
          contract_form?: string
          contract_notes?: string
          contract_reference?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          planned_finish_date: string
          project_manager_id?: string | null
          reference: string
          scope?: string
          site_address?: string
          start_date: string
          status?: Database["public"]["Enums"]["project_status"]
          template_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          client_id?: string | null
          contract_form?: string
          contract_notes?: string
          contract_reference?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          planned_finish_date?: string
          project_manager_id?: string | null
          reference?: string
          scope?: string
          site_address?: string
          start_date?: string
          status?: Database["public"]["Enums"]["project_status"]
          template_id?: string | null
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
      record_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          record_id: string
          tenant_id: string
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: string
          record_id: string
          tenant_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          record_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_comments_tenant_id_record_id_fkey"
            columns: ["tenant_id", "record_id"]
            isOneToOne: false
            referencedRelation: "project_records"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      record_links: {
        Row: {
          created_at: string
          created_by: string | null
          from_record_id: string
          id: string
          tenant_id: string
          to_record_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_record_id: string
          id?: string
          tenant_id: string
          to_record_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_record_id?: string
          id?: string
          tenant_id?: string
          to_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_links_tenant_id_from_record_id_fkey"
            columns: ["tenant_id", "from_record_id"]
            isOneToOne: false
            referencedRelation: "project_records"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "record_links_tenant_id_to_record_id_fkey"
            columns: ["tenant_id", "to_record_id"]
            isOneToOne: false
            referencedRelation: "project_records"
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
          accent_colour: string
          base_currency: string
          brand_colour: string
          business_name: string
          created_at: string
          created_by: string | null
          date_format: string
          default_appearance: string
          default_weekly_hours: number[]
          display_name: string
          id: string
          is_demo: boolean
          logo_dark_path: string | null
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
          accent_colour?: string
          base_currency?: string
          brand_colour?: string
          business_name: string
          created_at?: string
          created_by?: string | null
          date_format?: string
          default_appearance?: string
          default_weekly_hours?: number[]
          display_name: string
          id?: string
          is_demo?: boolean
          logo_dark_path?: string | null
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
          accent_colour?: string
          base_currency?: string
          brand_colour?: string
          business_name?: string
          created_at?: string
          created_by?: string | null
          date_format?: string
          default_appearance?: string
          default_weekly_hours?: number[]
          display_name?: string
          id?: string
          is_demo?: boolean
          logo_dark_path?: string | null
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
      user_preferences: {
        Row: {
          appearance: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appearance: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appearance?: string
          updated_at?: string
          user_id?: string
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
      add_drawing_revision: {
        Args: {
          _file: string
          _file_version: number
          _note?: string
          _purpose?: string
          _record: string
          _revision: string
          _revision_date: string
        }
        Returns: string
      }
      add_member_invitation: {
        Args: {
          _email: string
          _role: Database["public"]["Enums"]["tenant_role"]
          _tenant: string
        }
        Returns: string
      }
      apply_project_template: {
        Args: { _project: string; _template: string }
        Returns: string[]
      }
      auth_user_id_by_email: { Args: { _email: string }; Returns: string }
      branding_folder_tenant: { Args: { _name: string }; Returns: string }
      can_compare_drawing: {
        Args: { _from: string; _record: string; _to: string }
        Returns: boolean
      }
      can_contribute_project: {
        Args: { _project: string; _tenant: string }
        Returns: boolean
      }
      can_manage_project: {
        Args: { _project: string; _tenant: string }
        Returns: boolean
      }
      can_read_project_file_object: {
        Args: { _name: string }
        Returns: boolean
      }
      can_view_project: {
        Args: { _project: string; _tenant: string }
        Returns: boolean
      }
      can_write_project_file_object: {
        Args: { _name: string }
        Returns: boolean
      }
      claim_platform_admin: { Args: never; Returns: boolean }
      current_employee_id: { Args: { _tenant: string }; Returns: string }
      drawing_revision_rank: {
        Args: { _code: string; _digits: number; _series: string[] }
        Returns: number
      }
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
      linked_record_summary: {
        Args: { _record: string }
        Returns: {
          accessible: boolean
          module_id: string
          record_id: string
          reference: string
          restriction: string
          title: string
        }[]
      }
      module_enabled: {
        Args: { _module: string; _tenant: string }
        Returns: boolean
      }
      my_project_client_names: {
        Args: { _tenant: string }
        Returns: {
          client_name: string
          project_id: string
        }[]
      }
      platform_tenant_overview: {
        Args: never
        Returns: {
          business_name: string
          created_at: string
          display_name: string
          is_demo: boolean
          members_active: number
          modules_enabled: string[]
          owners_active: number
          owners_invited: number
          project_prefix: string
          status: Database["public"]["Enums"]["tenant_status"]
          tenant_id: string
          version: number
        }[]
      }
      project_activity: {
        Args: { _limit?: number; _project: string }
        Returns: {
          action: string
          actor_email: string
          category: string
          occurred_at: string
          record_table: string
          summary: string
        }[]
      }
      project_file_path_parts: {
        Args: { _name: string }
        Returns: {
          file_id: string
          module_id: string
          project_id: string
          tenant_id: string
        }[]
      }
      project_module_active: {
        Args: { _module: string; _project: string; _tenant: string }
        Returns: boolean
      }
      project_role_of: {
        Args: { _project: string; _tenant: string }
        Returns: string
      }
      record_project_file_version: {
        Args: {
          _caption?: string
          _file: string
          _file_name: string
          _folder?: string
          _mime: string
          _module: string
          _note?: string
          _path: string
          _project: string
          _size: number
          _tags?: string[]
          _title?: string
        }
        Returns: number
      }
      review_comparison_finding: {
        Args: { _amended?: string; _decision: string; _finding: string }
        Returns: string
      }
      save_drawing_comparison: {
        Args: {
          _actor: string
          _error: string
          _findings: Json
          _from: string
          _model: string
          _record: string
          _status: string
          _to: string
        }
        Returns: {
          comparison_id: string
          finding_count: number
          new_count: number
        }[]
      }
      set_drawing_authorised: {
        Args: { _authorised: boolean; _revision: string }
        Returns: undefined
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
