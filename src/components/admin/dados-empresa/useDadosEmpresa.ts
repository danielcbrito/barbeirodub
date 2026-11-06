import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isTenantRootUnit } from "./unitSelection";
import { BARBERSHOP_PENDING_QUERY_KEY } from "@/hooks/useBarbershopPendingFields";

/**
 * Dados completos da empresa — estrutura normalizada
 */
export interface CompanyData {
  nome: string;
  slogan: string;
  cnpj: string;
  cpf: string;
  email: string;
  telefone: string;
  whatsapp: string;
  site: string;
  endereco_completo: string;
  cep: string;
  rua: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  estado: string;
}

/** Mapeamento chave ↔ campo local */
export const FIELD_MAP: { chave: string; categoria: string; field: keyof CompanyData }[] = [
  { chave: "nome", categoria: "empresa", field: "nome" },
  { chave: "slogan", categoria: "empresa", field: "slogan" },
  { chave: "cnpj", categoria: "empresa", field: "cnpj" },
  { chave: "cpf", categoria: "empresa", field: "cpf" },
  { chave: "email", categoria: "contato", field: "email" },
  { chave: "telefone", categoria: "contato", field: "telefone" },
  { chave: "whatsapp", categoria: "contato", field: "whatsapp" },
  { chave: "site_completo", categoria: "contato", field: "site" },
  { chave: "endereco_completo", categoria: "localizacao", field: "endereco_completo" },
  { chave: "cep", categoria: "localizacao", field: "cep" },
  { chave: "rua", categoria: "localizacao", field: "rua" },
  { chave: "numero", categoria: "localizacao", field: "numero" },
  { chave: "complemento", categoria: "localizacao", field: "complemento" },
  { chave: "bairro", categoria: "localizacao", field: "bairro" },
  { chave: "cidade", categoria: "localizacao", field: "cidade" },
  { chave: "estado", categoria: "localizacao", field: "estado" },
];

export const INITIAL: CompanyData = {
  nome: "", slogan: "", cnpj: "", cpf: "",
  email: "", telefone: "", whatsapp: "", site: "",
  endereco_completo: "", cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
};

/**
 * Hook para carregar e salvar dados da empresa.
 * Filtra os campos por seção para uso nas sub-telas.
 * @param tenantId — ID do tenant para escopo tenant.
 * @param scope — "tenant" força isolamento por tenant_id; "global" usa tenant_id IS NULL.
 */
export function useDadosEmpresa(
  tenantId?: string | null,
  scope: "tenant" | "global" | "unit" = "global",
  unidadeId?: string | null,
) {
  const queryClient = useQueryClient();
  const [data, setData] = useState<CompanyData>(INITIAL);
  const [originalData, setOriginalData] = useState<CompanyData>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasChanges = JSON.stringify(data) !== JSON.stringify(originalData);

  const loadData = useCallback(async () => {
    try {
      const isTenantScope = scope === "tenant";
      const isUnitScope = scope === "unit" && !isTenantRootUnit(unidadeId);

      // Segurança: nunca cair para dados globais em contexto tenant
      if ((isTenantScope || isUnitScope) && !tenantId) {
        setData({ ...INITIAL });
        setOriginalData({ ...INITIAL });
        return;
      }

      if (isUnitScope) {
        const { data: unitRow, error } = await supabase
          .from("tenant_unidades")
          .select("nome, slogan, cpf, cnpj, telefone, whatsapp, site, email, cep, rua, numero, complemento, bairro, cidade, estado")
          .eq("tenant_id", tenantId as string)
          .eq("id", unidadeId as string)
          .maybeSingle();

        if (error) throw error;

        const unitData: CompanyData = {
          ...INITIAL,
          nome: unitRow?.nome || "",
          slogan: unitRow?.slogan || "",
          cpf: unitRow?.cpf || "",
          cnpj: unitRow?.cnpj || "",
          email: unitRow?.email || "",
          telefone: unitRow?.telefone || "",
          whatsapp: unitRow?.whatsapp || "",
          site: unitRow?.site || "",
          cep: unitRow?.cep || "",
          rua: unitRow?.rua || "",
          numero: unitRow?.numero || "",
          complemento: unitRow?.complemento || "",
          bairro: unitRow?.bairro || "",
          cidade: unitRow?.cidade || "",
          estado: unitRow?.estado || "",
          endereco_completo: [unitRow?.rua, unitRow?.numero, unitRow?.complemento, unitRow?.bairro, unitRow?.cidade, unitRow?.estado]
            .filter(Boolean)
            .join(" — "),
        };

        setData(unitData);
        setOriginalData(unitData);
        return;
      }

      let query = supabase
        .from("informacoes_empresa")
        .select("chave, valor, categoria");

      if (isTenantScope) {
        query = query.eq("tenant_id", tenantId as string);
      } else {
        query = query.is("tenant_id", null);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      const newData: CompanyData = { ...INITIAL };

      // Bootstrap: se não há registros em informacoes_empresa, puxar da tabela tenants
      if (isTenantScope && (!rows || rows.length === 0)) {
        const { data: tenantRow } = await supabase
          .from("tenants")
          .select("nome, slogan, cpf, cnpj, telefone, whatsapp, site, email, cep, rua, numero, complemento, bairro, cidade, estado, endereco_completo, owner_user_id")
          .eq("id", tenantId as string)
          .maybeSingle();

        if (tenantRow) {
          newData.nome = tenantRow.nome || "";
          newData.slogan = tenantRow.slogan || "";
          newData.cpf = tenantRow.cpf || "";
          newData.cnpj = tenantRow.cnpj || "";
          newData.telefone = tenantRow.telefone || "";
          newData.whatsapp = tenantRow.whatsapp || "";
          newData.site = tenantRow.site || "";
          newData.email = tenantRow.email || "";
          newData.cep = (tenantRow as any).cep || "";
          newData.rua = tenantRow.rua || "";
          newData.numero = tenantRow.numero || "";
          newData.complemento = (tenantRow as any).complemento || "";
          newData.bairro = tenantRow.bairro || "";
          newData.cidade = tenantRow.cidade || "";
          newData.estado = tenantRow.estado || "";
          newData.endereco_completo = tenantRow.endereco_completo || "";
        }
      }

      for (const row of rows || []) {
        const mapping = FIELD_MAP.find(
          (m) => m.chave === row.chave && m.categoria === row.categoria
        );
        if (mapping) {
          newData[mapping.field] = row.valor || "";
        }
      }

      // Se CEP ainda não foi preenchido via informacoes_empresa, busca da unidade sede
      if (isTenantScope && tenantId && !newData.cep) {
        const { data: sedeUnit } = await supabase
          .from("tenant_unidades")
          .select("cep, rua, numero, complemento, bairro, cidade, estado")
          .eq("tenant_id", tenantId)
          .order("is_sede", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sedeUnit?.cep) newData.cep = sedeUnit.cep;
        if (!newData.rua && sedeUnit?.rua) newData.rua = sedeUnit.rua;
        if (!newData.numero && sedeUnit?.numero) newData.numero = sedeUnit.numero;
        if (!newData.complemento && (sedeUnit as any)?.complemento) newData.complemento = (sedeUnit as any).complemento;
        if (!newData.bairro && sedeUnit?.bairro) newData.bairro = sedeUnit.bairro;
        if (!newData.cidade && sedeUnit?.cidade) newData.cidade = sedeUnit.cidade;
        if (!newData.estado && sedeUnit?.estado) newData.estado = sedeUnit.estado;
      }

      setData(newData);
      setOriginalData(newData);
    } catch (err) {
      console.error("Erro ao carregar dados da empresa:", err);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [tenantId, scope, unidadeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveData = async (updatedData: CompanyData) => {
    setSaving(true);
    try {
      const isTenantScope = scope === "tenant";
      const isUnitScope = scope === "unit" && !isTenantRootUnit(unidadeId);

      // Segurança: bloqueia escrita global indevida em contexto tenant
      if ((isTenantScope || isUnitScope) && !tenantId) {
        toast.error("Tenant não identificado para salvar os dados da empresa.");
        return;
      }

      if (isUnitScope) {
        const { error } = await supabase
          .from("tenant_unidades")
          .update({
            nome: updatedData.nome || null,
            slogan: updatedData.slogan || null,
            cnpj: updatedData.cnpj || null,
            cpf: updatedData.cpf || null,
            email: updatedData.email || null,
            telefone: updatedData.telefone || null,
            whatsapp: updatedData.whatsapp || null,
            site: updatedData.site || null,
            cep: updatedData.cep || null,
            rua: updatedData.rua || null,
            numero: updatedData.numero || null,
            complemento: updatedData.complemento || null,
            bairro: updatedData.bairro || null,
            cidade: updatedData.cidade || null,
            estado: updatedData.estado || null,
          } as any)
          .eq("tenant_id", tenantId as string)
          .eq("id", unidadeId as string);

        if (error) throw error;

        setData(updatedData);
        setOriginalData(updatedData);
        queryClient.invalidateQueries({ queryKey: [BARBERSHOP_PENDING_QUERY_KEY] });
        toast.success("Dados salvos com sucesso");
        return;
      }

      for (const mapping of FIELD_MAP) {
        const value = updatedData[mapping.field];

        // Verificar se já existe registro para esta chave/categoria/tenant
        let existsQuery = supabase
          .from("informacoes_empresa")
          .select("id")
          .eq("chave", mapping.chave)
          .eq("categoria", mapping.categoria);

        if (isTenantScope) {
          existsQuery = existsQuery.eq("tenant_id", tenantId as string);
        } else {
          existsQuery = existsQuery.is("tenant_id", null);
        }

        const { data: existing } = await existsQuery.maybeSingle();

        if (existing) {
          await supabase
            .from("informacoes_empresa")
            .update({
              valor: value,
              atualizado_em: new Date().toISOString(),
            } as any)
            .eq("id", existing.id);
        } else {
          const row: Record<string, unknown> = {
            chave: mapping.chave,
            categoria: mapping.categoria,
            valor: value,
            atualizado_em: new Date().toISOString(),
            ativo: true,
          };
          if (isTenantScope) {
            row.tenant_id = tenantId as string;
          }
          await supabase
            .from("informacoes_empresa")
            .insert(row as any);
        }
      }

      // Sincronizar também com a tabela tenants quando escopo tenant
      if (isTenantScope && tenantId) {
        try {
          const tenantPayload: Record<string, any> = {};
          if (updatedData.nome) tenantPayload.nome = updatedData.nome;
          if (updatedData.slogan !== undefined) tenantPayload.slogan = updatedData.slogan;
          if (updatedData.cnpj !== undefined) tenantPayload.cnpj = updatedData.cnpj;
          if (updatedData.cpf !== undefined) tenantPayload.cpf = updatedData.cpf;
          if (updatedData.email !== undefined) tenantPayload.email = updatedData.email;
          if (updatedData.telefone !== undefined) tenantPayload.telefone = updatedData.telefone;
          if (updatedData.whatsapp !== undefined) tenantPayload.whatsapp = updatedData.whatsapp;
          if (updatedData.site !== undefined) tenantPayload.site = updatedData.site;
          if (updatedData.cep !== undefined) tenantPayload.cep = updatedData.cep;
          if (updatedData.rua !== undefined) tenantPayload.rua = updatedData.rua;
          if (updatedData.numero !== undefined) tenantPayload.numero = updatedData.numero;
          if (updatedData.complemento !== undefined) tenantPayload.complemento = updatedData.complemento;
          if (updatedData.bairro !== undefined) tenantPayload.bairro = updatedData.bairro;
          if (updatedData.cidade !== undefined) tenantPayload.cidade = updatedData.cidade;
          if (updatedData.estado !== undefined) tenantPayload.estado = updatedData.estado;
          const fullAddress = [
            updatedData.rua,
            updatedData.numero ? `nº ${updatedData.numero}` : null,
            updatedData.complemento,
            updatedData.bairro,
            updatedData.cidade && updatedData.estado ? `${updatedData.cidade} - ${updatedData.estado}` : updatedData.cidade || updatedData.estado,
            updatedData.cep ? `CEP ${updatedData.cep}` : null,
          ].filter(Boolean).join(", ");
          if (fullAddress) tenantPayload.endereco_completo = fullAddress;

          if (Object.keys(tenantPayload).length > 0) {
            await supabase.from("tenants").update(tenantPayload as any).eq("id", tenantId);
          }

          // Sincroniza também na unidade sede para consistência
          await supabase
            .from("tenant_unidades")
            .update({
              nome: updatedData.nome || undefined,
              cnpj: updatedData.cnpj || undefined,
              cpf: updatedData.cpf || undefined,
              telefone: updatedData.telefone || undefined,
              whatsapp: updatedData.whatsapp || undefined,
              cep: updatedData.cep || undefined,
              rua: updatedData.rua || undefined,
              numero: updatedData.numero || undefined,
              complemento: updatedData.complemento || undefined,
              bairro: updatedData.bairro || undefined,
              cidade: updatedData.cidade || undefined,
              estado: updatedData.estado || undefined,
            } as any)
            .eq("tenant_id", tenantId)
            .eq("is_sede", true);
        } catch (syncErr) {
          console.warn("[useDadosEmpresa] Erro ao sincronizar tabela tenants/unidades:", syncErr);
        }
      }

      setData(updatedData);
      setOriginalData(updatedData);
      queryClient.invalidateQueries({ queryKey: [BARBERSHOP_PENDING_QUERY_KEY] });
      toast.success("Dados salvos com sucesso");
    } catch (err) {
      console.error("Erro ao salvar:", err);
      toast.error("Erro ao salvar dados");
    } finally {
      setSaving(false);
    }
  };

  const update = (field: keyof CompanyData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  return { data, originalData, loading, saving, hasChanges, update, saveData, setData };
}
