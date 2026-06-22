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
      ability_scores: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      alignments: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      backgrounds: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          created_at: string
          data: Json
          hit_die: number | null
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          hit_die?: number | null
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          hit_die?: number | null
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      conditions: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      damage_types: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      equipment: {
        Row: {
          categories: string[] | null
          cost_qty: number | null
          cost_unit: string | null
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
          weight: number | null
        }
        Insert: {
          categories?: string[] | null
          cost_qty?: number | null
          cost_unit?: string | null
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
          weight?: number | null
        }
        Update: {
          categories?: string[] | null
          cost_qty?: number | null
          cost_unit?: string | null
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
          weight?: number | null
        }
        Relationships: []
      }
      equipment_categories: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      feats: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
          type: string | null
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
          type?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
          type?: string | null
        }
        Relationships: []
      }
      features: {
        Row: {
          class_index: string | null
          created_at: string
          data: Json
          index: string
          level_index: string | null
          name: string
          ruleset: string
        }
        Insert: {
          class_index?: string | null
          created_at?: string
          data: Json
          index: string
          level_index?: string | null
          name: string
          ruleset: string
        }
        Update: {
          class_index?: string | null
          created_at?: string
          data?: Json
          index?: string
          level_index?: string | null
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      languages: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      levels: {
        Row: {
          class_index: string | null
          created_at: string
          data: Json
          index: string
          level: number | null
          name: string | null
          ruleset: string
        }
        Insert: {
          class_index?: string | null
          created_at?: string
          data: Json
          index: string
          level?: number | null
          name?: string | null
          ruleset: string
        }
        Update: {
          class_index?: string | null
          created_at?: string
          data?: Json
          index?: string
          level?: number | null
          name?: string | null
          ruleset?: string
        }
        Relationships: []
      }
      magic_items: {
        Row: {
          created_at: string
          data: Json
          equipment_category: string | null
          index: string
          name: string
          rarity: string | null
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          equipment_category?: string | null
          index: string
          name: string
          rarity?: string | null
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          equipment_category?: string | null
          index?: string
          name?: string
          rarity?: string | null
          ruleset?: string
        }
        Relationships: []
      }
      magic_schools: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      monsters: {
        Row: {
          challenge_rating: number | null
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
          size: string | null
          type: string | null
        }
        Insert: {
          challenge_rating?: number | null
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
          size?: string | null
          type?: string | null
        }
        Update: {
          challenge_rating?: number | null
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
          size?: string | null
          type?: string | null
        }
        Relationships: []
      }
      poisons: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
          type: string | null
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
          type?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
          type?: string | null
        }
        Relationships: []
      }
      proficiencies: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
          type: string | null
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
          type?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
          type?: string | null
        }
        Relationships: []
      }
      rule_sections: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      rules: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      skills: {
        Row: {
          ability_score: string | null
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          ability_score?: string | null
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          ability_score?: string | null
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      species: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
          size: string | null
          speed: number | null
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
          size?: string | null
          speed?: number | null
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
          size?: string | null
          speed?: number | null
        }
        Relationships: []
      }
      spells: {
        Row: {
          concentration: boolean | null
          created_at: string
          data: Json
          index: string
          level: number | null
          name: string
          ritual: boolean | null
          ruleset: string
          school: string | null
        }
        Insert: {
          concentration?: boolean | null
          created_at?: string
          data: Json
          index: string
          level?: number | null
          name: string
          ritual?: boolean | null
          ruleset: string
          school?: string | null
        }
        Update: {
          concentration?: boolean | null
          created_at?: string
          data?: Json
          index?: string
          level?: number | null
          name?: string
          ritual?: boolean | null
          ruleset?: string
          school?: string | null
        }
        Relationships: []
      }
      subclasses: {
        Row: {
          class_index: string | null
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          class_index?: string | null
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          class_index?: string | null
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      subspecies: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
          species_index: string | null
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
          species_index?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
          species_index?: string | null
        }
        Relationships: []
      }
      traits: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      weapon_mastery_properties: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
        }
        Relationships: []
      }
      weapon_properties: {
        Row: {
          created_at: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Insert: {
          created_at?: string
          data: Json
          index: string
          name: string
          ruleset: string
        }
        Update: {
          created_at?: string
          data?: Json
          index?: string
          name?: string
          ruleset?: string
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
  public: {
    Enums: {},
  },
} as const
