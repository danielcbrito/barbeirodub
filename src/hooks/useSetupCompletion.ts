import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";

export interface SetupStep {
  id: string;
  label: string;
  completed: boolean;
  route?: string;
}

interface UseSetupCompletionProps {
  userId: string;
  barbeiroId: string;
  basePath?: string;
  /** Mapa de rotas customizado por step id */
  routeOverrides?: Partial<Record<string, string>>;
  /** ID do tenant (para verificar endereço em informacoes_empresa) */
  tenantId?: string | null;
  /** Steps opcionais para ocultar do cálculo/exibição */
  excludeSteps?: string[];
  /** Para contextos admin: não exigir nome/telefone/email do barbeiro */
  personalDataOptional?: boolean;
}

interface CachedSetup {
  steps: SetupStep[];
  percentage: number;
}

/**
 * Hook que calcula a porcentagem de configuração da barbearia.
 * Verifica: foto, dados pessoais, endereço, serviços, horários, WhatsApp e carteira.
 *
 * Endereço: verifica barbeiros_private E informacoes_empresa (admin/tenant).
 * Carteira: verifica Woovi, Asaas legado, conta financeira configurada ou chaves PIX cadastradas.
 *
 * Perf: hidrata sincronicamente do localStorage — mesma metodologia da agenda.
 * Cold start renderiza em ~0ms com o último snapshot enquanto revalida em background.
 */
export function useSetupCompletion({
  userId,
  barbeiroId,
  basePath = "/barbeiro",
  routeOverrides = {},
  tenantId,
  excludeSteps = [],
  personalDataOptional = false,
}: UseSetupCompletionProps) {
  const cacheKey = `setup-completion:${barbeiroId}:${excludeSteps.join(",")}`;
  const cached = barbeiroId ? readSyncCache<CachedSetup>(cacheKey) : null;

  const [steps, setSteps] = useState<SetupStep[]>(cached?.data.steps ?? []);
  const [percentage, setPercentage] = useState(cached?.data.percentage ?? 0);
  const [loading, setLoading] = useState(!cached);
  const inFlightRef = useRef(false);

  // Idade máxima antes de revalidar em background (60s). Se o cache está fresco,
  // pulamos totalmente a rodada de queries — evita "carregando" ao trocar de aba.
  const CACHE_TTL_MS = 60 * 1000;

  useEffect(() => {
    if (!userId || !barbeiroId) return;
    if (inFlightRef.current) return;
    if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) return;
    inFlightRef.current = true;
    void checkCompletion().finally(() => {
      inFlightRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, barbeiroId, tenantId, personalDataOptional, JSON.stringify(excludeSteps)]);

  const checkCompletion = async () => {
    // Se não temos cache, mostramos loading; caso contrário revalidamos silenciosamente.
    if (!cached) setLoading(true);
    try {
      // ── Fase 1: buscar barbeiro para descobrir tenant_id ──
      const barbeiroRes = await supabase
        .from("barbeiros")
        .select("foto_url, asaas_account_id, woovi_pix_key, conta_configurada, conta_financeira_id, tenant_id")
        .eq("id", barbeiroId)
        .maybeSingle();

      const resolvedTenantId = tenantId || barbeiroRes.data?.tenant_id;

      // ── Fase 2: buscar tudo em paralelo com tenant_id resolvido ──
      const servicosQuery = supabase.from("servicos").select("id").limit(1);
      if (resolvedTenantId) {
        servicosQuery.eq("tenant_id", resolvedTenantId);
      }

      const [
        privateRes,
        servicosRes,
        horariosRes,
        whatsappRes,
        pixRes,
        bankRes,
        depositRes,
        profileRes,
      ] = await Promise.all([
        supabase.from("barbeiros_private").select("nome_completo, cpf, telefone, email, endereco_cep, endereco_rua, endereco_cidade, endereco_estado").eq("barbeiro_id", barbeiroId).maybeSingle(),
        servicosQuery,
        supabase.from("configuracoes_horario_barbeiro").select("id, aberto").eq("barbeiro_id", barbeiroId),
        supabase.from("whatsapp_instances" as any).select("status").eq("barbeiro_id", barbeiroId).maybeSingle(),
        // Carteira por chave PIX (por usuário ou por barbeiro)
        supabase
          .from("chaves_pix")
          .select("id")
          .or(`user_id.eq.${userId},barbeiro_id.eq.${barbeiroId}`)
          .limit(1),
        // Carteira por conta bancária (por usuário ou por barbeiro)
        supabase
          .from("contas_bancarias")
          .select("id")
          .or(`user_id.eq.${userId},barbeiro_id.eq.${barbeiroId}`)
          .limit(1),
        // Carteira por uso real (depósito confirmado)
        supabase
          .from("depositos")
          .select("id")
          .or(`user_id.eq.${userId},barbeiro_id.eq.${barbeiroId}`)
          .in("status", ["confirmado", "paid", "completed"])
          .limit(1),
        // Foto no profile (paralelizado — antes rodava sequencial após barbeiroRes)
        supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle(),
      ]);

      // ── Foto ──
      const hasPhoto = !!barbeiroRes.data?.foto_url || !!profileRes.data?.avatar_url;

      // ── Dados pessoais ──
      const priv = privateRes.data;
      const hasDadosPessoais = personalDataOptional || !!(
        priv?.nome_completo &&
        priv?.telefone &&
        priv?.email
      );

      // ── Endereço (barbeiros_private) ──
      let hasEndereco = !!(
        priv?.endereco_cep &&
        priv?.endereco_rua &&
        priv?.endereco_cidade &&
        priv?.endereco_estado
      );

      // Se não encontrou em barbeiros_private, verificar informacoes_empresa
      if (!hasEndereco) {
        const hasCompanyAddress = (empresaRows: Array<{ chave: string; valor: string | null }>) => {
          const getValue = (chave: string) =>
            empresaRows.find((r) => r.chave === chave)?.valor?.trim() || "";

          const cidade = getValue("cidade");
          const estado = getValue("estado");
          const rua = getValue("rua");
          const enderecoCompleto = getValue("endereco_completo");

          return !!((rua && cidade && estado) || (enderecoCompleto && cidade));
        };

        // 1) Tenta localização do tenant
        if (resolvedTenantId) {
          const { data: tenantRows } = await supabase
            .from("informacoes_empresa")
            .select("chave, valor")
            .eq("tenant_id", resolvedTenantId)
            .eq("categoria", "localizacao");

          if (tenantRows && tenantRows.length > 0) {
            hasEndereco = hasCompanyAddress(tenantRows as Array<{ chave: string; valor: string | null }>);
          }
        }

        // 2) Fallback global (tenant_id null) para bases legadas/mistas
        if (!hasEndereco) {
          const { data: globalRows } = await supabase
            .from("informacoes_empresa")
            .select("chave, valor")
            .is("tenant_id", null)
            .eq("categoria", "localizacao");

          if (globalRows && globalRows.length > 0) {
            hasEndereco = hasCompanyAddress(globalRows as Array<{ chave: string; valor: string | null }>);
          }
        }
      }

      // ── Serviços ──
      const hasServicos = (servicosRes.data?.length || 0) > 0;

      // ── Horários (pelo menos 1 dia aberto) ──
      const hasHorarios = (horariosRes.data || []).some((h: any) => h.aberto);

      // ── WhatsApp ──
      const hasWhatsApp = (whatsappRes.data as any)?.status === "connected";

      // ── Carteira: Woovi, Asaas legado, conta financeira configurada ou chaves PIX cadastradas ──
      const hasCarteira =
        !!barbeiroRes.data?.woovi_pix_key ||
        !!barbeiroRes.data?.asaas_account_id ||
        (!!barbeiroRes.data?.conta_configurada && !!barbeiroRes.data?.conta_financeira_id) ||
        !!(privateRes.data as any)?.asaas_api_key ||
        (pixRes.data?.length || 0) > 0 ||
        (bankRes.data?.length || 0) > 0 ||
        (depositRes.data?.length || 0) > 0;

      // ── Rotas ──
      // ── Dados Gerais: unifica foto + dados pessoais + endereço ──
      const hasDadosGerais = hasPhoto && hasDadosPessoais && hasEndereco;

      const defaultRoutes: Record<string, string> = {
        dados_gerais: `${basePath}/meus-dados`,
        servicos: `${basePath}/servicos`,
        horarios: `${basePath}/horarios`,
        whatsapp: `${basePath}/whatsapp`,
        carteira: `${basePath}/financeiro`,
      };

      // Compatibilidade retroativa: aceita chaves antigas (dados/endereco)
      const getRoute = (id: string) => {
        if (id === "dados_gerais") {
          return routeOverrides.dados_gerais || routeOverrides.dados || routeOverrides.endereco || defaultRoutes[id];
        }
        return routeOverrides[id] || defaultRoutes[id];
      };

      const newSteps: SetupStep[] = [
        { id: "dados_gerais", label: "Dados gerais", completed: hasDadosGerais, route: getRoute("dados_gerais") },
        { id: "servicos", label: "Serviços", completed: hasServicos, route: getRoute("servicos") },
        { id: "horarios", label: "Horários", completed: hasHorarios, route: getRoute("horarios") },
        { id: "whatsapp", label: "WhatsApp", completed: hasWhatsApp, route: getRoute("whatsapp") },
        { id: "carteira", label: "Carteira digital", completed: hasCarteira, route: getRoute("carteira") },
      ];

      const excluded = new Set(excludeSteps);
      const visibleSteps = newSteps.filter((step) => !excluded.has(step.id));

      const nextPercentage = visibleSteps.length === 0
        ? 100
        : Math.round((visibleSteps.filter((s) => s.completed).length / visibleSteps.length) * 100);

      setSteps(visibleSteps);
      setPercentage(nextPercentage);
      writeSyncCache<CachedSetup>(cacheKey, { steps: visibleSteps, percentage: nextPercentage });
    } catch (error) {
      console.error("Erro ao verificar configuração:", error);
    } finally {
      setLoading(false);
    }
  };

  return { steps, percentage, loading, isComplete: percentage === 100, refresh: checkCompletion };
}
