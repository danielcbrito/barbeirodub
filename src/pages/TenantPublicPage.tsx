import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { TenantLandingPage } from "@/components/tenant/TenantLandingPage";

interface ResolvedTenant {
  id: string;
  nome: string;
  slug: string;
}

/**
 * Resolve links públicos da barbearia e normaliza para URL canônica.
 *
 * Entradas suportadas:
 * - /{tenant_slug} (canônico)
 * - /b/{tenant_slug} (legado)
 * - /{barber_id} ou /{barber_apelido} (legado incorreto)
 */
export default function TenantPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [resolvedTenant, setResolvedTenant] = useState<ResolvedTenant | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setErrorMessage("URL inválida.");
      return;
    }

    const resolve = async () => {
      try {
        // 1) Tenta resolver como slug canônico do tenant
        const { data: tenantBySlug, error: tenantSlugError } = await supabase
          .from("tenants")
          .select("id, nome, slug")
          .eq("slug", slug)
          .maybeSingle();

        if (!tenantSlugError && tenantBySlug) {
          if (location.pathname.startsWith("/b/")) {
            navigate(`/${tenantBySlug.slug}`, { replace: true });
            return;
          }
          setResolvedTenant(tenantBySlug);
          return;
        }

        // 2) Compatibilidade: resolver como barbeiro legado (id UUID ou apelido)
        let barberTenantId: string | null = null;
        let resolvedBarberId: string | null = null;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

        if (isUuid) {
          const { data: barberById } = await supabase
            .from("barbeiros")
            .select("id, tenant_id")
            .eq("id", slug)
            .eq("ativo", true)
            .is("deleted_at", null)
            .maybeSingle();
          barberTenantId = barberById?.tenant_id ?? null;
          resolvedBarberId = barberById?.id ?? null;
        }

        if (!barberTenantId) {
          const { data: barberByNickname } = await supabase
            .from("barbeiros")
            .select("id, tenant_id")
            .ilike("apelido", slug)
            .eq("ativo", true)
            .is("deleted_at", null)
            .maybeSingle();
          barberTenantId = barberByNickname?.tenant_id ?? null;
          resolvedBarberId = barberByNickname?.id ?? null;
        }

        if (!barberTenantId) {
          setErrorMessage("Barbearia não encontrada.");
          return;
        }

        const { data: tenantByBarber } = await supabase
          .from("tenants")
          .select("id, nome, slug")
          .eq("id", barberTenantId)
          .maybeSingle();

        if (!tenantByBarber?.slug) {
          setErrorMessage("Configuração inválida: barbearia sem slug público.");
          return;
        }

        const queryParam = resolvedBarberId ? `?barbeiro=${resolvedBarberId}` : "";
        navigate(`/${tenantByBarber.slug}${queryParam}`, { replace: true });
      } catch {
        setErrorMessage("Erro ao resolver o link da barbearia.");
      }
    };

    resolve();
  }, [slug, navigate, location.pathname]);

  if (errorMessage) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-6 text-center gap-4">
        <h1 className="text-2xl font-bold text-foreground">Link indisponível</h1>
        <p className="text-muted-foreground text-sm max-w-xs">{errorMessage}</p>
        <button
          onClick={() => navigate("/")}
          className="mt-4 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Voltar ao início
        </button>
      </div>
    );
  }

  if (resolvedTenant) {
    return (
      <TenantLandingPage
        tenantId={resolvedTenant.id}
        tenantName={resolvedTenant.nome}
        tenantSlug={resolvedTenant.slug}
      />
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 text-primary animate-spin" />
    </div>
  );
}
