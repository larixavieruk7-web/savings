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
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      category_rules: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_essential: boolean | null
          note: string | null
          pattern: string
          source: string | null
          subcategory: string | null
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          is_essential?: boolean | null
          note?: string | null
          pattern: string
          source?: string | null
          subcategory?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_essential?: boolean | null
          note?: string | null
          pattern?: string
          source?: string | null
          subcategory?: string | null
          user_id?: string
        }
        Relationships: []
      }
      knowledge_entries: {
        Row: {
          created_at: string | null
          date: string
          description: string | null
          expected_amount: number | null
          expected_category: string | null
          expected_date: string | null
          id: string
          tags: string[] | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          description?: string | null
          expected_amount?: number | null
          expected_category?: string | null
          expected_date?: string | null
          id: string
          tags?: string[] | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          description?: string | null
          expected_amount?: number | null
          expected_category?: string | null
          expected_date?: string | null
          id?: string
          tags?: string[] | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      monthly_analyses: {
        Row: {
          analysis: Json
          created_at: string | null
          id: string
          period: string
          user_id: string
        }
        Insert: {
          analysis: Json
          created_at?: string | null
          id?: string
          period: string
          user_id: string
        }
        Update: {
          analysis?: Json
          created_at?: string | null
          id?: string
          period?: string
          user_id?: string
        }
        Relationships: []
      }
      savings_targets: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          month: string
          target_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id: string
          month: string
          target_amount: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          month?: string
          target_amount?: number
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_name: string | null
          amount: number
          balance: number | null
          category: string | null
          category_source: string | null
          created_at: string | null
          date: string
          description: string
          id: string
          is_essential: boolean | null
          is_recurring: boolean | null
          merchant_name: string | null
          raw_description: string | null
          source: string | null
          subcategory: string | null
          type: string | null
          user_id: string
          user_note: string | null
        }
        Insert: {
          account_name?: string | null
          amount: number
          balance?: number | null
          category?: string | null
          category_source?: string | null
          created_at?: string | null
          date: string
          description: string
          id: string
          is_essential?: boolean | null
          is_recurring?: boolean | null
          merchant_name?: string | null
          raw_description?: string | null
          source?: string | null
          subcategory?: string | null
          type?: string | null
          user_id: string
          user_note?: string | null
        }
        Update: {
          account_name?: string | null
          amount?: number
          balance?: number | null
          category?: string | null
          category_source?: string | null
          created_at?: string | null
          date?: string
          description?: string
          id?: string
          is_essential?: boolean | null
          is_recurring?: boolean | null
          merchant_name?: string | null
          raw_description?: string | null
          source?: string | null
          subcategory?: string | null
          type?: string | null
          user_id?: string
          user_note?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          account_nicknames: Json | null
          account_types: Json | null
          custom_colors: Json | null
          dismissed_recommendations: string[] | null
          essential_merchants: string[] | null
          insights_cache: Json | null
          migration_completed_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_nicknames?: Json | null
          account_types?: Json | null
          custom_colors?: Json | null
          dismissed_recommendations?: string[] | null
          essential_merchants?: string[] | null
          insights_cache?: Json | null
          migration_completed_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_nicknames?: Json | null
          account_types?: Json | null
          custom_colors?: Json | null
          dismissed_recommendations?: string[] | null
          essential_merchants?: string[] | null
          insights_cache?: Json | null
          migration_completed_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
