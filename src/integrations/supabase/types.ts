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
      account_deletion_feedback: {
        Row: {
          created_at: string
          details: string | null
          email: string | null
          id: string
          reason: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: string | null
          email?: string | null
          id?: string
          reason: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: string | null
          email?: string | null
          id?: string
          reason?: string
          user_id?: string | null
        }
        Relationships: []
      }
      admin_google_tokens: {
        Row: {
          connected_at: string | null
          created_at: string
          google_email: string | null
          google_picture_url: string | null
          id: string
          refresh_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          google_email?: string | null
          google_picture_url?: string | null
          id?: string
          refresh_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          google_email?: string | null
          google_picture_url?: string | null
          id?: string
          refresh_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_passwords: {
        Row: {
          category: string
          id: string
          label: string
          password: string
          updated_at: string
        }
        Insert: {
          category: string
          id?: string
          label?: string
          password?: string
          updated_at?: string
        }
        Update: {
          category?: string
          id?: string
          label?: string
          password?: string
          updated_at?: string
        }
        Relationships: []
      }
      agendamento_lembretes_log: {
        Row: {
          agendamento_id: string
          channel: string
          created_at: string
          details: Json | null
          id: string
          kind: string
          response: string | null
          response_at: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agendamento_id: string
          channel?: string
          created_at?: string
          details?: Json | null
          id?: string
          kind: string
          response?: string | null
          response_at?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agendamento_id?: string
          channel?: string
          created_at?: string
          details?: Json | null
          id?: string
          kind?: string
          response?: string | null
          response_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      agendamentos: {
        Row: {
          barbeiro_confirmou: boolean | null
          barbeiro_id: string | null
          cancelado_em: string | null
          cliente_confirmou: boolean | null
          created_at: string | null
          criado_por: string | null
          cupom_id: string | null
          data: string
          desconto_aplicado: number | null
          duracao: number
          google_event_id: string | null
          hora: string
          id: string
          is_free: boolean | null
          motivo_remarcacao: string | null
          observacoes: string | null
          payment_method: string | null
          ponto_liberado: boolean | null
          preco: number
          preco_final: number | null
          remarcacao_solicitada: boolean | null
          remarcado_de: string | null
          servico_id: string
          status: Database["public"]["Enums"]["appointment_status"] | null
          tipo_agendamento: string | null
          unidade_id: string | null
          updated_at: string | null
          usado_redemption_id: string | null
          user_id: string | null
          visivel_para_usuario: boolean | null
        }
        Insert: {
          barbeiro_confirmou?: boolean | null
          barbeiro_id?: string | null
          cancelado_em?: string | null
          cliente_confirmou?: boolean | null
          created_at?: string | null
          criado_por?: string | null
          cupom_id?: string | null
          data: string
          desconto_aplicado?: number | null
          duracao: number
          google_event_id?: string | null
          hora: string
          id?: string
          is_free?: boolean | null
          motivo_remarcacao?: string | null
          observacoes?: string | null
          payment_method?: string | null
          ponto_liberado?: boolean | null
          preco: number
          preco_final?: number | null
          remarcacao_solicitada?: boolean | null
          remarcado_de?: string | null
          servico_id: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          tipo_agendamento?: string | null
          unidade_id?: string | null
          updated_at?: string | null
          usado_redemption_id?: string | null
          user_id?: string | null
          visivel_para_usuario?: boolean | null
        }
        Update: {
          barbeiro_confirmou?: boolean | null
          barbeiro_id?: string | null
          cancelado_em?: string | null
          cliente_confirmou?: boolean | null
          created_at?: string | null
          criado_por?: string | null
          cupom_id?: string | null
          data?: string
          desconto_aplicado?: number | null
          duracao?: number
          google_event_id?: string | null
          hora?: string
          id?: string
          is_free?: boolean | null
          motivo_remarcacao?: string | null
          observacoes?: string | null
          payment_method?: string | null
          ponto_liberado?: boolean | null
          preco?: number
          preco_final?: number | null
          remarcacao_solicitada?: boolean | null
          remarcado_de?: string | null
          servico_id?: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          tipo_agendamento?: string | null
          unidade_id?: string | null
          updated_at?: string | null
          usado_redemption_id?: string | null
          user_id?: string | null
          visivel_para_usuario?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_cupom_id_fkey"
            columns: ["cupom_id"]
            isOneToOne: false
            referencedRelation: "cupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_remarcado_de_fkey"
            columns: ["remarcado_de"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "tenant_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conversations: {
        Row: {
          barbershop_id: string | null
          content: string
          created_at: string
          customer_id: string | null
          id: string
          metadata: Json
          phone: string
          role: string
        }
        Insert: {
          barbershop_id?: string | null
          content: string
          created_at?: string
          customer_id?: string | null
          id?: string
          metadata?: Json
          phone: string
          role: string
        }
        Update: {
          barbershop_id?: string | null
          content?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          metadata?: Json
          phone?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_knowledge: {
        Row: {
          active: boolean
          barbershop_id: string
          content: string
          created_at: string
          id: string
          kind: string
          name: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          barbershop_id: string
          content: string
          created_at?: string
          id?: string
          kind: string
          name: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          barbershop_id?: string
          content?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memories: {
        Row: {
          barbershop_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          barbershop_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          barbershop_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memories_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_memories_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_skills: {
        Row: {
          active: boolean
          barbershop_id: string
          created_at: string
          description: string | null
          id: string
          instructions: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          barbershop_id: string
          created_at?: string
          description?: string | null
          id?: string
          instructions: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          barbershop_id?: string
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_skills_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      agente_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          barbeiro_id: string | null
          criado_em: string
          id: string
          tenant_id: string | null
          webhook_agente: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          barbeiro_id?: string | null
          criado_em?: string
          id?: string
          tenant_id?: string | null
          webhook_agente?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          barbeiro_id?: string | null
          criado_em?: string
          id?: string
          tenant_id?: string | null
          webhook_agente?: string
        }
        Relationships: [
          {
            foreignKeyName: "agente_config_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agente_config_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agente_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agente_webhook_global: {
        Row: {
          atualizado_em: string | null
          atualizado_por: string | null
          id: boolean
          webhook_url: string | null
        }
        Insert: {
          atualizado_em?: string | null
          atualizado_por?: string | null
          id?: boolean
          webhook_url?: string | null
        }
        Update: {
          atualizado_em?: string | null
          atualizado_por?: string | null
          id?: boolean
          webhook_url?: string | null
        }
        Relationships: []
      }
      ai_actions_log: {
        Row: {
          action_name: string
          action_type: string
          after_state: Json | null
          approved_by: string | null
          auto_approved: boolean | null
          before_state: Json | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          parameters: Json | null
          result: Json | null
          reverted_at: string | null
          reverted_by: string | null
          session_id: string | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          action_name: string
          action_type: string
          after_state?: Json | null
          approved_by?: string | null
          auto_approved?: boolean | null
          before_state?: Json | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          parameters?: Json | null
          result?: Json | null
          reverted_at?: string | null
          reverted_by?: string | null
          session_id?: string | null
          success?: boolean
          user_id?: string | null
        }
        Update: {
          action_name?: string
          action_type?: string
          after_state?: Json | null
          approved_by?: string | null
          auto_approved?: boolean | null
          before_state?: Json | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          parameters?: Json | null
          result?: Json | null
          reverted_at?: string | null
          reverted_by?: string | null
          session_id?: string | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          active: boolean
          barbershop_id: string
          created_at: string
          evolution_instance: string
          human_mode: boolean
          id: string
          model: string
          name: string
          system_prompt: string | null
          temperature: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          barbershop_id: string
          created_at?: string
          evolution_instance: string
          human_mode?: boolean
          id?: string
          model?: string
          name?: string
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          barbershop_id?: string
          created_at?: string
          evolution_instance?: string
          human_mode?: boolean
          id?: string
          model?: string
          name?: string
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_barbeiro_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_barbeiro_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          comment: string | null
          conversation_id: string | null
          created_at: string
          helpful: boolean | null
          id: string
          message_id: string | null
          rating: number | null
          resolved_issue: boolean | null
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          conversation_id?: string | null
          created_at?: string
          helpful?: boolean | null
          id?: string
          message_id?: string | null
          rating?: number | null
          resolved_issue?: boolean | null
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          conversation_id?: string | null
          created_at?: string
          helpful?: boolean | null
          id?: string
          message_id?: string | null
          rating?: number | null
          resolved_issue?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_monitor_state: {
        Row: {
          key: string
          last_run_at: string
          payload: Json
          updated_at: string
        }
        Insert: {
          key: string
          last_run_at?: string
          payload?: Json
          updated_at?: string
        }
        Update: {
          key?: string
          last_run_at?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      ai_security_alerts: {
        Row: {
          categoria: string
          cliente_id: string | null
          cliente_nome: string | null
          created_at: string
          descricao: string
          enviado: boolean
          enviado_em: string | null
          erro_envio: string | null
          evidencias: Json
          id: string
          resumo_ia: string | null
          severidade: string
          titulo: string
        }
        Insert: {
          categoria: string
          cliente_id?: string | null
          cliente_nome?: string | null
          created_at?: string
          descricao: string
          enviado?: boolean
          enviado_em?: string | null
          erro_envio?: string | null
          evidencias?: Json
          id?: string
          resumo_ia?: string | null
          severidade: string
          titulo: string
        }
        Update: {
          categoria?: string
          cliente_id?: string | null
          cliente_nome?: string | null
          created_at?: string
          descricao?: string
          enviado?: boolean
          enviado_em?: string | null
          erro_envio?: string | null
          evidencias?: Json
          id?: string
          resumo_ia?: string | null
          severidade?: string
          titulo?: string
        }
        Relationships: []
      }
      anuncios_app: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_target: string | null
          cta_tipo: string
          descricao: string | null
          id: string
          imagem_path: string
          ordem: number
          titulo: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_target?: string | null
          cta_tipo?: string
          descricao?: string | null
          id?: string
          imagem_path: string
          ordem?: number
          titulo: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_target?: string | null
          cta_tipo?: string
          descricao?: string | null
          id?: string
          imagem_path?: string
          ordem?: number
          titulo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      assinaturas: {
        Row: {
          asaas_payment_id: string | null
          barbeiro_id: string | null
          cash_payment_confirmed: boolean | null
          ciclo_fim: string | null
          ciclo_inicio: string | null
          created_at: string | null
          gateway_subscription_id: string | null
          id: string
          next_billing_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          pix_expires_at: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          plano_id: string
          renovada_antecipadamente: boolean
          status: Database["public"]["Enums"]["subscription_status"] | null
          total_renovacoes: number
          updated_at: string | null
          user_id: string
          usos_ciclo_atual: number
        }
        Insert: {
          asaas_payment_id?: string | null
          barbeiro_id?: string | null
          cash_payment_confirmed?: boolean | null
          ciclo_fim?: string | null
          ciclo_inicio?: string | null
          created_at?: string | null
          gateway_subscription_id?: string | null
          id?: string
          next_billing_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          pix_expires_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          plano_id: string
          renovada_antecipadamente?: boolean
          status?: Database["public"]["Enums"]["subscription_status"] | null
          total_renovacoes?: number
          updated_at?: string | null
          user_id: string
          usos_ciclo_atual?: number
        }
        Update: {
          asaas_payment_id?: string | null
          barbeiro_id?: string | null
          cash_payment_confirmed?: boolean | null
          ciclo_fim?: string | null
          ciclo_inicio?: string | null
          created_at?: string | null
          gateway_subscription_id?: string | null
          id?: string
          next_billing_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          pix_expires_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          plano_id?: string
          renovada_antecipadamente?: boolean
          status?: Database["public"]["Enums"]["subscription_status"] | null
          total_renovacoes?: number
          updated_at?: string | null
          user_id?: string
          usos_ciclo_atual?: number
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      barbeiro_avaliacoes: {
        Row: {
          appointment_id: string
          barber_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          reviewer_first_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          barber_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          reviewer_first_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          barber_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          reviewer_first_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      barbeiro_google_tokens: {
        Row: {
          barbeiro_id: string
          connected_at: string | null
          created_at: string
          google_email: string | null
          google_picture_url: string | null
          id: string
          refresh_token: string
          updated_at: string
        }
        Insert: {
          barbeiro_id: string
          connected_at?: string | null
          created_at?: string
          google_email?: string | null
          google_picture_url?: string | null
          id?: string
          refresh_token: string
          updated_at?: string
        }
        Update: {
          barbeiro_id?: string
          connected_at?: string | null
          created_at?: string
          google_email?: string | null
          google_picture_url?: string | null
          id?: string
          refresh_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_barbeiro_google_tokens_barbeiro"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_barbeiro_google_tokens_barbeiro"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      barbeiro_portfolio: {
        Row: {
          barbeiro_id: string
          created_at: string
          descricao: string | null
          id: string
          image_url: string
          ordem: number | null
          updated_at: string
        }
        Insert: {
          barbeiro_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          image_url: string
          ordem?: number | null
          updated_at?: string
        }
        Update: {
          barbeiro_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          image_url?: string
          ordem?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "barbeiro_portfolio_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbeiro_portfolio_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      barbeiro_servico_duracao: {
        Row: {
          barbeiro_id: string
          created_at: string
          duracao_personalizada: number
          id: string
          servico_id: string
          updated_at: string
        }
        Insert: {
          barbeiro_id: string
          created_at?: string
          duracao_personalizada: number
          id?: string
          servico_id: string
          updated_at?: string
        }
        Update: {
          barbeiro_id?: string
          created_at?: string
          duracao_personalizada?: number
          id?: string
          servico_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "barbeiro_servico_duracao_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbeiro_servico_duracao_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbeiro_servico_duracao_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      barbeiro_unidades: {
        Row: {
          barbeiro_id: string
          created_at: string
          id: string
          is_primary: boolean
          role: string
          role_level: string | null
          unidade_id: string
        }
        Insert: {
          barbeiro_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          role?: string
          role_level?: string | null
          unidade_id: string
        }
        Update: {
          barbeiro_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          role?: string
          role_level?: string | null
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barbeiro_unidades_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbeiro_unidades_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbeiro_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "tenant_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      barbeiros: {
        Row: {
          apelido: string
          asaas_account_id: string | null
          asaas_wallet_id: string | null
          ativo: boolean | null
          comissao_pct: number | null
          conta_configurada: boolean
          conta_financeira_id: string | null
          created_at: string | null
          deleted_at: string | null
          foto_url: string | null
          google_calendar_connected: boolean | null
          id: string
          setup_completed: boolean | null
          tenant_id: string
          unidade_id: string | null
          updated_at: string | null
          user_id: string | null
          woovi_auto_withdraw_enabled: boolean
          woovi_auto_withdraw_min_centavos: number
          woovi_last_auto_withdraw_at: string | null
          woovi_pix_key: string | null
          woovi_pix_key_type: string | null
          woovi_subaccount_name: string | null
        }
        Insert: {
          apelido: string
          asaas_account_id?: string | null
          asaas_wallet_id?: string | null
          ativo?: boolean | null
          comissao_pct?: number | null
          conta_configurada?: boolean
          conta_financeira_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          foto_url?: string | null
          google_calendar_connected?: boolean | null
          id?: string
          setup_completed?: boolean | null
          tenant_id: string
          unidade_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          woovi_auto_withdraw_enabled?: boolean
          woovi_auto_withdraw_min_centavos?: number
          woovi_last_auto_withdraw_at?: string | null
          woovi_pix_key?: string | null
          woovi_pix_key_type?: string | null
          woovi_subaccount_name?: string | null
        }
        Update: {
          apelido?: string
          asaas_account_id?: string | null
          asaas_wallet_id?: string | null
          ativo?: boolean | null
          comissao_pct?: number | null
          conta_configurada?: boolean
          conta_financeira_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          foto_url?: string | null
          google_calendar_connected?: boolean | null
          id?: string
          setup_completed?: boolean | null
          tenant_id?: string
          unidade_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          woovi_auto_withdraw_enabled?: boolean
          woovi_auto_withdraw_min_centavos?: number
          woovi_last_auto_withdraw_at?: string | null
          woovi_pix_key?: string | null
          woovi_pix_key_type?: string | null
          woovi_subaccount_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barbeiros_conta_financeira_id_fkey"
            columns: ["conta_financeira_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbeiros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbeiros_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "tenant_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbeiros_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      barbeiros_private: {
        Row: {
          asaas_api_key: string | null
          barbeiro_id: string
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_cidade: string | null
          endereco_estado: string | null
          endereco_numero: string | null
          endereco_rua: string | null
          nome_completo: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          asaas_api_key?: string | null
          barbeiro_id: string
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_estado?: string | null
          endereco_numero?: string | null
          endereco_rua?: string | null
          nome_completo?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          asaas_api_key?: string | null
          barbeiro_id?: string
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_estado?: string | null
          endereco_numero?: string | null
          endereco_rua?: string | null
          nome_completo?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      barber_fcm_tokens: {
        Row: {
          barbeiro_id: string
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          barbeiro_id: string
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          barbeiro_id?: string
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barber_fcm_tokens_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_fcm_tokens_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      barber_home_snapshot: {
        Row: {
          apt_last_month_revenue: number
          apt_month_revenue: number
          barbeiro_id: string
          computed_for_date: string
          is_stale: boolean
          last_month_cuts: number
          month_cuts: number
          next_appointment: Json | null
          pending_cash_count: number
          plan_cash_last_month: number
          plan_cash_month: number
          plan_pix_last_month: number
          plan_pix_month: number
          recent_appointments: Json
          today_count: number
          updated_at: string
          yesterday_count: number
        }
        Insert: {
          apt_last_month_revenue?: number
          apt_month_revenue?: number
          barbeiro_id: string
          computed_for_date?: string
          is_stale?: boolean
          last_month_cuts?: number
          month_cuts?: number
          next_appointment?: Json | null
          pending_cash_count?: number
          plan_cash_last_month?: number
          plan_cash_month?: number
          plan_pix_last_month?: number
          plan_pix_month?: number
          recent_appointments?: Json
          today_count?: number
          updated_at?: string
          yesterday_count?: number
        }
        Update: {
          apt_last_month_revenue?: number
          apt_month_revenue?: number
          barbeiro_id?: string
          computed_for_date?: string
          is_stale?: boolean
          last_month_cuts?: number
          month_cuts?: number
          next_appointment?: Json | null
          pending_cash_count?: number
          plan_cash_last_month?: number
          plan_cash_month?: number
          plan_pix_last_month?: number
          plan_pix_month?: number
          recent_appointments?: Json
          today_count?: number
          updated_at?: string
          yesterday_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "barber_home_snapshot_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_home_snapshot_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      barbershops: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string | null
        }
        Relationships: []
      }
      bloqueios_cliente_barbeiro: {
        Row: {
          barbeiro_id: string
          bloqueado_por: string | null
          created_at: string
          id: string
          motivo: string | null
          user_id: string
        }
        Insert: {
          barbeiro_id: string
          bloqueado_por?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          user_id: string
        }
        Update: {
          barbeiro_id?: string
          bloqueado_por?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bloqueios_cliente_barbeiro_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueios_cliente_barbeiro_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          barber_id: string | null
          barbershop_id: string
          created_at: string
          customer_id: string | null
          ends_at: string | null
          id: string
          metadata: Json
          service_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          barber_id?: string | null
          barbershop_id: string
          created_at?: string
          customer_id?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          service_id?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          barber_id?: string | null
          barbershop_id?: string
          created_at?: string
          customer_id?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          service_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas_config: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          indicacoes_necessarias: number
          premio_descricao: string | null
          tenant_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          indicacoes_necessarias?: number
          premio_descricao?: string | null
          tenant_id: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          indicacoes_necessarias?: number
          premio_descricao?: string | null
          tenant_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      carteiras: {
        Row: {
          barbeiro_id: string
          chave_pix: string | null
          chave_pix_titular: string | null
          chave_pix_validada: boolean
          chave_pix_validada_em: string | null
          created_at: string
          id: string
          pix_automatico_ativo: boolean
          saldo_disponivel: number
          tipo_chave_pix: string | null
          updated_at: string
        }
        Insert: {
          barbeiro_id: string
          chave_pix?: string | null
          chave_pix_titular?: string | null
          chave_pix_validada?: boolean
          chave_pix_validada_em?: string | null
          created_at?: string
          id?: string
          pix_automatico_ativo?: boolean
          saldo_disponivel?: number
          tipo_chave_pix?: string | null
          updated_at?: string
        }
        Update: {
          barbeiro_id?: string
          chave_pix?: string | null
          chave_pix_titular?: string | null
          chave_pix_validada?: boolean
          chave_pix_validada_em?: string | null
          created_at?: string
          id?: string
          pix_automatico_ativo?: boolean
          saldo_disponivel?: number
          tipo_chave_pix?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carteiras_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carteiras_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      chaves_pix: {
        Row: {
          apelido: string | null
          barbeiro_id: string | null
          chave: string | null
          chave_auth_tag: string | null
          chave_encrypted: string | null
          chave_iv: string | null
          created_at: string
          id: string
          instituicao: string | null
          is_default: boolean | null
          nome_titular: string | null
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          apelido?: string | null
          barbeiro_id?: string | null
          chave?: string | null
          chave_auth_tag?: string | null
          chave_encrypted?: string | null
          chave_iv?: string | null
          created_at?: string
          id?: string
          instituicao?: string | null
          is_default?: boolean | null
          nome_titular?: string | null
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          apelido?: string | null
          barbeiro_id?: string | null
          chave?: string | null
          chave_auth_tag?: string | null
          chave_encrypted?: string | null
          chave_iv?: string | null
          created_at?: string
          id?: string
          instituicao?: string | null
          is_default?: boolean | null
          nome_titular?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chaves_pix_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chaves_pix_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ciclos_indicacao: {
        Row: {
          apurado_em: string | null
          ciclo_pai_id: string | null
          criado_em: string
          criado_por: string | null
          data_fim: string
          data_inicio: string
          dia_fim_mes: number | null
          dia_inicio_mes: number | null
          id: string
          quantidade_indicacoes_vencedor: number | null
          status: string
          tenant_id: string | null
          tipo: string
          vencedor_id: string | null
        }
        Insert: {
          apurado_em?: string | null
          ciclo_pai_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_fim: string
          data_inicio: string
          dia_fim_mes?: number | null
          dia_inicio_mes?: number | null
          id?: string
          quantidade_indicacoes_vencedor?: number | null
          status?: string
          tenant_id?: string | null
          tipo?: string
          vencedor_id?: string | null
        }
        Update: {
          apurado_em?: string | null
          ciclo_pai_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_fim?: string
          data_inicio?: string
          dia_fim_mes?: number | null
          dia_inicio_mes?: number | null
          id?: string
          quantidade_indicacoes_vencedor?: number | null
          status?: string
          tenant_id?: string | null
          tipo?: string
          vencedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ciclos_indicacao_ciclo_pai_id_fkey"
            columns: ["ciclo_pai_id"]
            isOneToOne: false
            referencedRelation: "ciclos_indicacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ciclos_indicacao_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ciclos_indicacao_vencedor_id_fkey"
            columns: ["vencedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_booking_blocks: {
        Row: {
          barbeiro_id: string | null
          blocked_by_user_id: string
          client_user_id: string
          created_at: string
          id: string
          scope: string
          tenant_id: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          barbeiro_id?: string | null
          blocked_by_user_id: string
          client_user_id: string
          created_at?: string
          id?: string
          scope: string
          tenant_id: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          barbeiro_id?: string | null
          blocked_by_user_id?: string
          client_user_id?: string
          created_at?: string
          id?: string
          scope?: string
          tenant_id?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_booking_blocks_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_booking_blocks_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_booking_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_booking_blocks_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "tenant_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      client_home_snapshot: {
        Row: {
          appointments: Json
          available_credits: number
          has_active_plan: boolean
          is_stale: boolean
          loyalty_active: boolean
          paid_completed_count: number
          pending_bookings: Json
          points: number
          profile: Json
          redemptions_available: number
          redemptions_total: number
          required_points: number
          total_completed_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          appointments?: Json
          available_credits?: number
          has_active_plan?: boolean
          is_stale?: boolean
          loyalty_active?: boolean
          paid_completed_count?: number
          pending_bookings?: Json
          points?: number
          profile?: Json
          redemptions_available?: number
          redemptions_total?: number
          required_points?: number
          total_completed_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          appointments?: Json
          available_credits?: number
          has_active_plan?: boolean
          is_stale?: boolean
          loyalty_active?: boolean
          paid_completed_count?: number
          pending_bookings?: Json
          points?: number
          profile?: Json
          redemptions_available?: number
          redemptions_total?: number
          required_points?: number
          total_completed_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comissoes: {
        Row: {
          appointment_id: string
          barbeiro_id: string
          created_at: string | null
          id: string
          pago: boolean | null
          percentual: number | null
          valor: number
        }
        Insert: {
          appointment_id: string
          barbeiro_id: string
          created_at?: string | null
          id?: string
          pago?: boolean | null
          percentual?: number | null
          valor: number
        }
        Update: {
          appointment_id?: string
          barbeiro_id?: string
          created_at?: string | null
          id?: string
          pago?: boolean | null
          percentual?: number | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_horario: {
        Row: {
          aberto: boolean
          created_at: string | null
          delay_entre_servicos: number
          dia_semana: number
          hora_abertura: string
          hora_almoco_fim: string | null
          hora_almoco_inicio: string | null
          hora_fechamento: string
          id: string
          updated_at: string | null
        }
        Insert: {
          aberto?: boolean
          created_at?: string | null
          delay_entre_servicos?: number
          dia_semana: number
          hora_abertura?: string
          hora_almoco_fim?: string | null
          hora_almoco_inicio?: string | null
          hora_fechamento?: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          aberto?: boolean
          created_at?: string | null
          delay_entre_servicos?: number
          dia_semana?: number
          hora_abertura?: string
          hora_almoco_fim?: string | null
          hora_almoco_inicio?: string | null
          hora_fechamento?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      configuracoes_horario_barbeiro: {
        Row: {
          aberto: boolean | null
          barbeiro_id: string
          created_at: string | null
          delay_entre_servicos: number | null
          dia_semana: number
          hora_abertura: string | null
          hora_almoco_fim: string | null
          hora_almoco_inicio: string | null
          hora_fechamento: string | null
          id: string
          slot_interval_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          aberto?: boolean | null
          barbeiro_id: string
          created_at?: string | null
          delay_entre_servicos?: number | null
          dia_semana: number
          hora_abertura?: string | null
          hora_almoco_fim?: string | null
          hora_almoco_inicio?: string | null
          hora_fechamento?: string | null
          id?: string
          slot_interval_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          aberto?: boolean | null
          barbeiro_id?: string
          created_at?: string | null
          delay_entre_servicos?: number | null
          dia_semana?: number
          hora_abertura?: string | null
          hora_almoco_fim?: string | null
          hora_almoco_inicio?: string | null
          hora_fechamento?: string | null
          id?: string
          slot_interval_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_horario_barbeiro_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracoes_horario_barbeiro_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_horario_unidade: {
        Row: {
          aberto: boolean
          created_at: string
          delay_entre_servicos: number
          dia_semana: number
          hora_abertura: string
          hora_almoco_fim: string | null
          hora_almoco_inicio: string | null
          hora_fechamento: string
          id: string
          slot_interval_minutes: number | null
          tenant_id: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          aberto?: boolean
          created_at?: string
          delay_entre_servicos?: number
          dia_semana: number
          hora_abertura?: string
          hora_almoco_fim?: string | null
          hora_almoco_inicio?: string | null
          hora_fechamento?: string
          id?: string
          slot_interval_minutes?: number | null
          tenant_id: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          aberto?: boolean
          created_at?: string
          delay_entre_servicos?: number
          dia_semana?: number
          hora_abertura?: string
          hora_almoco_fim?: string | null
          hora_almoco_inicio?: string | null
          hora_fechamento?: string
          id?: string
          slot_interval_minutes?: number | null
          tenant_id?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_horario_unidade_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracoes_horario_unidade_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "tenant_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_bancarias: {
        Row: {
          agencia: string
          banco_codigo: string
          banco_nome: string | null
          barbeiro_id: string | null
          conta: string
          conta_digito: string
          created_at: string
          id: string
          is_default: boolean | null
          tipo_conta: string
          titular_cpf_cnpj: string
          titular_nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agencia: string
          banco_codigo: string
          banco_nome?: string | null
          barbeiro_id?: string | null
          conta: string
          conta_digito: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          tipo_conta?: string
          titular_cpf_cnpj: string
          titular_nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agencia?: string
          banco_codigo?: string
          banco_nome?: string | null
          barbeiro_id?: string | null
          conta?: string
          conta_digito?: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          tipo_conta?: string
          titular_cpf_cnpj?: string
          titular_nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_bancarias_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_bancarias_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_financeiras: {
        Row: {
          asaas_account_id: string | null
          asaas_wallet_id: string | null
          ativo: boolean
          created_at: string
          created_by: string | null
          efi_account_id: string | null
          id: string
          observacoes: string | null
          responsavel_barbeiro_id: string | null
          responsavel_nome: string
          tipo_conta: string
          updated_at: string
        }
        Insert: {
          asaas_account_id?: string | null
          asaas_wallet_id?: string | null
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          efi_account_id?: string | null
          id?: string
          observacoes?: string | null
          responsavel_barbeiro_id?: string | null
          responsavel_nome: string
          tipo_conta?: string
          updated_at?: string
        }
        Update: {
          asaas_account_id?: string | null
          asaas_wallet_id?: string | null
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          efi_account_id?: string | null
          id?: string
          observacoes?: string | null
          responsavel_barbeiro_id?: string | null
          responsavel_nome?: string
          tipo_conta?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_financeiras_responsavel_barbeiro_id_fkey"
            columns: ["responsavel_barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_financeiras_responsavel_barbeiro_id_fkey"
            columns: ["responsavel_barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      creditos: {
        Row: {
          agendamento_origem_id: string | null
          agendamento_usado_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          origem: string
          usado: boolean | null
          user_id: string
          valor: number
        }
        Insert: {
          agendamento_origem_id?: string | null
          agendamento_usado_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          origem: string
          usado?: boolean | null
          user_id: string
          valor: number
        }
        Update: {
          agendamento_origem_id?: string | null
          agendamento_usado_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          origem?: string
          usado?: boolean | null
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      creditos_indicacao: {
        Row: {
          criado_em: string
          id: string
          indicacao_id: string
          status: string
          usado_em: string | null
          usado_no_agendamento_id: string | null
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          indicacao_id: string
          status?: string
          usado_em?: string | null
          usado_no_agendamento_id?: string | null
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          indicacao_id?: string
          status?: string
          usado_em?: string | null
          usado_no_agendamento_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creditos_indicacao_indicacao_id_fkey"
            columns: ["indicacao_id"]
            isOneToOne: true
            referencedRelation: "indicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_indicacao_usado_no_agendamento_id_fkey"
            columns: ["usado_no_agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_indicacao_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cupom_usos: {
        Row: {
          agendamento_id: string | null
          cupom_id: string
          id: string
          used_at: string
          user_id: string
          valor_descontado: number | null
        }
        Insert: {
          agendamento_id?: string | null
          cupom_id: string
          id?: string
          used_at?: string
          user_id: string
          valor_descontado?: number | null
        }
        Update: {
          agendamento_id?: string | null
          cupom_id?: string
          id?: string
          used_at?: string
          user_id?: string
          valor_descontado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cupom_usos_cupom_id_fkey"
            columns: ["cupom_id"]
            isOneToOne: false
            referencedRelation: "cupons"
            referencedColumns: ["id"]
          },
        ]
      }
      cupons: {
        Row: {
          ativo: boolean
          auto_aplicar: boolean
          cliente_user_id: string | null
          codigo: string
          created_at: string
          created_by: string | null
          descricao: string | null
          escopo: string
          id: string
          max_usos_por_cliente: number | null
          max_usos_total: number | null
          tenant_id: string
          tipo_desconto: string
          updated_at: string
          uso_obrigatorio: boolean
          valido_ate: string | null
          valido_de: string
          valor_desconto: number
        }
        Insert: {
          ativo?: boolean
          auto_aplicar?: boolean
          cliente_user_id?: string | null
          codigo: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          escopo?: string
          id?: string
          max_usos_por_cliente?: number | null
          max_usos_total?: number | null
          tenant_id: string
          tipo_desconto: string
          updated_at?: string
          uso_obrigatorio?: boolean
          valido_ate?: string | null
          valido_de?: string
          valor_desconto: number
        }
        Update: {
          ativo?: boolean
          auto_aplicar?: boolean
          cliente_user_id?: string | null
          codigo?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          escopo?: string
          id?: string
          max_usos_por_cliente?: number | null
          max_usos_total?: number | null
          tenant_id?: string
          tipo_desconto?: string
          updated_at?: string
          uso_obrigatorio?: boolean
          valido_ate?: string | null
          valido_de?: string
          valor_desconto?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          barbershop_id: string
          created_at: string
          id: string
          name: string | null
          notes: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          barbershop_id: string
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          barbershop_id?: string
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      depositos: {
        Row: {
          barbeiro_id: string | null
          confirmado_em: string | null
          created_at: string
          expires_at: string | null
          gateway_payment_id: string | null
          id: string
          pix_payload: string | null
          pix_qr_code: string | null
          status: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          barbeiro_id?: string | null
          confirmado_em?: string | null
          created_at?: string
          expires_at?: string | null
          gateway_payment_id?: string | null
          id?: string
          pix_payload?: string | null
          pix_qr_code?: string | null
          status?: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          barbeiro_id?: string | null
          confirmado_em?: string | null
          created_at?: string
          expires_at?: string | null
          gateway_payment_id?: string | null
          id?: string
          pix_payload?: string | null
          pix_qr_code?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "depositos_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depositos_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_coupon_redemptions: {
        Row: {
          appointment_id: string | null
          coupon_id: string
          id: string
          used_at: string
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          coupon_id: string
          id?: string
          used_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          coupon_id?: string
          id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "discount_coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          nome: string | null
          percent: number
          starts_at: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          nome?: string | null
          percent: number
          starts_at?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          nome?: string | null
          percent?: number
          starts_at?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_coupons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_programados: {
        Row: {
          contatos_ids: string[]
          created_at: string | null
          created_by: string | null
          data_programada: string
          executado: boolean | null
          executado_em: string | null
          id: string
          mensagem: string
          resultado: Json | null
          tenant_id: string | null
        }
        Insert: {
          contatos_ids?: string[]
          created_at?: string | null
          created_by?: string | null
          data_programada: string
          executado?: boolean | null
          executado_em?: string | null
          id?: string
          mensagem: string
          resultado?: Json | null
          tenant_id?: string | null
        }
        Update: {
          contatos_ids?: string[]
          created_at?: string | null
          created_by?: string | null
          data_programada?: string
          executado?: boolean | null
          executado_em?: string | null
          id?: string
          mensagem?: string
          resultado?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disparos_programados_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dispositivos_autorizados: {
        Row: {
          autorizado_por: string | null
          created_at: string | null
          descricao: string | null
          device_fingerprint: string
          device_name: string
          device_type: string
          id: string
        }
        Insert: {
          autorizado_por?: string | null
          created_at?: string | null
          descricao?: string | null
          device_fingerprint: string
          device_name: string
          device_type: string
          id?: string
        }
        Update: {
          autorizado_por?: string | null
          created_at?: string | null
          descricao?: string | null
          device_fingerprint?: string
          device_name?: string
          device_type?: string
          id?: string
        }
        Relationships: []
      }
      dispositivos_conectados: {
        Row: {
          browser: string | null
          created_at: string | null
          device_fingerprint: string
          device_name: string
          device_type: string
          id: string
          ip_address: string | null
          is_active: boolean | null
          last_activity: string | null
          os: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string | null
          device_fingerprint: string
          device_name: string
          device_type: string
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_activity?: string | null
          os?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string | null
          device_fingerprint?: string
          device_name?: string
          device_type?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_activity?: string | null
          os?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      efi_credenciais: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          ambiente: string
          ativo: boolean
          barbeiro_id: string
          cert_p12_auth_tag: string
          cert_p12_encrypted: string
          cert_p12_iv: string
          cert_password_auth_tag: string | null
          cert_password_encrypted: string | null
          cert_password_iv: string | null
          client_id_auth_tag: string
          client_id_encrypted: string
          client_id_iv: string
          client_secret_auth_tag: string
          client_secret_encrypted: string
          client_secret_iv: string
          created_at: string
          id: string
          pix_key: string
          test_connection_at: string | null
          test_connection_ok: boolean | null
          test_pix_at: string | null
          test_pix_e2e_id: string | null
          test_pix_ok: boolean | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          ambiente?: string
          ativo?: boolean
          barbeiro_id: string
          cert_p12_auth_tag: string
          cert_p12_encrypted: string
          cert_p12_iv: string
          cert_password_auth_tag?: string | null
          cert_password_encrypted?: string | null
          cert_password_iv?: string | null
          client_id_auth_tag: string
          client_id_encrypted: string
          client_id_iv: string
          client_secret_auth_tag: string
          client_secret_encrypted: string
          client_secret_iv: string
          created_at?: string
          id?: string
          pix_key: string
          test_connection_at?: string | null
          test_connection_ok?: boolean | null
          test_pix_at?: string | null
          test_pix_e2e_id?: string | null
          test_pix_ok?: boolean | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          ambiente?: string
          ativo?: boolean
          barbeiro_id?: string
          cert_p12_auth_tag?: string
          cert_p12_encrypted?: string
          cert_p12_iv?: string
          cert_password_auth_tag?: string | null
          cert_password_encrypted?: string | null
          cert_password_iv?: string | null
          client_id_auth_tag?: string
          client_id_encrypted?: string
          client_id_iv?: string
          client_secret_auth_tag?: string
          client_secret_encrypted?: string
          client_secret_iv?: string
          created_at?: string
          id?: string
          pix_key?: string
          test_connection_at?: string | null
          test_connection_ok?: boolean | null
          test_pix_at?: string | null
          test_pix_e2e_id?: string | null
          test_pix_ok?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "efi_credenciais_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efi_credenciais_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      efi_pix_charges: {
        Row: {
          barbeiro_id: string
          br_code: string | null
          chave_pix_destino: string
          created_at: string
          descricao: string | null
          e2e_id: string | null
          expires_at: string | null
          id: string
          loc_id: number | null
          paid_at: string | null
          pending_booking_id: string | null
          qr_code_image: string | null
          raw_charge: Json | null
          status: string
          txid: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          barbeiro_id: string
          br_code?: string | null
          chave_pix_destino: string
          created_at?: string
          descricao?: string | null
          e2e_id?: string | null
          expires_at?: string | null
          id?: string
          loc_id?: number | null
          paid_at?: string | null
          pending_booking_id?: string | null
          qr_code_image?: string | null
          raw_charge?: Json | null
          status?: string
          txid: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          barbeiro_id?: string
          br_code?: string | null
          chave_pix_destino?: string
          created_at?: string
          descricao?: string | null
          e2e_id?: string | null
          expires_at?: string | null
          id?: string
          loc_id?: number | null
          paid_at?: string | null
          pending_booking_id?: string | null
          qr_code_image?: string | null
          raw_charge?: Json | null
          status?: string
          txid?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "efi_pix_charges_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efi_pix_charges_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efi_pix_charges_pending_booking_id_fkey"
            columns: ["pending_booking_id"]
            isOneToOne: false
            referencedRelation: "pending_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      efi_pix_payouts: {
        Row: {
          barbeiro_id: string
          charge_id: string
          chave_pix_destino: string
          completed_at: string | null
          created_at: string
          e2e_id: string | null
          efi_id_envio: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          raw_response: Json | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          barbeiro_id: string
          charge_id: string
          chave_pix_destino: string
          completed_at?: string | null
          created_at?: string
          e2e_id?: string | null
          efi_id_envio?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          raw_response?: Json | null
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          barbeiro_id?: string
          charge_id?: string
          chave_pix_destino?: string
          completed_at?: string | null
          created_at?: string
          e2e_id?: string | null
          efi_id_envio?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          raw_response?: Json | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "efi_pix_payouts_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efi_pix_payouts_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efi_pix_payouts_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "efi_barbeiro_extrato"
            referencedColumns: ["charge_id"]
          },
          {
            foreignKeyName: "efi_pix_payouts_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "efi_pix_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      efi_saldo_alertas: {
        Row: {
          ambiente: string
          created_at: string
          detalhes: Json | null
          id: string
          limite_minimo: number
          resolvido: boolean
          resolvido_em: string | null
          saldo_atual: number
        }
        Insert: {
          ambiente: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          limite_minimo?: number
          resolvido?: boolean
          resolvido_em?: string | null
          saldo_atual: number
        }
        Update: {
          ambiente?: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          limite_minimo?: number
          resolvido?: boolean
          resolvido_em?: string | null
          saldo_atual?: number
        }
        Relationships: []
      }
      efi_webhook_events: {
        Row: {
          e2e_id: string | null
          event_signature: string
          id: string
          payload: Json
          processed_at: string
          txid: string | null
        }
        Insert: {
          e2e_id?: string | null
          event_signature: string
          id?: string
          payload: Json
          processed_at?: string
          txid?: string | null
        }
        Update: {
          e2e_id?: string | null
          event_signature?: string
          id?: string
          payload?: Json
          processed_at?: string
          txid?: string | null
        }
        Relationships: []
      }
      email_confirmation_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      financeiro_auth_attempts: {
        Row: {
          created_at: string | null
          id: string
          ip_address: string | null
          reason: string | null
          success: boolean | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      financeiro_auth_sessions: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          last_used_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      financeiro_marco_zero: {
        Row: {
          created_at: string | null
          criado_por: string | null
          data_corte: string
          id: string
        }
        Insert: {
          created_at?: string | null
          criado_por?: string | null
          data_corte?: string
          id?: string
        }
        Update: {
          created_at?: string | null
          criado_por?: string | null
          data_corte?: string
          id?: string
        }
        Relationships: []
      }
      financeiro_security_config: {
        Row: {
          created_at: string | null
          id: string
          must_change_password: boolean | null
          password_hash: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          must_change_password?: boolean | null
          password_hash: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          must_change_password?: boolean | null
          password_hash?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      financial_entries: {
        Row: {
          categoria: string
          created_at: string | null
          data: string
          descricao: string | null
          id: string
          nota_anexo: string | null
          related_appointment_id: string | null
          tipo: Database["public"]["Enums"]["financial_entry_type"]
          updated_at: string | null
          valor: number
        }
        Insert: {
          categoria: string
          created_at?: string | null
          data: string
          descricao?: string | null
          id?: string
          nota_anexo?: string | null
          related_appointment_id?: string | null
          tipo: Database["public"]["Enums"]["financial_entry_type"]
          updated_at?: string | null
          valor: number
        }
        Update: {
          categoria?: string
          created_at?: string | null
          data?: string
          descricao?: string | null
          id?: string
          nota_anexo?: string | null
          related_appointment_id?: string | null
          tipo?: Database["public"]["Enums"]["financial_entry_type"]
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_related_appointment_id_fkey"
            columns: ["related_appointment_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      global_configs: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      horarios_excepcionais: {
        Row: {
          aberto: boolean
          created_at: string | null
          data: string
          hora_abertura: string | null
          hora_almoco_fim: string | null
          hora_almoco_inicio: string | null
          hora_fechamento: string | null
          id: string
          motivo: string | null
          tenant_id: string
          unidade_id: string | null
          updated_at: string | null
        }
        Insert: {
          aberto?: boolean
          created_at?: string | null
          data: string
          hora_abertura?: string | null
          hora_almoco_fim?: string | null
          hora_almoco_inicio?: string | null
          hora_fechamento?: string | null
          id?: string
          motivo?: string | null
          tenant_id: string
          unidade_id?: string | null
          updated_at?: string | null
        }
        Update: {
          aberto?: boolean
          created_at?: string | null
          data?: string
          hora_abertura?: string | null
          hora_almoco_fim?: string | null
          hora_almoco_inicio?: string | null
          hora_fechamento?: string | null
          id?: string
          motivo?: string | null
          tenant_id?: string
          unidade_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "horarios_excepcionais_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horarios_excepcionais_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "tenant_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios_excepcionais_barbeiro: {
        Row: {
          aberto: boolean | null
          barbeiro_id: string
          created_at: string | null
          data: string
          hora_abertura: string | null
          hora_almoco_fim: string | null
          hora_almoco_inicio: string | null
          hora_fechamento: string | null
          id: string
          motivo: string | null
          updated_at: string | null
        }
        Insert: {
          aberto?: boolean | null
          barbeiro_id: string
          created_at?: string | null
          data: string
          hora_abertura?: string | null
          hora_almoco_fim?: string | null
          hora_almoco_inicio?: string | null
          hora_fechamento?: string | null
          id?: string
          motivo?: string | null
          updated_at?: string | null
        }
        Update: {
          aberto?: boolean | null
          barbeiro_id?: string
          created_at?: string | null
          data?: string
          hora_abertura?: string | null
          hora_almoco_fim?: string | null
          hora_almoco_inicio?: string | null
          hora_fechamento?: string | null
          id?: string
          motivo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "horarios_excepcionais_barbeiro_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horarios_excepcionais_barbeiro_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      identidades_usadas: {
        Row: {
          cpf_hash: string | null
          criado_em: string
          email: string | null
          id: string
          primeiro_profile_id: string | null
          telefone_hash: string | null
        }
        Insert: {
          cpf_hash?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          primeiro_profile_id?: string | null
          telefone_hash?: string | null
        }
        Update: {
          cpf_hash?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          primeiro_profile_id?: string | null
          telefone_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "identidades_usadas_primeiro_profile_id_fkey"
            columns: ["primeiro_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      indicacoes: {
        Row: {
          agendado_em: string | null
          agendamento_qualificador_id: string | null
          click_session_id: string | null
          codigo_usado: string
          confirmado_em: string | null
          credito_gerado: boolean
          criado_em: string
          id: string
          indicado_id: string | null
          indicador_id: string
          liberado_em: string | null
          link_clicked_em: string | null
          motivo_invalidacao: string | null
          status: string
        }
        Insert: {
          agendado_em?: string | null
          agendamento_qualificador_id?: string | null
          click_session_id?: string | null
          codigo_usado: string
          confirmado_em?: string | null
          credito_gerado?: boolean
          criado_em?: string
          id?: string
          indicado_id?: string | null
          indicador_id: string
          liberado_em?: string | null
          link_clicked_em?: string | null
          motivo_invalidacao?: string | null
          status?: string
        }
        Update: {
          agendado_em?: string | null
          agendamento_qualificador_id?: string | null
          click_session_id?: string | null
          codigo_usado?: string
          confirmado_em?: string | null
          credito_gerado?: boolean
          criado_em?: string
          id?: string
          indicado_id?: string | null
          indicador_id?: string
          liberado_em?: string | null
          link_clicked_em?: string | null
          motivo_invalidacao?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicacoes_agendamento_qualificador_id_fkey"
            columns: ["agendamento_qualificador_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicacoes_indicado_id_fkey"
            columns: ["indicado_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicacoes_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      informacoes_aplicativo: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          atualizado_por: string | null
          categoria: string
          chave: string
          conteudo: string
          id: number
          ordem: number | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          atualizado_por?: string | null
          categoria: string
          chave: string
          conteudo: string
          id?: number
          ordem?: number | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          atualizado_por?: string | null
          categoria?: string
          chave?: string
          conteudo?: string
          id?: number
          ordem?: number | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      informacoes_empresa: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          categoria: string
          chave: string
          id: number
          tenant_id: string | null
          valor: string
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          categoria: string
          chave: string
          id?: number
          tenant_id?: string | null
          valor: string
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          categoria?: string
          chave?: string
          id?: number
          tenant_id?: string | null
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "informacoes_empresa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_connections: {
        Row: {
          access_token: string
          barbeiro_id: string
          created_at: string
          id: string
          ig_user_id: string
          ig_username: string
          profile_picture_url: string | null
          show_posts_on_landing: boolean
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          barbeiro_id: string
          created_at?: string
          id?: string
          ig_user_id: string
          ig_username: string
          profile_picture_url?: string | null
          show_posts_on_landing?: boolean
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          barbeiro_id?: string
          created_at?: string
          id?: string
          ig_user_id?: string
          ig_username?: string
          profile_picture_url?: string | null
          show_posts_on_landing?: boolean
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_connections_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_connections_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_posts_cache: {
        Row: {
          cached_at: string
          caption: string | null
          connection_id: string
          id: string
          ig_post_id: string
          media_type: string
          media_url: string
          permalink: string | null
          post_timestamp: string | null
          thumbnail_url: string | null
        }
        Insert: {
          cached_at?: string
          caption?: string | null
          connection_id: string
          id?: string
          ig_post_id: string
          media_type: string
          media_url: string
          permalink?: string | null
          post_timestamp?: string | null
          thumbnail_url?: string | null
        }
        Update: {
          cached_at?: string
          caption?: string | null
          connection_id?: string
          id?: string
          ig_post_id?: string
          media_type?: string
          media_url?: string
          permalink?: string | null
          post_timestamp?: string | null
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_posts_cache_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "instagram_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_agendamentos: {
        Row: {
          acao: string
          agendamento_id: string | null
          detalhes: string | null
          id: string
          timestamp: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          agendamento_id?: string | null
          detalhes?: string | null
          id?: string
          timestamp?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          agendamento_id?: string | null
          detalhes?: string | null
          id?: string
          timestamp?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_agendamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      loja_cupons: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          max_usos_por_cliente: number | null
          max_usos_total: number | null
          produto_id: string | null
          tenant_id: string
          tipo_desconto: string
          updated_at: string
          usos_count: number
          valido_ate: string | null
          valido_de: string
          valor_desconto: number
          valor_minimo: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          max_usos_por_cliente?: number | null
          max_usos_total?: number | null
          produto_id?: string | null
          tenant_id: string
          tipo_desconto?: string
          updated_at?: string
          usos_count?: number
          valido_ate?: string | null
          valido_de?: string
          valor_desconto?: number
          valor_minimo?: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          max_usos_por_cliente?: number | null
          max_usos_total?: number | null
          produto_id?: string | null
          tenant_id?: string
          tipo_desconto?: string
          updated_at?: string
          usos_count?: number
          valido_ate?: string | null
          valido_de?: string
          valor_desconto?: number
          valor_minimo?: number
        }
        Relationships: [
          {
            foreignKeyName: "loja_cupons_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_cupons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_audit_logs: {
        Row: {
          action: string
          appointment_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          points_after: number | null
          points_before: number | null
          reason: string | null
          user_id: string
        }
        Insert: {
          action: string
          appointment_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          points_after?: number | null
          points_before?: number | null
          reason?: string | null
          user_id: string
        }
        Update: {
          action?: string
          appointment_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          points_after?: number | null
          points_before?: number | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      manutencao_emails_permitidos: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      mensagem_templates: {
        Row: {
          ativo: boolean
          categoria: string
          conteudo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          slug: string
          updated_at: string
          updated_by: string | null
          variaveis_disponiveis: string[] | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          conteudo: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          slug: string
          updated_at?: string
          updated_by?: string | null
          variaveis_disponiveis?: string[] | null
        }
        Update: {
          ativo?: boolean
          categoria?: string
          conteudo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          slug?: string
          updated_at?: string
          updated_by?: string | null
          variaveis_disponiveis?: string[] | null
        }
        Relationships: []
      }
      mensagens_debounce: {
        Row: {
          id: string
          instance_name: string
          mensagem: string
          mensagens_json: Json | null
          numero: string
          session_id: string | null
          timestamp: string
        }
        Insert: {
          id?: string
          instance_name: string
          mensagem: string
          mensagens_json?: Json | null
          numero: string
          session_id?: string | null
          timestamp?: string
        }
        Update: {
          id?: string
          instance_name?: string
          mensagem?: string
          mensagens_json?: Json | null
          numero?: string
          session_id?: string | null
          timestamp?: string
        }
        Relationships: []
      }
      n8n_chat_histories: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          agendamento_id: string | null
          created_at: string | null
          id: string
          lida: boolean | null
          mensagem: string
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          agendamento_id?: string | null
          created_at?: string | null
          id?: string
          lida?: boolean | null
          mensagem: string
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          agendamento_id?: string | null
          created_at?: string | null
          id?: string
          lida?: boolean | null
          mensagem?: string
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_agendamento"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          agendamento_id: string | null
          assinatura_id: string | null
          created_at: string | null
          data_pagamento: string | null
          gateway_payment_id: string | null
          id: string
          metodo: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["payment_status"] | null
          user_id: string
          valor: number
        }
        Insert: {
          agendamento_id?: string | null
          assinatura_id?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          gateway_payment_id?: string | null
          id?: string
          metodo: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["payment_status"] | null
          user_id: string
          valor: number
        }
        Update: {
          agendamento_id?: string | null
          assinatura_id?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          gateway_payment_id?: string | null
          id?: string
          metodo?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["payment_status"] | null
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "assinaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos_plano_barbearia: {
        Row: {
          assinatura_id: string
          barbeiro_id: string | null
          competencia: string
          confirmado_por: string
          created_at: string
          id: string
          observacoes: string | null
          user_id: string
          valor: number
        }
        Insert: {
          assinatura_id: string
          barbeiro_id?: string | null
          competencia: string
          confirmado_por: string
          created_at?: string
          id?: string
          observacoes?: string | null
          user_id: string
          valor: number
        }
        Update: {
          assinatura_id?: string
          barbeiro_id?: string | null
          competencia?: string
          confirmado_por?: string
          created_at?: string
          id?: string
          observacoes?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_plano_barbearia_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "assinaturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_plano_barbearia_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_plano_barbearia_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          details: Json
          event_type: string
          from_status: string | null
          id: string
          payment_id: string
          to_status: string | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          event_type: string
          from_status?: string | null
          id?: string
          payment_id: string
          to_status?: string | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          event_type?: string
          from_status?: string | null
          id?: string
          payment_id?: string
          to_status?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          created_at: string
          file_type: string | null
          file_url: string
          id: string
          ocr_extracted: Json | null
          ocr_failure_reason: string | null
          ocr_processed_at: string | null
          ocr_score: number | null
          ocr_status: string
          ocr_validated: boolean | null
          payment_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_type?: string | null
          file_url: string
          id?: string
          ocr_extracted?: Json | null
          ocr_failure_reason?: string | null
          ocr_processed_at?: string | null
          ocr_score?: number | null
          ocr_status?: string
          ocr_validated?: boolean | null
          payment_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_type?: string | null
          file_url?: string
          id?: string
          ocr_extracted?: Json | null
          ocr_failure_reason?: string | null
          ocr_processed_at?: string | null
          ocr_score?: number | null
          ocr_status?: string
          ocr_validated?: boolean | null
          payment_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          agendamento_id: string | null
          amount: number
          barbeiro_id: string
          confirmation_method: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          expires_at: string
          failed_at: string | null
          id: string
          marked_probably_paid_at: string | null
          metadata: Json
          pix_key_used_hash: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          provider: string
          provider_payment_id: string | null
          qr_generated_at: string
          status: string
          tenant_id: string | null
          txid_internal: string
          txid_pix: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agendamento_id?: string | null
          amount: number
          barbeiro_id: string
          confirmation_method?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          expires_at?: string
          failed_at?: string | null
          id?: string
          marked_probably_paid_at?: string | null
          metadata?: Json
          pix_key_used_hash?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          provider?: string
          provider_payment_id?: string | null
          qr_generated_at?: string
          status?: string
          tenant_id?: string | null
          txid_internal: string
          txid_pix?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agendamento_id?: string | null
          amount?: number
          barbeiro_id?: string
          confirmation_method?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          expires_at?: string
          failed_at?: string | null
          id?: string
          marked_probably_paid_at?: string | null
          metadata?: Json
          pix_key_used_hash?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          provider?: string
          provider_payment_id?: string | null
          qr_generated_at?: string
          status?: string
          tenant_id?: string | null
          txid_internal?: string
          txid_pix?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          created_at: string
          id: string
          nome_produto: string | null
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          subtotal: number
        }
        Insert: {
          created_at?: string
          id?: string
          nome_produto?: string | null
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          subtotal: number
        }
        Update: {
          created_at?: string
          id?: string
          nome_produto?: string | null
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          asaas_payment_id: string | null
          cancelado_em: string | null
          cancelled_at: string | null
          cliente_id: string | null
          created_at: string
          desconto: number
          forma_pagamento: string | null
          id: string
          numero_pedido: string | null
          observacoes_admin: string | null
          observacoes_cliente: string | null
          paid_at: string | null
          payment_id: string | null
          payment_method: string | null
          payment_provider: string
          pix_copia_cola: string | null
          pix_qr_code: string | null
          reservation_expires_at: string
          status: string
          subtotal: number | null
          tenant_id: string
          total: number | null
          updated_at: string
          user_id: string
          valor_total: number
        }
        Insert: {
          asaas_payment_id?: string | null
          cancelado_em?: string | null
          cancelled_at?: string | null
          cliente_id?: string | null
          created_at?: string
          desconto?: number
          forma_pagamento?: string | null
          id?: string
          numero_pedido?: string | null
          observacoes_admin?: string | null
          observacoes_cliente?: string | null
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_provider?: string
          pix_copia_cola?: string | null
          pix_qr_code?: string | null
          reservation_expires_at: string
          status?: string
          subtotal?: number | null
          tenant_id: string
          total?: number | null
          updated_at?: string
          user_id: string
          valor_total: number
        }
        Update: {
          asaas_payment_id?: string | null
          cancelado_em?: string | null
          cancelled_at?: string | null
          cliente_id?: string | null
          created_at?: string
          desconto?: number
          forma_pagamento?: string | null
          id?: string
          numero_pedido?: string | null
          observacoes_admin?: string | null
          observacoes_cliente?: string | null
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_provider?: string
          pix_copia_cola?: string | null
          pix_qr_code?: string | null
          reservation_expires_at?: string
          status?: string
          subtotal?: number | null
          tenant_id?: string
          total?: number | null
          updated_at?: string
          user_id?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_bookings: {
        Row: {
          asaas_payment_id: string | null
          barbeiro_id: string
          created_at: string | null
          data: string
          duracao: number
          expires_at: string | null
          hora: string
          id: string
          observacoes: string | null
          payment_intent_id: string | null
          payment_method: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          preco: number
          servico_id: string
          user_id: string
        }
        Insert: {
          asaas_payment_id?: string | null
          barbeiro_id: string
          created_at?: string | null
          data: string
          duracao: number
          expires_at?: string | null
          hora: string
          id?: string
          observacoes?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          preco: number
          servico_id: string
          user_id: string
        }
        Update: {
          asaas_payment_id?: string | null
          barbeiro_id?: string
          created_at?: string | null
          data?: string
          duracao?: number
          expires_at?: string | null
          hora?: string
          id?: string
          observacoes?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          preco?: number
          servico_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_bookings_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_bookings_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_bookings_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_tickets: {
        Row: {
          category: string
          conversation_id: string | null
          created_at: string
          description: string
          id: string
          last_error: string | null
          payload: Json | null
          pending_ticket_id: string
          priority: string
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number
          session_id: string | null
          status: string
          summary: string
          ticket_id: string | null
          updated_at: string
          user_email: string | null
          user_id: string | null
          user_name: string | null
          user_phone: string | null
        }
        Insert: {
          category?: string
          conversation_id?: string | null
          created_at?: string
          description: string
          id?: string
          last_error?: string | null
          payload?: Json | null
          pending_ticket_id: string
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          session_id?: string | null
          status?: string
          summary: string
          ticket_id?: string | null
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          user_phone?: string | null
        }
        Update: {
          category?: string
          conversation_id?: string | null
          created_at?: string
          description?: string
          id?: string
          last_error?: string | null
          payload?: Json | null
          pending_ticket_id?: string
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          session_id?: string | null
          status?: string
          summary?: string
          ticket_id?: string | null
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          user_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_tickets_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_financeiro: {
        Row: {
          created_at: string
          id: string
          pin_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pin_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pin_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pix_charge_audit: {
        Row: {
          charge_id: string
          created_at: string
          decided_by: string
          decision_reason: string
          heuristic_signals: Json | null
          id: string
          new_status: string
          previous_status: string | null
          txid: string | null
        }
        Insert: {
          charge_id: string
          created_at?: string
          decided_by?: string
          decision_reason: string
          heuristic_signals?: Json | null
          id?: string
          new_status: string
          previous_status?: string | null
          txid?: string | null
        }
        Update: {
          charge_id?: string
          created_at?: string
          decided_by?: string
          decision_reason?: string
          heuristic_signals?: Json | null
          id?: string
          new_status?: string
          previous_status?: string | null
          txid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pix_charge_audit_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "pix_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_charges: {
        Row: {
          agendamento_id: string | null
          auto_confirmation_reason: string | null
          barbeiro_id: string | null
          br_code: string
          chave_pix_id: string | null
          client_opened_bank_at: string | null
          client_returned_at: string | null
          confidence_score: number | null
          created_at: string
          descricao: string | null
          expires_at: string
          id: string
          late_payment: boolean | null
          likely_paid_at: string | null
          metadata: Json | null
          paid_at: string | null
          status: string
          txid: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          agendamento_id?: string | null
          auto_confirmation_reason?: string | null
          barbeiro_id?: string | null
          br_code: string
          chave_pix_id?: string | null
          client_opened_bank_at?: string | null
          client_returned_at?: string | null
          confidence_score?: number | null
          created_at?: string
          descricao?: string | null
          expires_at: string
          id?: string
          late_payment?: boolean | null
          likely_paid_at?: string | null
          metadata?: Json | null
          paid_at?: string | null
          status?: string
          txid: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          agendamento_id?: string | null
          auto_confirmation_reason?: string | null
          barbeiro_id?: string | null
          br_code?: string
          chave_pix_id?: string | null
          client_opened_bank_at?: string | null
          client_returned_at?: string | null
          confidence_score?: number | null
          created_at?: string
          descricao?: string | null
          expires_at?: string
          id?: string
          late_payment?: boolean | null
          likely_paid_at?: string | null
          metadata?: Json | null
          paid_at?: string | null
          status?: string
          txid?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pix_charges_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_charges_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_charges_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_charges_chave_pix_id_fkey"
            columns: ["chave_pix_id"]
            isOneToOne: false
            referencedRelation: "chaves_pix"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_agendamentos_usos: {
        Row: {
          agendamento_id: string | null
          assinatura_id: string
          competencia: string
          created_at: string
          id: string
          released_at: string | null
          user_id: string
        }
        Insert: {
          agendamento_id?: string | null
          assinatura_id: string
          competencia: string
          created_at?: string
          id?: string
          released_at?: string | null
          user_id: string
        }
        Update: {
          agendamento_id?: string | null
          assinatura_id?: string
          competencia?: string
          created_at?: string
          id?: string
          released_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plano_servicos: {
        Row: {
          created_at: string
          plano_id: string
          servico_id: string
        }
        Insert: {
          created_at?: string
          plano_id: string
          servico_id: string
        }
        Update: {
          created_at?: string
          plano_id?: string
          servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_servicos_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_servicos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean | null
          beneficios_json: Json | null
          controle_vagas_ativo: boolean
          created_at: string | null
          descricao: string | null
          id: string
          limite_agendamentos_mes: number | null
          nome: string
          preco_mensal: number
          prioridade_agendamento: number | null
          servico_id: string | null
          stripe_price_id: string | null
          tenant_id: string | null
          updated_at: string | null
          vagas: number | null
        }
        Insert: {
          ativo?: boolean | null
          beneficios_json?: Json | null
          controle_vagas_ativo?: boolean
          created_at?: string | null
          descricao?: string | null
          id?: string
          limite_agendamentos_mes?: number | null
          nome: string
          preco_mensal: number
          prioridade_agendamento?: number | null
          servico_id?: string | null
          stripe_price_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          vagas?: number | null
        }
        Update: {
          ativo?: boolean | null
          beneficios_json?: Json | null
          controle_vagas_ativo?: boolean
          created_at?: string | null
          descricao?: string | null
          id?: string
          limite_agendamentos_mes?: number | null
          nome?: string
          preco_mensal?: number
          prioridade_agendamento?: number | null
          servico_id?: string | null
          stripe_price_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          vagas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "planos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pontos: {
        Row: {
          created_at: string | null
          id: string
          last_awarded_at: string | null
          pontos: number | null
          promocao_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_awarded_at?: string | null
          pontos?: number | null
          promocao_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_awarded_at?: string | null
          pontos?: number | null
          promocao_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pontos_promocao_id_fkey"
            columns: ["promocao_id"]
            isOneToOne: false
            referencedRelation: "promocoes"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_images: {
        Row: {
          barbeiro_id: string
          caption: string | null
          created_at: string
          id: string
          image_url: string
          ordem: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          barbeiro_id: string
          caption?: string | null
          created_at?: string
          id?: string
          image_url: string
          ordem?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          barbeiro_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string
          ordem?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_images_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_images_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_images_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_imagens: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          ordem: number
          produto_id: string
          url: string
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          ordem?: number
          produto_id: string
          url: string
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          ordem?: number
          produto_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_imagens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria: string
          categoria_id: string | null
          created_at: string
          descricao: string | null
          destaque: boolean
          estoque: number
          estoque_minimo: number
          id: string
          imagens: string[]
          nome: string
          preco: number
          preco_original: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          categoria_id?: string | null
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          estoque?: number
          estoque_minimo?: number
          id?: string
          imagens?: string[]
          nome: string
          preco: number
          preco_original?: number | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          categoria_id?: string | null
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          estoque?: number
          estoque_minimo?: number
          id?: string
          imagens?: string[]
          nome?: string
          preco?: number
          preco_original?: number | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos_loja: {
        Row: {
          ativo: boolean | null
          categoria: string
          created_at: string
          descricao: string | null
          destaque: boolean | null
          estoque: number | null
          id: string
          imagem_url: string | null
          nome: string
          preco: number
          preco_promocional: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean | null
          categoria?: string
          created_at?: string
          descricao?: string | null
          destaque?: boolean | null
          estoque?: number | null
          id?: string
          imagem_url?: string | null
          nome: string
          preco?: number
          preco_promocional?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean | null
          categoria?: string
          created_at?: string
          descricao?: string | null
          destaque?: boolean | null
          estoque?: number | null
          id?: string
          imagem_url?: string | null
          nome?: string
          preco?: number
          preco_promocional?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_loja_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          asaas_customer_id: string | null
          avatar_url: string | null
          banner_url: string | null
          barbearia_preferida_id: string | null
          blocked: boolean | null
          cep: string | null
          cpf: string | null
          created_at: string | null
          data_nascimento: string | null
          endereco_bairro: string | null
          endereco_cidade: string | null
          endereco_numero: string | null
          endereco_rua: string | null
          endereco_uf: string | null
          id: string
          nome: string
          referral_code: string | null
          referred_by: string | null
          signup_origin: string | null
          telefone: string | null
          unidade_preferida_id: string | null
          updated_at: string | null
          wallet_pin_hash: string | null
        }
        Insert: {
          asaas_customer_id?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          barbearia_preferida_id?: string | null
          blocked?: boolean | null
          cep?: string | null
          cpf?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          endereco_bairro?: string | null
          endereco_cidade?: string | null
          endereco_numero?: string | null
          endereco_rua?: string | null
          endereco_uf?: string | null
          id: string
          nome: string
          referral_code?: string | null
          referred_by?: string | null
          signup_origin?: string | null
          telefone?: string | null
          unidade_preferida_id?: string | null
          updated_at?: string | null
          wallet_pin_hash?: string | null
        }
        Update: {
          asaas_customer_id?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          barbearia_preferida_id?: string | null
          blocked?: boolean | null
          cep?: string | null
          cpf?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          endereco_bairro?: string | null
          endereco_cidade?: string | null
          endereco_numero?: string | null
          endereco_rua?: string | null
          endereco_uf?: string | null
          id?: string
          nome?: string
          referral_code?: string | null
          referred_by?: string | null
          signup_origin?: string | null
          telefone?: string | null
          unidade_preferida_id?: string | null
          updated_at?: string | null
          wallet_pin_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_barbearia_preferida_id_fkey"
            columns: ["barbearia_preferida_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_unidade_preferida_id_fkey"
            columns: ["unidade_preferida_id"]
            isOneToOne: false
            referencedRelation: "tenant_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      promocoes: {
        Row: {
          aprovada_em: string | null
          aprovada_por: string | null
          ativo: boolean | null
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          gerada_por_ia: boolean | null
          id: string
          imagem_url: string | null
          nome: string
          pontos_necessarios: number | null
          prompt_ia: string | null
          regras_json: Json | null
          tenant_id: string | null
          weekly_required: boolean | null
        }
        Insert: {
          aprovada_em?: string | null
          aprovada_por?: string | null
          ativo?: boolean | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          gerada_por_ia?: boolean | null
          id?: string
          imagem_url?: string | null
          nome: string
          pontos_necessarios?: number | null
          prompt_ia?: string | null
          regras_json?: Json | null
          tenant_id?: string | null
          weekly_required?: boolean | null
        }
        Update: {
          aprovada_em?: string | null
          aprovada_por?: string | null
          ativo?: boolean | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          gerada_por_ia?: boolean | null
          id?: string
          imagem_url?: string | null
          nome?: string
          pontos_necessarios?: number | null
          prompt_ia?: string | null
          regras_json?: Json | null
          tenant_id?: string | null
          weekly_required?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "promocoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      relatorios_mensais: {
        Row: {
          agendamentos_cancelados: number
          agendamentos_completados: number
          agendamentos_no_show: number
          ano: number
          arquivo_pdf_url: string | null
          created_at: string
          gerado_automaticamente: boolean
          id: string
          insights_ia: Json | null
          lucro_liquido: number
          mes: number
          receita_app: number
          receita_barbearia: number
          receita_credito: number
          receita_plano: number
          receita_total: number
          resumo_ia: string | null
          taxas_asaas: number
          total_agendamentos: number
          updated_at: string
          variacao_agendamentos_percentual: number | null
          variacao_receita_percentual: number | null
        }
        Insert: {
          agendamentos_cancelados?: number
          agendamentos_completados?: number
          agendamentos_no_show?: number
          ano: number
          arquivo_pdf_url?: string | null
          created_at?: string
          gerado_automaticamente?: boolean
          id?: string
          insights_ia?: Json | null
          lucro_liquido?: number
          mes: number
          receita_app?: number
          receita_barbearia?: number
          receita_credito?: number
          receita_plano?: number
          receita_total?: number
          resumo_ia?: string | null
          taxas_asaas?: number
          total_agendamentos?: number
          updated_at?: string
          variacao_agendamentos_percentual?: number | null
          variacao_receita_percentual?: number | null
        }
        Update: {
          agendamentos_cancelados?: number
          agendamentos_completados?: number
          agendamentos_no_show?: number
          ano?: number
          arquivo_pdf_url?: string | null
          created_at?: string
          gerado_automaticamente?: boolean
          id?: string
          insights_ia?: Json | null
          lucro_liquido?: number
          mes?: number
          receita_app?: number
          receita_barbearia?: number
          receita_credito?: number
          receita_plano?: number
          receita_total?: number
          resumo_ia?: string | null
          taxas_asaas?: number
          total_agendamentos?: number
          updated_at?: string
          variacao_agendamentos_percentual?: number | null
          variacao_receita_percentual?: number | null
        }
        Relationships: []
      }
      reservas_estoque: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          pedido_id: string
          produto_id: string
          quantidade: number
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          pedido_id: string
          produto_id: string
          quantidade: number
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          pedido_id?: string
          produto_id?: string
          quantidade?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservas_estoque_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      resgates: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          expired_at: string | null
          id: string
          promocao_id: string | null
          status: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          expired_at?: string | null
          id?: string
          promocao_id?: string | null
          status?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          expired_at?: string | null
          id?: string
          promocao_id?: string | null
          status?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resgates_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resgates_promocao_id_fkey"
            columns: ["promocao_id"]
            isOneToOne: false
            referencedRelation: "promocoes"
            referencedColumns: ["id"]
          },
        ]
      }
      saques: {
        Row: {
          barbeiro_id: string | null
          chave_pix_id: string | null
          chave_pix_tipo: string
          chave_pix_valor: string
          created_at: string
          id: string
          motivo_cancelamento: string | null
          processado_em: string | null
          status: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          barbeiro_id?: string | null
          chave_pix_id?: string | null
          chave_pix_tipo: string
          chave_pix_valor: string
          created_at?: string
          id?: string
          motivo_cancelamento?: string | null
          processado_em?: string | null
          status?: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          barbeiro_id?: string | null
          chave_pix_id?: string | null
          chave_pix_tipo?: string
          chave_pix_valor?: string
          created_at?: string
          id?: string
          motivo_cancelamento?: string | null
          processado_em?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "saques_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saques_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saques_chave_pix_id_fkey"
            columns: ["chave_pix_id"]
            isOneToOne: false
            referencedRelation: "chaves_pix"
            referencedColumns: ["id"]
          },
        ]
      }
      servicos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          custo_mao_obra: number | null
          custo_produtos: number | null
          descricao: string | null
          duracao_minutos: number
          id: string
          nome: string
          preco: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          custo_mao_obra?: number | null
          custo_produtos?: number | null
          descricao?: string | null
          duracao_minutos: number
          id?: string
          nome: string
          preco: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          custo_mao_obra?: number | null
          custo_produtos?: number | null
          descricao?: string | null
          duracao_minutos?: number
          id?: string
          nome?: string
          preco?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servicos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_conversations: {
        Row: {
          created_at: string | null
          id: string
          last_message_at: string | null
          metadata: Json | null
          rating: number | null
          resolved_at: string | null
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          metadata?: Json | null
          rating?: number | null
          resolved_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          metadata?: Json | null
          rating?: number | null
          resolved_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          conversation_id: string | null
          created_at: string | null
          description: string
          error_message: string | null
          id: string
          location: string | null
          metadata: Json | null
          priority: string
          resolved_at: string | null
          status: string
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          category?: string
          conversation_id?: string | null
          created_at?: string | null
          description: string
          error_message?: string | null
          id?: string
          location?: string | null
          metadata?: Json | null
          priority?: string
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          conversation_id?: string | null
          created_at?: string | null
          description?: string
          error_message?: string | null
          id?: string
          location?: string | null
          metadata?: Json | null
          priority?: string
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          chave: string
          descricao: string | null
          id: string
          updated_at: string | null
          updated_by: string | null
          valor: string | null
        }
        Insert: {
          chave: string
          descricao?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          valor?: string | null
        }
        Update: {
          chave?: string
          descricao?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          valor?: string | null
        }
        Relationships: []
      }
      system_health_checks: {
        Row: {
          error_message: string | null
          id: string
          last_check_at: string
          metadata: Json | null
          response_time_ms: number | null
          service_name: string
          status: string
        }
        Insert: {
          error_message?: string | null
          id?: string
          last_check_at?: string
          metadata?: Json | null
          response_time_ms?: number | null
          service_name: string
          status: string
        }
        Update: {
          error_message?: string | null
          id?: string
          last_check_at?: string
          metadata?: Json | null
          response_time_ms?: number | null
          service_name?: string
          status?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          category: string
          created_at: string
          details: Json | null
          id: string
          level: string
          message: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          details?: Json | null
          id?: string
          level: string
          message: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          details?: Json | null
          id?: string
          level?: string
          message?: string
          user_id?: string | null
        }
        Relationships: []
      }
      taxas_gateway: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          metodo_pagamento: string
          taxa_fixa: number | null
          taxa_percentual: number | null
          tipo_taxa: string
          updated_at: string
          valor_taxa: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          metodo_pagamento: string
          taxa_fixa?: number | null
          taxa_percentual?: number | null
          tipo_taxa?: string
          updated_at?: string
          valor_taxa?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          metodo_pagamento?: string
          taxa_fixa?: number | null
          taxa_percentual?: number | null
          tipo_taxa?: string
          updated_at?: string
          valor_taxa?: number
        }
        Relationships: []
      }
      tenant_assinaturas: {
        Row: {
          cakto_customer_email: string | null
          cakto_order_id: string | null
          cakto_subscription_id: string | null
          cancelled_at: string | null
          created_at: string | null
          id: string
          next_billing_date: string | null
          paid_at: string | null
          payment_method: string | null
          payment_reference: string | null
          plano_id: string | null
          qtd_barbeiros: number
          status: Database["public"]["Enums"]["tenant_subscription_status"]
          subscription_start: string | null
          tenant_id: string
          trial_end: string
          trial_start: string
          updated_at: string | null
        }
        Insert: {
          cakto_customer_email?: string | null
          cakto_order_id?: string | null
          cakto_subscription_id?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          id?: string
          next_billing_date?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          plano_id?: string | null
          qtd_barbeiros?: number
          status?: Database["public"]["Enums"]["tenant_subscription_status"]
          subscription_start?: string | null
          tenant_id: string
          trial_end?: string
          trial_start?: string
          updated_at?: string | null
        }
        Update: {
          cakto_customer_email?: string | null
          cakto_order_id?: string | null
          cakto_subscription_id?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          id?: string
          next_billing_date?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          plano_id?: string | null
          qtd_barbeiros?: number
          status?: Database["public"]["Enums"]["tenant_subscription_status"]
          subscription_start?: string | null
          tenant_id?: string
          trial_end?: string
          trial_start?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_assinaturas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "tenant_planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_assinaturas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_cakto_events: {
        Row: {
          cakto_order_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed: boolean
          tenant_id: string | null
        }
        Insert: {
          cakto_order_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          processed?: boolean
          tenant_id?: string | null
        }
        Update: {
          cakto_order_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_cakto_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_clientes: {
        Row: {
          added_by: string | null
          blocked: boolean
          created_at: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          blocked?: boolean
          created_at?: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          blocked?: boolean
          created_at?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_clientes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_mensagem_templates: {
        Row: {
          ativo: boolean | null
          conteudo: string
          created_at: string | null
          id: string
          slug: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          conteudo: string
          created_at?: string | null
          id?: string
          slug: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          conteudo?: string
          created_at?: string | null
          id?: string
          slug?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_mensagem_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_plano_faixas: {
        Row: {
          created_at: string
          id: string
          max_barbeiros: number | null
          min_barbeiros: number
          plano_id: string
          preco_cheio: number
          preco_promocional: number
        }
        Insert: {
          created_at?: string
          id?: string
          max_barbeiros?: number | null
          min_barbeiros?: number
          plano_id: string
          preco_cheio: number
          preco_promocional: number
        }
        Update: {
          created_at?: string
          id?: string
          max_barbeiros?: number | null
          min_barbeiros?: number
          plano_id?: string
          preco_cheio?: number
          preco_promocional?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_plano_faixas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "tenant_planos"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_planos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          destaque: boolean | null
          funcionalidades: Json | null
          id: string
          nome: string
          preco_anual: number | null
          preco_mensal: number
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          destaque?: boolean | null
          funcionalidades?: Json | null
          id?: string
          nome: string
          preco_anual?: number | null
          preco_mensal?: number
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          destaque?: boolean | null
          funcionalidades?: Json | null
          id?: string
          nome?: string
          preco_anual?: number | null
          preco_mensal?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      tenant_unidades: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          email: string | null
          estado: string | null
          id: string
          is_sede: boolean
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          nome: string
          numero: string | null
          rua: string | null
          site: string | null
          slogan: string | null
          slug: string | null
          telefone: string | null
          tenant_id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          estado?: string | null
          id?: string
          is_sede?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          nome: string
          numero?: string | null
          rua?: string | null
          site?: string | null
          slogan?: string | null
          slug?: string | null
          telefone?: string | null
          tenant_id: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          estado?: string | null
          id?: string
          is_sede?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          nome?: string
          numero?: string | null
          rua?: string | null
          site?: string | null
          slogan?: string | null
          slug?: string | null
          telefone?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_unidades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_webhook_config: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          id: string
          tenant_id: string
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          tenant_id: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_webhook_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          ativo: boolean
          bairro: string | null
          cidade: string | null
          cnpj: string | null
          cpf: string | null
          created_at: string
          email: string | null
          endereco_completo: string | null
          estado: string | null
          id: string
          is_test: boolean | null
          latitude: number | null
          logo_url: string | null
          loja_ativa: boolean
          loja_manutencao_ativa: boolean
          loja_manutencao_mensagem: string | null
          longitude: number | null
          nome: string
          numero: string | null
          onboarding_completed: boolean
          onboarding_step: number
          owner_user_id: string
          rua: string | null
          site: string | null
          slogan: string | null
          slot_interval_minutes: number
          slug: string | null
          telefone: string | null
          trial_ends_at: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cidade?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          endereco_completo?: string | null
          estado?: string | null
          id?: string
          is_test?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          loja_ativa?: boolean
          loja_manutencao_ativa?: boolean
          loja_manutencao_mensagem?: string | null
          longitude?: number | null
          nome: string
          numero?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          owner_user_id: string
          rua?: string | null
          site?: string | null
          slogan?: string | null
          slot_interval_minutes?: number
          slug?: string | null
          telefone?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cidade?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          endereco_completo?: string | null
          estado?: string | null
          id?: string
          is_test?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          loja_ativa?: boolean
          loja_manutencao_ativa?: boolean
          loja_manutencao_mensagem?: string | null
          longitude?: number | null
          nome?: string
          numero?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          owner_user_id?: string
          rua?: string | null
          site?: string | null
          slogan?: string | null
          slot_interval_minutes?: number
          slug?: string | null
          telefone?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      transacoes_financeiras: {
        Row: {
          barbeiro_id: string
          carteira_id: string
          chave_pix_destino: string | null
          completed_at: string | null
          created_at: string
          descricao: string | null
          efi_charge_id: string | null
          efi_e2e_id: string | null
          erro_mensagem: string | null
          id: string
          metadata: Json | null
          saldo_anterior: number | null
          saldo_posterior: number | null
          status: Database["public"]["Enums"]["transacao_status"]
          tipo: Database["public"]["Enums"]["transacao_tipo"]
          updated_at: string
          valor: number
        }
        Insert: {
          barbeiro_id: string
          carteira_id: string
          chave_pix_destino?: string | null
          completed_at?: string | null
          created_at?: string
          descricao?: string | null
          efi_charge_id?: string | null
          efi_e2e_id?: string | null
          erro_mensagem?: string | null
          id?: string
          metadata?: Json | null
          saldo_anterior?: number | null
          saldo_posterior?: number | null
          status?: Database["public"]["Enums"]["transacao_status"]
          tipo: Database["public"]["Enums"]["transacao_tipo"]
          updated_at?: string
          valor: number
        }
        Update: {
          barbeiro_id?: string
          carteira_id?: string
          chave_pix_destino?: string | null
          completed_at?: string | null
          created_at?: string
          descricao?: string | null
          efi_charge_id?: string | null
          efi_e2e_id?: string | null
          erro_mensagem?: string | null
          id?: string
          metadata?: Json | null
          saldo_anterior?: number | null
          saldo_posterior?: number | null
          status?: Database["public"]["Enums"]["transacao_status"]
          tipo?: Database["public"]["Enums"]["transacao_tipo"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_financeiras_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_financeiras_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_financeiras_carteira_id_fkey"
            columns: ["carteira_id"]
            isOneToOne: false
            referencedRelation: "carteiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_financeiras_efi_charge_id_fkey"
            columns: ["efi_charge_id"]
            isOneToOne: false
            referencedRelation: "efi_barbeiro_extrato"
            referencedColumns: ["charge_id"]
          },
          {
            foreignKeyName: "transacoes_financeiras_efi_charge_id_fkey"
            columns: ["efi_charge_id"]
            isOneToOne: false
            referencedRelation: "efi_pix_charges"
            referencedColumns: ["id"]
          },
        ]
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
      wallet_balances: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_deposits: {
        Row: {
          amount: number
          asaas_payment_id: string | null
          created_at: string
          id: string
          paid_at: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          provider: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          asaas_payment_id?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          asaas_payment_id?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          destination_account: string | null
          destination_agency: string | null
          destination_bank_code: string | null
          destination_cpf: string | null
          destination_name: string | null
          destination_pix_key: string | null
          gateway_payment_id: string | null
          id: string
          metadata: Json | null
          pix_expires_at: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          destination_account?: string | null
          destination_agency?: string | null
          destination_bank_code?: string | null
          destination_cpf?: string | null
          destination_name?: string | null
          destination_pix_key?: string | null
          gateway_payment_id?: string | null
          id?: string
          metadata?: Json | null
          pix_expires_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          destination_account?: string | null
          destination_agency?: string | null
          destination_bank_code?: string | null
          destination_cpf?: string | null
          destination_name?: string | null
          destination_pix_key?: string | null
          gateway_payment_id?: string | null
          id?: string
          metadata?: Json | null
          pix_expires_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_config: {
        Row: {
          ativo: boolean | null
          confirmacao_ativo: boolean
          confirmacao_webhook_url: string | null
          created_at: string | null
          disparo_ativo: boolean | null
          disparo_webhook_url: string | null
          id: string
          lembrete_ativo: boolean | null
          lembrete_webhook_url: string | null
          loja_manutencao_ativa: boolean
          loja_manutencao_aviso_ativo: boolean
          loja_manutencao_aviso_mensagem: string | null
          loja_manutencao_fim_programada: string | null
          loja_manutencao_inicio_programada: string | null
          loja_manutencao_mensagem: string | null
          manutencao_ativa: boolean | null
          manutencao_aviso_ativo: boolean
          manutencao_aviso_mensagem: string | null
          manutencao_aviso_publico: string
          manutencao_fim_programada: string | null
          manutencao_inicio_programada: string | null
          manutencao_ips_permitidos: string[] | null
          manutencao_mensagem: string | null
          refresh_barber_required_at: string | null
          refresh_client_required_at: string | null
          ticket_ativo: boolean
          ticket_webhook_url: string | null
          updated_at: string | null
          webhook_url: string | null
          whatsapp_ativo: boolean | null
          whatsapp_webhook_url: string | null
        }
        Insert: {
          ativo?: boolean | null
          confirmacao_ativo?: boolean
          confirmacao_webhook_url?: string | null
          created_at?: string | null
          disparo_ativo?: boolean | null
          disparo_webhook_url?: string | null
          id?: string
          lembrete_ativo?: boolean | null
          lembrete_webhook_url?: string | null
          loja_manutencao_ativa?: boolean
          loja_manutencao_aviso_ativo?: boolean
          loja_manutencao_aviso_mensagem?: string | null
          loja_manutencao_fim_programada?: string | null
          loja_manutencao_inicio_programada?: string | null
          loja_manutencao_mensagem?: string | null
          manutencao_ativa?: boolean | null
          manutencao_aviso_ativo?: boolean
          manutencao_aviso_mensagem?: string | null
          manutencao_aviso_publico?: string
          manutencao_fim_programada?: string | null
          manutencao_inicio_programada?: string | null
          manutencao_ips_permitidos?: string[] | null
          manutencao_mensagem?: string | null
          refresh_barber_required_at?: string | null
          refresh_client_required_at?: string | null
          ticket_ativo?: boolean
          ticket_webhook_url?: string | null
          updated_at?: string | null
          webhook_url?: string | null
          whatsapp_ativo?: boolean | null
          whatsapp_webhook_url?: string | null
        }
        Update: {
          ativo?: boolean | null
          confirmacao_ativo?: boolean
          confirmacao_webhook_url?: string | null
          created_at?: string | null
          disparo_ativo?: boolean | null
          disparo_webhook_url?: string | null
          id?: string
          lembrete_ativo?: boolean | null
          lembrete_webhook_url?: string | null
          loja_manutencao_ativa?: boolean
          loja_manutencao_aviso_ativo?: boolean
          loja_manutencao_aviso_mensagem?: string | null
          loja_manutencao_fim_programada?: string | null
          loja_manutencao_inicio_programada?: string | null
          loja_manutencao_mensagem?: string | null
          manutencao_ativa?: boolean | null
          manutencao_aviso_ativo?: boolean
          manutencao_aviso_mensagem?: string | null
          manutencao_aviso_publico?: string
          manutencao_fim_programada?: string | null
          manutencao_inicio_programada?: string | null
          manutencao_ips_permitidos?: string[] | null
          manutencao_mensagem?: string | null
          refresh_barber_required_at?: string | null
          refresh_client_required_at?: string | null
          ticket_ativo?: boolean
          ticket_webhook_url?: string | null
          updated_at?: string | null
          webhook_url?: string | null
          whatsapp_ativo?: boolean | null
          whatsapp_webhook_url?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          provider: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          api_key: string | null
          barbeiro_id: string
          connected_at: string | null
          connection_method: string | null
          created_at: string
          id: string
          instance_name: string | null
          pairing_code: string | null
          pairing_expires_at: string | null
          phone_number: string | null
          qrcode_base64: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          barbeiro_id: string
          connected_at?: string | null
          connection_method?: string | null
          created_at?: string
          id?: string
          instance_name?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          phone_number?: string | null
          qrcode_base64?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          barbeiro_id?: string
          connected_at?: string | null
          connection_method?: string | null
          created_at?: string
          id?: string
          instance_name?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          phone_number?: string | null
          qrcode_base64?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: true
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_signup_otp: {
        Row: {
          attempts: number
          code: string
          created_at: string
          expires_at: string
          id: string
          phone: string
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      whatsapp_verification_codes: {
        Row: {
          attempts: number | null
          code: string
          created_at: string
          expires_at: string
          id: string
          phone: string
          user_cpf: string | null
          user_email: string | null
          user_id: string
          user_name: string | null
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          attempts?: number | null
          code: string
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          user_cpf?: string | null
          user_email?: string | null
          user_id: string
          user_name?: string | null
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number | null
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          user_cpf?: string | null
          user_email?: string | null
          user_id?: string
          user_name?: string | null
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      woovi_charges: {
        Row: {
          agendamento_id: string | null
          barbeiro_id: string | null
          br_code: string | null
          charge_id: string | null
          correlation_id: string
          created_at: string
          id: string
          paid_at: string | null
          qr_code_image: string | null
          raw_response: Json | null
          refunded_at: string | null
          released_at: string | null
          status: string
          updated_at: string
          user_id: string | null
          value_centavos: number
        }
        Insert: {
          agendamento_id?: string | null
          barbeiro_id?: string | null
          br_code?: string | null
          charge_id?: string | null
          correlation_id: string
          created_at?: string
          id?: string
          paid_at?: string | null
          qr_code_image?: string | null
          raw_response?: Json | null
          refunded_at?: string | null
          released_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          value_centavos: number
        }
        Update: {
          agendamento_id?: string | null
          barbeiro_id?: string | null
          br_code?: string | null
          charge_id?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          qr_code_image?: string | null
          raw_response?: Json | null
          refunded_at?: string | null
          released_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          value_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "woovi_charges_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "woovi_charges_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "woovi_charges_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      barbeiro_rating_stats: {
        Row: {
          avg_rating: number | null
          barber_id: string | null
          ratings_count: number | null
        }
        Relationships: []
      }
      barbeiros_public: {
        Row: {
          apelido: string | null
          ativo: boolean | null
          foto_url: string | null
          id: string | null
          tenant_id: string | null
        }
        Insert: {
          apelido?: string | null
          ativo?: boolean | null
          foto_url?: string | null
          id?: string | null
          tenant_id?: string | null
        }
        Update: {
          apelido?: string | null
          ativo?: boolean | null
          foto_url?: string | null
          id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barbeiros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      efi_barbeiro_extrato: {
        Row: {
          barbeiro_id: string | null
          charge_id: string | null
          charge_status: string | null
          descricao: string | null
          paid_at: string | null
          payout_erro: string | null
          payout_id: string | null
          payout_status: string | null
          recebido_em: string | null
          repassado_em: string | null
          txid: string | null
          valor_recebido: number | null
          valor_repassado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "efi_pix_charges_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efi_pix_charges_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acumular_mensagem:
        | {
            Args: {
              p_instance_name: string
              p_mensagem: string
              p_numero: string
              p_session_id: string
              p_timestamp: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_instance_name: string
              p_mensagem: string
              p_message_id?: string
              p_numero: string
              p_session_id: string
              p_timestamp: string
            }
            Returns: undefined
          }
      add_wallet_credits: {
        Args: { p_amount: number; p_description?: string; p_user_id: string }
        Returns: number
      }
      admin_invalidar_indicacao: {
        Args: { p_indicacao_id: string; p_motivo: string }
        Returns: Json
      }
      apply_cupom: {
        Args: {
          p_agendamento_id: string
          p_codigo: string
          p_tenant_id: string
          p_user_id: string
          p_valor_base: number
        }
        Returns: {
          cupom_id: string
          motivo: string
          ok: boolean
          valor_descontado: number
        }[]
      }
      apurar_ciclo_indicacao: { Args: { p_ciclo_id: string }; Returns: string }
      assign_tenant_admin_role: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      auto_hide_old_cancelled_appointments: { Args: never; Returns: undefined }
      auto_suspend_expired_cash_subscriptions: {
        Args: never
        Returns: undefined
      }
      blank_barber_hours_if_untouched: {
        Args: { p_barbeiro_id: string }
        Returns: undefined
      }
      calcular_saldo_barbeiro: {
        Args: { p_barbeiro_id?: string; p_user_id: string }
        Returns: {
          saldo_disponivel: number
          saldo_processando: number
          total_depositos: number
          total_entradas: number
          total_saques: number
        }[]
      }
      check_barbeiro_email_exists: {
        Args: { p_email: string }
        Returns: boolean
      }
      check_cpf_available_for_barber: { Args: { p_cpf: string }; Returns: Json }
      check_email_exists: { Args: { p_email: string }; Returns: boolean }
      clean_expired_pending_bookings: { Args: never; Returns: undefined }
      clean_expired_reservas_loja: { Args: never; Returns: undefined }
      clean_expired_verification_codes: { Args: never; Returns: undefined }
      cleanup_old_logs: {
        Args: never
        Returns: {
          rows_deleted: number
          table_name: string
        }[]
      }
      confirmar_transacao: {
        Args: { p_efi_e2e_id: string; p_transacao_id: string }
        Returns: undefined
      }
      consume_available_redemptions_as_lost: {
        Args: {
          p_appointment_id?: string
          p_reason?: string
          p_user_id: string
        }
        Returns: Json
      }
      consumir_credito_indicacao: {
        Args: { p_agendamento_id: string }
        Returns: boolean
      }
      count_subscription_uses_in_cycle: {
        Args: {
          p_assinatura_id: string
          p_cycle_end: string
          p_cycle_start: string
        }
        Returns: number
      }
      create_barber_with_user: {
        Args: {
          p_apelido: string
          p_comissao_pct?: number
          p_email: string
          p_nome: string
          p_password: string
          p_telefone: string
        }
        Returns: Json
      }
      create_tenant_barber: {
        Args: {
          p_apelido: string
          p_comissao_pct?: number
          p_email: string
          p_nome: string
          p_telefone: string
        }
        Returns: Json
      }
      creditar_carteira: {
        Args: {
          p_barbeiro_id: string
          p_charge_id?: string
          p_descricao?: string
          p_valor: number
        }
        Returns: {
          carteira_id: string
          chave_pix: string
          pix_automatico_ativo: boolean
          saldo_anterior: number
          saldo_novo: number
          transacao_id: string
        }[]
      }
      criar_ciclo_indicacao: {
        Args: {
          p_data_fim?: string
          p_data_inicio?: string
          p_dia_fim_mes?: number
          p_dia_inicio_mes?: number
          p_tipo?: string
        }
        Returns: string
      }
      debitar_carteira: {
        Args: {
          p_barbeiro_id: string
          p_chave_pix_destino: string
          p_descricao?: string
          p_tipo: Database["public"]["Enums"]["transacao_tipo"]
          p_valor: number
        }
        Returns: {
          saldo_anterior: number
          saldo_novo: number
          transacao_id: string
        }[]
      }
      ensure_default_loyalty_promotion: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      ensure_tenant_barber: {
        Args: { p_apelido: string; p_user_id: string }
        Returns: string
      }
      format_phone_for_whatsapp: { Args: { phone: string }; Returns: string }
      generate_tenant_slug: { Args: { tenant_name: string }; Returns: string }
      gerar_referral_code: { Args: never; Returns: string }
      get_admin_banner_for_barber: {
        Args: { p_barbeiro_id: string }
        Returns: string
      }
      get_admin_dashboard_fast: {
        Args: { p_barbeiro_id?: string; p_tenant_id?: string }
        Returns: Json
      }
      get_all_lojas_stats: { Args: never; Returns: Json }
      get_assinatura_status: { Args: { p_user_id: string }; Returns: Json }
      get_barber_agenda_bundle: {
        Args: { p_barbeiro_id: string; p_data: string }
        Returns: Json
      }
      get_barber_app_context_fast: { Args: never; Returns: Json }
      get_barber_boot_bundle: { Args: never; Returns: Json }
      get_barber_dashboard_fast: {
        Args: { p_barbeiro_id: string }
        Returns: Json
      }
      get_barber_disparo_bundle: {
        Args: { p_barbeiro_id: string }
        Returns: Json
      }
      get_barber_home_bundle: { Args: { p_barbeiro_id: string }; Returns: Json }
      get_blocked_barber_ids: { Args: { p_user_id: string }; Returns: string[] }
      get_client_campaigns: { Args: { p_tenant_id?: string }; Returns: Json }
      get_client_home_bundle: { Args: never; Returns: Json }
      get_client_loyalty_for_barber_view: {
        Args: { p_barbeiro_id: string; p_user_id: string }
        Returns: {
          client_points: number
          required_points: number
        }[]
      }
      get_client_loyalty_required_points: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_cupom_pendente_obrigatorio: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: {
          auto_aplicar: boolean
          codigo: string
          descricao: string
          id: string
          tipo_desconto: string
          uso_obrigatorio: boolean
          valido_ate: string
          valor_desconto: number
        }[]
      }
      get_loja_stats_admin: { Args: { p_tenant_id: string }; Returns: Json }
      get_maintenance_status: {
        Args: never
        Returns: {
          manutencao_ativa: boolean
          manutencao_aviso_ativo: boolean
          manutencao_aviso_mensagem: string
          manutencao_aviso_publico: string
          manutencao_fim_programada: string
          manutencao_inicio_programada: string
          manutencao_mensagem: string
        }[]
      }
      get_maintenance_status_with_ips: {
        Args: never
        Returns: {
          manutencao_ativa: boolean
          manutencao_aviso_ativo: boolean
          manutencao_aviso_mensagem: string
          manutencao_fim_programada: string
          manutencao_inicio_programada: string
          manutencao_ips_permitidos: string[]
          manutencao_mensagem: string
        }[]
      }
      get_meus_indicados_info: {
        Args: never
        Returns: {
          email: string
          id: string
          nome: string
          telefone: string
        }[]
      }
      get_meus_pedidos_loja: { Args: { p_cliente_id: string }; Returns: Json }
      get_next_available_date: {
        Args: {
          p_barbeiro_id: string
          p_data_inicio: string
          p_dias_limite?: number
        }
        Returns: string
      }
      get_or_create_wallet_balance: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_plan_usage_for_barber_view: {
        Args: { p_barbeiro_id: string; p_user_id: string }
        Returns: {
          assinatura_id: string
          has_plan: boolean
          plan_limit: number
          used_count: number
        }[]
      }
      get_primary_tenant_whatsapp_instance: {
        Args: { p_tenant_id: string }
        Returns: {
          api_key: string
          barbeiro_id: string
          barbeiro_nome: string
          instance_name: string
          status: string
        }[]
      }
      get_store_maintenance_config: {
        Args: never
        Returns: {
          created_at: string
          loja_manutencao_ativa: boolean
          loja_manutencao_aviso_ativo: boolean
          loja_manutencao_aviso_mensagem: string
          loja_manutencao_fim_programada: string
          loja_manutencao_inicio_programada: string
          loja_manutencao_mensagem: string
          updated_at: string
        }[]
      }
      get_tenant_banners: {
        Args: { p_tenant_ids: string[] }
        Returns: {
          banner_url: string
          tenant_id: string
        }[]
      }
      get_tenant_pedidos_admin: { Args: { p_tenant_id: string }; Returns: Json }
      get_tenant_produtos_loja: {
        Args: { p_tenant_id: string }
        Returns: {
          categoria: string
          created_at: string
          descricao: string
          destaque: boolean
          estoque: number
          estoque_disponivel: number
          estoque_minimo: number
          id: string
          imagens: string[]
          nome: string
          preco: number
          preco_original: number
          tenant_id: string
        }[]
      }
      get_tenant_subscription_status: {
        Args: { p_tenant_id: string }
        Returns: {
          days_remaining: number
          is_active: boolean
          is_expired: boolean
          is_trial: boolean
          plano_nome: string
          preco_mensal: number
          status: string
          trial_end: string
        }[]
      }
      get_user_available_credits: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_loyalty_required_points: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_preferred_tenant_id: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      has_financial_pin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_barber_hours: {
        Args: { p_barbeiro_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_client_blocked_for_barber: {
        Args: {
          p_barbeiro_id: string
          p_client_user_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      is_client_blocked_from_barber: {
        Args: { p_barbeiro_id: string; p_user_id: string }
        Returns: boolean
      }
      is_device_authorized: {
        Args: { p_fingerprint: string }
        Returns: boolean
      }
      is_email_allowed_maintenance: {
        Args: { p_email: string }
        Returns: boolean
      }
      is_ip_allowed_maintenance: { Args: { p_ip: string }; Returns: boolean }
      is_tenant_owner_by_tenant: {
        Args: { p_tenant_id: string }
        Returns: boolean
      }
      mark_available_redemption_as_used: {
        Args: { p_appointment_id: string; p_reason?: string; p_user_id: string }
        Returns: Json
      }
      normalize_br_phone: { Args: { p_phone: string }; Returns: string }
      pix_signal_bank_opened: {
        Args: { p_charge_id: string }
        Returns: undefined
      }
      pix_signal_returned_to_app: {
        Args: { p_charge_id: string }
        Returns: undefined
      }
      profile_visible_to_tenant_admin: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      refresh_barber_home_snapshot: {
        Args: { p_barbeiro_id: string }
        Returns: undefined
      }
      refresh_client_home_snapshot: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      registrar_click_indicacao: {
        Args: { p_codigo: string; p_session_id: string }
        Returns: string
      }
      registrar_identidade_usada: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      registrar_indicacao: {
        Args: { p_codigo: string; p_indicado_id: string; p_session_id?: string }
        Returns: string
      }
      renovar_plano_cliente: {
        Args: { p_assinatura_id: string; p_forma_pagamento: string }
        Returns: Json
      }
      reverter_transacao_falha: {
        Args: { p_erro_mensagem: string; p_transacao_id: string }
        Returns: undefined
      }
      send_agendamento_whatsapp_webhook: {
        Args: { p_agendamento_id: string; p_kind: string; p_msg: string }
        Returns: number
      }
      set_financial_pin: {
        Args: { p_current_pin?: string; p_new_pin: string }
        Returns: boolean
      }
      store_create_order_with_reservations: {
        Args: {
          p_items: Json
          p_payment_method?: string
          p_reserve_minutes?: number
          p_user_id: string
        }
        Returns: {
          pedido_id: string
          reservation_expires_at: string
          valor_total: number
        }[]
      }
      store_expire_pending_orders: { Args: never; Returns: number }
      store_finalize_paid_order: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      store_get_sales_ranking: {
        Args: { p_limit?: number }
        Returns: {
          produto_id: string
          sold_qty: number
        }[]
      }
      use_credits_atomic: {
        Args: { p_amount: number; p_appointment_id: string; p_user_id: string }
        Returns: Json
      }
      user_has_active_redemption_appointment: {
        Args: { p_exclude_appointment_id?: string; p_user_id: string }
        Returns: boolean
      }
      validar_identidade_duplicada: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      validar_saque: {
        Args: { p_barbeiro_id: string; p_user_id: string; p_valor: number }
        Returns: {
          motivo: string
          permitido: boolean
          saldo_atual: number
        }[]
      }
      validate_barber_can_receive_pix: {
        Args: { p_barbeiro_id: string }
        Returns: boolean
      }
      validate_cupom: {
        Args: {
          p_codigo: string
          p_tenant_id: string
          p_user_id: string
          p_valor_base?: number
        }
        Returns: {
          cupom_id: string
          motivo: string
          tipo_desconto: string
          valido: boolean
          valor_descontado: number
          valor_desconto: number
          valor_final: number
        }[]
      }
      verificar_ciclos_para_apurar: { Args: never; Returns: number }
      verify_financial_pin: { Args: { p_pin: string }; Returns: boolean }
      woovi_blocked_centavos: { Args: { p_barbeiro: string }; Returns: number }
    }
    Enums: {
      app_role:
        | "admin"
        | "barber"
        | "cliente"
        | "ti"
        | "tenant_admin"
        | "unit_admin"
      appointment_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled_by_admin"
        | "cancelled_by_user"
        | "no_show"
        | "excluido"
      financial_entry_type: "income" | "expense"
      payment_method: "card" | "pix" | "cash" | "plano" | "fidelidade"
      payment_status: "pending" | "paid" | "failed" | "refunded" | "overdue"
      subscription_status:
        | "active"
        | "cancelled"
        | "past_due"
        | "suspended"
        | "pending_cash"
        | "pending_renewal"
      tenant_subscription_status:
        | "trialing"
        | "active"
        | "expired"
        | "cancelled"
        | "past_due"
      transacao_status:
        | "pendente"
        | "processando"
        | "concluida"
        | "falhou"
        | "estornada"
      transacao_tipo:
        | "entrada"
        | "saque_manual"
        | "saque_automatico"
        | "estorno"
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
        "admin",
        "barber",
        "cliente",
        "ti",
        "tenant_admin",
        "unit_admin",
      ],
      appointment_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled_by_admin",
        "cancelled_by_user",
        "no_show",
        "excluido",
      ],
      financial_entry_type: ["income", "expense"],
      payment_method: ["card", "pix", "cash", "plano", "fidelidade"],
      payment_status: ["pending", "paid", "failed", "refunded", "overdue"],
      subscription_status: [
        "active",
        "cancelled",
        "past_due",
        "suspended",
        "pending_cash",
        "pending_renewal",
      ],
      tenant_subscription_status: [
        "trialing",
        "active",
        "expired",
        "cancelled",
        "past_due",
      ],
      transacao_status: [
        "pendente",
        "processando",
        "concluida",
        "falhou",
        "estornada",
      ],
      transacao_tipo: [
        "entrada",
        "saque_manual",
        "saque_automatico",
        "estorno",
      ],
    },
  },
} as const
