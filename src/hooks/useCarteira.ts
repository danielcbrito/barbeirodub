import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface Carteira {
  id: string;
  barbeiro_id: string;
  saldo_disponivel: number;
  pix_automatico_ativo: boolean;
  chave_pix: string | null;
  tipo_chave_pix: string | null;
  chave_pix_validada: boolean;
  chave_pix_titular: string | null;
  chave_pix_validada_em: string | null;
}

export interface TransacaoFinanceira {
  id: string;
  barbeiro_id: string;
  carteira_id: string;
  tipo: "entrada" | "saque_manual" | "saque_automatico" | "estorno";
  valor: number;
  status: "pendente" | "processando" | "concluida" | "falhou";
  descricao: string | null;
  efi_e2e_id: string | null;
  efi_charge_id: string | null;
  chave_pix_destino: string | null;
  erro_mensagem: string | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * Hook central da Carteira Efí.
 * Gerencia: saldo, transações, chave Pix, toggle automático e ações de saque.
 */
export function useCarteira(barbeiroId: string | null | undefined) {
  const qc = useQueryClient();

  // Query: carteira (auto-cria se não existir, ignorando erro de RLS no insert)
  const carteiraQuery = useQuery({
    queryKey: ["carteira", barbeiroId],
    queryFn: async (): Promise<Carteira | null> => {
      if (!barbeiroId) return null;
      const { data, error } = await supabase
        .from("carteiras")
        .select("*")
        .eq("barbeiro_id", barbeiroId)
        .maybeSingle();
      if (error) {
        console.error("[useCarteira] erro ao buscar carteira:", error);
        throw error;
      }
      if (data) return data as Carteira;

      // Tenta criar — se falhar (RLS, etc), retorna null em vez de travar
      const { data: created, error: cErr } = await supabase
        .from("carteiras")
        .insert({ barbeiro_id: barbeiroId })
        .select()
        .maybeSingle();
      if (cErr) {
        console.error("[useCarteira] não foi possível criar carteira:", cErr);
        return null;
      }
      return (created as Carteira) ?? null;
    },
    enabled: !!barbeiroId,
    refetchInterval: 30000,
    retry: 1,
  });

  // Query: transações
  const transacoesQuery = useQuery({
    queryKey: ["carteira-transacoes", barbeiroId],
    queryFn: async (): Promise<TransacaoFinanceira[]> => {
      if (!barbeiroId) return [];
      const { data, error } = await supabase
        .from("transacoes_financeiras")
        .select("*")
        .eq("barbeiro_id", barbeiroId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as TransacaoFinanceira[];
    },
    enabled: !!barbeiroId,
    refetchInterval: 15000,
  });

  // Realtime: refresh em mudanças na carteira
  useEffect(() => {
    if (!barbeiroId) return;
    const channel = supabase
      .channel(`carteira-${barbeiroId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "carteiras",
        filter: `barbeiro_id=eq.${barbeiroId}`,
      }, () => qc.invalidateQueries({ queryKey: ["carteira", barbeiroId] }))
      .on("postgres_changes", {
        event: "*", schema: "public", table: "transacoes_financeiras",
        filter: `barbeiro_id=eq.${barbeiroId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ["carteira-transacoes", barbeiroId] });
        qc.invalidateQueries({ queryKey: ["carteira", barbeiroId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [barbeiroId, qc]);

  // Mutation: validar + salvar chave Pix
  const salvarChavePix = useMutation({
    mutationFn: async (chave: string) => {
      if (!barbeiroId) throw new Error("Barbeiro inválido");
      const { data, error } = await supabase.functions.invoke("efi-validate-pix-key", {
        body: { chave, barbeiro_id: barbeiroId },
      });
      if (error) throw error;
      if (!data?.valid) throw new Error(data?.error || "Chave inválida");

      const { error: updErr } = await supabase
        .from("carteiras")
        .update({
          chave_pix: data.chave_normalizada,
          tipo_chave_pix: data.tipo_detectado,
          chave_pix_validada: true,
          chave_pix_titular: data.titular_nome,
          chave_pix_validada_em: new Date().toISOString(),
        })
        .eq("barbeiro_id", barbeiroId);
      if (updErr) throw updErr;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carteira", barbeiroId] }),
  });

  // Mutation: remover chave
  const removerChavePix = useMutation({
    mutationFn: async () => {
      if (!barbeiroId) throw new Error("Barbeiro inválido");
      const { error } = await supabase
        .from("carteiras")
        .update({
          chave_pix: null, tipo_chave_pix: null,
          chave_pix_validada: false, chave_pix_titular: null,
          chave_pix_validada_em: null, pix_automatico_ativo: false,
        })
        .eq("barbeiro_id", barbeiroId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carteira", barbeiroId] }),
  });

  // Mutation: toggle Pix automático
  const togglePixAutomatico = useMutation({
    mutationFn: async (ativo: boolean) => {
      if (!barbeiroId) throw new Error("Barbeiro inválido");
      const { error } = await supabase
        .from("carteiras")
        .update({ pix_automatico_ativo: ativo })
        .eq("barbeiro_id", barbeiroId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carteira", barbeiroId] }),
  });

  // Mutation: sacar
  const sacar = useMutation({
    mutationFn: async (valor: number) => {
      if (!barbeiroId) throw new Error("Barbeiro inválido");
      const { data, error } = await supabase.functions.invoke("efi-send-pix", {
        body: { barbeiro_id: barbeiroId, valor, tipo: "saque_manual" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carteira", barbeiroId] });
      qc.invalidateQueries({ queryKey: ["carteira-transacoes", barbeiroId] });
    },
  });

  return {
    carteira: carteiraQuery.data ?? null,
    transacoes: transacoesQuery.data ?? [],
    isLoading: carteiraQuery.isLoading,
    error: carteiraQuery.error as Error | null,
    salvarChavePix,
    removerChavePix,
    togglePixAutomatico,
    sacar,
  };
}
