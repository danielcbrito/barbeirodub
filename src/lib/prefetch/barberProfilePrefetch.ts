import { supabase } from "@/integrations/supabase/client";

/**
 * Pré-aquece o cache do perfil do barbeiro em localStorage.
 * Roda em paralelo com os prefetches de dashboard/agenda/clientes,
 * garantindo que a aba "Perfil" renderize em ~0ms mesmo no primeiro acesso.
 * Chave e formato precisam bater com PROFILE_CACHE_PREFIX em BarberMobileProfile.
 */
const PROFILE_CACHE_PREFIX = "dub:barber-profile:v1:";

export async function prefetchBarberProfile(
  barbeiroId: string,
  userId: string,
  userEmail: string,
): Promise<void> {
  try {
    // Uma única round-trip para barbeiro+tenant (join embutido) em paralelo
    // com profile e banner. Antes eram 2 round-trips sequenciais.
    const [profileRes, barbeiroRes, bannerRes] = await Promise.all([
      supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle(),
      supabase
        .from("barbeiros")
        .select("foto_url, tenant_id, tenants:tenant_id(slug, nome, logo_url)")
        .eq("id", barbeiroId)
        .maybeSingle(),
      supabase.rpc("get_admin_banner_for_barber", { p_barbeiro_id: barbeiroId }),
    ]);

    const avatarUrl = profileRes.data?.avatar_url || barbeiroRes.data?.foto_url || null;
    const bannerUrl = !bannerRes.error && bannerRes.data ? (bannerRes.data as string) : null;
    const tenant = (barbeiroRes.data as { tenants?: { slug: string | null; nome: string | null; logo_url: string | null } | null } | null)?.tenants ?? null;
    const tenantSlug = tenant?.slug || null;
    const tenantName = tenant?.nome || "";
    const tenantLogo = tenant?.logo_url || null;

    localStorage.setItem(
      PROFILE_CACHE_PREFIX + barbeiroId,
      JSON.stringify({
        email: userEmail,
        avatarUrl,
        bannerUrl,
        tenantLogo,
        tenantName,
        tenantSlug,
        updatedAt: Date.now(),
      }),
    );
  } catch (err) {
    // Prefetch é best-effort — falha silenciosa não bloqueia a UX.
    console.debug("[prefetchBarberProfile] skipped:", err);
  }
}
