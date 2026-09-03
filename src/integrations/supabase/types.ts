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
      fuel_types: {
        Row: {
          acronym: string | null
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          measure_unit: string
          name: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acronym?: string | null
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          measure_unit?: string
          name: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acronym?: string | null
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
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
          created_at: string
          created_by: string | null
          fueling_id: string | null
          id: string
          justification: string | null
          message: string
          organization_id: string
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
          created_at?: string
          created_by?: string | null
          fueling_id?: string | null
          id?: string
          justification?: string | null
          message: string
          organization_id: string
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
          created_at?: string
          created_by?: string | null
          fueling_id?: string | null
          id?: string
          justification?: string | null
          message?: string
          organization_id?: string
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
          authorization_number: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          driver_name: string | null
          fuel_type_id: string | null
          fueled_at: string
          hour_meter: number | null
          id: string
          invoice_number: string | null
          notes: string | null
          odometer_km: number | null
          operator_name: string | null
          organization_id: string
          quantity: number
          status: Database["public"]["Enums"]["fueling_status"]
          supplier_id: string | null
          total_value: number | null
          unit_id: string | null
          unit_price: number
          updated_at: string
          updated_by: string | null
          vehicle_id: string
          vehicle_updated: boolean
        }
        Insert: {
          alert_flags?: string[]
          alert_justification?: string | null
          attachment_path?: string | null
          authorization_number?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          driver_name?: string | null
          fuel_type_id?: string | null
          fueled_at?: string
          hour_meter?: number | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          odometer_km?: number | null
          operator_name?: string | null
          organization_id: string
          quantity: number
          status?: Database["public"]["Enums"]["fueling_status"]
          supplier_id?: string | null
          total_value?: number | null
          unit_id?: string | null
          unit_price: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
          vehicle_updated?: boolean
        }
        Update: {
          alert_flags?: string[]
          alert_justification?: string | null
          attachment_path?: string | null
          authorization_number?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          driver_name?: string | null
          fuel_type_id?: string | null
          fueled_at?: string
          hour_meter?: number | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          odometer_km?: number | null
          operator_name?: string | null
          organization_id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["fueling_status"]
          supplier_id?: string | null
          total_value?: number | null
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
          vehicle_updated?: boolean
        }
        Relationships: [
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
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          job_title: string | null
          organization_id: string | null
          phone: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          organization_id?: string | null
          phone?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
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
      units: {
        Row: {
          acronym: string | null
          active: boolean
          created_at: string
          created_by: string | null
          email: string | null
          id: string
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
      vehicles: {
        Row: {
          asset_code: string | null
          brand: string | null
          chassis: string | null
          color: string | null
          created_at: string
          created_by: string | null
          current_km: number | null
          fuel_type: string | null
          hour_meter: number | null
          id: string
          model: string | null
          notes: string | null
          organization_id: string
          plate: string
          renavam: string | null
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
          asset_code?: string | null
          brand?: string | null
          chassis?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          current_km?: number | null
          fuel_type?: string | null
          hour_meter?: number | null
          id?: string
          model?: string | null
          notes?: string | null
          organization_id: string
          plate: string
          renavam?: string | null
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
          asset_code?: string | null
          brand?: string | null
          chassis?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          current_km?: number | null
          fuel_type?: string | null
          hour_meter?: number | null
          id?: string
          model?: string | null
          notes?: string | null
          organization_id?: string
          plate?: string
          renavam?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_cancel_fueling: { Args: never; Returns: boolean }
      can_fuel_vehicle: { Args: { _vehicle: string }; Returns: boolean }
      can_manage_users: { Args: never; Returns: boolean }
      can_register_fueling: { Args: never; Returns: boolean }
      can_write: { Args: never; Returns: boolean }
      current_org_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      my_unit_id: { Args: never; Returns: string }
    }
    Enums: {
      alert_severity: "info" | "alerta" | "erro"
      alert_status: "aberto" | "resolvido"
      app_role:
        | "super_admin"
        | "org_admin"
        | "fleet_manager"
        | "unit_manager"
        | "operator"
        | "auditor"
      fueling_status: "valido" | "cancelado"
      org_type:
        | "prefeitura"
        | "camara"
        | "consorcio"
        | "autarquia"
        | "fundacao"
        | "secretaria"
        | "outro"
      unit_type:
        | "secretaria"
        | "departamento"
        | "diretoria"
        | "coordenacao"
        | "unidade"
        | "outro"
      vehicle_status: "ativo" | "manutencao" | "cedido" | "inativo" | "baixado"
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
      fueling_status: ["valido", "cancelado"],
      org_type: [
        "prefeitura",
        "camara",
        "consorcio",
        "autarquia",
        "fundacao",
        "secretaria",
        "outro",
      ],
      unit_type: [
        "secretaria",
        "departamento",
        "diretoria",
        "coordenacao",
        "unidade",
        "outro",
      ],
      vehicle_status: ["ativo", "manutencao", "cedido", "inativo", "baixado"],
    },
  },
} as const
