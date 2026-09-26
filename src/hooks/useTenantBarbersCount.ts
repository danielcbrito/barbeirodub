import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna a quantidade de barbeiros ativos (não deletados) de um tenant.
 * Usado para mostrar/ocultar recursos que só fazem sentido quando a barbearia
 * tem mais de um profissional (ex.: "Configurações da Empresa").
 */
export function useTenantBarbersCount(tenantId: string | null | undefined) {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(!!tenantId);

  useEffect(() => {
    let mounted = true;
    if (!tenantId) {
      setCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("barbeiros")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .is("deleted_at", null)
      .then(({ count: c }) => {
        if (!mounted) return;
        setCount(c ?? 0);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [tenantId]);

  return { count, loading, hasMultiple: count > 1 };
}
