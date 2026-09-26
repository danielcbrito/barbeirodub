import { useState, useEffect } from "react";
import { resolvePrimaryBarberForUser } from "@/lib/tenantOwnership";

/**
 * Hook que busca o barbeiroId associado ao userId do admin.
 * Admins podem ter um registro de barbeiro vinculado via user_id.
 */
export function useAdminBarbeiroId(userId: string) {
  const [barbeiroId, setBarbeiroId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    const fetch = async () => {
      try {
        const { data } = await resolvePrimaryBarberForUser<{ id: string }>(userId);
        setBarbeiroId(data?.id || null);
      } catch (err) {
        console.error("Erro ao buscar barbeiroId do admin:", err);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [userId]);

  return { barbeiroId, loading };
}
