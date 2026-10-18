import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

/**
 * Dados pessoais do barbeiro — hook compartilhado entre as sub-telas.
 * Usa useQuery para o fetch inicial e estado local para edição.
 */

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
  nome_completo: "", cpf: "", data_nascimento: "",
  email: "", telefone: "",
  endereco_rua: "", endereco_numero: "", endereco_bairro: "",
  endereco_cidade: "", endereco_estado: "", endereco_cep: "",
};

/** Busca dados pessoais do barbeiro no Supabase */
async function fetchBarberDados(barbeiroId: string): Promise<BarberData> {
  const { data: row, error } = await supabase
    .from("barbeiros_private")
    .select("nome_completo, cpf, data_nascimento, email, telefone, endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado, endereco_cep")
    .eq("barbeiro_id", barbeiroId)
    .maybeSingle();

  if (error) throw error;

  if (!row) return INITIAL;

  return {
    nome_completo: (row as any).nome_completo || "",
    cpf: (row as any).cpf || "",
    data_nascimento: (row as any).data_nascimento || "",
    email: row.email || "",
    telefone: row.telefone || "",
    endereco_rua: (row as any).endereco_rua || "",
    endereco_numero: (row as any).endereco_numero || "",
    endereco_bairro: (row as any).endereco_bairro || "",
    endereco_cidade: (row as any).endereco_cidade || "",
    endereco_estado: (row as any).endereco_estado || "",
    endereco_cep: (row as any).endereco_cep || "",
  };
}

export function useBarberDados(barbeiroId: string) {
  const queryClient = useQueryClient();
  const [data, setData] = useState<BarberData>(INITIAL);
  const [originalData, setOriginalData] = useState<BarberData>(INITIAL);
  const [saving, setSaving] = useState(false);

  const { isLoading } = useQuery({
    queryKey: QUERY_KEYS.barbeiro.dadosPessoais(barbeiroId),
    queryFn: () => fetchBarberDados(barbeiroId),
    enabled: !!barbeiroId,
    staleTime: STALE_TIMES.PERFIL_BARBEIRO,
    select: (fetched) => {
      // Popula estado local apenas quando não há edições pendentes
      return fetched;
    },
  });

  // Sincronizar dados do cache com estado local (apenas quando cache muda e não há edições)
  const cachedData = queryClient.getQueryData<BarberData>(QUERY_KEYS.barbeiro.dadosPessoais(barbeiroId));

  useEffect(() => {
    if (cachedData && JSON.stringify(data) === JSON.stringify(originalData)) {
      setData(cachedData);
      setOriginalData(cachedData);
    }
  }, [cachedData]);

  const hasChanges = JSON.stringify(data) !== JSON.stringify(originalData);

  const update = useCallback((field: keyof BarberData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const saveData = async (current: BarberData) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("barbeiros_private")
        .update({
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
        } as any)
        .eq("barbeiro_id", barbeiroId);

      if (error) throw error;

      toast.success("Dados salvos com sucesso");

      setOriginalData({ ...current });
      // Invalida cache para refletir mudanças
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.barbeiro.dadosPessoais(barbeiroId) });
    } catch (err) {
      console.error("Erro ao salvar:", err);
      toast.error("Erro ao salvar dados");
    } finally {
      setSaving(false);
    }
  };

  return { data, loading: isLoading, saving, hasChanges, update, saveData };
}
