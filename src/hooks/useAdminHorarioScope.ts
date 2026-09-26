import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { STALE_TIMES } from '@/lib/queryConstants';
import { resolveOldestOwnedTenant } from '@/lib/tenantOwnership';

interface TenantData {
  id: string;
  nome: string | null;
  cidade: string | null;
}

interface UnidadeData {
  id: string;
  nome: string;
  cidade: string | null;
  ativo: boolean | null;
}

interface AdminHorarioScope {
  effectiveBarbeiroId: string | null;
  tenantData: TenantData | null;
  rawUnidades: UnidadeData[];
}

/**
 * Resolve o contexto do admin para horários usando fallback do usuário autenticado.
 * Isso evita telas vazias quando a rota não injeta o barbeiroId explicitamente.
 */
export function useAdminHorarioScope(barbeiroId?: string) {
  return useQuery({
    queryKey: ['admin-horario-scope', barbeiroId],
    staleTime: STALE_TIMES.HORARIOS,
    queryFn: async (): Promise<AdminHorarioScope> => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const userId = sessionData.session?.user?.id ?? null;
      let effectiveBarbeiroId = barbeiroId ?? null;
      let tenantData: TenantData | null = null;

      const loadTenantById = async (tenantId: string): Promise<TenantData | null> => {
        const { data, error } = await supabase
          .from('tenants')
          .select('id, nome, cidade')
          .eq('id', tenantId)
          .maybeSingle();

        if (error) throw error;
        return data ?? null;
      };

      if (effectiveBarbeiroId) {
        const { data: barberById, error: barberByIdError } = await supabase
          .from('barbeiros')
          .select('tenant_id')
          .eq('id', effectiveBarbeiroId)
          .is('deleted_at', null)
          .maybeSingle();

        if (barberByIdError) throw barberByIdError;

        if (barberById?.tenant_id) {
          tenantData = await loadTenantById(barberById.tenant_id);
        }
      }

      if (userId && (!effectiveBarbeiroId || !tenantData)) {
        const [barberByUserRes, ownerTenantRes] = await Promise.all([
          supabase
            .from('barbeiros')
            .select('id, tenant_id')
            .eq('user_id', userId)
            .eq('ativo', true)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          resolveOldestOwnedTenant<TenantData>(userId, 'id, nome, cidade'),
        ]);

        if (barberByUserRes.error) throw barberByUserRes.error;
        if (ownerTenantRes.error) throw ownerTenantRes.error;

        if (!effectiveBarbeiroId) {
          effectiveBarbeiroId = barberByUserRes.data?.id ?? null;
        }

        if (!tenantData) {
          tenantData = ownerTenantRes.data ?? null;
        }

        if (!tenantData && barberByUserRes.data?.tenant_id) {
          tenantData = await loadTenantById(barberByUserRes.data.tenant_id);
        }
      }

      let rawUnidades: UnidadeData[] = [];

      if (tenantData?.id) {
        const { data, error } = await supabase
          .from('tenant_unidades')
          .select('id, nome, cidade, ativo')
          .eq('tenant_id', tenantData.id)
          .eq('ativo', true)
          .order('nome');

        if (error) throw error;
        rawUnidades = data ?? [];
      }

      return {
        effectiveBarbeiroId,
        tenantData,
        rawUnidades,
      };
    },
  });
}