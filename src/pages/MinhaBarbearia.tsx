import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";

/**
 * Entry point para o painel do tenant (dono da barbearia SaaS).
 * Verifica autenticação e redireciona para o painel correto.
 */
const MinhaBarbearia = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(false);
  const { user, isReady } = useAuthReady();

  const check = async () => {
    setChecking(true);
    setError(false);
    try {
      if (!user) {
        navigate("/", { replace: true });
        return;
      }

      const { data: tenant, error: tenantErr } = await supabase
        .from("tenants")
        .select("id, onboarding_completed, nome")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (tenantErr) throw tenantErr;

      if (tenant?.onboarding_completed) {
        navigate("/tenant/admin", { replace: true });
        return;
      }

      if (tenant) {
        navigate("/onboarding");
        return;
      }

      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (rolesErr) throw rolesErr;

      const isTenantAdmin = roles?.some((r) => r.role === "tenant_admin");

      if (isTenantAdmin) {
        navigate("/onboarding", { replace: true });
        return;
      }

      navigate("/", { replace: true });
    } catch (err) {
      console.error("Erro ao verificar barbearia:", err);
      setError(true);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!isReady) return;
    check();
  }, [isReady, navigate, user]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4 gap-3 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500/80" />
        <p className="text-sm text-muted-foreground">Não foi possível carregar a barbearia.</p>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => check()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Tentar novamente
          </button>
          <button
            onClick={() => navigate("/", { replace: true })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
          >
            Início
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default MinhaBarbearia;
