import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PendingCategoryCounts {
  identificacao: number;
  contato: number;
  endereco: number;
}

export interface BarbershopFieldsData {
  nome: string;
  cnpj: string;
  cpf: string;
  telefone: string;
  whatsapp: string;
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface BarbershopPendingFieldsResult {
  totalPendingCount: number;
  pendingByCategory: PendingCategoryCounts;
  isCompliant: boolean;
  missingFieldNames: string[];
  fieldStatus: {
    hasNome: boolean;
    hasDocument: boolean;
    hasContact: boolean;
    hasCep: boolean;
    hasRua: boolean;
    hasNumero: boolean;
    hasBairro: boolean;
    hasCidade: boolean;
    hasEstado: boolean;
  };
  data: BarbershopFieldsData | null;
  loading: boolean;
  refetch: () => Promise<any>;
}

const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");

export const BARBERSHOP_PENDING_QUERY_KEY = "barbershop-pending-fields";

export function getBarbershopPendingQueryKey(tenantId?: string | null, unidadeId?: string | null) {
  return [BARBERSHOP_PENDING_QUERY_KEY, tenantId || "global", unidadeId || "default"];
}

/**
 * Hook para detecção inteligente de pendências cadastrais da barbearia em cascata.
 * Avalia os 4 blocos obrigatórios exigidos pelo Pix Automático (Woovi):
 *  1. Identificação: Nome e Documento (CNPJ ou CPF)
 *  2. Contato: Telefone ou WhatsApp oficial
 *  3. Endereço com CEP: CEP, Rua, Número, Cidade e Estado
 */
export function useBarbershopPendingFields(
  tenantId?: string | null,
  unidadeId?: string | null
): BarbershopPendingFieldsResult {
  const queryClient = useQueryClient();

  const queryKey = getBarbershopPendingQueryKey(tenantId, unidadeId);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<BarbershopFieldsData> => {
      const resolved: BarbershopFieldsData = {
        nome: "",
        cnpj: "",
        cpf: "",
        telefone: "",
        whatsapp: "",
        cep: "",
        rua: "",
        numero: "",
        bairro: "",
        cidade: "",
        estado: "",
      };

      try {
        // 1. Consulta tenant_unidades (se unidadeId foi fornecida, busca direto; senão, busca a sede ou primeira unidade)
        if (tenantId) {
          let unitQuery = supabase
            .from("tenant_unidades")
            .select("nome, cnpj, cpf, telefone, whatsapp, cep, rua, numero, bairro, cidade, estado, is_sede")
            .eq("tenant_id", tenantId);

          if (unidadeId && unidadeId !== "todas") {
            unitQuery = unitQuery.eq("id", unidadeId);
          } else {
            unitQuery = unitQuery.order("is_sede", { ascending: false }).limit(1);
          }

          const { data: unitData } = await unitQuery.maybeSingle();

          if (unitData) {
            resolved.nome = unitData.nome || "";
            resolved.cnpj = unitData.cnpj || "";
            resolved.cpf = unitData.cpf || "";
            resolved.telefone = unitData.telefone || "";
            resolved.whatsapp = unitData.whatsapp || "";
            resolved.cep = unitData.cep || "";
            resolved.rua = unitData.rua || "";
            resolved.numero = unitData.numero || "";
            resolved.bairro = unitData.bairro || "";
            resolved.cidade = unitData.cidade || "";
            resolved.estado = unitData.estado || "";
          }
        }

        // 2. Fallback / complemento: informacoes_empresa
        let infoQuery = supabase
          .from("informacoes_empresa")
          .select("chave, valor");

        if (tenantId) {
          infoQuery = infoQuery.eq("tenant_id", tenantId);
        } else {
          infoQuery = infoQuery.is("tenant_id", null);
        }

        const { data: infoRows } = await infoQuery;
        if (infoRows && infoRows.length > 0) {
          for (const row of infoRows) {
            const val = (row.valor || "").trim();
            if (!val) continue;
            if (row.chave === "nome" && !resolved.nome) resolved.nome = val;
            if (row.chave === "cnpj" && !resolved.cnpj) resolved.cnpj = val;
            if (row.chave === "cpf" && !resolved.cpf) resolved.cpf = val;
            if (row.chave === "telefone" && !resolved.telefone) resolved.telefone = val;
            if (row.chave === "whatsapp" && !resolved.whatsapp) resolved.whatsapp = val;
            if (row.chave === "cep" && !resolved.cep) resolved.cep = val;
            if (row.chave === "rua" && !resolved.rua) resolved.rua = val;
            if (row.chave === "numero" && !resolved.numero) resolved.numero = val;
            if (row.chave === "bairro" && !resolved.bairro) resolved.bairro = val;
            if (row.chave === "cidade" && !resolved.cidade) resolved.cidade = val;
            if (row.chave === "estado" && !resolved.estado) resolved.estado = val;
          }
        }

        // 3. Fallback / complemento: tabela tenants
        if (tenantId && (!resolved.nome || (!resolved.cnpj && !resolved.cpf) || !resolved.rua)) {
          const { data: tenantRow } = await supabase
            .from("tenants")
            .select("nome, cnpj, cpf, telefone, whatsapp, rua, numero, bairro, cidade, estado")
            .eq("id", tenantId)
            .maybeSingle();

          if (tenantRow) {
            if (!resolved.nome && tenantRow.nome) resolved.nome = tenantRow.nome;
            if (!resolved.cnpj && tenantRow.cnpj) resolved.cnpj = tenantRow.cnpj;
            if (!resolved.cpf && tenantRow.cpf) resolved.cpf = tenantRow.cpf;
            if (!resolved.telefone && tenantRow.telefone) resolved.telefone = tenantRow.telefone;
            if (!resolved.whatsapp && tenantRow.whatsapp) resolved.whatsapp = tenantRow.whatsapp;
            if (!resolved.rua && tenantRow.rua) resolved.rua = tenantRow.rua;
            if (!resolved.numero && tenantRow.numero) resolved.numero = tenantRow.numero;
            if (!resolved.bairro && tenantRow.bairro) resolved.bairro = tenantRow.bairro;
            if (!resolved.cidade && tenantRow.cidade) resolved.cidade = tenantRow.cidade;
            if (!resolved.estado && tenantRow.estado) resolved.estado = tenantRow.estado;
          }
        }
      } catch (err) {
        console.warn("[useBarbershopPendingFields] Erro ao carregar dados:", err);
      }

      return resolved;
    },
  });

  // Atualização em tempo real via Supabase Postgres Changes
  useEffect(() => {
    if (!tenantId) return;

    const channelName = `pending-fields-${tenantId}-${unidadeId || "all"}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenant_unidades", filter: `tenant_id=eq.${tenantId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: [BARBERSHOP_PENDING_QUERY_KEY] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "informacoes_empresa", filter: `tenant_id=eq.${tenantId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: [BARBERSHOP_PENDING_QUERY_KEY] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, unidadeId, queryClient]);

  const raw = data || {
    nome: "",
    cnpj: "",
    cpf: "",
    telefone: "",
    whatsapp: "",
    cep: "",
    rua: "",
    numero: "",
    bairro: "",
    cidade: "",
    estado: "",
  };

  const hasNome = Boolean(raw.nome && raw.nome.trim().length > 0);
  const cleanCnpj = digits(raw.cnpj);
  const cleanCpf = digits(raw.cpf);
  const hasDocument = cleanCnpj.length === 14 || cleanCpf.length === 11;

  const cleanTel = digits(raw.telefone);
  const cleanWhats = digits(raw.whatsapp);
  const hasContact = cleanTel.length >= 10 || cleanWhats.length >= 10;

  const cleanCep = digits(raw.cep);
  const hasCep = cleanCep.length === 8;
  const hasRua = Boolean(raw.rua && raw.rua.trim().length > 0);
  const hasNumero = Boolean(raw.numero && raw.numero.trim().length > 0);
  const hasBairro = Boolean(raw.bairro && raw.bairro.trim().length > 0);
  const hasCidade = Boolean(raw.cidade && raw.cidade.trim().length > 0);
  const hasEstado = Boolean(raw.estado && raw.estado.trim().length >= 2);

  const missingFieldNames: string[] = [];

  // 1. Identificação
  let pendingIdentificacao = 0;
  if (!hasNome) {
    pendingIdentificacao++;
    missingFieldNames.push("Nome da barbearia");
  }
  if (!hasDocument) {
    pendingIdentificacao++;
    missingFieldNames.push("CNPJ ou CPF do responsável");
  }

  // 2. Contato
  let pendingContato = 0;
  if (!hasContact) {
    pendingContato++;
    missingFieldNames.push("Telefone ou WhatsApp oficial");
  }

  // 3. Endereço com CEP
  let pendingEndereco = 0;
  if (!hasCep) {
    pendingEndereco++;
    missingFieldNames.push("CEP");
  }
  if (!hasRua) {
    pendingEndereco++;
    missingFieldNames.push("Rua / Logradouro");
  }
  if (!hasNumero) {
    pendingEndereco++;
    missingFieldNames.push("Número do endereço");
  }
  if (!hasCidade) {
    pendingEndereco++;
    missingFieldNames.push("Cidade");
  }
  if (!hasEstado) {
    pendingEndereco++;
    missingFieldNames.push("Estado (UF)");
  }

  const totalPendingCount = missingFieldNames.length;
  const isCompliant = totalPendingCount === 0;

  return {
    totalPendingCount,
    pendingByCategory: {
      identificacao: pendingIdentificacao,
      contato: pendingContato,
      endereco: pendingEndereco,
    },
    isCompliant,
    missingFieldNames,
    fieldStatus: {
      hasNome,
      hasDocument,
      hasContact,
      hasCep,
      hasRua,
      hasNumero,
      hasBairro,
      hasCidade,
      hasEstado,
    },
    data: data || null,
    loading: isLoading,
    refetch,
  };
}

/** Helper global para invalidar cache de pendências ao salvar qualquer formulário */
export function invalidateBarbershopPending(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [BARBERSHOP_PENDING_QUERY_KEY] });
}

