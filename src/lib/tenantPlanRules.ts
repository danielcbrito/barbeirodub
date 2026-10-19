import { supabase } from "@/integrations/supabase/client";

export interface TenantPlanRules {
  dias_permitidos?: number[]; // 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
  dias_nomes?: string[];
  mensagem?: string;
}

const MEM_CACHE = new Map<string, { rules: TenantPlanRules | null; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000;

/**
 * Busca as regras exclusivas de agendamento de plano para um tenant específico.
 * Se o tenant não tiver regras configuradas, retorna null (comportamento padrão sem restrição).
 */
export async function fetchTenantPlanRules(
  tenantId?: string | null
): Promise<TenantPlanRules | null> {
  if (!tenantId) return null;

  const cached = MEM_CACHE.get(tenantId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.rules;
  }

  let result: TenantPlanRules | null = null;

  // 1. Tentar buscar em informacoes_empresa pelo tenant_id e chave regras_agendamento_plano
  try {
    const { data } = await supabase
      .from("informacoes_empresa")
      .select("valor")
      .eq("tenant_id", tenantId)
      .eq("chave", "regras_agendamento_plano")
      .maybeSingle();

    if (data?.valor) {
      const parsed = JSON.parse(data.valor);
      if (Array.isArray(parsed?.dias_permitidos)) {
        result = parsed;
      }
    }
  } catch {}

  // 2. Fallback pela chave regras_agendamento_plano_${tenantId}
  if (!result) {
    try {
      const { data } = await supabase
        .from("informacoes_empresa")
        .select("valor")
        .eq("chave", `regras_agendamento_plano_${tenantId}`)
        .maybeSingle();

      if (data?.valor) {
        const parsed = JSON.parse(data.valor);
        if (Array.isArray(parsed?.dias_permitidos)) {
          result = parsed;
        }
      }
    } catch {}
  }

  MEM_CACHE.set(tenantId, { rules: result, timestamp: Date.now() });
  return result;
}

/**
 * Verifica se uma data específica é permitida para clientes com plano ativo,
 * de acordo com as regras do tenant.
 */
export function isDateAllowedForPlan(date: Date, rules?: TenantPlanRules | null): boolean {
  if (!rules || !Array.isArray(rules.dias_permitidos) || rules.dias_permitidos.length === 0) {
    return true; // Sem restrições
  }

  const dayOfWeek = date.getDay(); // 0 a 6
  return rules.dias_permitidos.includes(dayOfWeek);
}
