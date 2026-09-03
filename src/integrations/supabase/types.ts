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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accidents: {
        Row: {
          attachment_paths: string[]
          authorization_id: string | null
          blocks_use: boolean
          cancel_reason: string | null
          closed_at: string | null
          code: string | null
          created_at: string
          created_by: string | null
          damages: string | null
          deductible_value: number | null
          description: string
          driver_id: string | null
          expenses_value: number | null
          has_victims: boolean
          id: string
          import_batch_id: string | null
          investigator_name: string | null
          kind: Database["public"]["Enums"]["accident_kind"]
          legacy_source: string | null
          location: string | null
          maintenance_record_id: string | null
          needs_tow: boolean
          notes: string | null
          occurred_at: string
          organization_id: string
          police_report_agency: string | null
          police_report_number: string | null
          policy_id: string | null
          reporter_name: string | null
          service_order_id: string | null
          status: Database["public"]["Enums"]["accident_status"]
          third_parties: string | null
          third_party_entity_id: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          usage_id: string | null
          vehicle_id: string
          victims_notes: string | null
        }
        Insert: {
          attachment_paths?: string[]
          authorization_id?: string | null
          blocks_use?: boolean
          cancel_reason?: string | null
          closed_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          damages?: string | null
          deductible_value?: number | null
          description: string
          driver_id?: string | null
          expenses_value?: number | null
          has_victims?: boolean
          id?: string
          import_batch_id?: string | null
          investigator_name?: string | null
          kind?: Database["public"]["Enums"]["accident_kind"]
          legacy_source?: string | null
          location?: string | null
          maintenance_record_id?: string | null
          needs_tow?: boolean
          notes?: string | null
          occurred_at: string
          organization_id: string
          police_report_agency?: string | null
          police_report_number?: string | null
          policy_id?: string | null
          reporter_name?: string | null
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["accident_status"]
          third_parties?: string | null
          third_party_entity_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          usage_id?: string | null
          vehicle_id: string
          victims_notes?: string | null
        }
        Update: {
          attachment_paths?: string[]
          authorization_id?: string | null
          blocks_use?: boolean
          cancel_reason?: string | null
          closed_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          damages?: string | null
          deductible_value?: number | null
          description?: string
          driver_id?: string | null
          expenses_value?: number | null
          has_victims?: boolean
          id?: string
          import_batch_id?: string | null
          investigator_name?: string | null
          kind?: Database["public"]["Enums"]["accident_kind"]
          legacy_source?: string | null
          location?: string | null
          maintenance_record_id?: string | null
          needs_tow?: boolean
          notes?: string | null
          occurred_at?: string
          organization_id?: string
          police_report_agency?: string | null
          police_report_number?: string | null
          policy_id?: string | null
          reporter_name?: string | null
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["accident_status"]
          third_parties?: string | null
          third_party_entity_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          usage_id?: string | null
          vehicle_id?: string
          victims_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accidents_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "fuel_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_third_party_entity_id_fkey"
            columns: ["third_party_entity_id"]
            isOneToOne: false
            referencedRelation: "external_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_usage_id_fkey"
            columns: ["usage_id"]
            isOneToOne: false
            referencedRelation: "vehicle_usages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action: string | null
          actor_email: string | null
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          area: string | null
          as_super_admin: boolean
          created_at: string
          entity: string | null
          event_type: string
          id: string
          ip: string | null
          new_data: Json | null
          old_data: Json | null
          organization_id: string | null
          record_id: string | null
          route: string | null
          screen: string | null
          summary: string | null
          user_agent: string | null
        }
        Insert: {
          action?: string | null
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          area?: string | null
          as_super_admin?: boolean
          created_at?: string
          entity?: string | null
          event_type: string
          id?: string
          ip?: string | null
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string | null
          record_id?: string | null
          route?: string | null
          screen?: string | null
          summary?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string | null
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          area?: string | null
          as_super_admin?: boolean
          created_at?: string
          entity?: string | null
          event_type?: string
          id?: string
          ip?: string | null
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string | null
          record_id?: string | null
          route?: string | null
          screen?: string | null
          summary?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_movements: {
        Row: {
          accident_id: string | null
          act_number: string | null
          act_published_on: string | null
          asset_code: string | null
          attachment_path: string | null
          auction_lot: string | null
          auction_number: string | null
          auction_value: number | null
          auction_winner_entity_id: string | null
          book_value: number | null
          code: string | null
          condition_state: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          from_status: Database["public"]["Enums"]["vehicle_status"] | null
          from_unit_id: string | null
          holder_name: string | null
          hour_meter: number | null
          id: string
          import_batch_id: string | null
          kind: Database["public"]["Enums"]["asset_movement_kind"]
          legacy_source: string | null
          moved_on: string
          notes: string | null
          odometer_km: number | null
          official_gazette: string | null
          organization_id: string
          owner_name: string | null
          reason: string | null
          to_status: Database["public"]["Enums"]["vehicle_status"] | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string
        }
        Insert: {
          accident_id?: string | null
          act_number?: string | null
          act_published_on?: string | null
          asset_code?: string | null
          attachment_path?: string | null
          auction_lot?: string | null
          auction_number?: string | null
          auction_value?: number | null
          auction_winner_entity_id?: string | null
          book_value?: number | null
          code?: string | null
          condition_state?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          from_status?: Database["public"]["Enums"]["vehicle_status"] | null
          from_unit_id?: string | null
          holder_name?: string | null
          hour_meter?: number | null
          id?: string
          import_batch_id?: string | null
          kind: Database["public"]["Enums"]["asset_movement_kind"]
          legacy_source?: string | null
          moved_on?: string
          notes?: string | null
          odometer_km?: number | null
          official_gazette?: string | null
          organization_id: string
          owner_name?: string | null
          reason?: string | null
          to_status?: Database["public"]["Enums"]["vehicle_status"] | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
        }
        Update: {
          accident_id?: string | null
          act_number?: string | null
          act_published_on?: string | null
          asset_code?: string | null
          attachment_path?: string | null
          auction_lot?: string | null
          auction_number?: string | null
          auction_value?: number | null
          auction_winner_entity_id?: string | null
          book_value?: number | null
          code?: string | null
          condition_state?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          from_status?: Database["public"]["Enums"]["vehicle_status"] | null
          from_unit_id?: string | null
          holder_name?: string | null
          hour_meter?: number | null
          id?: string
          import_batch_id?: string | null
          kind?: Database["public"]["Enums"]["asset_movement_kind"]
          legacy_source?: string | null
          moved_on?: string
          notes?: string | null
          odometer_km?: number | null
          official_gazette?: string | null
          organization_id?: string
          owner_name?: string | null
          reason?: string | null
          to_status?: Database["public"]["Enums"]["vehicle_status"] | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_movements_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: false
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_movements_auction_winner_entity_id_fkey"
            columns: ["auction_winner_entity_id"]
            isOneToOne: false
            referencedRelation: "external_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_movements_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "external_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_movements_from_unit_id_fkey"
            columns: ["from_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_movements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_movements_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          organization_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      backup_restores: {
        Row: {
          confirmation_text: string
          created_at: string
          error_summary: string | null
          finished_at: string | null
          id: string
          justification: string
          organization_id: string
          requested_by: string
          result_summary: string | null
          run_id: string
          safety_run_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          confirmation_text: string
          created_at?: string
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          justification: string
          organization_id: string
          requested_by: string
          result_summary?: string | null
          run_id: string
          safety_run_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          confirmation_text?: string
          created_at?: string
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          justification?: string
          organization_id?: string
          requested_by?: string
          result_summary?: string | null
          run_id?: string
          safety_run_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_restores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_restores_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "backup_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_restores_safety_run_id_fkey"
            columns: ["safety_run_id"]
            isOneToOne: false
            referencedRelation: "backup_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_runs: {
        Row: {
          checksum: string | null
          checksum_algo: string | null
          created_at: string
          cycle_key: string
          destination_kind: string | null
          destination_path: string | null
          duration_ms: number | null
          error_summary: string | null
          expires_at: string | null
          file_count: number | null
          finished_at: string | null
          id: string
          included_database: boolean
          included_storage: boolean
          integrity_checked_at: string | null
          integrity_valid: boolean | null
          is_protected: boolean
          kind: string
          manifest: Json | null
          object_key: string | null
          organization_id: string
          protected_at: string | null
          protected_by: string | null
          protected_reason: string | null
          purge_reason: string | null
          purged_at: string | null
          reason: string | null
          record_count: number | null
          requested_by: string | null
          scheduled_for: string
          started_at: string | null
          status: string
          tech_log: string | null
          total_bytes: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          checksum?: string | null
          checksum_algo?: string | null
          created_at?: string
          cycle_key: string
          destination_kind?: string | null
          destination_path?: string | null
          duration_ms?: number | null
          error_summary?: string | null
          expires_at?: string | null
          file_count?: number | null
          finished_at?: string | null
          id?: string
          included_database?: boolean
          included_storage?: boolean
          integrity_checked_at?: string | null
          integrity_valid?: boolean | null
          is_protected?: boolean
          kind?: string
          manifest?: Json | null
          object_key?: string | null
          organization_id: string
          protected_at?: string | null
          protected_by?: string | null
          protected_reason?: string | null
          purge_reason?: string | null
          purged_at?: string | null
          reason?: string | null
          record_count?: number | null
          requested_by?: string | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
          tech_log?: string | null
          total_bytes?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          checksum?: string | null
          checksum_algo?: string | null
          created_at?: string
          cycle_key?: string
          destination_kind?: string | null
          destination_path?: string | null
          duration_ms?: number | null
          error_summary?: string | null
          expires_at?: string | null
          file_count?: number | null
          finished_at?: string | null
          id?: string
          included_database?: boolean
          included_storage?: boolean
          integrity_checked_at?: string | null
          integrity_valid?: boolean | null
          is_protected?: boolean
          kind?: string
          manifest?: Json | null
          object_key?: string | null
          organization_id?: string
          protected_at?: string | null
          protected_by?: string | null
          protected_reason?: string | null
          purge_reason?: string | null
          purged_at?: string | null
          reason?: string | null
          record_count?: number | null
          requested_by?: string | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
          tech_log?: string | null
          total_bytes?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_settings: {
        Row: {
          created_at: string
          created_by: string | null
          credentials_secret_name: string | null
          destination_kind: string
          enabled: boolean
          hour: number
          id: string
          include_database: boolean
          include_storage: boolean
          last_test_at: string | null
          last_test_message: string | null
          last_test_ok: boolean | null
          minute: number
          notes: string | null
          organization_id: string
          platform_copy: boolean
          retention_daily: number
          retention_days: number | null
          retention_monthly: number
          retention_weekly: number
          s3_bucket: string | null
          s3_endpoint: string | null
          s3_prefix: string | null
          s3_region: string | null
          sftp_base_path: string | null
          sftp_host: string | null
          sftp_port: number | null
          sftp_user: string | null
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credentials_secret_name?: string | null
          destination_kind?: string
          enabled?: boolean
          hour?: number
          id?: string
          include_database?: boolean
          include_storage?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          minute?: number
          notes?: string | null
          organization_id: string
          platform_copy?: boolean
          retention_daily?: number
          retention_days?: number | null
          retention_monthly?: number
          retention_weekly?: number
          s3_bucket?: string | null
          s3_endpoint?: string | null
          s3_prefix?: string | null
          s3_region?: string | null
          sftp_base_path?: string | null
          sftp_host?: string | null
          sftp_port?: number | null
          sftp_user?: string | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credentials_secret_name?: string | null
          destination_kind?: string
          enabled?: boolean
          hour?: number
          id?: string
          include_database?: boolean
          include_storage?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          minute?: number
          notes?: string | null
          organization_id?: string
          platform_copy?: boolean
          retention_daily?: number
          retention_days?: number | null
          retention_monthly?: number
          retention_weekly?: number
          s3_bucket?: string | null
          s3_endpoint?: string | null
          s3_prefix?: string | null
          s3_region?: string | null
          sftp_base_path?: string | null
          sftp_host?: string | null
          sftp_port?: number | null
          sftp_user?: string | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_movements: {
        Row: {
          authorization_id: string | null
          commitment_id: string | null
          contract_id: string | null
          contract_item_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          fueling_id: string | null
          id: string
          kind: Database["public"]["Enums"]["budget_movement_kind"]
          maintenance_record_id: string | null
          organization_id: string
          quantity: number
          quota_id: string | null
          reason: string | null
          service_order_id: string | null
          value: number
        }
        Insert: {
          authorization_id?: string | null
          commitment_id?: string | null
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          fueling_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["budget_movement_kind"]
          maintenance_record_id?: string | null
          organization_id: string
          quantity?: number
          quota_id?: string | null
          reason?: string | null
          service_order_id?: string | null
          value?: number
        }
        Update: {
          authorization_id?: string | null
          commitment_id?: string | null
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          fueling_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["budget_movement_kind"]
          maintenance_record_id?: string | null
          organization_id?: string
          quantity?: number
          quota_id?: string | null
          reason?: string | null
          service_order_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_movements_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "fuel_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_movements_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_movements_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_movements_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_movements_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_movements_fueling_id_fkey"
            columns: ["fueling_id"]
            isOneToOne: false
            referencedRelation: "fuelings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_movements_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_movements_quota_id_fkey"
            columns: ["quota_id"]
            isOneToOne: false
            referencedRelation: "quotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_movements_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_types: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commitment_movements: {
        Row: {
          attachment_path: string | null
          commitment_id: string
          created_at: string
          created_by: string | null
          document: string | null
          id: string
          justification: string | null
          kind: string
          moved_on: string
          new_value: number | null
          organization_id: string
          previous_value: number | null
          value: number
        }
        Insert: {
          attachment_path?: string | null
          commitment_id: string
          created_at?: string
          created_by?: string | null
          document?: string | null
          id?: string
          justification?: string | null
          kind: string
          moved_on?: string
          new_value?: number | null
          organization_id: string
          previous_value?: number | null
          value: number
        }
        Update: {
          attachment_path?: string | null
          commitment_id?: string
          created_at?: string
          created_by?: string | null
          document?: string | null
          id?: string
          justification?: string | null
          kind?: string
          moved_on?: string
          new_value?: number | null
          organization_id?: string
          previous_value?: number | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "commitment_movements_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commitments: {
        Row: {
          available_value: number | null
          budget_allocation: string | null
          cancelled_value: number
          committed_value: number
          consumed_value: number
          contract_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          exercise: number
          expense_element: string | null
          id: string
          import_batch_id: string | null
          issued_at: string
          kind: Database["public"]["Enums"]["commitment_kind"]
          notes: string | null
          number: string
          organization_id: string
          reserved_value: number
          resource_source: string | null
          status: Database["public"]["Enums"]["commitment_status"]
          supplier_id: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          available_value?: number | null
          budget_allocation?: string | null
          cancelled_value?: number
          committed_value?: number
          consumed_value?: number
          contract_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          exercise?: number
          expense_element?: string | null
          id?: string
          import_batch_id?: string | null
          issued_at?: string
          kind?: Database["public"]["Enums"]["commitment_kind"]
          notes?: string | null
          number: string
          organization_id: string
          reserved_value?: number
          resource_source?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          supplier_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          available_value?: number | null
          budget_allocation?: string | null
          cancelled_value?: number
          committed_value?: number
          consumed_value?: number
          contract_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          exercise?: number
          expense_element?: string | null
          id?: string
          import_batch_id?: string | null
          issued_at?: string
          kind?: Database["public"]["Enums"]["commitment_kind"]
          notes?: string | null
          number?: string
          organization_id?: string
          reserved_value?: number
          resource_source?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          supplier_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commitments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_parameters: {
        Row: {
          active: boolean
          asset_class: string | null
          brand: string | null
          category: string | null
          created_at: string
          created_by: string | null
          critical_pct: number
          expected_value: number
          fuel_type_id: string | null
          id: string
          metric: string
          model: string | null
          notes: string | null
          organization_id: string
          scope: string
          tolerance_pct: number
          updated_at: string
          updated_by: string | null
          vehicle_id: string | null
        }
        Insert: {
          active?: boolean
          asset_class?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          critical_pct?: number
          expected_value: number
          fuel_type_id?: string | null
          id?: string
          metric: string
          model?: string | null
          notes?: string | null
          organization_id: string
          scope?: string
          tolerance_pct?: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
        }
        Update: {
          active?: boolean
          asset_class?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          critical_pct?: number
          expected_value?: number
          fuel_type_id?: string | null
          id?: string
          metric?: string
          model?: string | null
          notes?: string | null
          organization_id?: string
          scope?: string
          tolerance_pct?: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consumption_parameters_fuel_type_id_fkey"
            columns: ["fuel_type_id"]
            isOneToOne: false
            referencedRelation: "fuel_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_parameters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_parameters_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_amendments: {
        Row: {
          attachment_path: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          delta_value: number | null
          effect_date: string
          id: string
          index_name: string | null
          justification: string | null
          kind: Database["public"]["Enums"]["contract_amendment_kind"]
          new_contract_value: number | null
          new_valid_from: string | null
          new_valid_to: string | null
          notes: string | null
          number: string
          organization_id: string
          percent: number | null
          period_id: string | null
          period_value: number | null
          previous_contract_value: number | null
          signed_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attachment_path?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          delta_value?: number | null
          effect_date?: string
          id?: string
          index_name?: string | null
          justification?: string | null
          kind: Database["public"]["Enums"]["contract_amendment_kind"]
          new_contract_value?: number | null
          new_valid_from?: string | null
          new_valid_to?: string | null
          notes?: string | null
          number: string
          organization_id: string
          percent?: number | null
          period_id?: string | null
          period_value?: number | null
          previous_contract_value?: number | null
          signed_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attachment_path?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          delta_value?: number | null
          effect_date?: string
          id?: string
          index_name?: string | null
          justification?: string | null
          kind?: Database["public"]["Enums"]["contract_amendment_kind"]
          new_contract_value?: number | null
          new_valid_from?: string | null
          new_valid_to?: string | null
          notes?: string | null
          number?: string
          organization_id?: string
          percent?: number | null
          period_id?: string | null
          period_value?: number | null
          previous_contract_value?: number | null
          signed_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_amendments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_amendments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_amendments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "contract_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_items: {
        Row: {
          active: boolean
          consumed_quantity: number
          consumed_value: number
          contract_id: string
          created_at: string
          created_by: string | null
          description: string
          fuel_type_id: string | null
          id: string
          item_code: string | null
          item_number: number | null
          material_kind: string
          measure_unit: string
          notes: string | null
          organization_id: string
          origin_amendment_id: string | null
          quantity: number
          reserved_quantity: number
          reserved_value: number
          total_value: number | null
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          consumed_quantity?: number
          consumed_value?: number
          contract_id: string
          created_at?: string
          created_by?: string | null
          description: string
          fuel_type_id?: string | null
          id?: string
          item_code?: string | null
          item_number?: number | null
          material_kind?: string
          measure_unit?: string
          notes?: string | null
          organization_id: string
          origin_amendment_id?: string | null
          quantity?: number
          reserved_quantity?: number
          reserved_value?: number
          total_value?: number | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          consumed_quantity?: number
          consumed_value?: number
          contract_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          fuel_type_id?: string | null
          id?: string
          item_code?: string | null
          item_number?: number | null
          material_kind?: string
          measure_unit?: string
          notes?: string | null
          organization_id?: string
          origin_amendment_id?: string | null
          quantity?: number
          reserved_quantity?: number
          reserved_value?: number
          total_value?: number | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_fuel_type_id_fkey"
            columns: ["fuel_type_id"]
            isOneToOne: false
            referencedRelation: "fuel_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_origin_amendment_id_fkey"
            columns: ["origin_amendment_id"]
            isOneToOne: false
            referencedRelation: "contract_amendments"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_object_kinds: {
        Row: {
          active: boolean
          code: string
          created_at: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      contract_periods: {
        Row: {
          balance_value: number | null
          closed_at: string | null
          consumed_value: number
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          is_current: boolean
          notes: string | null
          organization_id: string
          origin_amendment_id: string | null
          period_value: number
          reserved_value: number
          sequence: number
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_to: string
        }
        Insert: {
          balance_value?: number | null
          closed_at?: string | null
          consumed_value?: number
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          organization_id: string
          origin_amendment_id?: string | null
          period_value?: number
          reserved_value?: number
          sequence: number
          updated_at?: string
          updated_by?: string | null
          valid_from: string
          valid_to: string
        }
        Update: {
          balance_value?: number | null
          closed_at?: string | null
          consumed_value?: number
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          organization_id?: string
          origin_amendment_id?: string | null
          period_value?: number
          reserved_value?: number
          sequence?: number
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_periods_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_periods_origin_fk"
            columns: ["origin_amendment_id"]
            isOneToOne: false
            referencedRelation: "contract_amendments"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          allows_amendment: boolean
          amendment_count: number
          attachment_path: string | null
          cnpj: string | null
          created_at: string
          created_by: string | null
          current_period_id: string | null
          current_value: number
          id: string
          import_batch_id: string | null
          initial_value: number
          modality: Database["public"]["Enums"]["contract_modality"]
          notes: string | null
          number: string
          object: string
          object_kind: string
          organization_id: string
          original_valid_from: string | null
          original_valid_to: string | null
          process_number: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["contract_status"]
          supplier_id: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string | null
          valid_to: string | null
          value_from_items: boolean
        }
        Insert: {
          allows_amendment?: boolean
          amendment_count?: number
          attachment_path?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          current_period_id?: string | null
          current_value?: number
          id?: string
          import_batch_id?: string | null
          initial_value?: number
          modality?: Database["public"]["Enums"]["contract_modality"]
          notes?: string | null
          number: string
          object: string
          object_kind?: string
          organization_id: string
          original_valid_from?: string | null
          original_valid_to?: string | null
          process_number?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
          value_from_items?: boolean
        }
        Update: {
          allows_amendment?: boolean
          amendment_count?: number
          attachment_path?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          current_period_id?: string | null
          current_value?: number
          id?: string
          import_batch_id?: string | null
          initial_value?: number
          modality?: Database["public"]["Enums"]["contract_modality"]
          notes?: string | null
          number?: string
          object?: string
          object_kind?: string
          organization_id?: string
          original_valid_from?: string | null
          original_valid_to?: string | null
          process_number?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
          value_from_items?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contracts_current_period_id_fkey"
            columns: ["current_period_id"]
            isOneToOne: false
            referencedRelation: "contract_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_object_kind_fkey"
            columns: ["object_kind"]
            isOneToOne: false
            referencedRelation: "contract_object_kinds"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          import_batch_id: string | null
          name: string
          organization_id: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          import_batch_id?: string | null
          name: string
          organization_id: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          import_batch_id?: string | null
          name?: string
          organization_id?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_secrets: {
        Row: {
          created_at: string
          name: string
          token_hash: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          name: string
          token_hash: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          name?: string
          token_hash?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      diaries: {
        Row: {
          application_period: string | null
          attachment_paths: string[]
          authorized_at: string | null
          authorized_by: string | null
          authorized_by_name: string | null
          beneficiary_cpf: string | null
          beneficiary_driver_id: string | null
          beneficiary_name: string
          beneficiary_role: string | null
          budget_note: string | null
          cancel_reason: string | null
          closed_at: string | null
          closed_by: string | null
          closed_by_name: string | null
          code: string | null
          commitment_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          departure_at: string
          destination_city: string
          destination_state: string | null
          event_location: string | null
          event_name: string | null
          exercise: number
          id: string
          import_batch_id: string | null
          legacy_source: string | null
          legal_basis: string | null
          notes: string | null
          organization_id: string
          origin_city: string | null
          origin_state: string | null
          paid_at: string | null
          purpose: string
          quantity: number
          reject_reason: string | null
          requested_at: string | null
          requester_id: string | null
          requester_name: string | null
          return_at: string | null
          status: Database["public"]["Enums"]["diary_status"]
          total_value: number
          unit_id: string | null
          unit_value: number
          updated_at: string
          updated_by: string | null
          usage_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          application_period?: string | null
          attachment_paths?: string[]
          authorized_at?: string | null
          authorized_by?: string | null
          authorized_by_name?: string | null
          beneficiary_cpf?: string | null
          beneficiary_driver_id?: string | null
          beneficiary_name: string
          beneficiary_role?: string | null
          budget_note?: string | null
          cancel_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_by_name?: string | null
          code?: string | null
          commitment_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          departure_at: string
          destination_city: string
          destination_state?: string | null
          event_location?: string | null
          event_name?: string | null
          exercise?: number
          id?: string
          import_batch_id?: string | null
          legacy_source?: string | null
          legal_basis?: string | null
          notes?: string | null
          organization_id: string
          origin_city?: string | null
          origin_state?: string | null
          paid_at?: string | null
          purpose: string
          quantity?: number
          reject_reason?: string | null
          requested_at?: string | null
          requester_id?: string | null
          requester_name?: string | null
          return_at?: string | null
          status?: Database["public"]["Enums"]["diary_status"]
          total_value?: number
          unit_id?: string | null
          unit_value?: number
          updated_at?: string
          updated_by?: string | null
          usage_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          application_period?: string | null
          attachment_paths?: string[]
          authorized_at?: string | null
          authorized_by?: string | null
          authorized_by_name?: string | null
          beneficiary_cpf?: string | null
          beneficiary_driver_id?: string | null
          beneficiary_name?: string
          beneficiary_role?: string | null
          budget_note?: string | null
          cancel_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_by_name?: string | null
          code?: string | null
          commitment_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          departure_at?: string
          destination_city?: string
          destination_state?: string | null
          event_location?: string | null
          event_name?: string | null
          exercise?: number
          id?: string
          import_batch_id?: string | null
          legacy_source?: string | null
          legal_basis?: string | null
          notes?: string | null
          organization_id?: string
          origin_city?: string | null
          origin_state?: string | null
          paid_at?: string | null
          purpose?: string
          quantity?: number
          reject_reason?: string | null
          requested_at?: string | null
          requester_id?: string | null
          requester_name?: string | null
          return_at?: string | null
          status?: Database["public"]["Enums"]["diary_status"]
          total_value?: number
          unit_id?: string | null
          unit_value?: number
          updated_at?: string
          updated_by?: string | null
          usage_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diaries_beneficiary_driver_id_fkey"
            columns: ["beneficiary_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diaries_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diaries_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diaries_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diaries_usage_id_fkey"
            columns: ["usage_id"]
            isOneToOne: false
            referencedRelation: "vehicle_usages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diaries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      diary_proofs: {
        Row: {
          activity_report: string | null
          actual_departure_at: string | null
          actual_return_at: string | null
          attachment_paths: string[]
          balance_value: number
          beneficiary_cpf: string | null
          beneficiary_name: string | null
          beneficiary_role: string | null
          code: string | null
          created_at: string
          created_by: string | null
          diary_id: string
          exercise: number
          id: string
          notes: string | null
          organization_id: string
          purpose: string | null
          purpose_complement: string | null
          received_quantity: number
          received_total: number
          received_unit_value: number
          restitution_note: string | null
          restitution_resolved: boolean
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          settlement_date: string | null
          status: Database["public"]["Enums"]["diary_proof_status"]
          updated_at: string
          updated_by: string | null
          used_quantity: number
          used_total: number
        }
        Insert: {
          activity_report?: string | null
          actual_departure_at?: string | null
          actual_return_at?: string | null
          attachment_paths?: string[]
          balance_value?: number
          beneficiary_cpf?: string | null
          beneficiary_name?: string | null
          beneficiary_role?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          diary_id: string
          exercise?: number
          id?: string
          notes?: string | null
          organization_id: string
          purpose?: string | null
          purpose_complement?: string | null
          received_quantity?: number
          received_total?: number
          received_unit_value?: number
          restitution_note?: string | null
          restitution_resolved?: boolean
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          settlement_date?: string | null
          status?: Database["public"]["Enums"]["diary_proof_status"]
          updated_at?: string
          updated_by?: string | null
          used_quantity?: number
          used_total?: number
        }
        Update: {
          activity_report?: string | null
          actual_departure_at?: string | null
          actual_return_at?: string | null
          attachment_paths?: string[]
          balance_value?: number
          beneficiary_cpf?: string | null
          beneficiary_name?: string | null
          beneficiary_role?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          diary_id?: string
          exercise?: number
          id?: string
          notes?: string | null
          organization_id?: string
          purpose?: string | null
          purpose_complement?: string | null
          received_quantity?: number
          received_total?: number
          received_unit_value?: number
          restitution_note?: string | null
          restitution_resolved?: boolean
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          settlement_date?: string | null
          status?: Database["public"]["Enums"]["diary_proof_status"]
          updated_at?: string
          updated_by?: string | null
          used_quantity?: number
          used_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "diary_proofs_diary_id_fkey"
            columns: ["diary_id"]
            isOneToOne: false
            referencedRelation: "diaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diary_proofs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          active: boolean
          bond_type: Database["public"]["Enums"]["driver_bond"]
          cpf: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          import_batch_id: string | null
          license_categories: string[]
          license_expiry: string | null
          license_first_issue: string | null
          license_number: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          registration_number: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          bond_type?: Database["public"]["Enums"]["driver_bond"]
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          import_batch_id?: string | null
          license_categories?: string[]
          license_expiry?: string | null
          license_first_issue?: string | null
          license_number?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          registration_number?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          bond_type?: Database["public"]["Enums"]["driver_bond"]
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          import_batch_id?: string | null
          license_categories?: string[]
          license_expiry?: string | null
          license_first_issue?: string | null
          license_number?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          registration_number?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_types: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          default_meter_kind: string
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          default_meter_kind?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          default_meter_kind?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_entities: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          created_at: string
          created_by: string | null
          document: string | null
          email: string | null
          id: string
          import_batch_id: string | null
          kind: Database["public"]["Enums"]["entity_kind"]
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          state: string | null
          updated_at: string
          updated_by: string | null
          zip_code: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"]
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          zip_code?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"]
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_entities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_authorizations: {
        Row: {
          authorizer_id: string | null
          authorizer_name: string | null
          budget_reserved: boolean
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          code: string | null
          commitment_id: string | null
          consumed_quantity: number
          consumed_value: number
          contract_id: string | null
          contract_item_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          driver_id: string | null
          expense_origin: Database["public"]["Enums"]["expense_origin"]
          fuel_type_id: string | null
          hour_meter: number | null
          id: string
          justification: string | null
          limit_exception_reason: string | null
          max_quantity: number
          max_unit_price: number | null
          max_value: number | null
          odometer_km: number | null
          organization_id: string
          purpose: string | null
          qr_token: string
          quota_id: string | null
          reserved_quantity: number
          reserved_value: number
          security_code: string | null
          server_quota_id: string | null
          server_quota_override_reason: string | null
          status: Database["public"]["Enums"]["fuel_auth_status"]
          supplier_id: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string
          vehicle_id: string
        }
        Insert: {
          authorizer_id?: string | null
          authorizer_name?: string | null
          budget_reserved?: boolean
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          code?: string | null
          commitment_id?: string | null
          consumed_quantity?: number
          consumed_value?: number
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          expense_origin?: Database["public"]["Enums"]["expense_origin"]
          fuel_type_id?: string | null
          hour_meter?: number | null
          id?: string
          justification?: string | null
          limit_exception_reason?: string | null
          max_quantity: number
          max_unit_price?: number | null
          max_value?: number | null
          odometer_km?: number | null
          organization_id: string
          purpose?: string | null
          qr_token?: string
          quota_id?: string | null
          reserved_quantity?: number
          reserved_value?: number
          security_code?: string | null
          server_quota_id?: string | null
          server_quota_override_reason?: string | null
          status?: Database["public"]["Enums"]["fuel_auth_status"]
          supplier_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until: string
          vehicle_id: string
        }
        Update: {
          authorizer_id?: string | null
          authorizer_name?: string | null
          budget_reserved?: boolean
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          code?: string | null
          commitment_id?: string | null
          consumed_quantity?: number
          consumed_value?: number
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          expense_origin?: Database["public"]["Enums"]["expense_origin"]
          fuel_type_id?: string | null
          hour_meter?: number | null
          id?: string
          justification?: string | null
          limit_exception_reason?: string | null
          max_quantity?: number
          max_unit_price?: number | null
          max_value?: number | null
          odometer_km?: number | null
          organization_id?: string
          purpose?: string | null
          qr_token?: string
          quota_id?: string | null
          reserved_quantity?: number
          reserved_value?: number
          security_code?: string | null
          server_quota_id?: string | null
          server_quota_override_reason?: string | null
          status?: Database["public"]["Enums"]["fuel_auth_status"]
          supplier_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_authorizations_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_authorizations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_authorizations_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_authorizations_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_authorizations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_authorizations_fuel_type_id_fkey"
            columns: ["fuel_type_id"]
            isOneToOne: false
            referencedRelation: "fuel_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_authorizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_authorizations_quota_id_fkey"
            columns: ["quota_id"]
            isOneToOne: false
            referencedRelation: "quotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_authorizations_server_quota_id_fkey"
            columns: ["server_quota_id"]
            isOneToOne: false
            referencedRelation: "server_fuel_quotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_authorizations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_authorizations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_authorizations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_limits: {
        Row: {
          active: boolean
          allow_exception: boolean
          created_at: string
          created_by: string | null
          daily_quantity: number | null
          daily_value: number | null
          id: string
          monthly_quantity: number | null
          monthly_value: number | null
          notes: string | null
          organization_id: string
          scope: Database["public"]["Enums"]["limit_scope"]
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string | null
        }
        Insert: {
          active?: boolean
          allow_exception?: boolean
          created_at?: string
          created_by?: string | null
          daily_quantity?: number | null
          daily_value?: number | null
          id?: string
          monthly_quantity?: number | null
          monthly_value?: number | null
          notes?: string | null
          organization_id: string
          scope?: Database["public"]["Enums"]["limit_scope"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
        }
        Update: {
          active?: boolean
          allow_exception?: boolean
          created_at?: string
          created_by?: string | null
          daily_quantity?: number | null
          daily_value?: number | null
          id?: string
          monthly_quantity?: number | null
          monthly_value?: number | null
          notes?: string | null
          organization_id?: string
          scope?: Database["public"]["Enums"]["limit_scope"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_limits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_limits_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_limits_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_types: {
        Row: {
          acronym: string | null
          active: boolean
          category: string
          created_at: string
          created_by: string | null
          id: string
          import_batch_id: string | null
          measure_unit: string
          name: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acronym?: string | null
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          measure_unit?: string
          name: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acronym?: string | null
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          measure_unit?: string
          name?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fueling_alerts: {
        Row: {
          alert_type: string
          authorization_id: string | null
          category: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          entity_id: string | null
          entity_type: string | null
          fueling_id: string | null
          id: string
          justification: string | null
          message: string
          organization_id: string
          period_key: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          status: Database["public"]["Enums"]["alert_status"]
          updated_at: string
          updated_by: string | null
          vehicle_id: string | null
        }
        Insert: {
          alert_type: string
          authorization_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          fueling_id?: string | null
          id?: string
          justification?: string | null
          message: string
          organization_id: string
          period_key?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
        }
        Update: {
          alert_type?: string
          authorization_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          fueling_id?: string | null
          id?: string
          justification?: string | null
          message?: string
          organization_id?: string
          period_key?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fueling_alerts_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "fuel_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fueling_alerts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fueling_alerts_fueling_id_fkey"
            columns: ["fueling_id"]
            isOneToOne: false
            referencedRelation: "fuelings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fueling_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fueling_alerts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuelings: {
        Row: {
          alert_flags: string[]
          alert_justification: string | null
          attachment_path: string | null
          authorization_id: string | null
          authorization_number: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          closes_authorization: boolean
          commitment_id: string | null
          contract_id: string | null
          contract_item_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          document_key: string | null
          document_kind: string | null
          driver_id: string | null
          driver_name: string | null
          expense_origin: Database["public"]["Enums"]["expense_origin"]
          fuel_type_id: string | null
          fueled_at: string
          hour_meter: number | null
          id: string
          import_batch_id: string | null
          invoice_number: string | null
          legacy_source: string | null
          notes: string | null
          odometer_km: number | null
          operator_name: string | null
          organization_id: string
          quantity: number
          quota_id: string | null
          released_quantity: number
          released_value: number
          reserved_quantity_before: number | null
          reserved_value_before: number | null
          server_quota_id: string | null
          status: Database["public"]["Enums"]["fueling_status"]
          supplier_id: string | null
          total_value: number | null
          unit_id: string | null
          unit_price: number
          updated_at: string
          updated_by: string | null
          vehicle_id: string
          vehicle_updated: boolean
          without_authorization_reason: string | null
        }
        Insert: {
          alert_flags?: string[]
          alert_justification?: string | null
          attachment_path?: string | null
          authorization_id?: string | null
          authorization_number?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closes_authorization?: boolean
          commitment_id?: string | null
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          document_key?: string | null
          document_kind?: string | null
          driver_id?: string | null
          driver_name?: string | null
          expense_origin?: Database["public"]["Enums"]["expense_origin"]
          fuel_type_id?: string | null
          fueled_at?: string
          hour_meter?: number | null
          id?: string
          import_batch_id?: string | null
          invoice_number?: string | null
          legacy_source?: string | null
          notes?: string | null
          odometer_km?: number | null
          operator_name?: string | null
          organization_id: string
          quantity: number
          quota_id?: string | null
          released_quantity?: number
          released_value?: number
          reserved_quantity_before?: number | null
          reserved_value_before?: number | null
          server_quota_id?: string | null
          status?: Database["public"]["Enums"]["fueling_status"]
          supplier_id?: string | null
          total_value?: number | null
          unit_id?: string | null
          unit_price: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
          vehicle_updated?: boolean
          without_authorization_reason?: string | null
        }
        Update: {
          alert_flags?: string[]
          alert_justification?: string | null
          attachment_path?: string | null
          authorization_id?: string | null
          authorization_number?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closes_authorization?: boolean
          commitment_id?: string | null
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          document_key?: string | null
          document_kind?: string | null
          driver_id?: string | null
          driver_name?: string | null
          expense_origin?: Database["public"]["Enums"]["expense_origin"]
          fuel_type_id?: string | null
          fueled_at?: string
          hour_meter?: number | null
          id?: string
          import_batch_id?: string | null
          invoice_number?: string | null
          legacy_source?: string | null
          notes?: string | null
          odometer_km?: number | null
          operator_name?: string | null
          organization_id?: string
          quantity?: number
          quota_id?: string | null
          released_quantity?: number
          released_value?: number
          reserved_quantity_before?: number | null
          reserved_value_before?: number | null
          server_quota_id?: string | null
          status?: Database["public"]["Enums"]["fueling_status"]
          supplier_id?: string | null
          total_value?: number | null
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
          vehicle_updated?: boolean
          without_authorization_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuelings_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "fuel_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_fuel_type_id_fkey"
            columns: ["fuel_type_id"]
            isOneToOne: false
            referencedRelation: "fuel_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_quota_id_fkey"
            columns: ["quota_id"]
            isOneToOne: false
            referencedRelation: "quotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_server_quota_id_fkey"
            columns: ["server_quota_id"]
            isOneToOne: false
            referencedRelation: "server_fuel_quotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          annul_reason: string | null
          annulled_at: string | null
          annulled_by: string | null
          cancel_reason: string | null
          completed_at: string | null
          create_missing: boolean
          created_at: string
          created_by: string | null
          duplicate_rows: number
          duplicate_strategy: string
          error_rows: number
          file_name: string | null
          file_type: string | null
          headers: Json
          id: string
          imported_rows: number
          mapping: Json
          module: string
          notes: string | null
          organization_id: string
          result: Json | null
          source_system: string | null
          status: string
          total_rows: number
          updated_at: string
          updated_by: string | null
          valid_rows: number
          warning_rows: number
        }
        Insert: {
          annul_reason?: string | null
          annulled_at?: string | null
          annulled_by?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          create_missing?: boolean
          created_at?: string
          created_by?: string | null
          duplicate_rows?: number
          duplicate_strategy?: string
          error_rows?: number
          file_name?: string | null
          file_type?: string | null
          headers?: Json
          id?: string
          imported_rows?: number
          mapping?: Json
          module: string
          notes?: string | null
          organization_id: string
          result?: Json | null
          source_system?: string | null
          status?: string
          total_rows?: number
          updated_at?: string
          updated_by?: string | null
          valid_rows?: number
          warning_rows?: number
        }
        Update: {
          annul_reason?: string | null
          annulled_at?: string | null
          annulled_by?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          create_missing?: boolean
          created_at?: string
          created_by?: string | null
          duplicate_rows?: number
          duplicate_strategy?: string
          error_rows?: number
          file_name?: string | null
          file_type?: string | null
          headers?: Json
          id?: string
          imported_rows?: number
          mapping?: Json
          module?: string
          notes?: string | null
          organization_id?: string
          result?: Json | null
          source_system?: string | null
          status?: string
          total_rows?: number
          updated_at?: string
          updated_by?: string | null
          valid_rows?: number
          warning_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          batch_id: string
          created_at: string
          duplicate_of: string | null
          id: string
          imported: boolean
          issues: Json
          normalized: Json
          organization_id: string
          raw: Json
          row_number: number
          status: string
          target_id: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          duplicate_of?: string | null
          id?: string
          imported?: boolean
          issues?: Json
          normalized?: Json
          organization_id: string
          raw?: Json
          row_number: number
          status?: string
          target_id?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          duplicate_of?: string | null
          id?: string
          imported?: boolean
          issues?: Json
          normalized?: Json
          organization_id?: string
          raw?: Json
          row_number?: number
          status?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policies: {
        Row: {
          attachment_path: string | null
          cancel_reason: string | null
          contract_id: string | null
          coverages: string | null
          created_at: string
          created_by: string | null
          deductible_value: number | null
          entity_id: string | null
          id: string
          import_batch_id: string | null
          insurer_name: string
          legacy_source: string | null
          limits_notes: string | null
          notes: string | null
          organization_id: string
          policy_number: string
          premium_value: number
          renewed_from_id: string | null
          status: Database["public"]["Enums"]["insurance_status"]
          supplier_id: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_to: string
        }
        Insert: {
          attachment_path?: string | null
          cancel_reason?: string | null
          contract_id?: string | null
          coverages?: string | null
          created_at?: string
          created_by?: string | null
          deductible_value?: number | null
          entity_id?: string | null
          id?: string
          import_batch_id?: string | null
          insurer_name: string
          legacy_source?: string | null
          limits_notes?: string | null
          notes?: string | null
          organization_id: string
          policy_number: string
          premium_value?: number
          renewed_from_id?: string | null
          status?: Database["public"]["Enums"]["insurance_status"]
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from: string
          valid_to: string
        }
        Update: {
          attachment_path?: string | null
          cancel_reason?: string | null
          contract_id?: string | null
          coverages?: string | null
          created_at?: string
          created_by?: string | null
          deductible_value?: number | null
          entity_id?: string | null
          id?: string
          import_batch_id?: string | null
          insurer_name?: string
          legacy_source?: string | null
          limits_notes?: string | null
          notes?: string | null
          organization_id?: string
          policy_number?: string
          premium_value?: number
          renewed_from_id?: string | null
          status?: Database["public"]["Enums"]["insurance_status"]
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "external_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_renewed_from_id_fkey"
            columns: ["renewed_from_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_vehicles: {
        Row: {
          created_at: string
          created_by: string | null
          deductible_value: number | null
          id: string
          insured_value: number | null
          notes: string | null
          organization_id: string
          policy_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deductible_value?: number | null
          id?: string
          insured_value?: number | null
          notes?: string | null
          organization_id: string
          policy_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deductible_value?: number | null
          id?: string
          insured_value?: number | null
          notes?: string | null
          organization_id?: string
          policy_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_vehicles_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_vehicles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_settings: {
        Row: {
          alerts_enabled: boolean
          cost_deviation_pct: number
          created_at: string
          created_by: string | null
          critical_pct: number
          default_tolerance_pct: number
          efficiency_drop_pct: number
          id: string
          maintenance_cost_alert: number
          max_hours_segment: number
          max_km_segment: number
          min_minutes_between_fuelings: number
          min_segments_for_alert: number
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alerts_enabled?: boolean
          cost_deviation_pct?: number
          created_at?: string
          created_by?: string | null
          critical_pct?: number
          default_tolerance_pct?: number
          efficiency_drop_pct?: number
          id?: string
          maintenance_cost_alert?: number
          max_hours_segment?: number
          max_km_segment?: number
          min_minutes_between_fuelings?: number
          min_segments_for_alert?: number
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alerts_enabled?: boolean
          cost_deviation_pct?: number
          created_at?: string
          created_by?: string | null
          critical_pct?: number
          default_tolerance_pct?: number
          efficiency_drop_pct?: number
          id?: string
          maintenance_cost_alert?: number
          max_hours_segment?: number
          max_km_segment?: number
          min_minutes_between_fuelings?: number
          min_segments_for_alert?: number
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_parts: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          hour_meter: number | null
          id: string
          installed_at: string
          maintenance_record_id: string
          notes: string | null
          odometer_km: number | null
          organization_id: string
          part_id: string | null
          quantity: number
          supplier_id: string | null
          total_value: number | null
          unit_value: number
          updated_at: string
          updated_by: string | null
          vehicle_id: string
          warranty_days: number | null
          warranty_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          hour_meter?: number | null
          id?: string
          installed_at?: string
          maintenance_record_id: string
          notes?: string | null
          odometer_km?: number | null
          organization_id: string
          part_id?: string | null
          quantity?: number
          supplier_id?: string | null
          total_value?: number | null
          unit_value?: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
          warranty_days?: number | null
          warranty_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          hour_meter?: number | null
          id?: string
          installed_at?: string
          maintenance_record_id?: string
          notes?: string | null
          odometer_km?: number | null
          organization_id?: string
          part_id?: string | null
          quantity?: number
          supplier_id?: string | null
          total_value?: number | null
          unit_value?: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
          warranty_days?: number | null
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_parts_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_parts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_parts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_parts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_plan_items: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          organization_id: string
          plan_id: string
          sequence: number
          service_type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          organization_id: string
          plan_id: string
          sequence?: number
          service_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          organization_id?: string
          plan_id?: string
          sequence?: number
          service_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_plan_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_plans: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          import_batch_id: string | null
          interval_hours: number | null
          interval_km: number | null
          interval_months: number | null
          last_done_at: string | null
          last_done_hours: number | null
          last_done_km: number | null
          legacy_source: string | null
          name: string
          notes: string | null
          organization_id: string
          service_type: string | null
          tolerance_days: number
          tolerance_hours: number
          tolerance_km: number
          updated_at: string
          updated_by: string | null
          vehicle_id: string | null
          vehicle_type: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          import_batch_id?: string | null
          interval_hours?: number | null
          interval_km?: number | null
          interval_months?: number | null
          last_done_at?: string | null
          last_done_hours?: number | null
          last_done_km?: number | null
          legacy_source?: string | null
          name: string
          notes?: string | null
          organization_id: string
          service_type?: string | null
          tolerance_days?: number
          tolerance_hours?: number
          tolerance_km?: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
          vehicle_type?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          import_batch_id?: string | null
          interval_hours?: number | null
          interval_km?: number | null
          interval_months?: number | null
          last_done_at?: string | null
          last_done_hours?: number | null
          last_done_km?: number | null
          legacy_source?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          service_type?: string | null
          tolerance_days?: number
          tolerance_hours?: number
          tolerance_km?: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_records: {
        Row: {
          accident_id: string | null
          attachment_path: string | null
          budget_consumed: boolean
          cancel_reason: string | null
          code: string | null
          commitment_id: string | null
          contract_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          entry_at: string
          exit_at: string | null
          expense_origin: Database["public"]["Enums"]["expense_origin"]
          hour_meter: number | null
          id: string
          import_batch_id: string | null
          invoice_number: string | null
          kind: Database["public"]["Enums"]["maintenance_kind"]
          labor_value: number
          legacy_source: string | null
          notes: string | null
          odometer_km: number | null
          organization_id: string
          other_value: number
          parts_value: number
          plan_id: string | null
          quota_id: string | null
          request_id: string | null
          services: string
          status: Database["public"]["Enums"]["maintenance_record_status"]
          supplier_id: string | null
          total_value: number | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string
          warranty_days: number | null
          warranty_until: string | null
        }
        Insert: {
          accident_id?: string | null
          attachment_path?: string | null
          budget_consumed?: boolean
          cancel_reason?: string | null
          code?: string | null
          commitment_id?: string | null
          contract_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          entry_at?: string
          exit_at?: string | null
          expense_origin?: Database["public"]["Enums"]["expense_origin"]
          hour_meter?: number | null
          id?: string
          import_batch_id?: string | null
          invoice_number?: string | null
          kind?: Database["public"]["Enums"]["maintenance_kind"]
          labor_value?: number
          legacy_source?: string | null
          notes?: string | null
          odometer_km?: number | null
          organization_id: string
          other_value?: number
          parts_value?: number
          plan_id?: string | null
          quota_id?: string | null
          request_id?: string | null
          services: string
          status?: Database["public"]["Enums"]["maintenance_record_status"]
          supplier_id?: string | null
          total_value?: number | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
          warranty_days?: number | null
          warranty_until?: string | null
        }
        Update: {
          accident_id?: string | null
          attachment_path?: string | null
          budget_consumed?: boolean
          cancel_reason?: string | null
          code?: string | null
          commitment_id?: string | null
          contract_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          entry_at?: string
          exit_at?: string | null
          expense_origin?: Database["public"]["Enums"]["expense_origin"]
          hour_meter?: number | null
          id?: string
          import_batch_id?: string | null
          invoice_number?: string | null
          kind?: Database["public"]["Enums"]["maintenance_kind"]
          labor_value?: number
          legacy_source?: string | null
          notes?: string | null
          odometer_km?: number | null
          organization_id?: string
          other_value?: number
          parts_value?: number
          plan_id?: string | null
          quota_id?: string | null
          request_id?: string | null
          services?: string
          status?: Database["public"]["Enums"]["maintenance_record_status"]
          supplier_id?: string | null
          total_value?: number | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
          warranty_days?: number | null
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: false
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_quota_id_fkey"
            columns: ["quota_id"]
            isOneToOne: false
            referencedRelation: "quotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          attachment_path: string | null
          cancel_reason: string | null
          code: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          description: string
          hour_meter: number | null
          id: string
          kind: Database["public"]["Enums"]["maintenance_kind"]
          notes: string | null
          odometer_km: number | null
          organization_id: string
          plan_id: string | null
          priority: Database["public"]["Enums"]["maintenance_priority"]
          requested_at: string
          requester_id: string | null
          requester_name: string | null
          status: Database["public"]["Enums"]["maintenance_request_status"]
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string
        }
        Insert: {
          attachment_path?: string | null
          cancel_reason?: string | null
          code?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          hour_meter?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["maintenance_kind"]
          notes?: string | null
          odometer_km?: number | null
          organization_id: string
          plan_id?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          requested_at?: string
          requester_id?: string | null
          requester_name?: string | null
          status?: Database["public"]["Enums"]["maintenance_request_status"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
        }
        Update: {
          attachment_path?: string | null
          cancel_reason?: string | null
          code?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          hour_meter?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["maintenance_kind"]
          notes?: string | null
          odometer_km?: number | null
          organization_id?: string
          plan_id?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          requested_at?: string
          requester_id?: string | null
          requester_name?: string | null
          status?: Database["public"]["Enums"]["maintenance_request_status"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_settings: {
        Row: {
          created_at: string
          created_by: string | null
          lead_days: number
          lead_hours: number
          lead_km: number
          organization_id: string
          updated_at: string
          updated_by: string | null
          warranty_lead_days: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          lead_days?: number
          lead_hours?: number
          lead_km?: number
          organization_id: string
          updated_at?: string
          updated_by?: string | null
          warranty_lead_days?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          lead_days?: number
          lead_hours?: number
          lead_km?: number
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
          warranty_lead_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_corrections: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          meter: string
          new_value: number
          occurred_at: string
          organization_id: string
          previous_value: number | null
          reason: string
          updated_at: string
          updated_by: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          meter: string
          new_value: number
          occurred_at?: string
          organization_id: string
          previous_value?: number | null
          reason: string
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          meter?: string
          new_value?: number
          occurred_at?: string
          organization_id?: string
          previous_value?: number | null
          reason?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_corrections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_corrections_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_balances: {
        Row: {
          applied: boolean
          applied_at: string | null
          applied_by: string | null
          base_date: string
          batch_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          id: string
          justification: string
          kind: string
          organization_id: string
          quantity: number | null
          reference_id: string | null
          reference_label: string
          updated_at: string
          updated_by: string | null
          value: number | null
        }
        Insert: {
          applied?: boolean
          applied_at?: string | null
          applied_by?: string | null
          base_date: string
          batch_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          justification: string
          kind: string
          organization_id: string
          quantity?: number | null
          reference_id?: string | null
          reference_label: string
          updated_at?: string
          updated_by?: string | null
          value?: number | null
        }
        Update: {
          applied?: boolean
          applied_at?: string | null
          applied_by?: string | null
          base_date?: string
          batch_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          justification?: string
          kind?: string
          organization_id?: string
          quantity?: number | null
          reference_id?: string | null
          reference_label?: string
          updated_at?: string
          updated_by?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opening_balances_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_balances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          organization_id: string
          prefix: string
          revoked_at: string | null
          revoked_by: string | null
          scopes: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          organization_id: string
          prefix: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          prefix?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_counters: {
        Row: {
          counter_key: string
          organization_id: string
          value: number
        }
        Insert: {
          counter_key: string
          organization_id: string
          value?: number
        }
        Update: {
          counter_key?: string
          organization_id?: string
          value?: number
        }
        Relationships: []
      }
      organizations: {
        Row: {
          address: string | null
          authority_cpf: string | null
          authority_name: string | null
          authority_role: string | null
          city: string | null
          cnpj: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          legal_name: string
          logo_url: string | null
          notes: string | null
          org_type: Database["public"]["Enums"]["org_type"]
          phone: string | null
          short_name: string | null
          state: string | null
          term_end: string | null
          term_start: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          authority_cpf?: string | null
          authority_name?: string | null
          authority_role?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          legal_name: string
          logo_url?: string | null
          notes?: string | null
          org_type?: Database["public"]["Enums"]["org_type"]
          phone?: string | null
          short_name?: string | null
          state?: string | null
          term_end?: string | null
          term_start?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          authority_cpf?: string | null
          authority_name?: string | null
          authority_role?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          legal_name?: string
          logo_url?: string | null
          notes?: string | null
          org_type?: Database["public"]["Enums"]["org_type"]
          phone?: string | null
          short_name?: string | null
          state?: string | null
          term_end?: string | null
          term_start?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      parts_catalog: {
        Row: {
          active: boolean
          brand: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          import_batch_id: string | null
          internal_code: string | null
          legacy_source: string | null
          measure_unit: string
          notes: string | null
          organization_id: string
          reference: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          import_batch_id?: string | null
          internal_code?: string | null
          legacy_source?: string | null
          measure_unit?: string
          notes?: string | null
          organization_id: string
          reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          import_batch_id?: string | null
          internal_code?: string | null
          legacy_source?: string | null
          measure_unit?: string
          notes?: string | null
          organization_id?: string
          reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_sessions: {
        Row: {
          organization_id: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          organization_id?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          organization_id?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: boolean
          log_retention_days: number
          platform_name: string
          support_email: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          log_retention_days?: number
          platform_name?: string
          support_email?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          log_retention_days?: number
          platform_name?: string
          support_email?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          job_title: string | null
          must_change_password: boolean
          organization_id: string | null
          phone: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          must_change_password?: boolean
          organization_id?: string | null
          phone?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          must_change_password?: boolean
          organization_id?: string | null
          phone?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      quota_supplements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          quota_id: string
          reason: string
          responsible_name: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          quota_id: string
          reason: string
          responsible_name?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          quota_id?: string
          reason?: string
          responsible_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quota_supplements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quota_supplements_quota_id_fkey"
            columns: ["quota_id"]
            isOneToOne: false
            referencedRelation: "quotas"
            referencedColumns: ["id"]
          },
        ]
      }
      quotas: {
        Row: {
          active: boolean
          balance_amount: number | null
          commitment_id: string | null
          consumed_amount: number
          contract_id: string | null
          contract_item_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          granted_amount: number
          id: string
          import_batch_id: string | null
          legacy_source: string | null
          measure_unit: string
          name: string
          notes: string | null
          organization_id: string
          quota_type: Database["public"]["Enums"]["quota_type"]
          reserved_amount: number
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          balance_amount?: number | null
          commitment_id?: string | null
          consumed_amount?: number
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          granted_amount?: number
          id?: string
          import_batch_id?: string | null
          legacy_source?: string | null
          measure_unit?: string
          name: string
          notes?: string | null
          organization_id: string
          quota_type?: Database["public"]["Enums"]["quota_type"]
          reserved_amount?: number
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          balance_amount?: number | null
          commitment_id?: string | null
          consumed_amount?: number
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          granted_amount?: number
          id?: string
          import_batch_id?: string | null
          legacy_source?: string | null
          measure_unit?: string
          name?: string
          notes?: string | null
          organization_id?: string
          quota_type?: Database["public"]["Enums"]["quota_type"]
          reserved_amount?: number
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotas_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotas_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotas_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotas_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotas_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_invitations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invited_at: string
          organization_id: string
          quotation_id: string
          reason: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          updated_at: string
          updated_by: string | null
          workshop_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invited_at?: string
          organization_id: string
          quotation_id: string
          reason?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
          updated_by?: string | null
          workshop_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invited_at?: string
          organization_id?: string
          quotation_id?: string
          reason?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
          updated_by?: string | null
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_invitations_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_invitations_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          measure_unit: string
          notes: string | null
          organization_id: string
          part_id: string | null
          quantity: number
          quotation_id: string
          sequence: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          measure_unit?: string
          notes?: string | null
          organization_id: string
          part_id?: string | null
          quantity?: number
          quotation_id: string
          sequence?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          measure_unit?: string
          notes?: string | null
          organization_id?: string
          part_id?: string | null
          quantity?: number
          quotation_id?: string
          sequence?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_proposal_items: {
        Row: {
          brand: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          notes: string | null
          organization_id: string
          proposal_id: string
          quantity: number
          quotation_item_id: string | null
          total_value: number | null
          unit_value: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          notes?: string | null
          organization_id: string
          proposal_id: string
          quantity?: number
          quotation_item_id?: string | null
          total_value?: number | null
          unit_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          notes?: string | null
          organization_id?: string
          proposal_id?: string
          quantity?: number
          quotation_item_id?: string | null
          total_value?: number | null
          unit_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_proposal_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "quotation_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_proposal_items_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_proposals: {
        Row: {
          attachment_path: string | null
          created_at: string
          created_by: string | null
          discount_value: number
          disqualify_reason: string | null
          execution_days: number | null
          id: string
          labor_value: number
          notes: string | null
          organization_id: string
          parts_value: number
          payment_terms: string | null
          quotation_id: string
          received_at: string
          status: Database["public"]["Enums"]["proposal_status"]
          total_value: number
          updated_at: string
          updated_by: string | null
          valid_until: string | null
          warranty_days: number | null
          workshop_id: string
        }
        Insert: {
          attachment_path?: string | null
          created_at?: string
          created_by?: string | null
          discount_value?: number
          disqualify_reason?: string | null
          execution_days?: number | null
          id?: string
          labor_value?: number
          notes?: string | null
          organization_id: string
          parts_value?: number
          payment_terms?: string | null
          quotation_id: string
          received_at?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          total_value?: number
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
          warranty_days?: number | null
          workshop_id: string
        }
        Update: {
          attachment_path?: string | null
          created_at?: string
          created_by?: string | null
          discount_value?: number
          disqualify_reason?: string | null
          execution_days?: number | null
          id?: string
          labor_value?: number
          notes?: string | null
          organization_id?: string
          parts_value?: number
          payment_terms?: string | null
          quotation_id?: string
          received_at?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          total_value?: number
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
          warranty_days?: number | null
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_proposals_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_proposals_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          attachment_path: string | null
          cancel_reason: string | null
          choice_justification: string | null
          code: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          deadline_at: string | null
          description: string
          few_proposals_justification: string | null
          id: string
          invited_count: number
          no_response_count: number
          notes: string | null
          organization_id: string
          proposals_count: number
          refusals_count: number
          reject_reason: string | null
          request_id: string | null
          selected_proposal_id: string | null
          specialty: string | null
          status: Database["public"]["Enums"]["quotation_status"]
          technical_analysis: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          valid_proposals_count: number
          vehicle_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          attachment_path?: string | null
          cancel_reason?: string | null
          choice_justification?: string | null
          code?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline_at?: string | null
          description: string
          few_proposals_justification?: string | null
          id?: string
          invited_count?: number
          no_response_count?: number
          notes?: string | null
          organization_id: string
          proposals_count?: number
          refusals_count?: number
          reject_reason?: string | null
          request_id?: string | null
          selected_proposal_id?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["quotation_status"]
          technical_analysis?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_proposals_count?: number
          vehicle_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          attachment_path?: string | null
          cancel_reason?: string | null
          choice_justification?: string | null
          code?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline_at?: string | null
          description?: string
          few_proposals_justification?: string | null
          id?: string
          invited_count?: number
          no_response_count?: number
          notes?: string | null
          organization_id?: string
          proposals_count?: number
          refusals_count?: number
          reject_reason?: string | null
          request_id?: string | null
          selected_proposal_id?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["quotation_status"]
          technical_analysis?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_proposals_count?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_selected_proposal_fk"
            columns: ["selected_proposal_id"]
            isOneToOne: false
            referencedRelation: "quotation_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_presets: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          organization_id: string
          report_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          organization_id: string
          report_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          organization_id?: string
          report_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_presets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      server_fuel_quotas: {
        Row: {
          alert_threshold_percent: number
          attachment_path: string | null
          beneficiary_cpf: string
          beneficiary_name: string
          created_at: string
          created_by: string | null
          end_date: string | null
          fuel_type_id: string | null
          id: string
          import_batch_id: string | null
          job_title: string | null
          justification: string | null
          notes: string | null
          organization_id: string
          period: Database["public"]["Enums"]["server_quota_period"]
          quota_quantity: number
          quota_value: number | null
          registration_code: string | null
          start_date: string
          status: Database["public"]["Enums"]["server_quota_status"]
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string
        }
        Insert: {
          alert_threshold_percent?: number
          attachment_path?: string | null
          beneficiary_cpf: string
          beneficiary_name: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          fuel_type_id?: string | null
          id?: string
          import_batch_id?: string | null
          job_title?: string | null
          justification?: string | null
          notes?: string | null
          organization_id: string
          period?: Database["public"]["Enums"]["server_quota_period"]
          quota_quantity?: number
          quota_value?: number | null
          registration_code?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["server_quota_status"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
        }
        Update: {
          alert_threshold_percent?: number
          attachment_path?: string | null
          beneficiary_cpf?: string
          beneficiary_name?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          fuel_type_id?: string | null
          id?: string
          import_batch_id?: string | null
          job_title?: string | null
          justification?: string | null
          notes?: string | null
          organization_id?: string
          period?: Database["public"]["Enums"]["server_quota_period"]
          quota_quantity?: number
          quota_value?: number | null
          registration_code?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["server_quota_status"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_fuel_quotas_fuel_type_id_fkey"
            columns: ["fuel_type_id"]
            isOneToOne: false
            referencedRelation: "fuel_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_fuel_quotas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_fuel_quotas_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_fuel_quotas_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_items: {
        Row: {
          brand: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          kind: string
          notes: string | null
          organization_id: string
          part_id: string | null
          quantity: number
          replaced_part_returned: boolean
          return_attachment_path: string | null
          return_notes: string | null
          returned_at: string | null
          returned_to: string | null
          service_order_id: string
          total_value: number | null
          unit_value: number
          updated_at: string
          updated_by: string | null
          warranty_days: number | null
          warranty_until: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          kind?: string
          notes?: string | null
          organization_id: string
          part_id?: string | null
          quantity?: number
          replaced_part_returned?: boolean
          return_attachment_path?: string | null
          return_notes?: string | null
          returned_at?: string | null
          returned_to?: string | null
          service_order_id: string
          total_value?: number | null
          unit_value?: number
          updated_at?: string
          updated_by?: string | null
          warranty_days?: number | null
          warranty_until?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          kind?: string
          notes?: string | null
          organization_id?: string
          part_id?: string | null
          quantity?: number
          replaced_part_returned?: boolean
          return_attachment_path?: string | null
          return_notes?: string | null
          returned_at?: string | null
          returned_to?: string | null
          service_order_id?: string
          total_value?: number | null
          unit_value?: number
          updated_at?: string
          updated_by?: string | null
          warranty_days?: number | null
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          accident_id: string | null
          approved_value: number
          attachment_path: string | null
          authorizer_id: string | null
          authorizer_name: string | null
          budget_reserved: boolean
          cancel_reason: string | null
          code: string | null
          commitment_id: string | null
          consumed_value: number
          contract_id: string | null
          contract_item_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          deadline_at: string | null
          executed_value: number | null
          execution_days: number | null
          expense_origin: Database["public"]["Enums"]["expense_origin"]
          finished_at: string | null
          hour_meter: number | null
          id: string
          issued_at: string
          maintenance_record_id: string | null
          notes: string | null
          odometer_km: number | null
          organization_id: string
          proposal_id: string | null
          quota_id: string | null
          quotation_id: string | null
          request_id: string | null
          reserved_value: number
          services: string
          started_at: string | null
          status: Database["public"]["Enums"]["service_order_status"]
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string
          warranty_days: number | null
          workshop_id: string
        }
        Insert: {
          accident_id?: string | null
          approved_value?: number
          attachment_path?: string | null
          authorizer_id?: string | null
          authorizer_name?: string | null
          budget_reserved?: boolean
          cancel_reason?: string | null
          code?: string | null
          commitment_id?: string | null
          consumed_value?: number
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline_at?: string | null
          executed_value?: number | null
          execution_days?: number | null
          expense_origin?: Database["public"]["Enums"]["expense_origin"]
          finished_at?: string | null
          hour_meter?: number | null
          id?: string
          issued_at?: string
          maintenance_record_id?: string | null
          notes?: string | null
          odometer_km?: number | null
          organization_id: string
          proposal_id?: string | null
          quota_id?: string | null
          quotation_id?: string | null
          request_id?: string | null
          reserved_value?: number
          services: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
          warranty_days?: number | null
          workshop_id: string
        }
        Update: {
          accident_id?: string | null
          approved_value?: number
          attachment_path?: string | null
          authorizer_id?: string | null
          authorizer_name?: string | null
          budget_reserved?: boolean
          cancel_reason?: string | null
          code?: string | null
          commitment_id?: string | null
          consumed_value?: number
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline_at?: string | null
          executed_value?: number | null
          execution_days?: number | null
          expense_origin?: Database["public"]["Enums"]["expense_origin"]
          finished_at?: string | null
          hour_meter?: number | null
          id?: string
          issued_at?: string
          maintenance_record_id?: string | null
          notes?: string | null
          odometer_km?: number | null
          organization_id?: string
          proposal_id?: string | null
          quota_id?: string | null
          quotation_id?: string | null
          request_id?: string | null
          reserved_value?: number
          services?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
          warranty_days?: number | null
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: false
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "quotation_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_quota_id_fkey"
            columns: ["quota_id"]
            isOneToOne: false
            referencedRelation: "quotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contracts: {
        Row: {
          active: boolean
          cnpj_match: boolean
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          justification: string | null
          notes: string | null
          organization_id: string
          supplier_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          cnpj_match?: boolean
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          justification?: string | null
          notes?: string | null
          organization_id: string
          supplier_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          cnpj_match?: boolean
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          justification?: string | null
          notes?: string | null
          organization_id?: string
          supplier_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contracts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          cnpj: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          import_batch_id: string | null
          legal_name: string
          notes: string | null
          organization_id: string
          phone: string | null
          state: string | null
          state_registration: string | null
          trade_name: string | null
          updated_at: string
          updated_by: string | null
          zip_code: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          legal_name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          state?: string | null
          state_registration?: string | null
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
          zip_code?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          legal_name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          state?: string | null
          state_registration?: string | null
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tire_movements: {
        Row: {
          created_at: string
          created_by: string | null
          from_status: Database["public"]["Enums"]["tire_status"] | null
          id: string
          kind: Database["public"]["Enums"]["tire_movement_kind"]
          maintenance_record_id: string | null
          odometer_km: number | null
          organization_id: string
          position: string | null
          reason: string | null
          tire_id: string
          to_status: Database["public"]["Enums"]["tire_status"]
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_status?: Database["public"]["Enums"]["tire_status"] | null
          id?: string
          kind: Database["public"]["Enums"]["tire_movement_kind"]
          maintenance_record_id?: string | null
          odometer_km?: number | null
          organization_id: string
          position?: string | null
          reason?: string | null
          tire_id: string
          to_status: Database["public"]["Enums"]["tire_status"]
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_status?: Database["public"]["Enums"]["tire_status"] | null
          id?: string
          kind?: Database["public"]["Enums"]["tire_movement_kind"]
          maintenance_record_id?: string | null
          odometer_km?: number | null
          organization_id?: string
          position?: string | null
          reason?: string | null
          tire_id?: string
          to_status?: Database["public"]["Enums"]["tire_status"]
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tire_movements_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tire_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tire_movements_tire_id_fkey"
            columns: ["tire_id"]
            isOneToOne: false
            referencedRelation: "tires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tire_movements_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      tires: {
        Row: {
          accumulated_km: number
          brand: string | null
          code: string
          created_at: string
          created_by: string | null
          dot: string | null
          expected_life_km: number | null
          id: string
          import_batch_id: string | null
          install_date: string | null
          install_km: number | null
          legacy_source: string | null
          model: string | null
          notes: string | null
          organization_id: string
          position: string | null
          purchase_date: string | null
          purchase_value: number | null
          removal_km: number | null
          removal_reason: string | null
          serial_number: string | null
          size: string | null
          status: Database["public"]["Enums"]["tire_status"]
          supplier_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string | null
          warranty_until: string | null
        }
        Insert: {
          accumulated_km?: number
          brand?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          dot?: string | null
          expected_life_km?: number | null
          id?: string
          import_batch_id?: string | null
          install_date?: string | null
          install_km?: number | null
          legacy_source?: string | null
          model?: string | null
          notes?: string | null
          organization_id: string
          position?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          removal_km?: number | null
          removal_reason?: string | null
          serial_number?: string | null
          size?: string | null
          status?: Database["public"]["Enums"]["tire_status"]
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
          warranty_until?: string | null
        }
        Update: {
          accumulated_km?: number
          brand?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          dot?: string | null
          expected_life_km?: number | null
          id?: string
          import_batch_id?: string | null
          install_date?: string | null
          install_km?: number | null
          legacy_source?: string | null
          model?: string | null
          notes?: string | null
          organization_id?: string
          position?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          removal_km?: number | null
          removal_reason?: string | null
          serial_number?: string | null
          size?: string | null
          status?: Database["public"]["Enums"]["tire_status"]
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tires_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tires_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tires_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_fines: {
        Row: {
          amount: number
          authorization_id: string | null
          cancel_reason: string | null
          code: string | null
          created_at: string
          created_by: string | null
          decision_at: string | null
          decision_notes: string | null
          decision_path: string | null
          defense_at: string | null
          defense_path: string | null
          defense_protocol: string | null
          description: string
          discount_amount: number | null
          driver_confirmed: boolean
          driver_id: string | null
          due_date: string | null
          id: string
          import_batch_id: string | null
          infraction_code: string | null
          issuing_authority: string
          legacy_source: string | null
          liability: Database["public"]["Enums"]["fine_liability"]
          location: string | null
          notes: string | null
          notice_number: string
          notification_path: string | null
          occurred_at: string
          organization_id: string
          paid_amount: number | null
          paid_at: string | null
          payment_path: string | null
          points: number | null
          responsible_id: string | null
          responsible_name: string | null
          status: Database["public"]["Enums"]["fine_status"]
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          usage_id: string | null
          vehicle_id: string
        }
        Insert: {
          amount?: number
          authorization_id?: string | null
          cancel_reason?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          decision_at?: string | null
          decision_notes?: string | null
          decision_path?: string | null
          defense_at?: string | null
          defense_path?: string | null
          defense_protocol?: string | null
          description: string
          discount_amount?: number | null
          driver_confirmed?: boolean
          driver_id?: string | null
          due_date?: string | null
          id?: string
          import_batch_id?: string | null
          infraction_code?: string | null
          issuing_authority: string
          legacy_source?: string | null
          liability?: Database["public"]["Enums"]["fine_liability"]
          location?: string | null
          notes?: string | null
          notice_number: string
          notification_path?: string | null
          occurred_at: string
          organization_id: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_path?: string | null
          points?: number | null
          responsible_id?: string | null
          responsible_name?: string | null
          status?: Database["public"]["Enums"]["fine_status"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          usage_id?: string | null
          vehicle_id: string
        }
        Update: {
          amount?: number
          authorization_id?: string | null
          cancel_reason?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          decision_at?: string | null
          decision_notes?: string | null
          decision_path?: string | null
          defense_at?: string | null
          defense_path?: string | null
          defense_protocol?: string | null
          description?: string
          discount_amount?: number | null
          driver_confirmed?: boolean
          driver_id?: string | null
          due_date?: string | null
          id?: string
          import_batch_id?: string | null
          infraction_code?: string | null
          issuing_authority?: string
          legacy_source?: string | null
          liability?: Database["public"]["Enums"]["fine_liability"]
          location?: string | null
          notes?: string | null
          notice_number?: string
          notification_path?: string | null
          occurred_at?: string
          organization_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_path?: string | null
          points?: number | null
          responsible_id?: string | null
          responsible_name?: string | null
          status?: Database["public"]["Enums"]["fine_status"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          usage_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "traffic_fines_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "fuel_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traffic_fines_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traffic_fines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traffic_fines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traffic_fines_usage_id_fkey"
            columns: ["usage_id"]
            isOneToOne: false
            referencedRelation: "vehicle_usages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traffic_fines_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      transparency_delivery_attempts: {
        Row: {
          attempted_at: string
          attempted_by: string | null
          created_at: string
          endpoint: string | null
          http_status: number | null
          id: string
          message: string | null
          mode: Database["public"]["Enums"]["transparency_integration_mode"]
          organization_id: string
          publication_id: string | null
          status: string
        }
        Insert: {
          attempted_at?: string
          attempted_by?: string | null
          created_at?: string
          endpoint?: string | null
          http_status?: number | null
          id?: string
          message?: string | null
          mode: Database["public"]["Enums"]["transparency_integration_mode"]
          organization_id: string
          publication_id?: string | null
          status: string
        }
        Update: {
          attempted_at?: string
          attempted_by?: string | null
          created_at?: string
          endpoint?: string | null
          http_status?: number | null
          id?: string
          message?: string | null
          mode?: Database["public"]["Enums"]["transparency_integration_mode"]
          organization_id?: string
          publication_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "transparency_delivery_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transparency_delivery_attempts_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "transparency_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      transparency_periods: {
        Row: {
          checklist: Json
          closed_at: string | null
          closed_by: string | null
          closing_notes: string | null
          created_at: string
          created_by: string | null
          current_version: number
          id: string
          month: number
          organization_id: string
          reopened_at: string | null
          reopened_by: string | null
          status: Database["public"]["Enums"]["transparency_period_status"]
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          checklist?: Json
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          month: number
          organization_id: string
          reopened_at?: string | null
          reopened_by?: string | null
          status?: Database["public"]["Enums"]["transparency_period_status"]
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          checklist?: Json
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          month?: number
          organization_id?: string
          reopened_at?: string | null
          reopened_by?: string | null
          status?: Database["public"]["Enums"]["transparency_period_status"]
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "transparency_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transparency_publications: {
        Row: {
          checklist: Json
          created_at: string
          external_error: string | null
          external_mode: Database["public"]["Enums"]["transparency_integration_mode"]
          external_sent_at: string | null
          external_status: string
          id: string
          notes: string | null
          organization_id: string
          period_id: string
          published_at: string
          published_by: string | null
          snapshot: Json
          superseded_at: string | null
          version: number
        }
        Insert: {
          checklist?: Json
          created_at?: string
          external_error?: string | null
          external_mode?: Database["public"]["Enums"]["transparency_integration_mode"]
          external_sent_at?: string | null
          external_status?: string
          id?: string
          notes?: string | null
          organization_id: string
          period_id: string
          published_at?: string
          published_by?: string | null
          snapshot?: Json
          superseded_at?: string | null
          version: number
        }
        Update: {
          checklist?: Json
          created_at?: string
          external_error?: string | null
          external_mode?: Database["public"]["Enums"]["transparency_integration_mode"]
          external_sent_at?: string | null
          external_status?: string
          id?: string
          notes?: string | null
          organization_id?: string
          period_id?: string
          published_at?: string
          published_by?: string | null
          snapshot?: Json
          superseded_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transparency_publications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transparency_publications_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "transparency_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      transparency_reopen_requests: {
        Row: {
          created_at: string
          details: string
          executed_at: string | null
          executed_by: string | null
          id: string
          organization_id: string
          period_id: string
          protocol: string | null
          reason: string
          requested_at: string
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["reopen_request_status"]
          support_justification: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          details: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          organization_id: string
          period_id: string
          protocol?: string | null
          reason: string
          requested_at?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["reopen_request_status"]
          support_justification?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          details?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          organization_id?: string
          period_id?: string
          protocol?: string | null
          reason?: string
          requested_at?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["reopen_request_status"]
          support_justification?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transparency_reopen_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transparency_reopen_requests_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "transparency_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      transparency_settings: {
        Row: {
          created_at: string
          datasets: Json
          enabled: boolean
          headline: string | null
          integration_auth_header: string | null
          integration_endpoint: string | null
          integration_mode: Database["public"]["Enums"]["transparency_integration_mode"]
          integration_notes: string | null
          integration_secret_name: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          organization_id: string
          slug: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          datasets?: Json
          enabled?: boolean
          headline?: string | null
          integration_auth_header?: string | null
          integration_endpoint?: string | null
          integration_mode?: Database["public"]["Enums"]["transparency_integration_mode"]
          integration_notes?: string | null
          integration_secret_name?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          organization_id: string
          slug?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          datasets?: Json
          enabled?: boolean
          headline?: string | null
          integration_auth_header?: string | null
          integration_endpoint?: string | null
          integration_mode?: Database["public"]["Enums"]["transparency_integration_mode"]
          integration_notes?: string | null
          integration_secret_name?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          organization_id?: string
          slug?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transparency_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          acronym: string | null
          active: boolean
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          import_batch_id: string | null
          manager_name: string | null
          manager_role: string | null
          name: string
          organization_id: string
          phone: string | null
          unit_type: Database["public"]["Enums"]["unit_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acronym?: string | null
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          manager_name?: string | null
          manager_role?: string | null
          name: string
          organization_id: string
          phone?: string | null
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acronym?: string | null
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          manager_name?: string | null
          manager_role?: string | null
          name?: string
          organization_id?: string
          phone?: string | null
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_cleanings: {
        Row: {
          attachment_path: string | null
          budget_consumed: boolean
          cancel_reason: string | null
          code: string | null
          commitment_id: string | null
          contract_id: string | null
          contract_item_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          id: string
          import_batch_id: string | null
          invoice_number: string | null
          legacy_source: string | null
          notes: string | null
          odometer_km: number | null
          organization_id: string
          performed_at: string
          quota_id: string | null
          service_type_ids: string[]
          service_types: string[]
          status: Database["public"]["Enums"]["cleaning_status"]
          supplier_id: string | null
          total_value: number
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string
        }
        Insert: {
          attachment_path?: string | null
          budget_consumed?: boolean
          cancel_reason?: string | null
          code?: string | null
          commitment_id?: string | null
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_number?: string | null
          legacy_source?: string | null
          notes?: string | null
          odometer_km?: number | null
          organization_id: string
          performed_at?: string
          quota_id?: string | null
          service_type_ids?: string[]
          service_types?: string[]
          status?: Database["public"]["Enums"]["cleaning_status"]
          supplier_id?: string | null
          total_value?: number
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
        }
        Update: {
          attachment_path?: string | null
          budget_consumed?: boolean
          cancel_reason?: string | null
          code?: string | null
          commitment_id?: string | null
          contract_id?: string | null
          contract_item_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_number?: string | null
          legacy_source?: string | null
          notes?: string | null
          odometer_km?: number | null
          organization_id?: string
          performed_at?: string
          quota_id?: string | null
          service_type_ids?: string[]
          service_types?: string[]
          status?: Database["public"]["Enums"]["cleaning_status"]
          supplier_id?: string | null
          total_value?: number
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_cleanings_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_cleanings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_cleanings_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_cleanings_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_cleanings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_cleanings_quota_id_fkey"
            columns: ["quota_id"]
            isOneToOne: false
            referencedRelation: "quotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_cleanings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_cleanings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_cleanings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_obligations: {
        Row: {
          amount: number | null
          attachment_path: string | null
          cancel_reason: string | null
          created_at: string
          created_by: string | null
          document_number: string | null
          due_date: string | null
          exercise: number | null
          id: string
          import_batch_id: string | null
          legacy_source: string | null
          not_applicable: boolean
          notes: string | null
          obligation_type: string
          organization_id: string
          paid_amount: number | null
          paid_at: string | null
          status: Database["public"]["Enums"]["obligation_status"]
          updated_at: string
          updated_by: string | null
          vehicle_id: string
        }
        Insert: {
          amount?: number | null
          attachment_path?: string | null
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          due_date?: string | null
          exercise?: number | null
          id?: string
          import_batch_id?: string | null
          legacy_source?: string | null
          not_applicable?: boolean
          notes?: string | null
          obligation_type: string
          organization_id: string
          paid_amount?: number | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["obligation_status"]
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
        }
        Update: {
          amount?: number | null
          attachment_path?: string | null
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          due_date?: string | null
          exercise?: number | null
          id?: string
          import_batch_id?: string | null
          legacy_source?: string | null
          not_applicable?: boolean
          notes?: string | null
          obligation_type?: string
          organization_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["obligation_status"]
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_obligations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_obligations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_status_history: {
        Row: {
          accident_id: string | null
          asset_movement_id: string | null
          created_at: string
          created_by: string | null
          from_status: Database["public"]["Enums"]["vehicle_status"] | null
          id: string
          maintenance_request_id: string | null
          organization_id: string
          reason: string | null
          source: string | null
          to_status: Database["public"]["Enums"]["vehicle_status"]
          vehicle_id: string
        }
        Insert: {
          accident_id?: string | null
          asset_movement_id?: string | null
          created_at?: string
          created_by?: string | null
          from_status?: Database["public"]["Enums"]["vehicle_status"] | null
          id?: string
          maintenance_request_id?: string | null
          organization_id: string
          reason?: string | null
          source?: string | null
          to_status: Database["public"]["Enums"]["vehicle_status"]
          vehicle_id: string
        }
        Update: {
          accident_id?: string | null
          asset_movement_id?: string | null
          created_at?: string
          created_by?: string | null
          from_status?: Database["public"]["Enums"]["vehicle_status"] | null
          id?: string
          maintenance_request_id?: string | null
          organization_id?: string
          reason?: string | null
          source?: string | null
          to_status?: Database["public"]["Enums"]["vehicle_status"]
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_status_history_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: false
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_status_history_asset_movement_id_fkey"
            columns: ["asset_movement_id"]
            isOneToOne: false
            referencedRelation: "asset_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_status_history_maintenance_request_id_fkey"
            columns: ["maintenance_request_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_status_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_usages: {
        Row: {
          actual_departure: string | null
          actual_return: string | null
          authorizer_id: string | null
          authorizer_name: string | null
          cancel_reason: string | null
          code: string | null
          created_at: string
          created_by: string | null
          destination: string | null
          driver_id: string | null
          end_km: number | null
          id: string
          import_batch_id: string | null
          legacy_source: string | null
          maintenance_justification: string | null
          notes: string | null
          organization_id: string
          origin: string | null
          passengers: string[]
          planned_departure: string
          planned_return: string | null
          purpose: string | null
          requester_id: string | null
          requester_name: string | null
          start_km: number | null
          status: Database["public"]["Enums"]["usage_status"]
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string
          vehicle_updated: boolean
        }
        Insert: {
          actual_departure?: string | null
          actual_return?: string | null
          authorizer_id?: string | null
          authorizer_name?: string | null
          cancel_reason?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          driver_id?: string | null
          end_km?: number | null
          id?: string
          import_batch_id?: string | null
          legacy_source?: string | null
          maintenance_justification?: string | null
          notes?: string | null
          organization_id: string
          origin?: string | null
          passengers?: string[]
          planned_departure: string
          planned_return?: string | null
          purpose?: string | null
          requester_id?: string | null
          requester_name?: string | null
          start_km?: number | null
          status?: Database["public"]["Enums"]["usage_status"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
          vehicle_updated?: boolean
        }
        Update: {
          actual_departure?: string | null
          actual_return?: string | null
          authorizer_id?: string | null
          authorizer_name?: string | null
          cancel_reason?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          driver_id?: string | null
          end_km?: number | null
          id?: string
          import_batch_id?: string | null
          legacy_source?: string | null
          maintenance_justification?: string | null
          notes?: string | null
          organization_id?: string
          origin?: string | null
          passengers?: string[]
          planned_departure?: string
          planned_return?: string | null
          purpose?: string | null
          requester_id?: string | null
          requester_name?: string | null
          start_km?: number | null
          status?: Database["public"]["Enums"]["usage_status"]
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
          vehicle_updated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_usages_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_usages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_usages_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_usages_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          acquisition_date: string | null
          acquisition_value: number | null
          asset_class: string
          asset_code: string | null
          brand: string | null
          capacity_desc: string | null
          chassis: string | null
          color: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          current_km: number | null
          document_path: string | null
          engine_number: string | null
          equipment_type: string | null
          fuel_type: string | null
          hour_meter: number | null
          id: string
          import_batch_id: string | null
          is_private_server_vehicle: boolean
          manufacturer: string | null
          meter_kind: string
          model: string | null
          notes: string | null
          organization_id: string
          ownership: string
          photo_path: string | null
          plate: string | null
          power_hp: number | null
          renavam: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["vehicle_status"]
          tank_capacity: number | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_type: string | null
          year_manufacture: number | null
          year_model: number | null
        }
        Insert: {
          acquisition_date?: string | null
          acquisition_value?: number | null
          asset_class?: string
          asset_code?: string | null
          brand?: string | null
          capacity_desc?: string | null
          chassis?: string | null
          color?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          current_km?: number | null
          document_path?: string | null
          engine_number?: string | null
          equipment_type?: string | null
          fuel_type?: string | null
          hour_meter?: number | null
          id?: string
          import_batch_id?: string | null
          is_private_server_vehicle?: boolean
          manufacturer?: string | null
          meter_kind?: string
          model?: string | null
          notes?: string | null
          organization_id: string
          ownership?: string
          photo_path?: string | null
          plate?: string | null
          power_hp?: number | null
          renavam?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          tank_capacity?: number | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_type?: string | null
          year_manufacture?: number | null
          year_model?: number | null
        }
        Update: {
          acquisition_date?: string | null
          acquisition_value?: number | null
          asset_class?: string
          asset_code?: string | null
          brand?: string | null
          capacity_desc?: string | null
          chassis?: string | null
          color?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          current_km?: number | null
          document_path?: string | null
          engine_number?: string | null
          equipment_type?: string | null
          fuel_type?: string | null
          hour_meter?: number | null
          id?: string
          import_batch_id?: string | null
          is_private_server_vehicle?: boolean
          manufacturer?: string | null
          meter_kind?: string
          model?: string | null
          notes?: string | null
          organization_id?: string
          ownership?: string
          photo_path?: string | null
          plate?: string | null
          power_hp?: number | null
          renavam?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          tank_capacity?: number | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_type?: string | null
          year_manufacture?: number | null
          year_model?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      workshops: {
        Row: {
          accredited_at: string | null
          accredited_until: string | null
          address: string | null
          attachment_path: string | null
          brands: string[]
          city: string | null
          cnpj: string | null
          contact_name: string | null
          coverage_area: string | null
          created_at: string
          created_by: string | null
          district: string | null
          email: string | null
          id: string
          import_batch_id: string | null
          legacy_source: string | null
          legal_name: string
          notes: string | null
          organization_id: string
          phone: string | null
          service_radius_km: number | null
          specialties: string[]
          state: string | null
          status: Database["public"]["Enums"]["workshop_status"]
          trade_name: string | null
          updated_at: string
          updated_by: string | null
          urgency_24h: boolean
          weekend_service: boolean
          zip_code: string | null
        }
        Insert: {
          accredited_at?: string | null
          accredited_until?: string | null
          address?: string | null
          attachment_path?: string | null
          brands?: string[]
          city?: string | null
          cnpj?: string | null
          contact_name?: string | null
          coverage_area?: string | null
          created_at?: string
          created_by?: string | null
          district?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          legacy_source?: string | null
          legal_name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          service_radius_km?: number | null
          specialties?: string[]
          state?: string | null
          status?: Database["public"]["Enums"]["workshop_status"]
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
          urgency_24h?: boolean
          weekend_service?: boolean
          zip_code?: string | null
        }
        Update: {
          accredited_at?: string | null
          accredited_until?: string | null
          address?: string | null
          attachment_path?: string | null
          brands?: string[]
          city?: string | null
          cnpj?: string | null
          contact_name?: string | null
          coverage_area?: string | null
          created_at?: string
          created_by?: string | null
          district?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          legacy_source?: string | null
          legal_name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          service_radius_km?: number | null
          specialties?: string[]
          state?: string | null
          status?: Database["public"]["Enums"]["workshop_status"]
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
          urgency_24h?: boolean
          weekend_service?: boolean
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshops_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_org_id: { Args: never; Returns: string }
      active_server_quota: {
        Args: { _at: string; _vehicle: string }
        Returns: {
          alert_threshold_percent: number
          attachment_path: string | null
          beneficiary_cpf: string
          beneficiary_name: string
          created_at: string
          created_by: string | null
          end_date: string | null
          fuel_type_id: string | null
          id: string
          import_batch_id: string | null
          job_title: string | null
          justification: string | null
          notes: string | null
          organization_id: string
          period: Database["public"]["Enums"]["server_quota_period"]
          quota_quantity: number
          quota_value: number | null
          registration_code: string | null
          start_date: string
          status: Database["public"]["Enums"]["server_quota_status"]
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "server_fuel_quotas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      annul_import_batch: {
        Args: { _batch: string; _reason: string }
        Returns: Json
      }
      backup_due_organizations: {
        Args: never
        Returns: {
          cycle_key: string
          organization_id: string
        }[]
      }
      budget_consume: {
        Args: {
          _commitment: string
          _from_reserved: boolean
          _item: string
          _org: string
          _qty: number
          _quota: string
          _val: number
        }
        Returns: undefined
      }
      budget_log: {
        Args: {
          _auth: string
          _commitment: string
          _fueling: string
          _item: string
          _kind: Database["public"]["Enums"]["budget_movement_kind"]
          _org: string
          _qty: number
          _quota: string
          _reason: string
          _val: number
        }
        Returns: undefined
      }
      budget_refund: {
        Args: {
          _commitment: string
          _item: string
          _org: string
          _qty: number
          _quota: string
          _val: number
        }
        Returns: undefined
      }
      budget_release: {
        Args: {
          _commitment: string
          _item: string
          _org: string
          _qty: number
          _quota: string
          _val: number
        }
        Returns: undefined
      }
      budget_reserve: {
        Args: {
          _commitment: string
          _item: string
          _org: string
          _qty: number
          _quota: string
          _val: number
        }
        Returns: undefined
      }
      can_cancel_fueling: { Args: never; Returns: boolean }
      can_fuel_vehicle: { Args: { _vehicle: string }; Returns: boolean }
      can_manage_finance: { Args: never; Returns: boolean }
      can_manage_fleet: { Args: never; Returns: boolean }
      can_manage_maintenance: { Args: never; Returns: boolean }
      can_manage_users: { Args: never; Returns: boolean }
      can_operate_usage: { Args: never; Returns: boolean }
      can_register_fueling: { Args: never; Returns: boolean }
      can_register_occurrence: { Args: never; Returns: boolean }
      can_write: { Args: never; Returns: boolean }
      close_transparency_period: {
        Args: {
          _checklist: Json
          _month: number
          _notes: string
          _year: number
        }
        Returns: Json
      }
      commit_import_batch: { Args: { _batch: string }; Returns: Json }
      commit_import_batch_v2: { Args: { _batch: string }; Returns: Json }
      commit_import_batch_v3: { Args: { _batch: string }; Returns: Json }
      contract_period_at: {
        Args: { _at: string; _contract: string }
        Returns: string
      }
      current_org_id: { Args: never; Returns: string }
      ensure_transparency_period: {
        Args: { _month: number; _year: number }
        Returns: string
      }
      execute_transparency_reopen: {
        Args: { _justification: string; _request: string }
        Returns: undefined
      }
      expire_backups: { Args: never; Returns: number }
      expire_fuel_authorizations: { Args: never; Returns: undefined }
      expire_fuel_authorizations_all: { Args: never; Returns: number }
      fleet_consumption_segments: {
        Args: {
          _asset_class?: string
          _cost_center?: string
          _driver?: string
          _from: string
          _fuel?: string
          _to: string
          _unit?: string
          _vehicle?: string
        }
        Returns: {
          asset_class: string
          asset_label: string
          brand: string
          category: string
          cost_center_id: string
          cost_center_name: string
          distance_km: number
          driver_id: string
          driver_name: string
          fuel_name: string
          fuel_type_id: string
          fueled_at: string
          fueling_id: string
          hours: number
          invalid_reason: string
          liters: number
          meter_kind: string
          model: string
          too_close: boolean
          unit_id: string
          unit_name: string
          valid: boolean
          value: number
          vehicle_id: string
        }[]
      }
      fleet_cost_rows: {
        Args: {
          _asset_class?: string
          _cost_center?: string
          _from: string
          _to: string
          _unit?: string
          _vehicle?: string
        }
        Returns: {
          asset_class: string
          asset_label: string
          brand: string
          category: string
          category_asset: string
          competence: string
          cost_center_id: string
          cost_center_name: string
          model: string
          unit_id: string
          unit_name: string
          value: number
          vehicle_id: string
        }[]
      }
      fleet_downtime: {
        Args: { _from: string; _to: string }
        Returns: {
          days: number
          events: number
          vehicle_id: string
        }[]
      }
      fuel_limit_breach: {
        Args: {
          _at: string
          _org: string
          _qty: number
          _unit: string
          _vehicle: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_ref_contract: {
        Args: { _org: string; _txt: string }
        Returns: string
      }
      import_ref_cost_center: {
        Args: { _org: string; _txt: string }
        Returns: string
      }
      import_ref_driver: {
        Args: { _org: string; _txt: string }
        Returns: string
      }
      import_ref_fuel: { Args: { _org: string; _txt: string }; Returns: string }
      import_ref_supplier: {
        Args: { _org: string; _txt: string }
        Returns: string
      }
      import_ref_unit: { Args: { _org: string; _txt: string }; Returns: string }
      import_ref_vehicle: {
        Args: { _org: string; _txt: string }
        Returns: string
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      log_budget_block: {
        Args: { _entity_id: string; _entity_type: string; _message: string }
        Returns: undefined
      }
      log_event: {
        Args: {
          _action?: string
          _area?: string
          _entity?: string
          _event_type: string
          _new?: Json
          _old?: Json
          _record_id?: string
          _route?: string
          _screen?: string
          _summary?: string
        }
        Returns: undefined
      }
      log_transparency_delivery: {
        Args: {
          _http: number
          _message: string
          _publication: string
          _status: string
        }
        Returns: undefined
      }
      my_unit_id: { Args: never; Returns: string }
      next_org_code: {
        Args: { _key: string; _org: string; _prefix: string }
        Returns: string
      }
      purge_activity_logs: { Args: never; Returns: number }
      refresh_backup_alerts: { Args: never; Returns: undefined }
      refresh_financial_alerts: { Args: never; Returns: undefined }
      refresh_fleet_alerts: { Args: never; Returns: undefined }
      refresh_intelligence_alerts: { Args: never; Returns: number }
      refresh_maintenance_alerts: { Args: never; Returns: undefined }
      refresh_procurement_alerts: { Args: never; Returns: undefined }
      request_transparency_reopen: {
        Args: {
          _details: string
          _month: number
          _reason: string
          _year: number
        }
        Returns: string
      }
      review_transparency_reopen: {
        Args: { _decision: string; _justification: string; _request: string }
        Returns: undefined
      }
      save_transparency_checklist: {
        Args: { _checklist: Json; _month: number; _year: number }
        Returns: undefined
      }
      seed_cleaning_types: { Args: { _org: string }; Returns: undefined }
      server_quota_cycle: {
        Args: {
          _at: string
          _period: Database["public"]["Enums"]["server_quota_period"]
        }
        Returns: {
          cycle_end: string
          cycle_start: string
        }[]
      }
      server_quota_usage: {
        Args: { _at: string; _ignore_auth?: string; _quota: string }
        Returns: number
      }
      transparency_period_is_closed: {
        Args: { _at: string; _org: string }
        Returns: boolean
      }
      transparency_snapshot: {
        Args: { _month: number; _org: string; _year: number }
        Returns: Json
      }
      unit_scope_ok: { Args: { _unit: string }; Returns: boolean }
    }
    Enums: {
      accident_kind:
        | "colisao"
        | "tombamento"
        | "atropelamento"
        | "dano_estacionado"
        | "furto_roubo"
        | "incendio"
        | "perda_total"
        | "outro"
      accident_status:
        | "registrado"
        | "em_apuracao"
        | "seguradora_acionada"
        | "reparo_autorizado"
        | "encerrado"
      alert_severity: "info" | "alerta" | "erro"
      alert_status: "aberto" | "resolvido"
      app_role:
        | "super_admin"
        | "org_admin"
        | "fleet_manager"
        | "unit_manager"
        | "operator"
        | "auditor"
      asset_movement_kind:
        | "proprio_em_uso"
        | "cedido_ao_orgao"
        | "cedido_a_terceiros"
        | "locado"
        | "fiel_depositario"
        | "remanejamento"
        | "baixa_manutencao"
        | "alienacao_em_processo"
        | "doacao"
        | "leilao"
        | "furto_roubo"
        | "perda_total"
        | "alienado"
        | "desativado"
      budget_movement_kind:
        | "reserva"
        | "liberacao"
        | "consumo"
        | "estorno"
        | "suplementacao"
      cleaning_status: "agendada" | "realizada" | "cancelada"
      commitment_kind: "ordinario" | "estimativo" | "global"
      commitment_status: "ativo" | "esgotado" | "anulado" | "encerrado"
      contract_amendment_kind:
        | "prorrogacao"
        | "acrescimo"
        | "supressao"
        | "reajuste"
        | "reequilibrio"
        | "prorrogacao_valor"
        | "combinado"
      contract_modality:
        | "pregao"
        | "concorrencia"
        | "dispensa"
        | "inexigibilidade"
        | "adesao_ata"
        | "contratacao_direta"
        | "outro"
      contract_status:
        | "rascunho"
        | "vigente"
        | "suspenso"
        | "encerrado"
        | "rescindido"
      diary_proof_status:
        | "em_elaboracao"
        | "entregue"
        | "em_conferencia"
        | "aprovada"
        | "rejeitada"
      diary_status:
        | "rascunho"
        | "solicitada"
        | "em_analise"
        | "autorizada"
        | "paga"
        | "viagem_realizada"
        | "aguardando_comprovacao"
        | "comprovada"
        | "rejeitada"
        | "cancelada"
      driver_bond:
        | "efetivo"
        | "comissionado"
        | "contratado"
        | "terceirizado"
        | "outro"
      entity_kind: "pf" | "pj"
      expense_origin:
        | "contrato"
        | "compra_direta"
        | "convenio"
        | "doacao"
        | "almoxarifado"
        | "recurso_proprio"
      fine_liability: "nao_definida" | "condutor" | "orgao"
      fine_status:
        | "recebida"
        | "em_analise"
        | "defesa_apresentada"
        | "deferida"
        | "indeferida"
        | "paga"
        | "cancelada"
      fuel_auth_status:
        | "pendente"
        | "autorizada"
        | "utilizada_parcial"
        | "utilizada"
        | "expirada"
        | "cancelada"
      fueling_status: "valido" | "cancelado"
      insurance_status: "ativa" | "a_vencer" | "vencida" | "cancelada"
      invitation_status:
        | "convidada"
        | "respondida"
        | "recusada"
        | "sem_resposta"
      limit_scope: "organizacao" | "unidade" | "veiculo"
      maintenance_kind: "preventiva" | "corretiva"
      maintenance_priority: "baixa" | "normal" | "alta" | "urgente"
      maintenance_record_status: "em_execucao" | "concluida" | "cancelada"
      maintenance_request_status:
        | "aberta"
        | "em_analise"
        | "aprovada"
        | "em_manutencao"
        | "concluida"
        | "cancelada"
      obligation_status:
        | "pendente"
        | "quitada"
        | "vencida"
        | "nao_aplicavel"
        | "cancelada"
      org_type:
        | "prefeitura"
        | "camara"
        | "consorcio"
        | "autarquia"
        | "fundacao"
        | "secretaria"
        | "outro"
      proposal_status:
        | "recebida"
        | "desclassificada"
        | "selecionada"
        | "nao_selecionada"
      quota_type: "financeira" | "quantitativa"
      quotation_status:
        | "rascunho"
        | "aberta"
        | "em_analise"
        | "encerrada"
        | "cancelada"
      reopen_request_status:
        | "aberto"
        | "em_analise"
        | "aprovado"
        | "rejeitado"
        | "executado"
      server_quota_period: "semanal" | "mensal"
      server_quota_status: "ativa" | "inativa" | "suspensa"
      service_order_status:
        | "emitida"
        | "veiculo_recebido"
        | "em_execucao"
        | "aguardando_peca"
        | "concluida"
        | "cancelada"
      tire_movement_kind:
        | "entrada"
        | "instalacao"
        | "retirada"
        | "reparo"
        | "recapagem"
        | "descarte"
        | "baixa"
      tire_status:
        | "estoque"
        | "instalado"
        | "em_reparo"
        | "recapagem"
        | "descartado"
        | "baixado"
      transparency_integration_mode:
        | "desativada"
        | "api"
        | "webhook"
        | "arquivo"
      transparency_period_status:
        | "aberta"
        | "em_conferencia"
        | "fechada"
        | "reabertura_solicitada"
        | "reaberta"
        | "erro_integracao"
      unit_type:
        | "secretaria"
        | "departamento"
        | "diretoria"
        | "coordenacao"
        | "unidade"
        | "outro"
      usage_status:
        | "solicitada"
        | "autorizada"
        | "em_uso"
        | "concluida"
        | "cancelada"
      vehicle_status: "ativo" | "manutencao" | "cedido" | "inativo" | "baixado"
      workshop_status: "em_analise" | "ativo" | "suspenso" | "inativo"
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
      accident_kind: [
        "colisao",
        "tombamento",
        "atropelamento",
        "dano_estacionado",
        "furto_roubo",
        "incendio",
        "perda_total",
        "outro",
      ],
      accident_status: [
        "registrado",
        "em_apuracao",
        "seguradora_acionada",
        "reparo_autorizado",
        "encerrado",
      ],
      alert_severity: ["info", "alerta", "erro"],
      alert_status: ["aberto", "resolvido"],
      app_role: [
        "super_admin",
        "org_admin",
        "fleet_manager",
        "unit_manager",
        "operator",
        "auditor",
      ],
      asset_movement_kind: [
        "proprio_em_uso",
        "cedido_ao_orgao",
        "cedido_a_terceiros",
        "locado",
        "fiel_depositario",
        "remanejamento",
        "baixa_manutencao",
        "alienacao_em_processo",
        "doacao",
        "leilao",
        "furto_roubo",
        "perda_total",
        "alienado",
        "desativado",
      ],
      budget_movement_kind: [
        "reserva",
        "liberacao",
        "consumo",
        "estorno",
        "suplementacao",
      ],
      cleaning_status: ["agendada", "realizada", "cancelada"],
      commitment_kind: ["ordinario", "estimativo", "global"],
      commitment_status: ["ativo", "esgotado", "anulado", "encerrado"],
      contract_amendment_kind: [
        "prorrogacao",
        "acrescimo",
        "supressao",
        "reajuste",
        "reequilibrio",
        "prorrogacao_valor",
        "combinado",
      ],
      contract_modality: [
        "pregao",
        "concorrencia",
        "dispensa",
        "inexigibilidade",
        "adesao_ata",
        "contratacao_direta",
        "outro",
      ],
      contract_status: [
        "rascunho",
        "vigente",
        "suspenso",
        "encerrado",
        "rescindido",
      ],
      diary_proof_status: [
        "em_elaboracao",
        "entregue",
        "em_conferencia",
        "aprovada",
        "rejeitada",
      ],
      diary_status: [
        "rascunho",
        "solicitada",
        "em_analise",
        "autorizada",
        "paga",
        "viagem_realizada",
        "aguardando_comprovacao",
        "comprovada",
        "rejeitada",
        "cancelada",
      ],
      driver_bond: [
        "efetivo",
        "comissionado",
        "contratado",
        "terceirizado",
        "outro",
      ],
      entity_kind: ["pf", "pj"],
      expense_origin: [
        "contrato",
        "compra_direta",
        "convenio",
        "doacao",
        "almoxarifado",
        "recurso_proprio",
      ],
      fine_liability: ["nao_definida", "condutor", "orgao"],
      fine_status: [
        "recebida",
        "em_analise",
        "defesa_apresentada",
        "deferida",
        "indeferida",
        "paga",
        "cancelada",
      ],
      fuel_auth_status: [
        "pendente",
        "autorizada",
        "utilizada_parcial",
        "utilizada",
        "expirada",
        "cancelada",
      ],
      fueling_status: ["valido", "cancelado"],
      insurance_status: ["ativa", "a_vencer", "vencida", "cancelada"],
      invitation_status: [
        "convidada",
        "respondida",
        "recusada",
        "sem_resposta",
      ],
      limit_scope: ["organizacao", "unidade", "veiculo"],
      maintenance_kind: ["preventiva", "corretiva"],
      maintenance_priority: ["baixa", "normal", "alta", "urgente"],
      maintenance_record_status: ["em_execucao", "concluida", "cancelada"],
      maintenance_request_status: [
        "aberta",
        "em_analise",
        "aprovada",
        "em_manutencao",
        "concluida",
        "cancelada",
      ],
      obligation_status: [
        "pendente",
        "quitada",
        "vencida",
        "nao_aplicavel",
        "cancelada",
      ],
      org_type: [
        "prefeitura",
        "camara",
        "consorcio",
        "autarquia",
        "fundacao",
        "secretaria",
        "outro",
      ],
      proposal_status: [
        "recebida",
        "desclassificada",
        "selecionada",
        "nao_selecionada",
      ],
      quota_type: ["financeira", "quantitativa"],
      quotation_status: [
        "rascunho",
        "aberta",
        "em_analise",
        "encerrada",
        "cancelada",
      ],
      reopen_request_status: [
        "aberto",
        "em_analise",
        "aprovado",
        "rejeitado",
        "executado",
      ],
      server_quota_period: ["semanal", "mensal"],
      server_quota_status: ["ativa", "inativa", "suspensa"],
      service_order_status: [
        "emitida",
        "veiculo_recebido",
        "em_execucao",
        "aguardando_peca",
        "concluida",
        "cancelada",
      ],
      tire_movement_kind: [
        "entrada",
        "instalacao",
        "retirada",
        "reparo",
        "recapagem",
        "descarte",
        "baixa",
      ],
      tire_status: [
        "estoque",
        "instalado",
        "em_reparo",
        "recapagem",
        "descartado",
        "baixado",
      ],
      transparency_integration_mode: [
        "desativada",
        "api",
        "webhook",
        "arquivo",
      ],
      transparency_period_status: [
        "aberta",
        "em_conferencia",
        "fechada",
        "reabertura_solicitada",
        "reaberta",
        "erro_integracao",
      ],
      unit_type: [
        "secretaria",
        "departamento",
        "diretoria",
        "coordenacao",
        "unidade",
        "outro",
      ],
      usage_status: [
        "solicitada",
        "autorizada",
        "em_uso",
        "concluida",
        "cancelada",
      ],
      vehicle_status: ["ativo", "manutencao", "cedido", "inativo", "baixado"],
      workshop_status: ["em_analise", "ativo", "suspenso", "inativo"],
    },
  },
} as const
