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
      access_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          latency_ms: number | null
          model: string
          prompt_type: string | null
          provider: string
          retry_count: number | null
          success: boolean | null
          tokens_input: number | null
          tokens_output: number | null
          used_fallback: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model: string
          prompt_type?: string | null
          provider: string
          retry_count?: number | null
          success?: boolean | null
          tokens_input?: number | null
          tokens_output?: number | null
          used_fallback?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model?: string
          prompt_type?: string | null
          provider?: string
          retry_count?: number | null
          success?: boolean | null
          tokens_input?: number | null
          tokens_output?: number | null
          used_fallback?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      backend_logs: {
        Row: {
          created_at: string | null
          function_name: string
          id: string
          job_id: string | null
          level: string
          message: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string | null
          function_name: string
          id?: string
          job_id?: string | null
          level: string
          message: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string | null
          function_name?: string
          id?: string
          job_id?: string | null
          level?: string
          message?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "backend_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          component_stack: string | null
          created_at: string | null
          error_message: string
          error_stack: string | null
          error_type: string
          id: string
          metadata: Json | null
          url: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string | null
          error_message: string
          error_stack?: string | null
          error_type: string
          id?: string
          metadata?: Json | null
          url: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string | null
          error_message?: string
          error_stack?: string | null
          error_type?: string
          id?: string
          metadata?: Json | null
          url?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      financeiro: {
        Row: {
          created_at: string
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          id: string
          laudo_id: string | null
          observacoes: string | null
          status: Database["public"]["Enums"]["status_pagamento"]
          tipo_despesa: Database["public"]["Enums"]["tipo_despesa"] | null
          updated_at: string
          user_id: string
          valor_despesas: number | null
          valor_honorarios: number | null
        }
        Insert: {
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao: string
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          laudo_id?: string | null
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_pagamento"]
          tipo_despesa?: Database["public"]["Enums"]["tipo_despesa"] | null
          updated_at?: string
          user_id: string
          valor_despesas?: number | null
          valor_honorarios?: number | null
        }
        Update: {
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          laudo_id?: string | null
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_pagamento"]
          tipo_despesa?: Database["public"]["Enums"]["tipo_despesa"] | null
          updated_at?: string
          user_id?: string
          valor_despesas?: number | null
          valor_honorarios?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_laudo_id_fkey"
            columns: ["laudo_id"]
            isOneToOne: false
            referencedRelation: "laudos"
            referencedColumns: ["id"]
          },
        ]
      }
      global_api_keys: {
        Row: {
          api_key: string
          created_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          api_key: string
          created_at?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          api_key?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      import_attempts: {
        Row: {
          attempt_number: number
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          job_id: string
          result: Json | null
          status: string
        }
        Insert: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_id: string
          result?: Json | null
          status?: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string
          result?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          created_at: string
          current_step: string | null
          error: string | null
          file_path: string | null
          id: string
          progress: number
          result: Json | null
          retry_count: number | null
          status: string
          step_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_step?: string | null
          error?: string | null
          file_path?: string | null
          id?: string
          progress?: number
          result?: Json | null
          retry_count?: number | null
          status?: string
          step_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_step?: string | null
          error?: string | null
          file_path?: string | null
          id?: string
          progress?: number
          result?: Json | null
          retry_count?: number | null
          status?: string
          step_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
          ai_metadata: Json | null
          analise_incapacidade_laboral: string | null
          anotacoes: string | null
          antecedentes: string | null
          assistente_tecnico_reclamada: string | null
          assistente_tecnico_reclamante: string | null
          atestados_detalhados: Json | null
          auxilio_terceiros: string | null
          conclusao_analise: string | null
          conclusao_cid: string | null
          conclusao_destino: string | null
          conclusao_incapacidade: string | null
          conclusao_justificativa: string | null
          conclusao_status: string | null
          created_at: string | null
          dados_funcionais_admissao: string | null
          dados_funcionais_afastamento: string | null
          dados_funcionais_cargo: string | null
          dano_estetico: string | null
          data_acidente: string | null
          data_pericia: string | null
          descricao_atividades_laborais: string | null
          descricao_posto_trabalho: string | null
          descricao_tecnica_doencas: string | null
          diagnostico_cids: Json | null
          documentos: string[] | null
          exame_fisico: string | null
          exames_complementares: string | null
          fatores_individuais: string | null
          historia_acidente: string | null
          historia_atual: string | null
          historico_ocupacional: string | null
          id: string
          laudos_medicos: string | null
          local_pericia: string | null
          metodologia_pericial: string | null
          nexo_causal_justificativa: string | null
          nexo_causal_tipo: string | null
          objetivo_pericia: string | null
          observacoes_historico: string | null
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
          referencias_bibliograficas: string | null
          resumo_contestacao: string | null
          resumo_pericia: string | null
          resumo_peticao_inicial: string | null
          status: string | null
          tabela_susep: string | null
          title: string
          tratamentos: string | null
          updated_at: string | null
          user_id: string
          valor_honorarios: number | null
          vitima_dominancia: string | null
          vitima_escolaridade: string | null
          vitima_nascimento: string | null
          vitima_nome: string | null
          vitima_profissao: string | null
        }
        Insert: {
          afastamentos?: string | null
          ai_metadata?: Json | null
          analise_incapacidade_laboral?: string | null
          anotacoes?: string | null
          antecedentes?: string | null
          assistente_tecnico_reclamada?: string | null
          assistente_tecnico_reclamante?: string | null
          atestados_detalhados?: Json | null
          auxilio_terceiros?: string | null
          conclusao_analise?: string | null
          conclusao_cid?: string | null
          conclusao_destino?: string | null
          conclusao_incapacidade?: string | null
          conclusao_justificativa?: string | null
          conclusao_status?: string | null
          created_at?: string | null
          dados_funcionais_admissao?: string | null
          dados_funcionais_afastamento?: string | null
          dados_funcionais_cargo?: string | null
          dano_estetico?: string | null
          data_acidente?: string | null
          data_pericia?: string | null
          descricao_atividades_laborais?: string | null
          descricao_posto_trabalho?: string | null
          descricao_tecnica_doencas?: string | null
          diagnostico_cids?: Json | null
          documentos?: string[] | null
          exame_fisico?: string | null
          exames_complementares?: string | null
          fatores_individuais?: string | null
          historia_acidente?: string | null
          historia_atual?: string | null
          historico_ocupacional?: string | null
          id?: string
          laudos_medicos?: string | null
          local_pericia?: string | null
          metodologia_pericial?: string | null
          nexo_causal_justificativa?: string | null
          nexo_causal_tipo?: string | null
          objetivo_pericia?: string | null
          observacoes_historico?: string | null
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
          referencias_bibliograficas?: string | null
          resumo_contestacao?: string | null
          resumo_pericia?: string | null
          resumo_peticao_inicial?: string | null
          status?: string | null
          tabela_susep?: string | null
          title?: string
          tratamentos?: string | null
          updated_at?: string | null
          user_id: string
          valor_honorarios?: number | null
          vitima_dominancia?: string | null
          vitima_escolaridade?: string | null
          vitima_nascimento?: string | null
          vitima_nome?: string | null
          vitima_profissao?: string | null
        }
        Update: {
          afastamentos?: string | null
          ai_metadata?: Json | null
          analise_incapacidade_laboral?: string | null
          anotacoes?: string | null
          antecedentes?: string | null
          assistente_tecnico_reclamada?: string | null
          assistente_tecnico_reclamante?: string | null
          atestados_detalhados?: Json | null
          auxilio_terceiros?: string | null
          conclusao_analise?: string | null
          conclusao_cid?: string | null
          conclusao_destino?: string | null
          conclusao_incapacidade?: string | null
          conclusao_justificativa?: string | null
          conclusao_status?: string | null
          created_at?: string | null
          dados_funcionais_admissao?: string | null
          dados_funcionais_afastamento?: string | null
          dados_funcionais_cargo?: string | null
          dano_estetico?: string | null
          data_acidente?: string | null
          data_pericia?: string | null
          descricao_atividades_laborais?: string | null
          descricao_posto_trabalho?: string | null
          descricao_tecnica_doencas?: string | null
          diagnostico_cids?: Json | null
          documentos?: string[] | null
          exame_fisico?: string | null
          exames_complementares?: string | null
          fatores_individuais?: string | null
          historia_acidente?: string | null
          historia_atual?: string | null
          historico_ocupacional?: string | null
          id?: string
          laudos_medicos?: string | null
          local_pericia?: string | null
          metodologia_pericial?: string | null
          nexo_causal_justificativa?: string | null
          nexo_causal_tipo?: string | null
          objetivo_pericia?: string | null
          observacoes_historico?: string | null
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
          referencias_bibliograficas?: string | null
          resumo_contestacao?: string | null
          resumo_pericia?: string | null
          resumo_peticao_inicial?: string | null
          status?: string | null
          tabela_susep?: string | null
          title?: string
          tratamentos?: string | null
          updated_at?: string | null
          user_id?: string
          valor_honorarios?: number | null
          vitima_dominancia?: string | null
          vitima_escolaridade?: string | null
          vitima_nascimento?: string | null
          vitima_nome?: string | null
          vitima_profissao?: string | null
        }
        Relationships: []
      }
      model_pricing: {
        Row: {
          display_name: string | null
          id: string
          input_price_per_million: number
          output_price_per_million: number
          provider: string
          updated_at: string | null
        }
        Insert: {
          display_name?: string | null
          id: string
          input_price_per_million: number
          output_price_per_million: number
          provider: string
          updated_at?: string | null
        }
        Update: {
          display_name?: string | null
          id?: string
          input_price_per_million?: number
          output_price_per_million?: number
          provider?: string
          updated_at?: string | null
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
          logo_url: string | null
          nome: string
          telefone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          crm?: string | null
          email: string
          endereco?: string | null
          especialidade?: string | null
          id: string
          logo_url?: string | null
          nome: string
          telefone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          crm?: string | null
          email?: string
          endereco?: string | null
          especialidade?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          telefone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      system_config: {
        Row: {
          description: string | null
          id: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          is_online: boolean | null
          last_seen_at: string | null
          user_id: string
        }
        Insert: {
          is_online?: boolean | null
          last_seen_at?: string | null
          user_id: string
        }
        Update: {
          is_online?: boolean | null
          last_seen_at?: string | null
          user_id?: string
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
      user_settings: {
        Row: {
          ai_max_tokens: number | null
          ai_model: string | null
          ai_provider: string | null
          ai_requests_used: number | null
          ai_temperature: number | null
          created_at: string | null
          custom_api_key: string | null
          features_enabled: Json | null
          id: string
          last_reset_date: string | null
          monthly_ai_limit: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_max_tokens?: number | null
          ai_model?: string | null
          ai_provider?: string | null
          ai_requests_used?: number | null
          ai_temperature?: number | null
          created_at?: string | null
          custom_api_key?: string | null
          features_enabled?: Json | null
          id?: string
          last_reset_date?: string | null
          monthly_ai_limit?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_max_tokens?: number | null
          ai_model?: string | null
          ai_provider?: string | null
          ai_requests_used?: number | null
          ai_temperature?: number | null
          created_at?: string | null
          custom_api_key?: string | null
          features_enabled?: Json | null
          id?: string
          last_reset_date?: string | null
          monthly_ai_limit?: number | null
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
      get_email_by_user_id: { Args: { p_user_id: string }; Returns: string }
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
      is_developer: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "developer"
      forma_pagamento:
        | "pix"
        | "transferencia"
        | "dinheiro"
        | "cheque"
        | "cartao"
        | "boleto"
      status_pagamento: "pendente" | "recebido" | "atrasado" | "cancelado"
      tipo_despesa:
        | "combustivel"
        | "hospedagem"
        | "alimentacao"
        | "material"
        | "transporte"
        | "outros"
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
      app_role: ["admin", "user", "developer"],
      forma_pagamento: [
        "pix",
        "transferencia",
        "dinheiro",
        "cheque",
        "cartao",
        "boleto",
      ],
      status_pagamento: ["pendente", "recebido", "atrasado", "cancelado"],
      tipo_despesa: [
        "combustivel",
        "hospedagem",
        "alimentacao",
        "material",
        "transporte",
        "outros",
      ],
    },
  },
} as const
