/**
 * AdminMeusPlanos — Tela "Meus Planos" do menu Perfil do admin/barbeiro.
 * Mostra apenas as assinaturas vinculadas ao barbeiro logado e permite
 * adicionar planos manualmente (com barbeiro pré-selecionado).
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { useAdminBarbeiroId } from "@/hooks/useAdminBarbeiroId";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import { AdminAssinaturas } from "./AdminAssinaturas";

interface Props {
  basePath?: string;
}

export function AdminMeusPlanos({ basePath = "/admin" }: Props) {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const { barbeiroId, loading: loadingBarbeiro } = useAdminBarbeiroId(userId || "");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingTenant(false);
        return;
      }
      setUserId(user.id);

      const [{ data: barberRow }, { data: ownerTenant }] = await Promise.all([
        supabase
          .from("barbeiros")
          .select("tenant_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        resolveOldestOwnedTenant<{ id: string }>(user.id, "id"),
      ]);

      setTenantId(barberRow?.tenant_id || ownerTenant?.id || null);
      setLoadingTenant(false);
    })();
  }, []);

  if (loadingTenant || loadingBarbeiro) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Institucional Padronizado (Sticky com barra sólida atrás) */}
      <ScheduleHeader
        title="Meus Planos"
        subtitle="Clientes com plano vinculados a você"
        onBack={() => navigate(`${basePath}/perfil`)}
      />

      <AdminAssinaturas
        tenantId={tenantId}
        barbeiroIdFilter={barbeiroId}
        hideBarbeiroColumn={true}
      />
    </div>
  );
}
