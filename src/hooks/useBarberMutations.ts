import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { toast } from "sonner";
import type { BarberClientesResult, BlockDetail } from "@/hooks/useBarberClientes";

/**
 * ═══════════════════════════════════════════════════════════
 * BARBER MUTATIONS — Updates otimistas + rollback automático
 * ═══════════════════════════════════════════════════════════
 *
 * Centraliza todas as mutações dos componentes do barbeiro.
 * Cada mutation segue o padrão:
 * 1. onMutate: cancela refetches, salva snapshot, aplica update otimista
 * 2. onSuccess: invalida apenas queries afetadas (cirúrgico)
 * 3. onError: reverte para snapshot e mostra toast de erro
 */

// ─── BLOCK / UNBLOCK CLIENT ─────────────────────────────
type BlockScope = "barber" | "unit" | "tenant";

interface BlockClientParams {
  clientId: string;
  tenantId: string;
  barbeiroId: string;
  blockedByUserId: string;
  scope: BlockScope;
  /** IDs das unidades — obrigatório quando scope='unit' */
  unidadesIds?: string[];
}

interface UnblockClientParams {
  clientId: string;
  tenantId: string;
  barbeiroId: string;
}

/**
 * Bloquear cliente com escopo granular:
 *  - barber: apenas para este barbeiro
 *  - unit:   para uma ou mais unidades
 *  - tenant: barbearia inteira (remove bloqueios parciais antes)
 */
export function useBlockClient() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, BlockClientParams, { snapshot: BarberClientesResult | undefined }>({
    mutationFn: async ({ clientId, tenantId, barbeiroId, blockedByUserId, scope, unidadesIds }) => {
      if (scope === "barber") {
        const { error } = await supabase
          .from("client_booking_blocks")
          .insert({
            tenant_id: tenantId,
            client_user_id: clientId,
            scope: "barber",
            barbeiro_id: barbeiroId,
            blocked_by_user_id: blockedByUserId,
          });
        if (error && error.code !== "23505") throw error;

      } else if (scope === "unit" && unidadesIds?.length) {
        const rows = unidadesIds.map((uid) => ({
          tenant_id: tenantId,
          client_user_id: clientId,
          scope: "unit" as const,
          unidade_id: uid,
          barbeiro_id: null,
          blocked_by_user_id: blockedByUserId,
        }));
        const { error } = await supabase.from("client_booking_blocks").insert(rows);
        if (error && error.code !== "23505") throw error;

      } else if (scope === "tenant") {
        // Remover bloqueios parciais existentes antes do global
        await supabase
          .from("client_booking_blocks")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("client_user_id", clientId)
          .neq("scope", "tenant");

        const { error } = await supabase
          .from("client_booking_blocks")
          .insert({
            tenant_id: tenantId,
            client_user_id: clientId,
            scope: "tenant",
            barbeiro_id: null,
            unidade_id: null,
            blocked_by_user_id: blockedByUserId,
          });
        if (error && error.code !== "23505") throw error;
      }
    },

    onMutate: async ({ clientId, barbeiroId }) => {
      const key = QUERY_KEYS.barbeiro.clientes(barbeiroId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<BarberClientesResult>(key);

      queryClient.setQueryData<BarberClientesResult>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          clients: old.clients.map((c) =>
            c.id === clientId ? { ...c, blocked: true } : c
          ),
        };
      });
      return { snapshot };
    },

    onSuccess: (_data, { scope, unidadesIds, barbeiroId }) => {
      const msgs: Record<BlockScope, string> = {
        barber: "Cliente bloqueado para você",
        unit: `Cliente bloqueado em ${unidadesIds?.length ?? 1} unidade(s)`,
        tenant: "Cliente bloqueado em toda a barbearia",
      };
      toast.success(msgs[scope]);
      // Refetch para obter blockDetails atualizados do servidor
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.barbeiro.clientes(barbeiroId) });
    },

    onError: (_err, { barbeiroId }, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(QUERY_KEYS.barbeiro.clientes(barbeiroId), context.snapshot);
      }
      toast.error("Erro ao bloquear cliente");
    },
  });
}

/**
 * Desbloquear cliente — remove TODOS os bloqueios deste cliente
 * no tenant (barber + unit + tenant).
 */
export function useUnblockClient() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UnblockClientParams, { snapshot: BarberClientesResult | undefined }>({
    mutationFn: async ({ clientId, tenantId }) => {
      const { error } = await supabase
        .from("client_booking_blocks")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("client_user_id", clientId);
      if (error) throw error;
    },

    onMutate: async ({ clientId, barbeiroId }) => {
      const key = QUERY_KEYS.barbeiro.clientes(barbeiroId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<BarberClientesResult>(key);

      queryClient.setQueryData<BarberClientesResult>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          clients: old.clients.map((c) =>
            c.id === clientId ? { ...c, blocked: false, blockDetails: [] } : c
          ),
        };
      });
      return { snapshot };
    },

    onSuccess: (_data, { barbeiroId }) => {
      toast.success("Cliente desbloqueado");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.barbeiro.clientes(barbeiroId) });
    },

    onError: (_err, { barbeiroId }, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(QUERY_KEYS.barbeiro.clientes(barbeiroId), context.snapshot);
      }
      toast.error("Erro ao desbloquear cliente");
    },
  });
}

/**
 * Desbloquear seletivamente — remove bloqueios específicos por ID.
 * Usado quando o cliente tem múltiplos bloqueios e o dono quer remover apenas alguns.
 */
interface UnblockSpecificParams {
  blockIds: string[];
  clientId: string;
  barbeiroId: string;
}

export function useUnblockSpecific() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UnblockSpecificParams, { snapshot: BarberClientesResult | undefined }>({
    mutationFn: async ({ blockIds }) => {
      const { error } = await supabase
        .from("client_booking_blocks")
        .delete()
        .in("id", blockIds);
      if (error) throw error;
    },

    onMutate: async ({ blockIds, clientId, barbeiroId }) => {
      const key = QUERY_KEYS.barbeiro.clientes(barbeiroId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<BarberClientesResult>(key);

      queryClient.setQueryData<BarberClientesResult>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          clients: old.clients.map((c) => {
            if (c.id !== clientId) return c;
            const remaining = c.blockDetails.filter((d) => !blockIds.includes(d.id));
            return { ...c, blocked: remaining.length > 0, blockDetails: remaining };
          }),
        };
      });
      return { snapshot };
    },

    onSuccess: (_data, { blockIds, barbeiroId }) => {
      toast.success(`${blockIds.length} bloqueio(s) removido(s)`);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.barbeiro.clientes(barbeiroId) });
    },

    onError: (_err, { barbeiroId }, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(QUERY_KEYS.barbeiro.clientes(barbeiroId), context.snapshot);
      }
      toast.error("Erro ao remover bloqueios");
    },
  });
}

// ─── REMOVE CLIENT ───────────────────────────────────────
interface RemoveClientParams {
  clientId: string;
  tenantId: string;
  barbeiroId: string;
}

export function useRemoveClient() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, RemoveClientParams, { snapshot: BarberClientesResult | undefined }>({
    mutationFn: async ({ clientId, tenantId }) => {
      const { error } = await supabase
        .from("tenant_clientes")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("user_id", clientId);
      if (error) throw error;
    },

    onMutate: async ({ clientId, barbeiroId }) => {
      const key = QUERY_KEYS.barbeiro.clientes(barbeiroId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<BarberClientesResult>(key);

      queryClient.setQueryData<BarberClientesResult>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          clients: old.clients.filter(c => c.id !== clientId),
        };
      });

      return { snapshot };
    },

    onSuccess: () => {
      toast.success("Cliente removido da lista");
    },

    onError: (_err, { barbeiroId }, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(QUERY_KEYS.barbeiro.clientes(barbeiroId), context.snapshot);
      }
      toast.error("Erro ao remover cliente");
    },
  });
}

// ─── CONFIRM PLAN PAYMENT ────────────────────────────────
interface ConfirmPlanParams {
  assinaturaId: string;
  userId: string;
  planName: string;
  barbeiroId: string;
}

export function useConfirmPlanPayment() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ConfirmPlanParams>({
    mutationFn: async ({ assinaturaId, userId, planName }) => {
      const { data, error } = await supabase.functions.invoke("confirm-plan-payment", {
        body: { assinaturaId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Notificar cliente (fire-and-forget)
      await supabase.from("notificacoes").insert({
        user_id: userId,
        titulo: "Plano Ativado! 🎉",
        mensagem: `Seu plano ${planName} foi ativado com sucesso! Agora você pode agendar seus cortes pelo app.`,
        tipo: "geral",
        lida: false,
      });
    },

    onSuccess: (_data, { barbeiroId }) => {
      toast.success("Pagamento confirmado! Plano ativado.");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.pendingPlanPayments(barbeiroId),
      });
    },

    onError: (err) => {
      toast.error(err.message || "Erro ao confirmar pagamento");
    },
  });
}

// ─── SAVE BARBER PROFILE ─────────────────────────────────
interface SaveProfileParams {
  barbeiroId: string;
  apelido: string;
  email: string;
  telefone: string;
}

export function useSaveBarberProfile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SaveProfileParams>({
    mutationFn: async ({ barbeiroId, apelido, email, telefone }) => {
      const { error: barbeiroError } = await supabase
        .from("barbeiros")
        .update({ apelido: apelido.trim() })
        .eq("id", barbeiroId);
      if (barbeiroError) throw barbeiroError;

      const { data: existing } = await supabase
        .from("barbeiros_private")
        .select("barbeiro_id")
        .eq("barbeiro_id", barbeiroId)
        .maybeSingle();

      const privadoData = { email: email.trim() || null, telefone: telefone.trim() || null };

      if (existing) {
        const { error } = await supabase.from("barbeiros_private").update(privadoData).eq("barbeiro_id", barbeiroId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("barbeiros_private").insert({ barbeiro_id: barbeiroId, ...privadoData });
        if (error) throw error;
      }
    },

    onSuccess: (_data, { barbeiroId }) => {
      toast.success("Perfil atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.barbeiro.perfilPrefix(barbeiroId) });
    },

    onError: () => {
      toast.error("Erro ao salvar alterações");
    },
  });
}

// ─── UPLOAD BARBER PHOTO ─────────────────────────────────
interface UploadPhotoParams {
  barbeiroId: string;
  file: File;
}

export function useUploadBarberPhoto() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, UploadPhotoParams>({
    mutationFn: async ({ barbeiroId, file }) => {
      const fileExt = file.name.split(".").pop();
      const fileName = `barbeiro-${barbeiroId}-${Date.now()}.${fileExt}`;
      const filePath = `barbeiros/${fileName}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase.from("barbeiros").update({ foto_url: publicUrl }).eq("id", barbeiroId);
      if (updateError) throw updateError;

      return publicUrl;
    },

    onSuccess: (_data, { barbeiroId }) => {
      toast.success("Foto atualizada com sucesso!");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.barbeiro.perfilPrefix(barbeiroId) });
    },

    onError: (err) => {
      toast.error(err.message || "Erro ao atualizar foto");
    },
  });
}

// ─── REMOVE BARBER PHOTO ─────────────────────────────────
interface RemovePhotoParams {
  barbeiroId: string;
  currentFotoUrl: string | null;
}

export function useRemoveBarberPhoto() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, RemovePhotoParams>({
    mutationFn: async ({ barbeiroId, currentFotoUrl }) => {
      if (currentFotoUrl) {
        const urlParts = currentFotoUrl.split("/avatars/");
        if (urlParts.length > 1) {
          await supabase.storage.from("avatars").remove([urlParts[1]]);
        }
      }
      const { error } = await supabase.from("barbeiros").update({ foto_url: null }).eq("id", barbeiroId);
      if (error) throw error;
    },

    onSuccess: (_data, { barbeiroId }) => {
      toast.success("Foto removida com sucesso");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.barbeiro.perfilPrefix(barbeiroId) });
    },

    onError: (err) => {
      toast.error(err.message || "Erro ao remover foto");
    },
  });
}

// ─── SAVE SERVICE DURATION ───────────────────────────────
interface SaveDurationParams {
  barbeiroId: string;
  servicoId: string;
  duracao: number;
  tenantId: string | null;
}

export function useSaveServiceDuration() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SaveDurationParams>({
    mutationFn: async ({ barbeiroId, servicoId, duracao }) => {
      const { error } = await supabase
        .from("barbeiro_servico_duracao")
        .upsert(
          { barbeiro_id: barbeiroId, servico_id: servicoId, duracao_personalizada: duracao },
          { onConflict: "barbeiro_id,servico_id" }
        );
      if (error) throw error;
    },

    onSuccess: (_data, { barbeiroId, tenantId }) => {
      toast.success("Duração personalizada salva!");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.servicos(barbeiroId, tenantId),
      });
    },

    onError: () => {
      toast.error("Erro ao salvar duração");
    },
  });
}

// ─── RESET SERVICE DURATION ──────────────────────────────
interface ResetDurationParams {
  barbeiroId: string;
  servicoId: string;
  tenantId: string | null;
}

export function useResetServiceDuration() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ResetDurationParams>({
    mutationFn: async ({ barbeiroId, servicoId }) => {
      const { error } = await supabase
        .from("barbeiro_servico_duracao")
        .delete()
        .eq("barbeiro_id", barbeiroId)
        .eq("servico_id", servicoId);
      if (error) throw error;
    },

    onSuccess: (_data, { barbeiroId, tenantId }) => {
      toast.success("Duração resetada para o padrão");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.servicos(barbeiroId, tenantId),
      });
    },

    onError: () => {
      toast.error("Erro ao resetar duração");
    },
  });
}

// ─── SAVE BARBER SCHEDULE CONFIG ─────────────────────────
interface SaveScheduleParams {
  barbeiroId: string;
  configs: Array<{
    dia_semana: number;
    aberto: boolean | null;
    hora_abertura: string | null;
    hora_fechamento: string | null;
    hora_almoco_inicio: string | null;
    hora_almoco_fim: string | null;
    delay_entre_servicos?: number | null;
    slot_interval_minutes?: number | null;
  }>;
}

export function useSaveBarberSchedule() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SaveScheduleParams>({
    mutationFn: async ({ barbeiroId, configs }) => {
      const sanitize = (val: string | null | undefined) => (val === "" || val === null || val === undefined ? null : val);
      for (const config of configs) {
        const payload: Database["public"]["Tables"]["configuracoes_horario_barbeiro"]["Update"] = {
          aberto: config.aberto ?? true,
          hora_abertura: config.hora_abertura || "09:00",
          hora_fechamento: config.hora_fechamento || "18:00",
          hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
          hora_almoco_fim: sanitize(config.hora_almoco_fim),
          delay_entre_servicos: config.delay_entre_servicos ?? 10,
        };

        if (config.slot_interval_minutes !== undefined) {
          payload.slot_interval_minutes = config.slot_interval_minutes;
        }

        const { data, error } = await supabase
          .from("configuracoes_horario_barbeiro")
          .update(payload)
          .eq("barbeiro_id", barbeiroId)
          .eq("dia_semana", config.dia_semana)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) {
          const ins = await supabase
            .from("configuracoes_horario_barbeiro")
            .insert({
              barbeiro_id: barbeiroId,
              dia_semana: config.dia_semana,
              ...payload,
            })
            .select();
          if (ins.error) throw ins.error;
        }
      }
    },

    onSuccess: (_data, { barbeiroId, configs }) => {
      // Atualizar cache de imediato
      queryClient.setQueryData(
        QUERY_KEYS.barbeiro.horarioConfig(barbeiroId),
        (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((existing) => {
            const updated = configs.find((c) => c.dia_semana === existing.dia_semana);
            if (!updated) return existing;
            return {
              ...existing,
              ...updated,
              slot_interval_minutes:
                updated.slot_interval_minutes !== undefined
                  ? updated.slot_interval_minutes
                  : existing.slot_interval_minutes,
            };
          });
        }
      );

      toast.success("Configurações salvas com sucesso!");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.horarioConfig(barbeiroId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.horarios(barbeiroId),
      });
    },

    onError: (err) => {
      toast.error(err.message || "Erro ao salvar configurações");
    },
  });
}

// ─── SAVE VACATION ───────────────────────────────────────
interface SaveVacationParams {
  barbeiroId: string;
  days: Date[];
}

export function useSaveVacation() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, SaveVacationParams>({
    mutationFn: async ({ barbeiroId, days }) => {
      const { format } = await import("date-fns");
      for (const day of days) {
        const dateStr = format(day, "yyyy-MM-dd");
        const { data: existing } = await supabase
          .from("horarios_excepcionais_barbeiro")
          .select("id")
          .eq("barbeiro_id", barbeiroId)
          .eq("data", dateStr)
          .maybeSingle();

        const payload = {
          aberto: false,
          motivo: "Férias",
          hora_abertura: null,
          hora_fechamento: null,
          hora_almoco_inicio: null,
          hora_almoco_fim: null,
        };

        if (existing) {
          await supabase.from("horarios_excepcionais_barbeiro").update(payload).eq("id", existing.id);
        } else {
          await supabase.from("horarios_excepcionais_barbeiro").insert({
            barbeiro_id: barbeiroId,
            data: dateStr,
            ...payload,
          });
        }
      }
      return days.length;
    },

    onSuccess: (dayCount, { barbeiroId }) => {
      toast.success(`Férias configuradas! ${dayCount} dias bloqueados.`);
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.horariosExcepcionais(barbeiroId),
      });
    },

    onError: () => {
      toast.error("Erro ao configurar férias");
    },
  });
}

// ─── SAVE VACATION FOR UNITS (toda a unidade entra em férias) ───
interface SaveVacationForUnitsParams {
  /** IDs das unidades selecionadas. Para o tenant principal, passar tenantId aqui. */
  unidadeIds: string[];
  /** ID do tenant — usado para identificar barbeiros sem unidade vinculada */
  tenantId: string;
  /** Se true, considera tenantId como "toda a barbearia" (ignora unidadeIds) */
  isTenantWide: boolean;
  days: Date[];
}

export function useSaveVacationForUnits() {
  const queryClient = useQueryClient();

  return useMutation<{ barberCount: number; dayCount: number }, Error, SaveVacationForUnitsParams>({
    mutationFn: async ({ unidadeIds, tenantId, isTenantWide, days }) => {
      const { format } = await import("date-fns");

      // 1. Resolver lista de barbeiros afetados
      let barberQuery = supabase
        .from("barbeiros")
        .select("id, unidade_id")
        .eq("ativo", true)
        .is("deleted_at", null)
        .eq("tenant_id", tenantId);

      if (!isTenantWide && unidadeIds.length > 0) {
        // Buscar via tabela de junção barbeiro_unidades + também pela coluna direta unidade_id
        const [{ data: linkedRows }, { data: directBarbers }] = await Promise.all([
          supabase
            .from("barbeiro_unidades")
            .select("barbeiro_id")
            .in("unidade_id", unidadeIds),
          barberQuery.in("unidade_id", unidadeIds),
        ]);

        const ids = new Set<string>([
          ...(linkedRows || []).map(r => r.barbeiro_id),
          ...(directBarbers || []).map(b => b.id),
        ]);

        if (ids.size === 0) throw new Error("Nenhum barbeiro encontrado nas unidades selecionadas");

        // Validar que pertencem ao tenant
        const { data: validBarbers } = await supabase
          .from("barbeiros")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("ativo", true)
          .is("deleted_at", null)
          .in("id", Array.from(ids));

        const barberIds = (validBarbers || []).map(b => b.id);
        if (barberIds.length === 0) throw new Error("Nenhum barbeiro válido encontrado");

        await applyVacationToBarbers(barberIds, days, format);
        return { barberCount: barberIds.length, dayCount: days.length };
      }

      // Tenant-wide: todos os barbeiros do tenant
      const { data: allBarbers, error } = await barberQuery;
      if (error) throw error;
      const barberIds = (allBarbers || []).map(b => b.id);
      if (barberIds.length === 0) throw new Error("Nenhum barbeiro encontrado na barbearia");

      await applyVacationToBarbers(barberIds, days, format);
      return { barberCount: barberIds.length, dayCount: days.length };
    },

    onSuccess: ({ barberCount, dayCount }) => {
      toast.success(`Férias aplicadas: ${barberCount} barbeiro(s) × ${dayCount} dia(s)`);
      queryClient.invalidateQueries({ queryKey: ["barbeiro"], exact: false });
    },

    onError: (err) => {
      toast.error(err.message || "Erro ao aplicar férias para as unidades");
    },
  });
}

/** Helper: aplica férias (insert/update) para uma lista de barbeiros em N dias */
async function applyVacationToBarbers(
  barberIds: string[],
  days: Date[],
  format: (d: Date, fmt: string) => string,
) {
  const dateStrs = days.map(d => format(d, "yyyy-MM-dd"));

  // Buscar todos os registros existentes em uma única query
  const { data: existing } = await supabase
    .from("horarios_excepcionais_barbeiro")
    .select("id, barbeiro_id, data")
    .in("barbeiro_id", barberIds)
    .in("data", dateStrs);

  const existingMap = new Map<string, string>();
  (existing || []).forEach(e => existingMap.set(`${e.barbeiro_id}::${e.data}`, e.id));

  const toUpdate: string[] = [];
  const toInsert: Array<Record<string, unknown>> = [];
  const payloadFields = {
    aberto: false,
    motivo: "Férias",
    hora_abertura: null,
    hora_fechamento: null,
    hora_almoco_inicio: null,
    hora_almoco_fim: null,
  };

  for (const barberId of barberIds) {
    for (const dateStr of dateStrs) {
      const key = `${barberId}::${dateStr}`;
      const existingId = existingMap.get(key);
      if (existingId) {
        toUpdate.push(existingId);
      } else {
        toInsert.push({ barbeiro_id: barberId, data: dateStr, ...payloadFields });
      }
    }
  }

  // Inserts em lote
  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from("horarios_excepcionais_barbeiro")
      .insert(toInsert as never[]);
    if (insertErr) throw insertErr;
  }

  // Updates: precisa um por um (ou usar in() em batch)
  if (toUpdate.length > 0) {
    const { error: updateErr } = await supabase
      .from("horarios_excepcionais_barbeiro")
      .update(payloadFields)
      .in("id", toUpdate);
    if (updateErr) throw updateErr;
  }
}

// ─── REMOVE VACATION ─────────────────────────────────────
interface RemoveVacationParams {
  barbeiroId: string;
  days: Date[];
}

export function useRemoveVacation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, RemoveVacationParams>({
    mutationFn: async ({ barbeiroId, days }) => {
      const { format } = await import("date-fns");
      for (const day of days) {
        const dateStr = format(day, "yyyy-MM-dd");
        await supabase
          .from("horarios_excepcionais_barbeiro")
          .delete()
          .eq("barbeiro_id", barbeiroId)
          .eq("data", dateStr)
          .ilike("motivo", "%férias%");
      }
    },

    onSuccess: (_data, { barbeiroId }) => {
      toast.success("Período de férias removido");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.horariosExcepcionais(barbeiroId),
      });
    },

    onError: () => {
      toast.error("Erro ao remover período de férias");
    },
  });
}

// ─── REMOVE ALL VACATIONS ────────────────────────────────
interface RemoveAllVacationsParams {
  barbeiroId: string;
}

export function useRemoveAllVacations() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, RemoveAllVacationsParams>({
    mutationFn: async ({ barbeiroId }) => {
      await supabase
        .from("horarios_excepcionais_barbeiro")
        .delete()
        .eq("barbeiro_id", barbeiroId)
        .ilike("motivo", "%férias%");
    },

    onSuccess: (_data, { barbeiroId }) => {
      toast.success("Todos os períodos de férias foram removidos");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.horariosExcepcionais(barbeiroId),
      });
    },

    onError: () => {
      toast.error("Erro ao remover períodos de férias");
    },
  });
}

// ─── TOGGLE INSTAGRAM POSTS VISIBILITY ───────────────────
interface ToggleInstagramParams {
  connectionId: string;
  newValue: boolean;
}

export function useToggleInstagramPosts() {
  return useMutation<void, Error, ToggleInstagramParams>({
    mutationFn: async ({ connectionId, newValue }) => {
      const { error } = await supabase
        .from("instagram_connections")
        .update({ show_posts_on_landing: newValue })
        .eq("id", connectionId);
      if (error) throw error;
    },

    onSuccess: (_data, { newValue }) => {
      toast.success(newValue ? "Posts visíveis na landing page" : "Posts ocultados da landing page");
    },

    onError: () => {
      toast.error("Erro ao salvar configuração");
    },
  });
}
