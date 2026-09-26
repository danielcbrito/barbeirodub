import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";

/**
 * Entry point para o painel do tenant (dono da barbearia SaaS).
 * Verifica autenticação e redireciona para o painel correto.
 * 
 * Por hora, carrega o painel Admin completo com contexto do tenant.
 * No futuro, pode ser expandido para um painel multi-tenant totalmente isolado.
 */
const MinhaBarbearia = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const { user, isReady } = useAuthReady();

  useEffect(() => {
    if (!isReady) return;

    let isMounted = true;

    const check = async () => {
      if (!user) {
        navigate("/", { replace: true });
        return;
      }

      const { data: tenant } = await supabase
        .from("tenants")
        .select("id, onboarding_completed, nome")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (tenant?.onboarding_completed) {
        navigate("/tenant/admin", { replace: true });
        return;
      }

      if (tenant) {
        navigate("/onboarding");
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const isTenantAdmin = roles?.some((r) => r.role === "tenant_admin");

      if (isTenantAdmin) {
        navigate("/onboarding", { replace: true });
        return;
      }

      navigate("/", { replace: true });
    };

    check().finally(() => {
      if (isMounted) {
        setChecking(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isReady, navigate, user]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  return null;
};

export default MinhaBarbearia;
