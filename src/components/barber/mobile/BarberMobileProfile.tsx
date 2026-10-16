import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarEditSheet } from "@/components/admin/mobile/AvatarEditSheet";
import { BarberContext } from "@/pages/Barbeiro";
import {
  Loader2, ChevronRight, LogOut, Megaphone,
  Send, Star, BarChart3, ArrowRight,
} from "lucide-react";
import { CopyCode } from "@/components/ui/copy-code-button";
import { SetupCompletionBanner } from "@/components/barber/SetupCompletionBanner";
import { useSetupCompletion } from "@/hooks/useSetupCompletion";
import { useBarberAvaliacoes } from "@/hooks/useBarberAvaliacoes";
import { useStatusBarColor } from "@/hooks/useStatusBarColor";
import { ThemeSegmentedToggle } from "@/components/profile/ThemeSegmentedToggle";
import { WhenToSendDrawer } from "@/components/admin/WhenToSendDrawer";
import { SelectBarbeariaDrawer } from "@/components/admin/unidades/SelectBarbeariaDrawer";
import { ProfileInstagramBanner } from "@/components/profile/ProfileInstagramBanner";

interface BarberMobileProfileProps {
  barberContext: BarberContext;
  basePath?: string;
  isTenantAdmin?: boolean;
}

/**
 * Perfil mobile do Barbeiro — design IDÊNTICO ao AdminMobileProfile.
 * Diferenças pra funcionário: sem "Barbearias", sem edição de banner,
 * campanha leva pra tela "ainda não temos uma campanha pra você".
 */
// Cache síncrono em localStorage para render instantâneo (0ms) ao entrar no perfil.
const PROFILE_CACHE_PREFIX = "dub:barber-profile:v1:";
interface CachedProfile {
  email: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  tenantLogo: string | null;
  tenantName: string;
  tenantSlug: string | null;
  updatedAt?: number;
}
const PROFILE_CACHE_TTL_MS = 60 * 1000; // Revalida em background só após 60s.
function readProfileCache(barbeiroId: string): CachedProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_PREFIX + barbeiroId);
    return raw ? (JSON.parse(raw) as CachedProfile) : null;
  } catch {
    return null;
  }
}
function writeProfileCache(barbeiroId: string, data: CachedProfile) {
  try {
    localStorage.setItem(
      PROFILE_CACHE_PREFIX + barbeiroId,
      JSON.stringify({ ...data, updatedAt: Date.now() }),
    );
  } catch {
    /* ignore quota */
  }
}

export function BarberMobileProfile({ barberContext, basePath = "/barbeiro", isTenantAdmin = false }: BarberMobileProfileProps) {
  const navigate = useNavigate();
  const setupCompletion = useSetupCompletion({
    userId: barberContext.userId,
    barbeiroId: barberContext.barbeiroId,
    basePath,
    tenantId: barberContext.tenantId,
    excludeSteps: ["whatsapp", "carteira"],
  });

  // Hidratação síncrona do cache — evita spinner quando o perfil já foi visto.
  const cached = typeof window !== "undefined" ? readProfileCache(barberContext.barbeiroId) : null;

  const [loggingOut, setLoggingOut] = useState(false);
  const [showWhenToSend, setShowWhenToSend] = useState(false);
  const [email, setEmail] = useState(cached?.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(cached?.avatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(cached?.bannerUrl ?? null);
  const [tenantLogo, setTenantLogo] = useState<string | null>(cached?.tenantLogo ?? null);
  const [tenantName, setTenantName] = useState<string>(cached?.tenantName ?? "");
  const [tenantSlug, setTenantSlug] = useState<string | null>(cached?.tenantSlug ?? null);
  const [avatarEditOpen, setAvatarEditOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [barbeariaDrawerOpen, setBarbeariaDrawerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    // Se o cache ainda está fresco, evita qualquer round-trip ao entrar na aba.
    if (cached?.updatedAt && Date.now() - cached.updatedAt < PROFILE_CACHE_TTL_MS) {
      return;
    }
    const doLoad = async () => {
      try {
        // Sessão local — sem round-trip de rede.
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (!mounted || !user) return;

        const userEmail = user.email || "";
        if (mounted) setEmail(userEmail);

        // 3 queries em paralelo (tenant já embutido no join com barbeiros).
        const [profileRes, barbeiroRes, bannerRes] = await Promise.all([
          supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle(),
          supabase
            .from("barbeiros")
            .select("foto_url, tenant_id, tenants:tenant_id(slug, nome, logo_url)")
            .eq("id", barberContext.barbeiroId)
            .maybeSingle(),
          supabase.rpc("get_admin_banner_for_barber", { p_barbeiro_id: barberContext.barbeiroId }),
        ]);
        if (!mounted) return;

        const nextAvatar = profileRes.data?.avatar_url || barbeiroRes.data?.foto_url || null;
        const nextBanner = (!bannerRes.error && bannerRes.data) ? (bannerRes.data as string) : null;
        const tenant = (barbeiroRes.data as { tenants?: { slug: string | null; nome: string | null; logo_url: string | null } | null } | null)?.tenants ?? null;
        const nextTenantSlug = tenant?.slug || null;
        const nextTenantName = tenant?.nome || "";
        const nextTenantLogo = tenant?.logo_url || null;

        setAvatarUrl(nextAvatar);
        setBannerUrl(nextBanner);
        setTenantSlug(nextTenantSlug);
        setTenantName(nextTenantName);
        setTenantLogo(nextTenantLogo);

        writeProfileCache(barberContext.barbeiroId, {
          email: userEmail,
          avatarUrl: nextAvatar,
          bannerUrl: nextBanner,
          tenantLogo: nextTenantLogo,
          tenantName: nextTenantName,
          tenantSlug: nextTenantSlug,
        });
      } catch (error) {
        console.error("Erro ao carregar perfil:", error);
      } finally {}
    };
    doLoad();
    return () => { mounted = false; };
  }, [barberContext.barbeiroId]);

  const fullLink = tenantSlug ? `https://dubagenda.lovable.app/${tenantSlug}` : "";
  const displayLink = tenantSlug ? `dubagenda.lovable.app/${tenantSlug}` : "";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); return; }
    setSelectedFile(file);
    setAvatarEditOpen(true);
    e.target.value = "";
  };

  const initials = barberContext.apelido
    ? barberContext.apelido.charAt(0).toUpperCase()
    : email ? email.charAt(0).toUpperCase() : "B";

  useStatusBarColor("app-background");

  const { data: barberReviews = [] } = useBarberAvaliacoes(barberContext.barbeiroId);
  const barberStats = useMemo(() => {
    if (!barberReviews || barberReviews.length === 0) {
      return { rating: "5.0", count: 0 };
    }
    const sum = barberReviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
    const avg = (sum / barberReviews.length).toFixed(1);
    return { rating: avg, count: barberReviews.length };
  }, [barberReviews]);

  const handleCampaignClick = () => {
    // A rota /promocoes já renderiza AdminPromocoes para tenant admin
    // e BarberCampanhaEmpty para barbeiros funcionários.
    navigate(`${basePath}/promocoes`);
  };

  const handleConfigBarbeariaClick = async () => {
    const tid = barberContext.tenantId;
    if (!tid) {
      navigate(`${basePath}/config-barbearia`);
      return;
    }

    try {
      const { data: units } = await supabase
        .from("tenant_unidades")
        .select("id, nome")
        .eq("tenant_id", tid);

      // Se só existir uma barbearia (ou nenhuma cadastrada ainda), entra DIRETO sem subir a gaveta!
      if (!units || units.length <= 1) {
        const singleId = units?.[0]?.id;
        navigate(singleId ? `${basePath}/config-barbearia?unidade=${singleId}` : `${basePath}/config-barbearia`);
      } else {
        // Se houver mais de uma barbearia, aí sim abre a gaveta de escolha
        setBarbeariaDrawerOpen(true);
      }
    } catch {
      navigate(`${basePath}/config-barbearia`);
    }
  };

  return (
    <>
      <div
        className="min-h-screen bg-background text-foreground"
        style={{ paddingBottom: "calc(6.5rem + var(--app-safe-bottom, 8px))" }}
      >
      {/* Container principal */}
      <div className="max-w-lg mx-auto">
        {/* ═══ BANNER FINO NO TOPO (edge-to-edge, sob a status bar) ═══ */}
        <div className="relative isolate bg-background pointer-events-none">
          <div
            className="relative w-full overflow-hidden bg-muted pointer-events-none"
            style={{ height: "calc(6.5rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}
          >
            {bannerUrl ? (
              <img
                src={bannerUrl}
                alt="Banner da barbearia"
                className="w-full h-full object-cover select-none pointer-events-none"
                style={{ objectPosition: "center" }}
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-muted via-muted/70 to-background pointer-events-none" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-background pointer-events-none" />
          </div>
        </div>

        {/* ═══ HEADER ABAIXO DO BANNER — avatar sobrepondo 50/50 o banner ═══ */}
        <div className="relative px-5 pt-0 pb-2 -mt-8">
          <div className="flex items-end gap-3.5">
            {/* Avatar com logo da barbearia sobreposta */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative flex-shrink-0"
              aria-label="Alterar foto de perfil"
            >
              <Avatar className="h-16 w-16 border-[2.5px] border-background shadow-md">
                <AvatarImage src={avatarUrl || undefined} alt="Barbeiro" className="object-cover" />
                <AvatarFallback className="bg-secondary text-foreground text-lg font-semibold">{initials}</AvatarFallback>
              </Avatar>
              {tenantLogo && (
                <div
                  className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full bg-background border-[2px] border-background shadow-sm overflow-hidden"
                  aria-label="Logo da barbearia"
                >
                  <img src={tenantLogo} alt="Logo" className="h-full w-full object-cover" />
                </div>
              )}
            </button>

            {/* Nome + subtítulo — 100% clean & sério, sem badge Dono/Barbeiro e sem status Ativo */}
            <div className="min-w-0 flex-1 pb-1">
              <h2 className="text-[19px] font-bold text-foreground leading-tight truncate">
                {barberContext.apelido || "Barbeiro"}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {tenantName && (
                  <span className="text-[12.5px] text-muted-foreground truncate">
                    {tenantName}
                  </span>
                )}
                {tenantName && (
                  <span className="text-muted-foreground/30 text-[10px]">•</span>
                )}
                <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground shrink-0">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="font-semibold text-foreground">{barberStats.rating}</span>
                  {barberStats.count > 0 && (
                    <span className="text-[10.5px] text-muted-foreground/70">({barberStats.count})</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {tenantSlug && (
            <div className="mt-4">
              <CopyCode code={fullLink} label={displayLink} />
            </div>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

        {/* ═══ ACESSOS PRINCIPAIS ESTRATÉGICOS (3 CARDS 100% SÉRIOS & MINIMALISTAS - PADRÃO IMAGEM 2) ═══ */}
        <div className="grid grid-cols-3 gap-2.5 mt-5 mx-5">
          {/* Card 1: Disparo */}
          <button
            type="button"
            onClick={() => setShowWhenToSend(true)}
            className="group relative flex flex-col justify-between p-3.5 rounded-2xl bg-card border border-border/50 hover:bg-secondary/40 active:scale-[0.98] transition-transform duration-100 shadow-xs text-left min-h-[112px] cursor-pointer touch-manipulation"
          >
            <div className="text-red-500 dark:text-red-500 transition-transform duration-200 group-hover:scale-105">
              <Send className="w-6 h-6 stroke-[1.8]" />
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 w-full">
                <span className="text-[13.5px] font-semibold text-foreground tracking-tight block leading-tight">
                  Disparo
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 group-hover:translate-x-0.5" />
              </div>
              <span className="text-[11px] text-muted-foreground block truncate mt-1 font-normal">
                Mensagens em massa
              </span>
            </div>
          </button>

          {/* Card 2: WhatsApp */}
          <button
            type="button"
            onClick={() => navigate(`${basePath}/whatsapp`)}
            className="group relative flex flex-col justify-between p-3.5 rounded-2xl bg-card border border-border/50 hover:bg-secondary/40 active:scale-[0.98] transition-transform duration-100 shadow-xs text-left min-h-[112px] cursor-pointer touch-manipulation"
          >
            <div className="text-foreground transition-transform duration-200 group-hover:scale-105">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-6 h-6"
                aria-hidden="true"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 w-full">
                <span className="text-[13.5px] font-semibold text-foreground tracking-tight block leading-tight">
                  WhatsApp
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 group-hover:translate-x-0.5" />
              </div>
              <span className="text-[11px] text-muted-foreground block truncate mt-1 font-normal">
                Atendimento
              </span>
            </div>
          </button>

          {/* Card 3: Campanhas & Promoções */}
          <button
            type="button"
            onClick={handleCampaignClick}
            className="group relative flex flex-col justify-between p-3.5 rounded-2xl bg-card border border-border/50 hover:bg-secondary/40 active:scale-[0.98] transition-transform duration-100 shadow-xs text-left min-h-[112px] cursor-pointer touch-manipulation"
          >
            <div className="text-foreground transition-transform duration-200 group-hover:scale-105">
              <Megaphone className="w-6 h-6 stroke-[1.8]" />
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 w-full">
                <span className="text-[13.5px] font-semibold text-foreground tracking-tight block leading-tight">
                  Campanhas
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 group-hover:translate-x-0.5" />
              </div>
              <span className="text-[11px] text-muted-foreground block truncate mt-1 font-normal">
                Promoções
              </span>
            </div>
          </button>
        </div>

        {/* ═══ BANNER DE CONFIGURAÇÃO (SE HOUVER ETAPAS PENDENTES) ═══ */}
        <div className="mt-4 mx-5">
          <SetupCompletionBanner
            percentage={setupCompletion.percentage}
            steps={setupCompletion.steps}
            loading={setupCompletion.loading}
            variant="detailed"
            defaultExpanded={false}
          />
        </div>

        {/* ═══ ITENS DE CONFIGURAÇÃO (PADRÃO ATENDIMENTO & NOTIFICAÇÕES: 100% FLAT, SEM QUADRADOS EM VOLTA) ═══ */}
        <div className="mt-5 mx-5 space-y-6">
          {/* Seção: Configurações (exibido apenas se for dono / admin) */}
          {isTenantAdmin && (
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 mb-1">
                Configurações
              </p>
              <div className="divide-y divide-border/25">
                <ProfileMenuItem
                  label="Configurações"
                  description="Horários, serviços, clientes, equipe e dados"
                  onClick={handleConfigBarbeariaClick}
                />
              </div>
            </div>
          )}

          {/* Seção: Gestão & Atendimento Pessoal */}
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 mb-1">
              Gestão & Atendimento Pessoal
            </p>
            <div className="divide-y divide-border/25">
              <ProfileMenuItem label="Meus Serviços" description="Duração dos serviços que você atende" onClick={() => navigate(`${basePath}/servicos`)} />
              <ProfileMenuItem label="Clientes" description="Seus clientes atendidos" onClick={() => navigate(`${basePath}/clientes?mode=meus`)} />
              <ProfileMenuItem label="Avaliação" description="Notas e comentários dos seus clientes" onClick={() => navigate(`${basePath}/avaliacoes`)} />
              <ProfileMenuItem label="Horário de funcionamento" description="Seus dias e horários de trabalho" onClick={() => navigate(`${basePath}/horarios`)} />
              <ProfileMenuItem label="Portfólio" description="Fotos dos seus melhores cortes" onClick={() => navigate(`${basePath}/portfolio`)} />
              <ProfileMenuItem label="Relatórios" description="Estatísticas e desempenho do seu trabalho" onClick={() => navigate(`${basePath}/relatorios`)} />
              <ProfileMenuItem
                label="Suporte"
                description="Fale com nosso time de atendimento"
                onClick={() => window.open("https://wa.me/5511963390043?text=" + encodeURIComponent("Olá! Preciso de suporte no app DUB 🙏"), "_blank", "noopener,noreferrer")}
              />
            </div>
          </div>

          {/* Seção: Conta & Ajustes */}
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 mb-1">
              Conta & Ajustes
            </p>
            <div className="divide-y divide-border/25">
              <ProfileMenuItem label="Financeiro" description="Receitas, extrato e formas de pagamento" onClick={() => navigate(`${basePath}/financeiro`)} />
              <ProfileMenuItem label="WhatsApp" description="Conecte para confirmações e lembretes" onClick={() => navigate(`${basePath}/whatsapp`)} />
              <ProfileMenuItem label="Instagram" description="Conecte seu perfil e exiba seus cortes" onClick={() => navigate(`${basePath}/instagram`)} />
              <ProfileMenuItem label="Meus Dados" description="Foto, identificação, contato e endereço" onClick={() => navigate(`${basePath}/meus-dados`)} />
              <ProfileMenuItem label="Segurança" description="Senha, autenticação e acessos" onClick={() => navigate(`${basePath}/seguranca`)} />
            </div>
          </div>

          {/* ═══ BANNER DO INSTAGRAM ═══ */}
          <ProfileInstagramBanner
            barbeiroId={barberContext.barbeiroId}
            basePath={basePath}
          />

          {/* ═══ RODAPÉ: Sair da conta (esq) + Tema claro/escuro (dir) ═══ */}
          <div className="pt-4 pb-8 flex items-center justify-between">
            <button
              onClick={async () => {
                if (loggingOut) return;
                setLoggingOut(true);
                try {
                  await supabase.auth.signOut();
                  localStorage.removeItem("userRole");
                  localStorage.removeItem("barbeiroId");
                  toast.success("Sessão encerrada");
                  window.location.href = "/login";
                } catch {
                  toast.error("Erro ao sair");
                  setLoggingOut(false);
                }
              }}
              disabled={loggingOut}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-medium text-accent-red hover:bg-accent-red/10 active:scale-[0.97] transition-all disabled:opacity-60"
            >
              {loggingOut
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <LogOut className="w-3.5 h-3.5" />}
              Sair da conta
            </button>

            <ThemeSegmentedToggle />
          </div>
        </div>
      </div>
    </div>

      <AvatarEditSheet
        open={avatarEditOpen}
        onOpenChange={setAvatarEditOpen}
        userId={barberContext.userId}
        initials={initials}
        storagePath="barbeiros"
        selectedFile={selectedFile}
        onAvatarUpdated={(url) => { setAvatarUrl(url); setSelectedFile(null); }}
      />

      <WhenToSendDrawer
        isOpen={showWhenToSend}
        onClose={() => setShowWhenToSend(false)}
        onSelectNow={() => navigate(`${basePath}/disparo`)}
        onSelectSchedule={() => navigate(`${basePath}/disparo?mode=schedule`)}
      />

      <SelectBarbeariaDrawer
        open={barbeariaDrawerOpen}
        onClose={() => setBarbeariaDrawerOpen(false)}
        tenantId={barberContext.tenantId}
        onSelectUnit={(unit) => {
          setBarbeariaDrawerOpen(false);
          navigate(`${basePath}/config-barbearia?unidade=${unit.id}`);
        }}
      />
    </>
  );
}

/* ─── Subcomponent: item 100% sério, alinhado à tipografia e padrão Atendimento & Notificações ─── */
function ProfileMenuItem({
  label,
  description,
  badge,
  onClick,
}: {
  label: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-opacity duration-100 group touch-manipulation"
    >
      <div className="min-w-0 pr-3">
        <div className="flex items-center gap-2">
          <p className="text-[13.5px] font-medium text-foreground leading-snug">
            {label}
          </p>
          {badge && (
            <span className="text-[9.5px] font-medium uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40 shrink-0">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
    </button>
  );
}

function CampaignMenuItem({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-card rounded-2xl border border-border/60 shadow-sm p-4 text-left hover:border-border active:scale-[0.99] transition-all flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Megaphone className="h-5 w-5 text-foreground flex-shrink-0" strokeWidth={1.8} />
        <div className="min-w-0">
          <span className="text-[14.5px] font-semibold text-foreground block leading-tight">
            Ative uma campanha
          </span>
          <span className="text-[12px] text-muted-foreground block truncate mt-0.5">
            Atraia mais clientes com promoções
          </span>
        </div>
      </div>
      <span className="text-[11.5px] font-bold bg-foreground text-background px-3.5 py-1.5 rounded-full flex-shrink-0 shadow-sm">
        Criar
      </span>
    </button>
  );
}
