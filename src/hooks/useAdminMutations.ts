/**
 * useAdminMutations.ts
 *
 * Todas as mutations do painel admin estão no padrão correto:
 * useMutation com update otimista, invalidação cirúrgica e rollback.
 *
 * Migração concluída em: 2026-03-11
 *
 * Edge Functions atômicas criadas nesta sessão:
 * - update-unit-barbers: delete + insert em barbeiro_unidades
 * - delete-unit: cascade em 4 tabelas para exclusão de unidade
 * - admin-cancel-appointments: cancelamento com crédito condicional e notificação
 *
 * Operações transacionais que usam Edge Functions existentes:
 * - useManualBooking: insert direto em agendamentos (fluxo encaixe manual)
 * - useConfirmarPagamentoPlano: invoca confirm-plan-payment + notificação
 *
 * Nota: AdminUnidades.loadData contém insert/update de sede (auto-sync de
 * inicialização, não mutation acionada por usuário — mantido intencionalmente).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/lib/queryKeys";

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════

interface Promocao {
  id: string;
  nome: string;
  descricao: string | null;
  pontos_necessarios: number;
  ativo: boolean;
  weekly_required: boolean;
}

interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: number;
  limite_agendamentos_mes: number | null;
  prioridade_agendamento: number | null;
  beneficios_json: string[] | null;
  ativo: boolean;
}

interface Cupom {
  id: string;
  code: string;
  nome: string | null;
  percent: number;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface HorarioExcepcional {
  id: string;
  data: string;
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  motivo: string | null;
}

// ═══════════════════════════════════════════════════════════
// PROMOÇÕES
// ═══════════════════════════════════════════════════════════

/** Toggle ativo/inativo de uma promoção */
export function useTogglePromocao(tenantId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.promocoes(tenantId);

  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("promocoes")
        .update({ ativo: !ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ativo }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Promocao[]>(queryKey);
      queryClient.setQueryData<Promocao[]>(queryKey, (old) =>
        old?.map((p) => (p.id === id ? { ...p, ativo: !ativo } : p)) ?? []
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Erro ao atualizar promoção");
    },
    onSuccess: (_data, { ativo }) => {
      toast.success(ativo ? "Promoção desativada" : "Promoção ativada");
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Excluir uma promoção */
export function useDeletePromocao(tenantId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.promocoes(tenantId);

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promocoes").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Promocao[]>(queryKey);
      queryClient.setQueryData<Promocao[]>(queryKey, (old) =>
        old?.filter((p) => p.id !== id) ?? []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Erro ao excluir promoção");
    },
    onSuccess: () => {
      toast.success("Promoção excluída com sucesso");
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Atualizar uma promoção (nome, descricao, pontos, weekly, ativo) */
export function useUpdatePromocao(tenantId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.promocoes(tenantId);

  return useMutation({
    mutationFn: async (updated: Partial<Promocao> & { id: string }) => {
      const { id, ...payload } = updated;
      const { error } = await supabase.from("promocoes").update(payload).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Promocao[]>(queryKey);
      queryClient.setQueryData<Promocao[]>(queryKey, (old) =>
        old?.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)) ?? []
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Erro ao atualizar promoção");
    },
    onSuccess: () => {
      toast.success("Promoção atualizada!");
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

// ═══════════════════════════════════════════════════════════
// PLANOS
// ═══════════════════════════════════════════════════════════

/** Salvar plano (criar ou atualizar) */
export function useSavePlano(tenantId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.planos(tenantId);

  return useMutation({
    mutationFn: async ({
      id,
      payload,
      servicoIds,
    }: {
      id: string | null;
      payload: Record<string, unknown>;
      /** IDs dos serviços vinculados ao plano (multi-seleção). Se omitido, não sincroniza. */
      servicoIds?: string[];
    }) => {
      let planoId = id;
      if (id) {
        const { error } = await supabase.from("planos").update(payload as never).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("planos")
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;
        planoId = (data as { id: string }).id;
      }

      // Sincroniza tabela de junção plano_servicos quando array foi informado
      if (servicoIds && planoId) {
        const { error: delErr } = await supabase
          .from("plano_servicos")
          .delete()
          .eq("plano_id", planoId);
        if (delErr) throw delErr;
        if (servicoIds.length > 0) {
          const rows = servicoIds.map((sid) => ({ plano_id: planoId!, servico_id: sid }));
          const { error: insErr } = await supabase
            .from("plano_servicos")
            .insert(rows as never);
          if (insErr) throw insErr;
        }
      }
    },
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Plano[]>(queryKey);
      if (id) {
        queryClient.setQueryData<Plano[]>(queryKey, (old) =>
          old?.map((p) => (p.id === id ? { ...p, ...(payload as Partial<Plano>) } : p)) ?? []
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Erro ao salvar plano");
    },
    onSuccess: (_data, { id }) => {
      toast.success(id ? "Plano atualizado com sucesso" : "Plano criado com sucesso");
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Excluir plano */
export function useDeletePlano(tenantId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.planos(tenantId);

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planos").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Plano[]>(queryKey);
      queryClient.setQueryData<Plano[]>(queryKey, (old) =>
        old?.filter((p) => p.id !== id) ?? []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Erro ao excluir plano");
    },
    onSuccess: () => {
      toast.success("Plano removido");
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

// ═══════════════════════════════════════════════════════════
// CUPONS
// ═══════════════════════════════════════════════════════════

/** Criar cupom */
export function useCreateCupom(tenantId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.cupons(tenantId);

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from("discount_coupons").insert([payload] as never);
      if (error) throw error;
    },
    onError: (err: Error) => {
      toast.error(err.message?.includes("unique") ? "Código já existe" : "Erro ao criar cupom");
    },
    onSuccess: () => {
      toast.success("Cupom criado com sucesso!");
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Atualizar cupom */
export function useUpdateCupom(tenantId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.cupons(tenantId);

  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { error } = await supabase.from("discount_coupons").update(payload as any).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Cupom[]>(queryKey);
      queryClient.setQueryData<Cupom[]>(queryKey, (old) =>
        old?.map((c) => (c.id === id ? { ...c, ...(payload as Partial<Cupom>) } : c)) ?? []
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Erro ao atualizar cupom");
    },
    onSuccess: () => {
      toast.success("Cupom atualizado!");
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Toggle ativo/inativo de cupom */
export function useToggleCupom(tenantId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.cupons(tenantId);

  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("discount_coupons").update({ active: !active }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, active }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Cupom[]>(queryKey);
      queryClient.setQueryData<Cupom[]>(queryKey, (old) =>
        old?.map((c) => (c.id === id ? { ...c, active: !active } : c)) ?? []
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Erro ao atualizar cupom");
    },
    onSuccess: (_data, { active }) => {
      toast.success(active ? "Cupom desativado" : "Cupom ativado");
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Excluir cupom */
export function useDeleteCupom(tenantId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.cupons(tenantId);

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("discount_coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Cupom[]>(queryKey);
      queryClient.setQueryData<Cupom[]>(queryKey, (old) =>
        old?.filter((c) => c.id !== id) ?? []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Erro ao remover cupom");
    },
    onSuccess: () => {
      toast.success("Cupom removido");
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

// ═══════════════════════════════════════════════════════════
// HORÁRIOS EXCEPCIONAIS
// ═══════════════════════════════════════════════════════════

/** Adicionar exceção de horário (global ou por barbeiro) */
export function useAddHorarioExcepcional() {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.horariosExcepcionais();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { escopo, barbeiro_id, unidade_ids, ...rest } = payload;

      if (escopo === 'barbeiro' && barbeiro_id) {
        // Grava na tabela individual do barbeiro
        const { data, error } = await supabase
          .from("horarios_excepcionais_barbeiro")
          .insert({ ...rest, barbeiro_id } as never)
          .select("id, barbeiro_id, data, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, motivo")
          .single();
        if (error) throw error;
        return data;
      }

      // Escopo "unidade" — uma exceção por unidade selecionada
      if (escopo === 'unidade' && Array.isArray(unidade_ids) && unidade_ids.length > 0) {
        const rows = (unidade_ids as string[]).map((uid) => ({ ...rest, unidade_id: uid }));
        const { data, error } = await supabase
          .from("horarios_excepcionais")
          .insert(rows as never)
          .select("id, data, unidade_id, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, motivo");
        if (error) throw error;
        return data;
      }

      // Escopo global — vale para todas as unidades (unidade_id NULL)
      const { data, error } = await supabase
        .from("horarios_excepcionais")
        .insert({ ...rest, unidade_id: null } as never)
        .select("id, data, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, motivo")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, payload) => {
      toast.success("Exceção de horário adicionada!");
      queryClient.invalidateQueries({ queryKey });
      // Invalida também o cache individual do barbeiro (usado pela nova tela unificada)
      if (payload.barbeiro_id) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.barbeiro.horariosExcepcionais(payload.barbeiro_id as string),
        });
      }
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === "23505") {
        toast.error("Já existe uma exceção para esta data nesta unidade");
      } else {
        toast.error("Erro ao adicionar exceção");
      }
    },
  });
}

/** Excluir exceção de horário (global ou por barbeiro) */
export function useDeleteHorarioExcepcional() {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.horariosExcepcionais();

  return useMutation({
    mutationFn: async ({ id, tipo }: { id: string; tipo: 'global' | 'barbeiro' }) => {
      const tabela = tipo === 'barbeiro'
        ? 'horarios_excepcionais_barbeiro'
        : 'horarios_excepcionais';
      const { error } = await supabase.from(tabela).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exceção removida");
      queryClient.invalidateQueries({ queryKey });
      // Invalida qualquer cache de barbeiro individual que possa estar ativo
      queryClient.invalidateQueries({ queryKey: ['barbeiro'], exact: false });
    },
    onError: () => {
      toast.error("Erro ao remover exceção");
    },
  });
}

// ═══════════════════════════════════════════════════════════
// UNIDADES
// ═══════════════════════════════════════════════════════════

/** Excluir unidade */
export function useDeleteUnidade(tenantId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = tenantId ? QUERY_KEYS.admin.unidades(tenantId) : ['admin', 'unidades'];

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenant_unidades").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: unknown) =>
        Array.isArray(old) ? old.filter((u: { id: string }) => u.id !== id) : old
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Erro ao excluir unidade");
    },
    onSuccess: () => {
      toast.success("Unidade excluída com sucesso");
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

// ═══════════════════════════════════════════════════════════
// BARBEIROS (gestão admin)
// ═══════════════════════════════════════════════════════════

interface Barbeiro {
  id: string;
  apelido: string;
  foto_url: string | null;
  comissao_pct: number | null;
  ativo: boolean | null;
  tenant_id: string | null;
  deleted_at: string | null;
  [key: string]: unknown;
}

/** Toggle ativo/inativo de um barbeiro */
export function useToggleBarberAtivo(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      barbeiroId,
      ativo,
    }: {
      barbeiroId: string;
      ativo: boolean;
    }) => {
      const { error } = await supabase
        .from("barbeiros")
        .update({ ativo })
        .eq("id", barbeiroId);
      if (error) throw error;
    },

    onMutate: async ({ barbeiroId, ativo }) => {
      const queryKey = QUERY_KEYS.admin.barbeiros(tenantId);
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<Barbeiro[]>(queryKey);
      queryClient.setQueryData<Barbeiro[]>(queryKey, (old) =>
        old?.map((b) => (b.id === barbeiroId ? { ...b, ativo } : b)) ?? []
      );
      return { snapshot };
    },

    onSuccess: (_, { barbeiroId, ativo }) => {
      // Invalida lista de barbeiros no admin
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.admin.barbeiros(tenantId),
      });
      // Impacto cruzado — invalida perfil no módulo do barbeiro
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.perfil(barbeiroId),
      });
      toast.success(`Barbeiro ${ativo ? "ativado" : "desativado"} com sucesso`);
    },

    onError: (err, _, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(
          QUERY_KEYS.admin.barbeiros(tenantId),
          context.snapshot
        );
      }
      toast.error("Erro ao alterar status do barbeiro. Tente novamente.");
      console.error("[useToggleBarberAtivo]", err);
    },
  });
}

/** Criar novo barbeiro vinculado ao tenant */
export function useCriarBarbeiro(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (novoBarbeiro: {
      apelido: string;
      foto_url?: string;
      comissao_pct: number;
      unidade_id?: string;
    }) => {
      const { data, error } = await supabase
        .from("barbeiros")
        .insert({ ...novoBarbeiro, tenant_id: tenantId, ativo: true })
        .select("id, apelido, foto_url, comissao_pct, ativo")
        .single();
      if (error) throw error;
      return data;
    },

    // Criação não tem update otimista — ID gerado pelo banco
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.admin.barbeiros(tenantId),
      });
      toast.success("Barbeiro criado com sucesso");
    },

    onError: (err) => {
      toast.error("Erro ao criar barbeiro. Verifique os dados e tente novamente.");
      console.error("[useCriarBarbeiro]", err);
    },
  });
}

/**
 * Soft-delete completo de barbeiro com cascade:
 * 2. Remove dados vinculados (horários, comissões, avaliações, tokens)
 * 3. Cancela agendamentos futuros pendentes/confirmados
 * 4. Desvincula agendamentos passados
 * 5. Soft-delete (marca deleted_at, desativa, limpa wallet)
 */
export function useDeletarBarbeiro(tenantId: string) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.barbeiros(tenantId);

  return useMutation({
    mutationFn: async (barbeiroId: string) => {
      // 1. Cascade: remover dados vinculados
      await supabase.from("horarios_excepcionais_barbeiro").delete().eq("barbeiro_id", barbeiroId);
      await supabase.from("configuracoes_horario_barbeiro").delete().eq("barbeiro_id", barbeiroId);
      await supabase.from("comissoes").delete().eq("barbeiro_id", barbeiroId);
      await supabase.from("barbeiro_google_tokens").delete().eq("barbeiro_id", barbeiroId);
      await supabase.from("barbeiro_avaliacoes").delete().eq("barber_id", barbeiroId);

      // 2. Cancelar agendamentos futuros
      const today = new Date().toISOString().split("T")[0];
      await supabase
        .from("agendamentos")
        .update({ status: "cancelled_by_admin" as any })
        .eq("barbeiro_id", barbeiroId)
        .in("status", ["pending", "confirmed"])
        .gte("data", today);

      // 3. Desvincular agendamentos passados
      await supabase
        .from("agendamentos")
        .update({ barbeiro_id: null })
        .eq("barbeiro_id", barbeiroId);

      // 4. Soft-delete final
      const { error } = await supabase
        .from("barbeiros")
        .update({
          deleted_at: new Date().toISOString(),
          ativo: false,
        })
        .eq("id", barbeiroId);

      if (error) throw error;
    },

    onMutate: async (barbeiroId) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<Barbeiro[]>(queryKey);
      // Remove otimisticamente da lista
      queryClient.setQueryData<Barbeiro[]>(queryKey, (old) =>
        old?.filter((b) => b.id !== barbeiroId) ?? []
      );
      return { snapshot };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(
        "Barbeiro removido. Ele terá acesso por mais 7 dias para resolver pendências financeiras."
      );
    },

    onError: (err, _, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(queryKey, context.snapshot);
      }
      toast.error("Erro ao remover barbeiro. Tente novamente.");
      console.error("[useDeletarBarbeiro]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// SERVIÇOS
// ═══════════════════════════════════════════════════════════

interface Servico {
  id: string;
  nome: string;
  preco: number;
  duracao: number;
  ativo: boolean;
  descricao: string | null;
  categoria_id: string | null;
  [key: string]: unknown;
}

/** Criar novo serviço vinculado ao tenant */
export function useCriarServico(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (novoServico: {
      nome: string;
      preco: number;
      duracao: number;
      categoria_id?: string;
      descricao?: string;
    }) => {
      const payload = {
        nome: novoServico.nome,
        preco: novoServico.preco,
        duracao_minutos: novoServico.duracao,
        ...(novoServico.descricao ? { descricao: novoServico.descricao } : {}),
        tenant_id: tenantId,
        ativo: true,
      };
      const { data, error } = await supabase
        .from("servicos")
        .insert(payload)
        .select("id, nome, preco, duracao_minutos, ativo")
        .single();
      if (error) throw error;
      return data;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.admin.servicos(tenantId),
      });
      toast.success("Serviço criado com sucesso");
    },

    onError: (err) => {
      toast.error("Erro ao criar serviço. Verifique os dados e tente novamente.");
      console.error("[useCriarServico]", err);
    },
  });
}

/** Editar serviço existente com update otimista */
export function useEditarServico(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      servicoId,
      dados,
    }: {
      servicoId: string;
      dados: Partial<{
        nome: string;
        preco: number;
        duracao: number;
        descricao: string;
        ativo: boolean;
      }>;
    }) => {
      const { error } = await supabase
        .from("servicos")
        .update(dados as any)
        .eq("id", servicoId);
      if (error) throw error;
    },

    onMutate: async ({ servicoId, dados }) => {
      const queryKey = QUERY_KEYS.admin.servicos(tenantId);
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<Servico[]>(queryKey);
      queryClient.setQueryData<Servico[]>(queryKey, (old) =>
        old?.map((s) => (s.id === servicoId ? { ...s, ...dados } : s)) ?? []
      );
      return { snapshot };
    },

    onSuccess: (_, { dados }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.admin.servicos(tenantId),
      });
      // Serviço desativado impacta opções de agendamento
      if (dados.ativo === false) {
        queryClient.invalidateQueries({
          queryKey: ["shared", "servicos-agendamento", tenantId],
        });
      }
      toast.success("Serviço atualizado com sucesso");
    },

    onError: (err, _, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(
          QUERY_KEYS.admin.servicos(tenantId),
          context.snapshot
        );
      }
      toast.error("Erro ao atualizar serviço. Tente novamente.");
      console.error("[useEditarServico]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// HORÁRIOS DE FUNCIONAMENTO
// ═══════════════════════════════════════════════════════════

interface HorarioFuncionamento {
  id?: string;
  dia_semana: number;
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  aberto: boolean;
  [key: string]: unknown;
}

/** Salvar (upsert) horário de funcionamento do tenant */
export function useSalvarHorarioAdmin(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (horario: {
      dia_semana: number;
      hora_abertura: string;
      hora_fechamento: string;
      hora_almoco_inicio?: string;
      hora_almoco_fim?: string;
      aberto: boolean;
    }) => {
      const payload = {
        aberto: horario.aberto,
        hora_abertura: horario.hora_abertura,
        hora_fechamento: horario.hora_fechamento,
        hora_almoco_inicio: horario.hora_almoco_inicio || null,
        hora_almoco_fim: horario.hora_almoco_fim || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("configuracoes_horario_unidade" as any)
        .update(payload)
        .eq("tenant_id", tenantId)
        .eq("dia_semana", horario.dia_semana)
        .select();
      if (error) throw error;
      if (!data || (data as any[]).length === 0) {
        const { error: insErr } = await supabase
          .from("configuracoes_horario_unidade" as any)
          .insert({
            tenant_id: tenantId,
            dia_semana: horario.dia_semana,
            ...payload,
          });
        if (insErr) throw insErr;
      }
    },

    onMutate: async (horario) => {
      const queryKey = QUERY_KEYS.admin.horarios(tenantId);
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<HorarioFuncionamento[]>(queryKey);
      queryClient.setQueryData<HorarioFuncionamento[]>(queryKey, (old) =>
        old?.map((h) =>
          h.dia_semana === horario.dia_semana ? { ...h, ...horario } : h
        ) ?? []
      );
      return { snapshot };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.admin.horarios(tenantId),
      });
      toast.success("Horário salvo com sucesso");
    },

    onError: (err, _, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(
          QUERY_KEYS.admin.horarios(tenantId),
          context.snapshot
        );
      }
      toast.error("Erro ao salvar horário. Tente novamente.");
      console.error("[useSalvarHorarioAdmin]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// CLIENTES (gestão admin)
// ═══════════════════════════════════════════════════════════

/** Bloquear/desbloquear cliente no tenant */
export function useToggleClienteBloqueado(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clienteId,
      bloqueado,
    }: {
      clienteId: string;
      bloqueado: boolean;
    }) => {
      const { error } = await supabase
        .from("tenant_clientes")
        .update({ blocked: bloqueado })
        .eq("user_id", clienteId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },

    onMutate: async ({ clienteId, bloqueado }) => {
      await queryClient.cancelQueries({
        queryKey: QUERY_KEYS.admin.clientes(tenantId, 0),
      });

      const snapshot = queryClient.getQueryData(
        QUERY_KEYS.admin.clientes(tenantId, 0)
      );

      // Atualiza o campo `blocked` na lista paginada
      queryClient.setQueryData(
        QUERY_KEYS.admin.clientes(tenantId, 0),
        (paginaAtual: any) => ({
          ...paginaAtual,
          clientes: paginaAtual?.clientes?.map((c: any) =>
            c.id === clienteId ? { ...c, blocked: bloqueado } : c
          ),
        })
      );

      return { snapshot };
    },

    onSuccess: (_, { bloqueado }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.admin.clientes(tenantId, 0),
      });
      toast.success(
        `Cliente ${bloqueado ? "bloqueado" : "desbloqueado"} com sucesso`
      );
    },

    onError: (err, _, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(
          QUERY_KEYS.admin.clientes(tenantId, 0),
          context.snapshot
        );
      }
      toast.error("Erro ao alterar status do cliente. Tente novamente.");
      console.error("[useToggleClienteBloqueado]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// PLANOS (toggle ativo)
// ═══════════════════════════════════════════════════════════

/** Ativar/desativar plano */
export function useTogglePlanoAtivo(tenantId: string) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.planos(tenantId);

  return useMutation({
    mutationFn: async ({
      planoId,
      ativo,
    }: {
      planoId: string;
      ativo: boolean;
    }) => {
      const { error } = await supabase
        .from("planos")
        .update({ ativo })
        .eq("id", planoId);
      if (error) throw error;
    },

    onMutate: async ({ planoId, ativo }) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<Plano[]>(queryKey);
      queryClient.setQueryData<Plano[]>(queryKey, (old) =>
        old?.map((p) => (p.id === planoId ? { ...p, ativo } : p)) ?? []
      );
      return { snapshot };
    },

    onSuccess: (_, { ativo }) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(`Plano ${ativo ? "ativado" : "desativado"} com sucesso`);
    },

    onError: (err, _, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(queryKey, context.snapshot);
      }
      toast.error("Erro ao alterar status do plano. Tente novamente.");
      console.error("[useTogglePlanoAtivo]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// CUPONS (criação dedicada — complementa useCreateCupom existente)
// ═══════════════════════════════════════════════════════════

/** Criar cupom de desconto com campos tipados */
export function useCriarCupomAdmin(tenantId: string) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.cupons(tenantId);

  return useMutation({
    mutationFn: async (novoCupom: {
      code: string;
      percent: number;
      starts_at?: string;
      expires_at?: string;
      nome?: string;
    }) => {
      const { data, error } = await supabase
        .from("discount_coupons")
        .insert({
          code: novoCupom.code,
          percent: novoCupom.percent,
          starts_at: novoCupom.starts_at ?? null,
          expires_at: novoCupom.expires_at ?? null,
          nome: novoCupom.nome ?? null,
          tenant_id: tenantId,
          active: true,
        })
        .select("id, code, percent, starts_at, expires_at, active")
        .single();
      if (error) throw error;
      return data;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Cupom criado com sucesso");
    },

    onError: (err: Error) => {
      toast.error(
        err.message?.includes("unique")
          ? "Código já existe"
          : "Erro ao criar cupom. Verifique os dados e tente novamente."
      );
      console.error("[useCriarCupomAdmin]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// CLIENTES (bloqueio global — profiles)
// ═══════════════════════════════════════════════════════════

/** Bloquear/desbloquear cliente globalmente (tabela profiles) */
export function useToggleClienteBloqueadoGlobal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clienteId,
      blocked,
    }: {
      clienteId: string;
      blocked: boolean;
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ blocked })
        .eq("id", clienteId);
      if (error) throw error;
    },

    onSuccess: (_, { blocked }) => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "clientes-global"],
      });
      toast.success(
        `Cliente ${blocked ? "bloqueado" : "desbloqueado"} globalmente`
      );
    },

    onError: (err) => {
      toast.error("Erro ao alterar status do cliente. Tente novamente.");
      console.error("[useToggleClienteBloqueadoGlobal]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// SERVIÇOS — Exclusão
// ═══════════════════════════════════════════════════════════

/** Excluir serviço com update otimista */
export function useDeletarServico(tenantId: string) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.servicos(tenantId);

  return useMutation({
    mutationFn: async (servicoId: string) => {
      const { error } = await supabase
        .from("servicos")
        .delete()
        .eq("id", servicoId);
      if (error) throw error;
    },

    onMutate: async (servicoId) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<Servico[]>(queryKey);
      queryClient.setQueryData<Servico[]>(queryKey, (old) =>
        old?.filter((s) => s.id !== servicoId) ?? []
      );
      return { snapshot };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      // Serviço removido impacta opções de agendamento
      queryClient.invalidateQueries({
        queryKey: ["shared", "servicos-agendamento", tenantId],
      });
      toast.success("Serviço removido");
    },

    onError: (err, _, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(queryKey, context.snapshot);
      }
      toast.error("Erro ao excluir serviço. Tente novamente.");
      console.error("[useDeletarServico]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// UNIDADES — Toggle ativo
// ═══════════════════════════════════════════════════════════

interface Unidade {
  id: string;
  ativo: boolean;
  [key: string]: unknown;
}

/** Ativar/desativar unidade com update otimista */
export function useToggleUnidadeAtiva(tenantId: string) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.unidades(tenantId);

  return useMutation({
    mutationFn: async ({
      unidadeId,
      ativo,
    }: {
      unidadeId: string;
      ativo: boolean;
    }) => {
      const { error } = await supabase
        .from("tenant_unidades")
        .update({ ativo })
        .eq("id", unidadeId);
      if (error) throw error;
    },

    onMutate: async ({ unidadeId, ativo }) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: unknown) =>
        Array.isArray(old)
          ? old.map((u: Unidade) =>
              u.id === unidadeId ? { ...u, ativo } : u
            )
          : old
      );
      return { snapshot };
    },

    onSuccess: (_, { ativo }) => {
      // Invalida lista de unidades no admin
      queryClient.invalidateQueries({ queryKey });
      // Impacto cruzado: unidade inativa afeta barbeiros disponíveis para agendamento
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.admin.barbeiros(tenantId),
      });
      queryClient.invalidateQueries({
        queryKey: ["shared", "unidades", tenantId],
      });
      toast.success(`Unidade ${ativo ? "ativada" : "desativada"}`);
    },

    onError: (err, _, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(queryKey, context.snapshot);
      }
      toast.error("Erro ao alterar status da unidade. Tente novamente.");
      console.error("[useToggleUnidadeAtiva]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// PROMOÇÕES — Criação (IA ou manual)
// ═══════════════════════════════════════════════════════════

/** Criar promoção (sem update otimista — ID gerado pelo banco) */
export function useCriarPromocao(tenantId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.promocoes(tenantId);

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from("promocoes")
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Promoção criada e ativada!");
    },

    onError: (err) => {
      toast.error("Erro ao criar promoção. Tente novamente.");
      console.error("[useCriarPromocao]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// PERFIL ADMIN — Banner
// ═══════════════════════════════════════════════════════════

/** Atualizar banner_url do perfil admin (pós-upload) */
export function useAtualizarBannerAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      bannerUrl,
    }: {
      userId: string;
      bannerUrl: string;
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ banner_url: bannerUrl } as any)
        .eq("id", userId);
      if (error) throw error;
    },

    onSuccess: () => {
      // Invalida perfil para refletir novo banner em todas as telas
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Banner atualizado!");
    },

    onError: (err) => {
      toast.error("Erro ao atualizar banner");
      console.error("[useAtualizarBannerAdmin]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// DISPAROS — Exclusão
// ═══════════════════════════════════════════════════════════

/** Deletar disparo programado */
export function useDeletarDisparo(tenantId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (disparoId: string) => {
      const { error } = await supabase
        .from("disparos_programados")
        .delete()
        .eq("id", disparoId);
      if (error) throw error;
    },

    onSuccess: () => {
      // Invalida lista de disparos programados
      if (tenantId) {
        queryClient.invalidateQueries({
          queryKey: ["disparos-programados", tenantId],
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["disparos-programados"],
      });
      toast.success("Disparo cancelado");
    },

    onError: (err) => {
      toast.error("Erro ao cancelar disparo");
      console.error("[useDeletarDisparo]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// UNIDADE — SALVAR DADOS GERAIS
// ═══════════════════════════════════════════════════════════

interface UnidadeDadosPayload {
  unidadeId: string;
  nome: string;
  slogan: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  site: string | null;
}

export function useSalvarDadosUnidade(tenantId: string) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.unidades(tenantId);

  return useMutation({
    mutationFn: async (payload: UnidadeDadosPayload) => {
      const { error } = await supabase
        .from("tenant_unidades")
        .update({
          nome: payload.nome,
          slogan: payload.slogan,
          email: payload.email,
          telefone: payload.telefone,
          whatsapp: payload.whatsapp,
          site: payload.site,
        })
        .eq("id", payload.unidadeId);
      if (error) throw error;
    },

    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) =>
        old?.map((u: any) =>
          u.id === payload.unidadeId
            ? { ...u, nome: payload.nome, slogan: payload.slogan, email: payload.email, telefone: payload.telefone, whatsapp: payload.whatsapp, site: payload.site }
            : u
        )
      );
      return { snapshot };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Dados atualizados!");
    },

    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      toast.error("Erro ao salvar dados");
      console.error("[useSalvarDadosUnidade]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// UNIDADE — SALVAR ENDEREÇO
// ═══════════════════════════════════════════════════════════

interface UnidadeEnderecoPayload {
  unidadeId: string;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
}

export function useSalvarEnderecoUnidade(tenantId: string) {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.unidades(tenantId);

  return useMutation({
    mutationFn: async (payload: UnidadeEnderecoPayload) => {
      const { error } = await supabase
        .from("tenant_unidades")
        .update({
          cep: payload.cep,
          rua: payload.rua,
          numero: payload.numero,
          complemento: payload.complemento,
          bairro: payload.bairro,
          cidade: payload.cidade,
          estado: payload.estado,
        })
        .eq("id", payload.unidadeId);
      if (error) throw error;
    },

    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) =>
        old?.map((u: any) =>
          u.id === payload.unidadeId
            ? { ...u, cep: payload.cep, rua: payload.rua, numero: payload.numero, complemento: payload.complemento, bairro: payload.bairro, cidade: payload.cidade, estado: payload.estado }
            : u
        )
      );
      return { snapshot };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Endereço atualizado!");
    },

    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      toast.error("Erro ao salvar endereço");
      console.error("[useSalvarEnderecoUnidade]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// ENCAIXE MANUAL — Insert direto em agendamentos
// ═══════════════════════════════════════════════════════════

interface ManualBookingPayload {
  userId: string;
  servicoId: string;
  data: string;
  hora: string;
  duracao: number;
  preco: number;
  observacoes: string | null;
  barbeiroId: string;
  clienteNome?: string | null;
  paymentMethod?: string;
  isFree?: boolean;
}

// ═══════════════════════════════════════════════════════════
// UNIDADES — Salvar barbeiros vinculados (Edge Function)
// ═══════════════════════════════════════════════════════════

interface SalvarBarbeirosUnidadePayload {
  unidadeId: string;
  barbeiroIds: string[];
}

export function useSalvarBarbeirosUnidade(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SalvarBarbeirosUnidadePayload) => {
      const { data, error } = await supabase.functions.invoke(
        "update-unit-barbers",
        { body: { unidadeId: params.unidadeId, barbeiroIds: params.barbeiroIds } }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },

    onSuccess: () => {
      // Invalida lista de unidades (que inclui barber_count)
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.admin.unidades(tenantId),
      });
      toast.success("Barbeiros atualizados!");
    },

    onError: (err: any) => {
      console.error("[useSalvarBarbeirosUnidade]", err);
      toast.error("Erro ao salvar barbeiros da unidade");
    },
  });
}
// ═══════════════════════════════════════════════════════════
// UNIDADES — Deletar unidade com cascade (Edge Function)
// ═══════════════════════════════════════════════════════════

export function useDeletarUnidade(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (unidadeId: string) => {
      const { data, error } = await supabase.functions.invoke(
        "delete-unit",
        { body: { unidadeId } }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },

    onSuccess: () => {
      // Invalida lista de unidades
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.admin.unidades(tenantId),
      });
      toast.success("Unidade excluída com sucesso!");
    },

    onError: (err: any) => {
      console.error("[useDeletarUnidade]", err);
      toast.error(
        err?.message?.includes("foreign")
          ? "Não foi possível excluir: existem registros vinculados a esta unidade."
          : "Erro ao excluir unidade"
      );
    },
  });
}

// ═══════════════════════════════════════════════════════════
// UNIDADES — Criar nova unidade + vincular barbeiros
// ═══════════════════════════════════════════════════════════

interface CriarUnidadePayload {
  tenantId: string;
  nome: string;
  slogan?: string | null;
  email?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  site?: string | null;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  barbeiroIds?: string[];
}

export function useCriarUnidade(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CriarUnidadePayload) => {
      // Passo 1 — Cria a unidade
      const { data: newUnidade, error: unidadeError } = await supabase
        .from("tenant_unidades")
        .insert({
          tenant_id: params.tenantId,
          nome: params.nome.trim(),
          slogan: params.slogan || null,
          email: params.email || null,
          telefone: params.telefone || null,
          whatsapp: params.whatsapp || null,
          site: params.site || null,
          cep: params.cep || null,
          rua: params.rua || null,
          numero: params.numero || null,
          complemento: params.complemento || null,
          bairro: params.bairro || null,
          cidade: params.cidade || null,
          estado: params.estado || null,
          ativo: true,
          is_sede: false,
        })
        .select("id")
        .single();

      if (unidadeError) throw unidadeError;

      // Passo 2 — Vincula barbeiros via Edge Function (se houver)
      if (params.barbeiroIds && params.barbeiroIds.length > 0) {
        const { data, error } = await supabase.functions.invoke(
          "update-unit-barbers",
          { body: { unidadeId: newUnidade.id, barbeiroIds: params.barbeiroIds } }
        );
        if (error) {
          console.error("[useCriarUnidade] link barbers error:", error);
          toast.error("Unidade criada, mas houve erro ao vincular barbeiros.");
        }
        if (data?.error) {
          console.error("[useCriarUnidade] link barbers data error:", data.error);
          toast.error("Unidade criada, mas houve erro ao vincular barbeiros.");
        }
      }

      return newUnidade;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.admin.unidades(tenantId),
      });
      toast.success("Unidade criada com sucesso!");
    },

    onError: (err: any) => {
      console.error("[useCriarUnidade]", err);
      toast.error("Erro ao criar unidade");
    },
  });
}

// ═══════════════════════════════════════════════════════════
// AGENDAMENTOS — Encaixe manual
// ═══════════════════════════════════════════════════════════

export function useManualBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ManualBookingPayload) => {
      const isPlano = params.paymentMethod === "plano" || params.isFree === true;
      const { error } = await supabase
        .from("agendamentos")
        .insert({
          user_id: params.userId,
          servico_id: params.servicoId,
          data: params.data,
          hora: params.hora + ":00",
          duracao: params.duracao,
          preco: isPlano ? 0 : params.preco,
          status: "confirmed" as any,
          barbeiro_confirmou: true,
          cliente_confirmou: true,
          observacoes: params.observacoes,
          tipo_agendamento: "encaixe_manual",
          criado_por: "barbeiro",
          payment_method: params.paymentMethod || "cash",
          is_free: params.isFree ?? isPlano,
          barbeiro_id: params.barbeiroId,
          cliente_nome: params.clienteNome || null,
        });
      if (error) throw error;
    },

    onSuccess: (_, params) => {
      // Invalida agenda do barbeiro afetado
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.agenda(params.barbeiroId, params.data),
      });
      // Invalida timeline admin do dia
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.admin.timeline(params.data),
      });
      // Invalida planos e clientes
      queryClient.invalidateQueries({ queryKey: ["barber-clientes"] });
      queryClient.invalidateQueries({ queryKey: ["assinatura-status"] });
      queryClient.invalidateQueries({ queryKey: ["client-active-subscription"] });
      toast.success(params.paymentMethod === "plano" ? "✅ Encaixe registrado no plano!" : "✅ Encaixe criado com sucesso!");
    },

    onError: (err: any) => {
      let errorMessage = "Erro ao criar encaixe. Tente novamente.";

      if (err.message?.includes("Timeout")) {
        errorMessage = "Operação demorou muito. Verifique sua conexão e tente novamente.";
      } else if (err.message?.includes("foreign key") || err.message?.includes("profiles_id_fkey")) {
        errorMessage = "Erro de referência de cliente. Por favor, selecione um cliente da lista.";
      } else if (err.message) {
        errorMessage = err.message;
      }

      toast.error(errorMessage);
      console.error("[useManualBooking]", err);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// CANCELAMENTO DE AGENDAMENTOS (via Edge Function)
// ═══════════════════════════════════════════════════════════

interface CancelarAgendamentoParams {
  appointmentIds: string[];
  reason: string;
}

/**
 * Cancelamento individual de agendamento pelo admin.
 * Envolve um único appointmentId passado como array de 1.
 */
export function useCancelarAgendamentoAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CancelarAgendamentoParams) => {
      const { data, error } = await supabase.functions.invoke(
        "admin-cancel-appointments",
        { body: { appointmentIds: params.appointmentIds, reason: params.reason } }
      );
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Erro ao cancelar");
      return data;
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["barbeiro"] });
      const credits = data?.data?.credits || 0;
      if (credits > 0) {
        toast.success("Agendamento cancelado. Crédito gerado para o cliente.");
      } else {
        toast.success("Agendamento cancelado e cliente notificado.");
      }
    },

    onError: (err: any) => {
      console.error("[useCancelarAgendamentoAdmin]", err);
      toast.error(err?.message || "Erro ao cancelar agendamento.");
    },
  });
}

/**
 * Cancelamento em massa de agendamentos pelo admin.
 * Sem update otimista — volume pode ser grande.
 */
export function useCancelarTodosAgendamentos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CancelarAgendamentoParams) => {
      const { data, error } = await supabase.functions.invoke(
        "admin-cancel-appointments",
        { body: { appointmentIds: params.appointmentIds, reason: params.reason } }
      );
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Erro ao cancelar");
      return data;
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["barbeiro"] });
      const cancelled = data?.data?.cancelled || 0;
      const credits = data?.data?.credits || 0;
      toast.success(
        `✅ ${cancelled} agendamento(s) cancelado(s)${credits > 0 ? `. ${credits} crédito(s) gerado(s).` : ". Clientes notificados."}`,
        { duration: 5000 }
      );
    },

    onError: (err: any) => {
      console.error("[useCancelarTodosAgendamentos]", err);
      toast.error(err?.message || "Erro ao cancelar agendamentos em massa.");
    },
  });
}

// ═══════════════════════════════════════════════════════════
// CONFIRMAÇÃO DE PAGAMENTO DE PLANO
// ═══════════════════════════════════════════════════════════

interface ConfirmarPagamentoPlanoParams {
  assinaturaId: string;
  userId: string;
  planoNome: string;
  formaPagamento?: string;
}

/**
 * Confirma pagamento de assinatura de plano (dinheiro, PIX ou cartão).
 * 1. Invoca confirm-plan-payment Edge Function
 * 2. Insere notificação para o cliente (fire-and-forget, não bloqueia)
 */
export function useConfirmarPagamentoPlano() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ConfirmarPagamentoPlanoParams) => {
      // Passo 1 — Confirmar pagamento via Edge Function
      const { data, error } = await supabase.functions.invoke("confirm-plan-payment", {
        body: {
          assinaturaId: params.assinaturaId,
          formaPagamento: params.formaPagamento,
        },
      });
      if (error) throw new Error(`Falha ao confirmar pagamento: ${error.message}`);
      if (data?.error) throw new Error(data.error);

      // Passo 2 — Notificação (não bloqueia em caso de falha)
      const { error: notifError } = await supabase.from("notificacoes").insert({
        user_id: params.userId,
        titulo: "Plano Ativado! 🎉",
        mensagem: `Seu plano ${params.planoNome} foi ativado com sucesso! Agora você pode agendar seus cortes pelo app.`,
        tipo: "geral",
        lida: false,
      });

      if (notifError) {
        console.error("[useConfirmarPagamentoPlano] Erro ao criar notificação:", notifError);
      }

      return data;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["barbeiro"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-clientes"] });
      queryClient.invalidateQueries({ queryKey: ["client-subscription-detail"] });
      toast.success("Pagamento confirmado! Plano ativado.");
    },

    onError: (err: any) => {
      console.error("[useConfirmarPagamentoPlano]", err);
      toast.error(err?.message || "Erro ao confirmar pagamento do plano.");
    },
  });
}
