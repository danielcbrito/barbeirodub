import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface BarberData {
  nome_completo: string;
  cpf: string;
  data_nascimento: string;
  email: string;
  telefone: string;
  endereco_rua: string;
  endereco_numero: string;
  endereco_bairro: string;
  endereco_cidade: string;
  endereco_estado: string;
  endereco_cep: string;
}

export const INITIAL: BarberData = {
  nome_completo: "",
  cpf: "",
  data_nascimento: "",
  email: "",
  telefone: "",
  endereco_rua: "",
  endereco_numero: "",
  endereco_bairro: "",
  endereco_cidade: "",
  endereco_estado: "",
  endereco_cep: "",
};

/** Busca dados pessoais do barbeiro no Supabase com fallbacks inteligentes */
async function fetchBarberDados(barbeiroId?: string | null, userId?: string | null): Promise<{ data: BarberData; resolvedBarbeiroId: string | null; resolvedUserId: string | null }> {
  let bId = barbeiroId || null;
  let uId = userId || null;

  // Se não temos bId ou uId, busca da sessão autenticada atual
  if (!bId || !uId) {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      if (!uId) uId = authData.user.id;
      if (!bId) {
        const { data: bRow } = await supabase
          .from("barbeiros")
          .select("id")
          .eq("user_id", authData.user.id)
          .maybeSingle();
        if (bRow?.id) bId = bRow.id;
      }
    }
  }

  const result: BarberData = { ...INITIAL };

  // 1. Busca em barbeiros_private se houver bId
  if (bId) {
    const { data: row } = await supabase
      .from("barbeiros_private")
      .select("nome_completo, cpf, data_nascimento, email, telefone, endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado, endereco_cep")
      .eq("barbeiro_id", bId)
      .maybeSingle();

    if (row) {
      result.nome_completo = (row as any).nome_completo || "";
      result.cpf = (row as any).cpf || "";
      result.data_nascimento = (row as any).data_nascimento || "";
      result.email = row.email || "";
      result.telefone = row.telefone || "";
      result.endereco_rua = (row as any).endereco_rua || "";
      result.endereco_numero = (row as any).endereco_numero || "";
      result.endereco_bairro = (row as any).endereco_bairro || "";
      result.endereco_cidade = (row as any).endereco_cidade || "";
      result.endereco_estado = (row as any).endereco_estado || "";
      result.endereco_cep = (row as any).endereco_cep || "";
    }
  }

  // 2. Fallbacks de identificação e contato se campos vierem vazios
  if (bId && (!result.nome_completo || !result.telefone || !result.email)) {
    const { data: barberRow } = await supabase
      .from("barbeiros")
      .select("nome, telefone, email, user_id")
      .eq("id", bId)
      .maybeSingle();

    if (barberRow) {
      if (!result.nome_completo && barberRow.nome) result.nome_completo = barberRow.nome;
      if (!result.telefone && barberRow.telefone) result.telefone = barberRow.telefone;
      if (!result.email && barberRow.email) result.email = barberRow.email;
      if (!uId && barberRow.user_id) uId = barberRow.user_id;
    }
  }

  if (uId && (!result.nome_completo || !result.telefone || !result.email)) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("nome, telefone, email")
      .eq("id", uId)
      .maybeSingle();

    if (profileRow) {
      if (!result.nome_completo && profileRow.nome) result.nome_completo = profileRow.nome;
      if (!result.telefone && profileRow.telefone) result.telefone = profileRow.telefone;
      if (!result.email && (profileRow as any).email) result.email = (profileRow as any).email;
    }
  }

  return { data: result, resolvedBarbeiroId: bId, resolvedUserId: uId };
}

export function useBarberDados(initialBarbeiroId?: string | null, initialUserId?: string | null) {
  const queryClient = useQueryClient();
  const [data, setData] = useState<BarberData>(INITIAL);
  const [originalData, setOriginalData] = useState<BarberData>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<{ barbeiroId: string | null; userId: string | null }>({
    barbeiroId: initialBarbeiroId || null,
    userId: initialUserId || null,
  });

  const queryKey = [QUERY_KEYS.barbeiro.dadosPessoais(initialBarbeiroId || "auto"), initialUserId || "auto"];

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetchBarberDados(initialBarbeiroId, initialUserId);
      setResolvedIds({
        barbeiroId: res.resolvedBarbeiroId,
        userId: res.resolvedUserId,
      });
      return res.data;
    },
    staleTime: STALE_TIMES.PERFIL_BARBEIRO,
  });

  const cachedData = queryClient.getQueryData<BarberData>(queryKey);

  useEffect(() => {
    if (cachedData && JSON.stringify(data) === JSON.stringify(originalData)) {
      setData(cachedData);
      setOriginalData(cachedData);
    }
  }, [cachedData]);

  const hasChanges = JSON.stringify(data) !== JSON.stringify(originalData);

  const update = useCallback((field: keyof BarberData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const saveData = async (current: BarberData) => {
    setSaving(true);
    try {
      let bId = resolvedIds.barbeiroId;
      let uId = resolvedIds.userId;

      // Resolução emergencial de ID se ainda não definidos
      if (!bId || !uId) {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          uId = authData.user.id;
          const { data: bRow } = await supabase
            .from("barbeiros")
            .select("id")
            .eq("user_id", authData.user.id)
            .maybeSingle();
          if (bRow?.id) bId = bRow.id;
        }
      }

      // Upsert garantido na tabela barbeiros_private
      if (bId) {
        const { error: privateErr } = await supabase
          .from("barbeiros_private")
          .upsert(
            {
              barbeiro_id: bId,
              nome_completo: current.nome_completo,
              cpf: current.cpf,
              data_nascimento: current.data_nascimento || null,
              email: current.email,
              telefone: current.telefone,
              endereco_rua: current.endereco_rua,
              endereco_numero: current.endereco_numero,
              endereco_bairro: current.endereco_bairro,
              endereco_cidade: current.endereco_cidade,
              endereco_estado: current.endereco_estado,
              endereco_cep: current.endereco_cep,
              updated_at: new Date().toISOString(),
            } as any,
            { onConflict: "barbeiro_id" }
          );

        if (privateErr) throw privateErr;

        // Sincroniza dados com barbeiros
        await supabase
          .from("barbeiros")
          .update({
            nome: current.nome_completo || undefined,
            telefone: current.telefone || undefined,
            email: current.email || undefined,
          } as any)
          .eq("id", bId);
      }

      // Sincroniza dados com profiles se houver userId
      if (uId) {
        await supabase
          .from("profiles")
          .update({
            nome: current.nome_completo || undefined,
            telefone: current.telefone || undefined,
          } as any)
          .eq("id", uId);
      }

      toast.success("Dados pessoais salvos com sucesso");
      setOriginalData({ ...current });
      queryClient.invalidateQueries({ queryKey });
      if (bId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.barbeiro.dadosPessoais(bId) });
      }
    } catch (err) {
      console.error("Erro ao salvar dados pessoais:", err);
      toast.error("Erro ao salvar dados pessoais");
    } finally {
      setSaving(false);
    }
  };

  return {
    data,
    loading: isLoading,
    isError,
    error,
    refetch,
    saving,
    hasChanges,
    update,
    saveData,
    resolvedBarbeiroId: resolvedIds.barbeiroId,
    resolvedUserId: resolvedIds.userId,
  };
}
