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
      billing_events: {
        Row: {
          amount_cents: number | null
          created_at: string
          event_type: string
          id: string
          number_subscription_id: string | null
          pagarme_event_id: string | null
          payload: Json
          user_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          event_type: string
          id?: string
          number_subscription_id?: string | null
          pagarme_event_id?: string | null
          payload: Json
          user_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          event_type?: string
          id?: string
          number_subscription_id?: string | null
          pagarme_event_id?: string | null
          payload?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_number_subscription_id_fkey"
            columns: ["number_subscription_id"]
            isOneToOne: false
            referencedRelation: "number_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_instances: {
        Row: {
          campaign_id: string
          instance_id: string
        }
        Insert: {
          campaign_id: string
          instance_id: string
        }
        Update: {
          campaign_id?: string
          instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_instances_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_instances_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_targets: {
        Row: {
          campaign_id: string
          contact_id: string | null
          created_at: string
          error: string | null
          id: string
          instance_id: string | null
          name: string | null
          phone: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          instance_id?: string | null
          name?: string | null
          phone: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          instance_id?: string | null
          name?: string | null
          phone?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_targets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_targets_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          active_hour_end: number
          active_hour_start: number
          created_at: string
          id: string
          list_id: string | null
          max_delay_seconds: number
          media_filename: string | null
          media_type: string | null
          media_url: string | null
          message: string
          min_delay_seconds: number
          name: string
          next_run_at: string
          per_instance_daily_limit: number
          status: string
          user_id: string
        }
        Insert: {
          active_hour_end?: number
          active_hour_start?: number
          created_at?: string
          id?: string
          list_id?: string | null
          max_delay_seconds?: number
          media_filename?: string | null
          media_type?: string | null
          media_url?: string | null
          message: string
          min_delay_seconds?: number
          name: string
          next_run_at?: string
          per_instance_daily_limit?: number
          status?: string
          user_id: string
        }
        Update: {
          active_hour_end?: number
          active_hour_start?: number
          created_at?: string
          id?: string
          list_id?: string | null
          max_delay_seconds?: number
          media_filename?: string | null
          media_type?: string | null
          media_url?: string | null
          message?: string
          min_delay_seconds?: number
          name?: string
          next_run_at?: string
          per_instance_daily_limit?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          id: string
          list_id: string
          name: string | null
          phone: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          name?: string | null
          phone: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          name?: string | null
          phone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
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
      number_subscriptions: {
        Row: {
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          id: string
          last_charge_url: string | null
          last_pix_qr_code: string | null
          pagarme_plan_id: string | null
          pagarme_subscription_id: string | null
          payment_method: string
          price_cents: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          last_charge_url?: string | null
          last_pix_qr_code?: string | null
          pagarme_plan_id?: string | null
          pagarme_subscription_id?: string | null
          payment_method: string
          price_cents?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          last_charge_url?: string | null
          last_pix_qr_code?: string | null
          pagarme_plan_id?: string | null
          pagarme_subscription_id?: string | null
          payment_method?: string
          price_cents?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pagarme_config: {
        Row: {
          id: number
          is_live: boolean
          plan_id: string | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          id?: number
          is_live?: boolean
          plan_id?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          id?: number
          is_live?: boolean
          plan_id?: string | null
          updated_at?: string
          webhook_url?: string | null
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
          company: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          source: string | null
          use_case: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          source?: string | null
          use_case?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          source?: string | null
          use_case?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          free_number_bonus: number
          id: string
          pagarme_customer_id: string | null
          plan_id: string
          status: string
          suspended: boolean
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          free_number_bonus?: number
          id?: string
          pagarme_customer_id?: string | null
          plan_id: string
          status?: string
          suspended?: boolean
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          free_number_bonus?: number
          id?: string
          pagarme_customer_id?: string | null
          plan_id?: string
          status?: string
          suspended?: boolean
          suspended_at?: string | null
          suspended_reason?: string | null
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
          warmup_started_at: string | null
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
          warmup_started_at?: string | null
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
          warmup_started_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_financial_summary: {
        Args: never
        Returns: {
          active_paid_numbers: number
          active_users: number
          canceled_last_30d: number
          mrr_cents: number
          past_due_numbers: number
          suspended_users: number
        }[]
      }
      chip_temperature: {
        Args: { _instance_id: string }
        Returns: {
          active_days_7d: number
          last_activity: string
          msgs_7d: number
          msgs_total: number
          temperature: string
        }[]
      }
      group_engine_status: {
        Args: { _group_id: string }
        Returns: {
          active: boolean
          connected_members: number
          last_activity: string
          msgs_today: number
          msgs_total: number
          next_run_at: string
          total_members: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      messages_daily_series: {
        Args: { _days?: number; _user_id: string }
        Returns: {
          day: string
          failed: number
          sent: number
        }[]
      }
      messages_sent_today: { Args: { _user_id: string }; Returns: number }
      user_number_quota: { Args: { _user_id: string }; Returns: number }
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
