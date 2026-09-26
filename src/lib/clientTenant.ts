import { supabase } from "@/integrations/supabase/client";

interface ResolveClientTenantOptions {
  forcedTenantId?: string | null;
  userId?: string | null;
}

/**
 * Resolve tenant context for client-facing flows.
 * Priority:
 * 1) forced tenant (route/public link)
 * 2) tenant_clientes link
 * 3) profile preferred barbershop
 * 4) active/pending subscription plan tenant
 * 5) most recent appointment's barber tenant
 */
export async function resolveClientTenantId(
  options: ResolveClientTenantOptions = {}
): Promise<string | null> {
  const forcedTenantId = options.forcedTenantId ?? null;
  if (forcedTenantId) return forcedTenantId;

  let userId = options.userId ?? null;
  if (!userId) {
    const { data: sessionData } = await supabase.auth.getSession();
    userId = sessionData.session?.user?.id ?? null;
  }

  if (!userId) return null;

  const [{ data: tenantCliente }, { data: profile }, { data: activeSubscription }, { data: recentApt }] =
    await Promise.all([
      supabase
        .from("tenant_clientes")
        .select("tenant_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("barbearia_preferida_id")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("assinaturas")
        .select("plano_id")
        .eq("user_id", userId)
        .in("status", ["active", "suspended", "pending_cash"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("agendamentos")
        .select("barbeiro_id")
        .eq("user_id", userId)
        .not("barbeiro_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (tenantCliente?.tenant_id) return tenantCliente.tenant_id;
  if (profile?.barbearia_preferida_id) return profile.barbearia_preferida_id;

  if (activeSubscription?.plano_id) {
    const { data: plan } = await supabase
      .from("planos")
      .select("tenant_id")
      .eq("id", activeSubscription.plano_id)
      .maybeSingle();

    if (plan?.tenant_id) return plan.tenant_id;
  }

  if (recentApt?.barbeiro_id) {
    const { data: barber } = await supabase
      .from("barbeiros")
      .select("tenant_id")
      .eq("id", recentApt.barbeiro_id)
      .maybeSingle();

    if (barber?.tenant_id) return barber.tenant_id;
  }

  return null;
}
