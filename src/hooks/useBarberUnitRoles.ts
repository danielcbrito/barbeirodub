import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { STALE_TIMES } from '@/lib/queryConstants';
import { QUERY_KEYS } from '@/lib/queryKeys';

// ── Types ──────────────────────────────────────────────────
export type RoleLevel = 'barber' | 'unit_admin' | 'full_control';

export interface BarberUnitMember {
  id: string;
  barbeiro_id: string;
  unidade_id: string;
  role_level: RoleLevel;
  barbeiro: {
    id: string;
    apelido: string;
    foto_url: string | null;
    ativo: boolean;
    profile: { nome: string } | null;
  };
}

// ── Raw shape returned by Supabase join ────────────────────
interface RawRow {
  id: string;
  barbeiro_id: string;
  unidade_id: string;
  role_level: string | null;
  barbeiro: {
    id: string;
    apelido: string;
    foto_url: string | null;
    ativo: boolean;
    profile: { nome: string } | null;
  } | null;
}

// ── Hook ───────────────────────────────────────────────────
export function useBarberUnitRoles(unidadeId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryKey = QUERY_KEYS.shared.unitMembers(unidadeId ?? '');

  // ── Query ──────────────────────────────────────────────
  const {
    data: members = [],
    isLoading,
    error,
    refetch,
  } = useQuery<BarberUnitMember[]>({
    queryKey,
    queryFn: async (): Promise<BarberUnitMember[]> => {
      if (!unidadeId) return [];

      const { data, error: queryError } = await supabase
        .from('barbeiro_unidades')
        .select(`
          id, barbeiro_id, unidade_id, role_level,
          barbeiro:barbeiros!barbeiro_id (
            id, apelido, foto_url, ativo,
            profile:profiles!barbeiros_user_id_profiles_fkey ( nome )
          )
        `)
        .eq('unidade_id', unidadeId)
        .order('role_level', { ascending: false });

      if (queryError) throw new Error(queryError.message);

      // Normalize raw rows into typed members
      return ((data ?? []) as unknown as RawRow[])
        .filter((row): row is RawRow & { barbeiro: NonNullable<RawRow['barbeiro']> } => row.barbeiro !== null)
        .map((row) => ({
          id: row.id,
          barbeiro_id: row.barbeiro_id,
          unidade_id: row.unidade_id,
          role_level: (row.role_level ?? 'barber') as RoleLevel,
          barbeiro: {
            id: row.barbeiro.id,
            apelido: row.barbeiro.apelido,
            foto_url: row.barbeiro.foto_url,
            ativo: row.barbeiro.ativo,
            profile: row.barbeiro.profile ?? null,
          },
        }));
    },
    enabled: !!unidadeId,
    staleTime: STALE_TIMES.UNIDADE_MEMBROS,
  });

  // ── Mutation ───────────────────────────────────────────
  const mutation = useMutation<void, Error, { barbeiroId: string; newRole: RoleLevel }>({
    mutationFn: async ({ barbeiroId, newRole }) => {
      const { error: updateError } = await supabase
        .from('barbeiro_unidades')
        .update({ role_level: newRole } as any)
        .eq('barbeiro_id', barbeiroId)
        .eq('unidade_id', unidadeId!);

      if (updateError) throw new Error(updateError.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: 'Permissão atualizada',
        description: 'Permissão atualizada — aplicado em tempo real.',
      });
    },
    onError: (err) => {
      toast({
        title: 'Erro ao atualizar permissão',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const updateRole = async (barbeiroId: string, newRole: RoleLevel): Promise<void> => {
    await mutation.mutateAsync({ barbeiroId, newRole });
  };

  // ── Realtime subscription ──────────────────────────────
  useEffect(() => {
    if (!unidadeId) return;

    // Nome único por instância evita "cannot add postgres_changes after subscribe()"
    // quando o hook monta duas vezes (StrictMode) ou em mais de um componente.
    const topic = `barber-roles-${unidadeId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'barbeiro_unidades',
          filter: `unidade_id=eq.${unidadeId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shared.unitMembers(unidadeId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId]);


  return {
    members,
    isLoading,
    error: error ?? null,
    updateRole,
    isUpdating: mutation.isPending,
    refetch,
  };
}
