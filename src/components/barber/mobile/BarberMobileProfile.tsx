import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarEditSheet } from "@/components/admin/mobile/AvatarEditSheet";
import { BarberContext } from "@/pages/Barbeiro";
import {
  Loader2, ChevronRight, Headset, LogOut, Wallet, Megaphone,
} from "lucide-react";
import { CopyCode } from "@/components/ui/copy-code-button";
import { SetupCompletionBanner } from "@/components/barber/SetupCompletionBanner";
import { useSetupCompletion } from "@/hooks/useSetupCompletion";
import { useStatusBarColor } from "@/hooks/useStatusBarColor";
import { ThemeSegmentedToggle } from "@/components/profile/ThemeSegmentedToggle";

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
  const [email, setEmail] = useState(cached?.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(cached?.avatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(cached?.bannerUrl ?? null);
  const [tenantLogo, setTenantLogo] = useState<string | null>(cached?.tenantLogo ?? null);
  const [tenantName, setTenantName] = useState<string>(cached?.tenantName ?? "");
  const [tenantSlug, setTenantSlug] = useState<string | null>(cached?.tenantSlug ?? null);
  const [avatarEditOpen, setAvatarEditOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  const handleCampaignClick = () => {
    // A rota /promocoes já renderiza AdminPromocoes para tenant admin
    // e BarberCampanhaEmpty para barbeiros funcionários.
    navigate(`${basePath}/promocoes`);
  };

  return (
    <>
      <div className="min-h-[var(--app-height,100dvh)] bg-background pb-24">
        {/* ═══ BANNER FINO NO TOPO ═══ */}
        <div className="relative isolate bg-background">
          <div
            className="relative w-full overflow-hidden bg-muted"
            style={{ height: "calc(6.5rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}
          >
            {bannerUrl ? (
              <img
                src={bannerUrl}
                alt="Banner da barbearia"
                className="w-full h-full object-cover"
                style={{ objectPosition: "center" }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-muted via-muted/70 to-background" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-background" />
          </div>
        </div>

        {/* ═══ HEADER — avatar sobrepondo 50/50 o banner ═══ */}
        <div className="relative px-5 pt-0 pb-2 -mt-8">
          <div className="flex items-end gap-3.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative flex-shrink-0"
              aria-label="Alterar foto de perfil"
            >
              <Avatar className="h-16 w-16 border-[2.5px] border-background shadow-md">
                <AvatarImage src={avatarUrl || undefined} alt={barberContext.apelido} className="object-cover" />
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

            <div className="min-w-0 flex-1 pb-1">
              <h2 className="text-[18px] font-bold text-foreground leading-tight truncate">
                {barberContext.apelido || "Barbeiro"}
              </h2>
              {tenantName && (
                <p className="text-[12px] text-muted-foreground/80 leading-tight mt-0.5 truncate">
                  {tenantName}
                </p>
              )}
            </div>
          </div>

          {tenantSlug && (
            <div className="mt-7">
              <CopyCode code={fullLink} label={displayLink} />
            </div>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

        {/* ═══ BANNER DE CONFIGURAÇÃO ═══ */}
        <div className="mt-6 mx-5">
          <SetupCompletionBanner
            percentage={setupCompletion.percentage}
            steps={setupCompletion.steps}
            loading={setupCompletion.loading}
            variant="detailed"
          />
        </div>

        {/* ═══ CARD PREMIUM: DUB PAGO (Carteira) ═══ */}
        <button
          onClick={() => navigate(`${basePath}/carteira`)}
          className="relative w-full mt-1 px-5 text-left active:scale-[0.99] transition-transform"
        >
          <div className="relative rounded-2xl bg-muted/60 dark:bg-muted/30 overflow-hidden">
            <div className="relative bg-card rounded-2xl border border-border/60 shadow-sm px-4 pt-3 pb-3.5">
              <div className="flex items-baseline mb-5">
                <span className="text-[12px] font-bold text-primary tracking-tight leading-none">Dub</span>
                <span className="text-[12px] font-bold text-primary italic tracking-tight leading-none">Pago</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Wallet className="h-[18px] w-[18px] text-foreground flex-shrink-0" strokeWidth={1.6} />
                <p className="flex-1 text-[14px] font-medium text-foreground leading-tight">
                  Minha Carteira
                </p>
                <ChevronRight className="h-[15px] w-[15px] text-muted-foreground/60" strokeWidth={1.8} />
              </div>
            </div>
            <div className="relative px-4 py-2.5">
              <p className="text-[11.5px] font-normal text-muted-foreground leading-tight">
                Gerencie seus recebimentos e saques
              </p>
            </div>
          </div>
        </button>

        {/* ═══ CAMPANHA ═══ */}
        <div className="mt-5 mx-5">
          <CampaignMenuItem onClick={handleCampaignClick} />
        </div>

        {/* ═══ ITENS DE CONFIGURAÇÃO ═══ */}
        <div className="mt-6 mx-5">
          <ProfileMenuItem label="Meus Dados" description="Foto, identificação, contato e endereço" onClick={() => navigate(`${basePath}/meus-dados`)} />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem label="Segurança" description="Senha, autenticação e acessos" onClick={() => navigate(`${basePath}/seguranca`)} />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem label="Meus Serviços" description="Duração dos serviços que você atende" onClick={() => navigate(`${basePath}/servicos`)} />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem label="Clientes" description="Seus clientes atendidos" onClick={() => navigate(`${basePath}/clientes`)} />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem label="Avaliação" description="Notas e comentários dos seus clientes" onClick={() => navigate(`${basePath}/avaliacoes`)} />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem label="Horário de funcionamento" description="Seus dias e horários de trabalho" onClick={() => navigate(`${basePath}/horarios`)} />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem label="Portfólio" description="Fotos dos seus melhores cortes" onClick={() => navigate(`${basePath}/portfolio`)} />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem label="Relatórios" description="Estatísticas e desempenho do seu trabalho" onClick={() => navigate(`${basePath}/relatorios`)} />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem label="Financeiro" description="Receitas, extrato e formas de pagamento" onClick={() => navigate(`${basePath}/financeiro`)} />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem label="WhatsApp" description="Conecte para confirmações e lembretes" onClick={() => navigate(`${basePath}/whatsapp`)} />

          {/* ═══ RODAPÉ: Sair da conta (esq) + Tema claro/escuro (dir) ═══ */}
          <div className="mt-6 flex items-center justify-between gap-3">
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
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-medium text-accent-red hover:bg-accent-red/10 active:scale-[0.97] transition-all disabled:opacity-60"
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


      {/* ═══ BOTÃO FLUTUANTE: Suporte ═══ */}
      <div
        className="fixed right-4 z-40 flex flex-col gap-2.5 items-end"
        style={{ bottom: "calc(5rem + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))" }}
      >
        <button
          onClick={() => window.open("https://wa.me/5511963390043?text=" + encodeURIComponent("Olá! Preciso de suporte no app DUB 🙏"), "_blank", "noopener,noreferrer")}
          className="flex items-center gap-2 h-11 px-5 rounded-full bg-foreground text-background shadow-premium hover:shadow-premium-hover active:scale-[0.97] transition-all"
        >
          <div className="relative">
            <Headset className="w-4 h-4" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-background" />
          </div>
          <span className="text-[13px] font-semibold">Suporte</span>
        </button>
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
    </>
  );
}

function ProfileMenuItem({ label, description, onClick }: { label: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-4 text-left active:opacity-70 transition-opacity"
    >
      <div className="min-w-0">
        <span className="text-[15px] font-medium text-foreground block truncate">{label}</span>
        <span className="text-[12px] text-muted-foreground block truncate">{description}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
    </button>
  );
}

function CampaignMenuItem({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-4 text-left active:opacity-80 transition-opacity"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-xl bg-accent-red/12 flex items-center justify-center flex-shrink-0">
          <Megaphone className="h-[18px] w-[18px] text-accent-red" strokeWidth={1.9} />
        </div>
        <div className="min-w-0">
          <span className="text-[15px] font-semibold text-foreground block leading-tight">
            Ative uma <span className="text-accent-red">campanha</span>
          </span>
          <span className="text-[12px] text-muted-foreground">Atraia mais clientes com promoções</span>
        </div>
      </div>
      <span className="text-[11.5px] font-bold bg-foreground text-background px-3 py-1.5 rounded-full flex-shrink-0 shadow-sm">
        Criar
      </span>
    </button>
  );
}
