import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve o tenant proprietário mais antigo de um usuário.
 * Isso protege o app contra tenants duplicados criados acidentalmente
 * e mantém o tenant histórico como fonte de verdade.
 */
export async function resolveOldestOwnedTenant<T>(
  userId: string,
  columns: string
): Promise<{ data: T | null; error: unknown }> {
  const { data, error } = await supabase
    .from("tenants")
    .select(columns)
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    data: (data as T | null) ?? null,
    error,
  };
}

/**
 * Resolve o perfil profissional principal de um usuário.
 * Prioriza o barbeiro do tenant histórico do dono; quando não houver tenant próprio,
 * usa o barbeiro ativo mais antigo para evitar cair em perfis duplicados recentes.
 */
export async function resolvePrimaryBarberForUser<T>(
  userId: string
): Promise<{ data: T | null; error: unknown }> {
  const [{ data: ownedTenant, error: tenantError }, { data: barbers, error: barbersError }] =
    await Promise.all([
      supabase
        .from("tenants")
        .select("id")
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("barbeiros")
        .select("*")
        .eq("user_id", userId)
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    ]);

  if (tenantError || barbersError) {
    return {
      data: null,
      error: tenantError ?? barbersError,
    };
  }

  if (!barbers?.length) {
    return { data: null, error: null };
  }

  const ownedTenantId = ownedTenant?.id ?? null;
  const resolvedBarber = ownedTenantId
    ? barbers.find((barber) => barber.tenant_id === ownedTenantId) ?? barbers[0]
    : barbers[0];

  return {
    data: (resolvedBarber as T | null) ?? null,
    error: null,
  };
}

