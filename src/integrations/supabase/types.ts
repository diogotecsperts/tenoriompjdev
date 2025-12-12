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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      impugnacoes: {
        Row: {
          created_at: string
          id: string
          laudo_id: string | null
          processo_numero: string | null
          quesitos: Json | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          laudo_id?: string | null
          processo_numero?: string | null
          quesitos?: Json | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          laudo_id?: string | null
          processo_numero?: string | null
          quesitos?: Json | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impugnacoes_laudo_id_fkey"
            columns: ["laudo_id"]
            isOneToOne: false
            referencedRelation: "laudos"
            referencedColumns: ["id"]
          },
        ]
      }
      laudos: {
        Row: {
          afastamentos: string | null
          anotacoes: string | null
          antecedentes: string | null
          auxilio_terceiros: string | null
          conclusao_analise: string | null
          conclusao_cid: string | null
          conclusao_destino: string | null
          conclusao_incapacidade: string | null
          conclusao_justificativa: string | null
          conclusao_status: string | null
          created_at: string | null
          dano_estetico: string | null
          data_acidente: string | null
          data_pericia: string | null
          documentos: string[] | null
          exame_fisico: string | null
          exames_complementares: string | null
          historia_acidente: string | null
          historia_atual: string | null
          historico_ocupacional: string | null
          id: string
          laudos_medicos: string | null
          nexo_causal_justificativa: string | null
          nexo_causal_tipo: string | null
          perito_crm: string | null
          perito_email: string | null
          perito_endereco: string | null
          perito_especialidade: string | null
          perito_nome: string | null
          perito_telefone: string | null
          planejamento: string[] | null
          processo_numero: string | null
          processo_vara: string | null
          quesitos_juizo: string | null
          quesitos_reclamada: string | null
          quesitos_reclamante: string | null
          reclamada: string | null
          reclamante: string | null
          status: string | null
          tabela_susep: string | null
          title: string
          tratamentos: string | null
          updated_at: string | null
          user_id: string
          vitima_dominancia: string | null
          vitima_escolaridade: string | null
          vitima_nascimento: string | null
          vitima_nome: string | null
          vitima_profissao: string | null
        }
        Insert: {
          afastamentos?: string | null
          anotacoes?: string | null
          antecedentes?: string | null
          auxilio_terceiros?: string | null
          conclusao_analise?: string | null
          conclusao_cid?: string | null
          conclusao_destino?: string | null
          conclusao_incapacidade?: string | null
          conclusao_justificativa?: string | null
          conclusao_status?: string | null
          created_at?: string | null
          dano_estetico?: string | null
          data_acidente?: string | null
          data_pericia?: string | null
          documentos?: string[] | null
          exame_fisico?: string | null
          exames_complementares?: string | null
          historia_acidente?: string | null
          historia_atual?: string | null
          historico_ocupacional?: string | null
          id?: string
          laudos_medicos?: string | null
          nexo_causal_justificativa?: string | null
          nexo_causal_tipo?: string | null
          perito_crm?: string | null
          perito_email?: string | null
          perito_endereco?: string | null
          perito_especialidade?: string | null
          perito_nome?: string | null
          perito_telefone?: string | null
          planejamento?: string[] | null
          processo_numero?: string | null
          processo_vara?: string | null
          quesitos_juizo?: string | null
          quesitos_reclamada?: string | null
          quesitos_reclamante?: string | null
          reclamada?: string | null
          reclamante?: string | null
          status?: string | null
          tabela_susep?: string | null
          title?: string
          tratamentos?: string | null
          updated_at?: string | null
          user_id: string
          vitima_dominancia?: string | null
          vitima_escolaridade?: string | null
          vitima_nascimento?: string | null
          vitima_nome?: string | null
          vitima_profissao?: string | null
        }
        Update: {
          afastamentos?: string | null
          anotacoes?: string | null
          antecedentes?: string | null
          auxilio_terceiros?: string | null
          conclusao_analise?: string | null
          conclusao_cid?: string | null
          conclusao_destino?: string | null
          conclusao_incapacidade?: string | null
          conclusao_justificativa?: string | null
          conclusao_status?: string | null
          created_at?: string | null
          dano_estetico?: string | null
          data_acidente?: string | null
          data_pericia?: string | null
          documentos?: string[] | null
          exame_fisico?: string | null
          exames_complementares?: string | null
          historia_acidente?: string | null
          historia_atual?: string | null
          historico_ocupacional?: string | null
          id?: string
          laudos_medicos?: string | null
          nexo_causal_justificativa?: string | null
          nexo_causal_tipo?: string | null
          perito_crm?: string | null
          perito_email?: string | null
          perito_endereco?: string | null
          perito_especialidade?: string | null
          perito_nome?: string | null
          perito_telefone?: string | null
          planejamento?: string[] | null
          processo_numero?: string | null
          processo_vara?: string | null
          quesitos_juizo?: string | null
          quesitos_reclamada?: string | null
          quesitos_reclamante?: string | null
          reclamada?: string | null
          reclamante?: string | null
          status?: string | null
          tabela_susep?: string | null
          title?: string
          tratamentos?: string | null
          updated_at?: string | null
          user_id?: string
          vitima_dominancia?: string | null
          vitima_escolaridade?: string | null
          vitima_nascimento?: string | null
          vitima_nome?: string | null
          vitima_profissao?: string | null
        }
        Relationships: []
      }
      modelos_laudo: {
        Row: {
          category: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_favorite: boolean | null
          template_data: Json | null
          title: string
          updated_at: string
          usage_count: number | null
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_favorite?: boolean | null
          template_data?: Json | null
          title: string
          updated_at?: string
          usage_count?: number | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_favorite?: boolean | null
          template_data?: Json | null
          title?: string
          updated_at?: string
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          crm: string | null
          email: string
          endereco: string | null
          especialidade: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          crm?: string | null
          email: string
          endereco?: string | null
          especialidade?: string | null
          id: string
          nome: string
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          crm?: string | null
          email?: string
          endereco?: string | null
          especialidade?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_statistics: {
        Args: { target_user_id: string }
        Returns: {
          last_laudo_created: string
          total_laudos: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
