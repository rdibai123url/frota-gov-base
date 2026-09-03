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
    }
    Enums: {
      app_role:
        | "super_admin"
        | "org_admin"
        | "fleet_manager"
        | "unit_manager"
        | "operator"
        | "auditor"
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
      app_role: [
        "super_admin",
        "org_admin",
        "fleet_manager",
        "unit_manager",
        "operator",
        "auditor",
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
