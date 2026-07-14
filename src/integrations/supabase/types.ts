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
      evolution_config: {
        Row: {
          api_key: string | null
          api_url: string | null
          id: number
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          api_url?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          api_url?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          is_global: boolean
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_global?: boolean
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_global?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          max_instances: number
          max_messages_per_day: number
          name: string
          price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_instances?: number
          max_messages_per_day?: number
          name: string
          price_cents?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_instances?: number
          max_messages_per_day?: number
          name?: string
          price_cents?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warmup_group_members: {
        Row: {
          group_id: string
          id: string
          instance_id: string
        }
        Insert: {
          group_id: string
          id?: string
          instance_id: string
        }
        Update: {
          group_id?: string
          id?: string
          instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "warmup_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_group_members_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_groups: {
        Row: {
          active: boolean
          created_at: string
          daily_limit: number
          id: string
          max_delay_seconds: number
          min_delay_seconds: number
          name: string
          next_run_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_limit?: number
          id?: string
          max_delay_seconds?: number
          min_delay_seconds?: number
          name: string
          next_run_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_limit?: number
          id?: string
          max_delay_seconds?: number
          min_delay_seconds?: number
          name?: string
          next_run_at?: string
          user_id?: string
        }
        Relationships: []
      }
      warmup_logs: {
        Row: {
          content: string | null
          created_at: string
          error: string | null
          from_instance_id: string | null
          group_id: string | null
          id: string
          status: string
          to_instance_id: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          error?: string | null
          from_instance_id?: string | null
          group_id?: string | null
          id?: string
          status?: string
          to_instance_id?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          error?: string | null
          from_instance_id?: string | null
          group_id?: string | null
          id?: string
          status?: string
          to_instance_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_logs_from_instance_id_fkey"
            columns: ["from_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_logs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "warmup_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_logs_to_instance_id_fkey"
            columns: ["to_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          evolution_instance: string
          id: string
          last_qr: string | null
          name: string
          phone: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evolution_instance: string
          id?: string
          last_qr?: string | null
          name: string
          phone?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          evolution_instance?: string
          id?: string
          last_qr?: string | null
          name?: string
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      messages_sent_today: { Args: { _user_id: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "seller"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "seller"],
    },
  },
} as const
