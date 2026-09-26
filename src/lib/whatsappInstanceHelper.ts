import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a instância WhatsApp ISOLADA por tenant/barbeiro.
 * 
 * Hierarquia de resolução:
 * 1. Descobre o tenant_id do barbeiro
 * 2. Busca instância do owner do tenant (prioridade)
 * 3. Busca qualquer instância conectada do mesmo tenant
 * 4. Se não tem tenant, busca instância do próprio barbeiro
 * 5. Se nenhuma encontrada → retorna null (NÃO envia mensagem)
 * 
 * ⚠️ NUNCA faz fallback para instância de outro tenant/barbearia.
 */
export async function getWhatsAppInstance(barbeiroId?: string | null): Promise<{
  instance_name: string;
  api_key: string;
  status: string;
} | null> {
  if (!barbeiroId) return null;

  try {
    // 1. Descobrir tenant_id do barbeiro
    const { data: barbeiro } = await supabase
      .from("barbeiros")
      .select("tenant_id")
      .eq("id", barbeiroId)
      .maybeSingle();

    const tenantId = barbeiro?.tenant_id || null;

    if (tenantId) {
      // 2. Prioridade: instância do owner do tenant
      const { data: tenant } = await supabase
        .from("tenants")
        .select("owner_user_id")
        .eq("id", tenantId)
        .maybeSingle();

      if (tenant?.owner_user_id) {
        const { data: ownerBarbers } = await supabase
          .from("barbeiros")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_id", tenant.owner_user_id);

        if (ownerBarbers?.length) {
          const ownerBarberIds = ownerBarbers.map(b => b.id);
          const { data: ownerInstances } = await supabase
            .from("whatsapp_instances")
            .select("instance_name, api_key, status")
            .in("barbeiro_id", ownerBarberIds)
            .eq("status", "connected")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (ownerInstances) {
            return {
              instance_name: ownerInstances.instance_name,
              api_key: ownerInstances.api_key,
              status: ownerInstances.status,
            };
          }
        }
      }

      // 3. Qualquer instância conectada do mesmo tenant
      const { data: tenantBarbers } = await supabase
        .from("barbeiros")
        .select("id")
        .eq("tenant_id", tenantId);

      if (tenantBarbers?.length) {
        const ids = tenantBarbers.map(b => b.id);
        const { data: tenantInst } = await supabase
          .from("whatsapp_instances")
          .select("instance_name, api_key, status")
          .in("barbeiro_id", ids)
          .eq("status", "connected")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (tenantInst) {
          return {
            instance_name: tenantInst.instance_name,
            api_key: tenantInst.api_key,
            status: tenantInst.status,
          };
        }
      }

      // Tenant existe mas não tem WhatsApp → NÃO envia
      console.warn("[whatsappInstanceHelper] Nenhuma instância WhatsApp conectada para o tenant:", tenantId);
      return null;
    }

    // 4. Sem tenant → instância do próprio barbeiro
    const { data: barbInst } = await supabase
      .from("whatsapp_instances")
      .select("instance_name, api_key, status")
      .eq("barbeiro_id", barbeiroId)
      .eq("status", "connected")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (barbInst) {
      return {
        instance_name: barbInst.instance_name,
        api_key: barbInst.api_key,
        status: barbInst.status,
      };
    }

    console.warn("[whatsappInstanceHelper] Nenhuma instância WhatsApp conectada para barbeiro:", barbeiroId);
    return null;
  } catch (err) {
    console.error("[whatsappInstanceHelper] Erro ao resolver instância WhatsApp:", err);
    return null;
  }
}
