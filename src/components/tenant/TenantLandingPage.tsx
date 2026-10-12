import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Loader2, Star, MapPin, ChevronRight, ChevronLeft, Scissors,
  ExternalLink, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InstagramFeedSection } from "@/components/tenant/InstagramFeedSection";
import { PortfolioGallery } from "@/components/shared/PortfolioGallery";

interface TenantLandingPageProps {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
}

interface TenantDetails {
  nome: string;
  slogan: string | null;
  logo_url: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: number | null;
  longitude: number | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  site: string | null;
}

interface BarberWithRating {
  id: string;
  apelido: string;
  foto_url: string | null;
  avg_rating: number;
  review_count: number;
  on_vacation: boolean;
}

interface EmpresaInfo {
  [key: string]: string;
}

/**
 * Página pública completa da barbearia.
 * Exibe: banner, logo, nome, slogan, localização, avaliações agregadas,
 * todos os profissionais com suas notas e botões de ação.
 */
export function TenantLandingPage({ tenantId, tenantName, tenantSlug }: TenantLandingPageProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<TenantDetails | null>(null);
  const [empresaInfo, setEmpresaInfo] = useState<EmpresaInfo>({});
  const [barbers, setBarbers] = useState<BarberWithRating[]>([]);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  useEffect(() => {
    loadAllData();

    // Realtime: auto-refresh quando tenant for atualizado (ex: logo, nome, slogan)
    const channel = supabase
      .channel(`tenant-landing-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tenants", filter: `id=eq.${tenantId}` },
        () => {
          loadTenantDetails();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadTenantDetails(),
        loadBarbers(),
        loadBanner(),
        loadEmpresaInfo(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  /** Detalhes do tenant */
  const loadTenantDetails = async () => {
    const { data } = await supabase
      .from("tenants")
      .select("nome, slogan, logo_url, bairro, cidade, estado, latitude, longitude, telefone, whatsapp, email, site")
      .eq("id", tenantId)
      .maybeSingle();
    if (data) setTenant(data);
  };

  /** Informações complementares da empresa (tabela chave-valor) */
  const loadEmpresaInfo = async () => {
    // Busca primeiro por tenant_id, fallback para tenant_id IS NULL (global)
    let { data } = await supabase
      .from("informacoes_empresa")
      .select("chave, valor")
      .eq("tenant_id", tenantId)
      .eq("ativo", true);

    if (!data || data.length === 0) {
      const res = await supabase
        .from("informacoes_empresa")
        .select("chave, valor")
        .is("tenant_id", null)
        .eq("ativo", true);
      data = res.data;
    }

    if (data) {
      const map: EmpresaInfo = {};
      data.forEach((row) => { map[row.chave] = row.valor; });
      setEmpresaInfo(map);
    }
  };

  /** Barbeiros ativos do tenant, com avaliações agregadas */
  const loadBarbers = async () => {
    const { data: barbeirosRaw } = await supabase
      .from("barbeiros")
      .select("id, apelido, foto_url")
      .eq("ativo", true)
      .is("deleted_at", null)
      .eq("tenant_id", tenantId)
      .order("apelido");

    if (!barbeirosRaw) { setBarbers([]); return; }

    // Buscar avaliações agregadas + férias do dia atual
    const barberIds = barbeirosRaw.map((b) => b.id);
    const todayStr = new Date().toISOString().slice(0, 10);
    const [{ data: avaliacoes }, { data: ferias }] = await Promise.all([
      supabase
        .from("barbeiro_avaliacoes")
        .select("barber_id, rating")
        .in("barber_id", barberIds),
      supabase
        .from("horarios_excepcionais_barbeiro")
        .select("barbeiro_id")
        .in("barbeiro_id", barberIds)
        .eq("data", todayStr)
        .eq("aberto", false)
        .ilike("motivo", "%férias%"),
    ]);

    const ratingMap: Record<string, { sum: number; count: number }> = {};
    (avaliacoes || []).forEach((a) => {
      if (!ratingMap[a.barber_id]) ratingMap[a.barber_id] = { sum: 0, count: 0 };
      ratingMap[a.barber_id].sum += a.rating;
      ratingMap[a.barber_id].count += 1;
    });

    const onVacationSet = new Set((ferias || []).map((f) => f.barbeiro_id));

    const result: BarberWithRating[] = barbeirosRaw.map((b) => ({
      ...b,
      avg_rating: ratingMap[b.id] ? ratingMap[b.id].sum / ratingMap[b.id].count : 0,
      review_count: ratingMap[b.id]?.count || 0,
      on_vacation: onVacationSet.has(b.id),
    }));

    setBarbers(result);
  };

  /** Banner do owner do tenant */
  const loadBanner = async () => {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("owner_user_id")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantRow?.owner_user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("banner_url")
        .eq("id", tenantRow.owner_user_id)
        .maybeSingle();
      setBannerUrl(profile?.banner_url || null);
    }
  };

  // Dados derivados
  const displayName = tenant?.nome || empresaInfo.nome || tenantName;
  const slogan = tenant?.slogan || empresaInfo.slogan || null;
  const location = buildLocation();
  const totalReviews = barbers.reduce((s, b) => s + b.review_count, 0);
  const avgRating = totalReviews > 0
    ? barbers.reduce((s, b) => s + b.avg_rating * b.review_count, 0) / totalReviews
    : 0;

  function buildLocation(): string | null {
    const bairro = tenant?.bairro || empresaInfo.bairro;
    const cidade = tenant?.cidade || empresaInfo.cidade;
    const estado = tenant?.estado || empresaInfo.estado;
    const parts = [bairro, cidade, estado].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : (empresaInfo.endereco_completo || null);
  }

  const mapsUrl = tenant?.latitude && tenant?.longitude
    ? `https://www.google.com/maps?q=${tenant.latitude},${tenant.longitude}`
    : location
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
      : null;

  const handleLogin = () => navigate("/login", { state: { redirect: `/${tenantSlug}` } });
  const handleRegister = () => navigate("/cadastro", { state: { redirect: `/${tenantSlug}` } });

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-28">
      {/* ═══ BANNER ═══ */}
      <div className="relative">
        <div className="h-52 sm:h-64 w-full overflow-hidden bg-muted">
          {bannerUrl ? (
            <img src={bannerUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-muted to-muted-foreground/10" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-background" />
        </div>

        {/* Botão voltar */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-foreground active:scale-95 transition-transform"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
        </button>

        {/* Logo sobrepondo o banner */}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
          <div className="w-20 h-20 rounded-2xl border-[3px] border-background bg-muted shadow-xl overflow-hidden flex items-center justify-center">
            {tenant?.logo_url ? (
              <img src={tenant.logo_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <Scissors className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* ═══ INFORMAÇÕES ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mt-14 flex flex-col items-center px-5 text-center"
      >
        <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
        {slogan && (
          <p className="text-[13px] text-muted-foreground mt-1 italic">{slogan}</p>
        )}

        {/* Rating agregado */}
        {totalReviews > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span className="text-[13px] font-semibold text-foreground">{avgRating.toFixed(1)}</span>
            <span className="text-[11px] text-muted-foreground">({totalReviews})</span>
          </div>
        )}
      </motion.div>

      {/* ═══ LOCALIZAÇÃO ═══ */}
      {location && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          className="mt-5 mx-5"
        >
          <button
            onClick={() => mapsUrl && window.open(mapsUrl, "_blank")}
            disabled={!mapsUrl}
            className={cn(
              "w-full flex items-center gap-3 p-4 rounded-2xl border border-border/50 bg-card",
              mapsUrl && "active:scale-[0.98] transition-transform"
            )}
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Localização
              </p>
              <p className="text-[13px] text-foreground truncate">{location}</p>
            </div>
            {mapsUrl && (
              <ExternalLink className="w-4 h-4 text-primary/60 flex-shrink-0" />
            )}
          </button>
        </motion.div>
      )}

      {/* ═══ PROFISSIONAIS ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.3 }}
        className="mt-6 px-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
            Profissionais
          </span>
          <span className="text-[12px] text-muted-foreground">{barbers.length}</span>
        </div>

        <div className="space-y-2">
          {barbers.map((barber, idx) => (
            <motion.div
              key={barber.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.35 + idx * 0.06 }}
              className={cn(
                "flex items-center gap-3 p-3.5 rounded-2xl border border-border/40 bg-card",
                barber.on_vacation && "opacity-60"
              )}
            >
              <Avatar className="h-11 w-11 border border-border/30">
                <AvatarImage src={barber.foto_url || undefined} alt={barber.apelido} className="object-cover" />
                <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
                  {barber.apelido.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-medium text-foreground">{barber.apelido}</p>
                  {barber.on_vacation && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-500/15 px-1.5 py-0.5 rounded">
                      Modo Férias
                    </span>
                  )}
                </div>
                {barber.review_count > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span className="text-[12px] font-medium text-foreground">{barber.avg_rating.toFixed(1)}</span>
                    <span className="text-[11px] text-muted-foreground">({barber.review_count})</span>
                  </div>
                )}
              </div>
              {!barber.on_vacation && (
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ═══ PORTFÓLIO ═══ */}
      <PortfolioGallery barberIds={barbers.map(b => b.id)} />

      {/* ═══ INSTAGRAM FEED ═══ */}
      <InstagramFeedSection tenantId={tenantId} />

      {/* ═══ BOTÕES FIXOS ═══ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/30 p-4 flex gap-3 safe-area-bottom">
        <button
          onClick={handleLogin}
          className="flex-1 h-12 rounded-xl bg-muted text-foreground text-[14px] font-semibold active:scale-[0.97] transition-transform"
        >
          Já sou cliente
        </button>
        <button
          onClick={handleRegister}
          className="flex-1 h-12 rounded-xl bg-foreground text-background text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
        >
          Criar conta <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
