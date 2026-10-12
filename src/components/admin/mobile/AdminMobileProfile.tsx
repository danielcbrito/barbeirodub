import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarEditSheet } from "@/components/admin/mobile/AvatarEditSheet";
import {
  Loader2, ImagePlus,
  ChevronRight, Headset, Wallet, Store, Megaphone, LogOut,
} from "lucide-react";
import { CopyCode } from "@/components/ui/copy-code-button";

import { SetupCompletionBanner } from "@/components/barber/SetupCompletionBanner";
import { useSetupCompletion } from "@/hooks/useSetupCompletion";
import { useAdminBarbeiroId } from "@/hooks/useAdminBarbeiroId";
import { useAtualizarBannerAdmin } from "@/hooks/useAdminMutations";
import { resolveOwnerIdentity } from "@/lib/ownerIdentity";
import { useStatusBarColor } from "@/hooks/useStatusBarColor";
import { ApplyScopeSheet, type ApplyScope } from "@/components/admin/mobile/ApplyScopeSheet";
import { ThemeSegmentedToggle } from "@/components/profile/ThemeSegmentedToggle";
import { useTenantBarbersCount } from "@/hooks/useTenantBarbersCount";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";


interface AdminMobileProfileProps {
  basePath?: string;
  isTenant?: boolean;
}

/**
 * Perfil mobile do Admin/Dono.
 * Estrutura estratégica inspirada em apps modernos (iFood/Uber):
 *  - Identidade: avatar do dono + logo da barbearia sobreposta (dono de tudo)
 *  - Card premium "Dub Pago" (carteira) — cartão flutuante branco sobre base cinza
 *  - Banner de destaque: Campanhas para atrair clientes
 *  - Banner de Filiais (substitui o antigo "Configurações da barbearia")
 *  - Lista limpa de configurações reais (horários, clientes, portfólio, etc)
 */
interface AdminProfileCache {
  userId: string | null;
  email: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  tenantLogo: string | null;
  tenantName: string;
  tenantSlug: string | null;
  tenantId: string | null;
  unitsCount: number;
  profileName: string;
}

const PROFILE_CACHE_KEY = "admin-mobile-profile";

export function AdminMobileProfile({ basePath = "/admin", isTenant = false }: AdminMobileProfileProps) {
  const navigate = useNavigate();
  // Hidratação SÍNCRONA (mesmo motor "Instant Start" do barbeiro):
  // abre com os dados do último acesso em ~0ms e revalida em silêncio.
  const cached = useRef(readSyncCache<AdminProfileCache>(PROFILE_CACHE_KEY)?.data ?? null).current;
  const [loading, setLoading] = useState(!cached);
  const [email, setEmail] = useState(cached?.email ?? "");
  const [userId, setUserId] = useState<string | null>(cached?.userId ?? null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(cached?.avatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(cached?.bannerUrl ?? null);
  const [tenantLogo, setTenantLogo] = useState<string | null>(cached?.tenantLogo ?? null);
  const [tenantName, setTenantName] = useState<string>(cached?.tenantName ?? "");
  const [unitsCount, setUnitsCount] = useState<number>(cached?.unitsCount ?? 0);
  const [tenantId, setTenantId] = useState<string | null>(cached?.tenantId ?? null);

  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeConfig, setScopeConfig] = useState<{
    title: string;
    description: string;
    onConfirm: (scope: ApplyScope) => void;
  } | null>(null);
  const [avatarEditOpen, setAvatarEditOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(cached?.tenantSlug ?? null);
  const [profileName, setProfileName] = useState(cached?.profileName ?? "");

  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const atualizarBanner = useAtualizarBannerAdmin();
  const { barbeiroId: adminBarbeiroId } = useAdminBarbeiroId(userId || "");
  const { hasMultiple: hasMultipleBarbers } = useTenantBarbersCount(tenantId);
  const setupCompletion = useSetupCompletion({
    userId: userId || "",
    barbeiroId: adminBarbeiroId || "",
    basePath,
    personalDataOptional: true,
    routeOverrides: {
      dados_gerais: `${basePath}/dados-empresa`,
      servicos: `${basePath}/servicos/cortes`,
    },
  });

  useEffect(() => { loadProfile(); }, []);

  const patchProfileCache = (patch: Partial<AdminProfileCache>) => {
    const current = readSyncCache<AdminProfileCache>(PROFILE_CACHE_KEY)?.data;
    if (!current) return;
    writeSyncCache<AdminProfileCache>(PROFILE_CACHE_KEY, { ...current, ...patch });
  };

  const loadProfile = async () => {

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Se o cache é de outro usuário, limpa a tela antes de revalidar
      if (cached && cached.userId && cached.userId !== user.id) {
        setAvatarUrl(null); setBannerUrl(null); setTenantLogo(null);
        setTenantName(""); setTenantSlug(null); setTenantId(null);
        setUnitsCount(0); setProfileName("");
      }

      setUserId(user.id);
      setEmail(user.email || "");

      // ── Fase 1: tudo que não depende de nada roda em PARALELO ──
      const [profileRes, identity, ownerTenantRes, barbRes] = await Promise.all([
        supabase.from("profiles").select("avatar_url, banner_url" as any).eq("id", user.id).maybeSingle(),
        resolveOwnerIdentity(user.id),
        supabase.from("tenants").select("id, slug, nome, logo_url")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("barbeiros").select("tenant_id")
          .eq("user_id", user.id).eq("ativo", true).is("deleted_at", null)
          .not("tenant_id", "is", null)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
      ]);

      const profile: any = profileRes.data || {};
      const nextAvatar = profile.avatar_url || null;
      const nextBanner = profile.banner_url || null;
      setAvatarUrl(nextAvatar);
      setBannerUrl(nextBanner);
      setProfileName(identity.displayName);

      let resolvedTenantId: string | null = null;
      let nextSlug: string | null = null;
      let nextName = "";
      let nextLogo: string | null = null;

      const tenant = ownerTenantRes.data as any;
      if (tenant?.id) {
        resolvedTenantId = tenant.id;
        nextSlug = tenant.slug || null;
        nextName = tenant.nome || "";
        nextLogo = tenant.logo_url || null;
      } else if ((barbRes.data as any)?.tenant_id) {
        resolvedTenantId = (barbRes.data as any).tenant_id;
        const { data: t } = await supabase
          .from("tenants").select("slug, nome, logo_url")
          .eq("id", resolvedTenantId).maybeSingle();
        nextSlug = (t as any)?.slug || null;
        nextName = (t as any)?.nome || "";
        nextLogo = (t as any)?.logo_url || null;
      }

      setTenantSlug(nextSlug);
      setTenantName(nextName);
      setTenantLogo(nextLogo);
      setTenantId(resolvedTenantId);

      let nextUnits = 0;
      if (resolvedTenantId) {
        const { count } = await supabase
          .from("unidades" as any)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", resolvedTenantId);
        nextUnits = count || 0;
        setUnitsCount(nextUnits);
      } else {
        setUnitsCount(0);
      }

      writeSyncCache<AdminProfileCache>(PROFILE_CACHE_KEY, {
        userId: user.id,
        email: user.email || "",
        avatarUrl: nextAvatar,
        bannerUrl: nextBanner,
        tenantLogo: nextLogo,
        tenantName: nextName,
        tenantSlug: nextSlug,
        tenantId: resolvedTenantId,
        unitsCount: nextUnits,
        profileName: identity.displayName,
      });
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
    } finally {
      setLoading(false);
    }
  };


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

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); return; }

    setUploadingBanner(true);
    try {
      const fileName = `banner-${userId}-${Date.now()}.webp`;
      const filePath = `banners/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;
      atualizarBanner.mutate(
        { userId, bannerUrl: publicUrl },
        { onSuccess: () => { setBannerUrl(publicUrl); patchProfileCache({ bannerUrl: publicUrl }); } }
      );
    } catch (error: any) {
      console.error("Erro ao fazer upload do banner:", error);
      toast.error("Erro ao fazer upload do banner");
    } finally {
      setUploadingBanner(false);
      e.target.value = "";
    }
  };

  const initials = email ? email.charAt(0).toUpperCase() : "A";

  useStatusBarColor("app-background");

  if (loading) {
    return (
      <div className="min-h-[var(--app-height,100dvh)] bg-background">
        {/* Placeholder do banner — pinta a safe-area no topo enquanto carrega,
            evitando a "faixa cinza/branca" sob a status bar no iOS PWA. */}
        <div
          className="relative w-full overflow-hidden bg-muted"
          style={{ height: "calc(6.5rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}
        >
          <div className="w-full h-full bg-gradient-to-br from-muted via-muted/70 to-background" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-background" />
        </div>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-[var(--app-height,100dvh)] bg-background pb-24">
        {/* ═══ BANNER FINO NO TOPO (edge-to-edge, sob a status bar) ═══ */}
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

          {/* Botão trocar banner — canto superior direito, discreto */}
          <button
            onClick={() => bannerInputRef.current?.click()}
            disabled={uploadingBanner}
            className="absolute right-3 z-10 h-8 px-2.5 rounded-lg bg-black/40 backdrop-blur-sm flex items-center gap-1.5 text-white/90 hover:bg-black/60 active:scale-95 transition-all"
            style={{ top: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 12px)" }}
            aria-label="Alterar banner"
          >
            {uploadingBanner ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            <span className="text-[11px] font-medium">Editar</span>
          </button>
        </div>

        {/* ═══ HEADER ABAIXO DO BANNER — avatar sobrepondo 50/50 o banner ═══ */}
        <div className="relative px-5 pt-0 pb-2 -mt-8">
          <div className="flex items-end gap-3.5">
            {/* Avatar do dono com logo da barbearia sobreposta */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative flex-shrink-0"
              aria-label="Alterar foto de perfil"
            >
              <Avatar className="h-16 w-16 border-[2.5px] border-background shadow-md">
                <AvatarImage src={avatarUrl || undefined} alt="Admin" className="object-cover" />
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

            {/* Nome + subtítulo — alinhado à base do avatar */}
            <div className="min-w-0 flex-1 pb-1">
              <h2 className="text-[18px] font-bold text-foreground leading-tight truncate">
                {profileName || "Administrador"}
              </h2>
              {tenantName && (
                <p className="text-[12px] text-muted-foreground/80 leading-tight mt-0.5 truncate">
                  {tenantName}
                </p>
              )}
            </div>
          </div>

          {/* Link de copiar — lugar estratégico e compacto logo abaixo */}
          {tenantSlug && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="mt-7"
            >
              <CopyCode code={fullLink} label={displayLink} />
            </motion.div>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />

        {/* ═══ BANNER DE CONFIGURAÇÃO INICIAL ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="mt-6 mx-5"
        >
          <SetupCompletionBanner
            percentage={setupCompletion.percentage}
            steps={setupCompletion.steps}
            loading={setupCompletion.loading}
            variant="detailed"
          />
        </motion.div>

        {/* ═══ CARD PREMIUM: DUB PAGO (Carteira) ═══ */}
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          onClick={() => navigate(`${basePath}/carteira`)}
          className="relative w-full mt-1 px-5 text-left active:scale-[0.99] transition-transform"
        >
          <div className="relative rounded-2xl bg-muted/60 dark:bg-muted/30 overflow-hidden">
            {/* Cartão branco flutuante */}
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

            {/* Base cinza exposta */}
            <div className="relative px-4 py-2.5">
              <p className="text-[11.5px] font-normal text-muted-foreground leading-tight">
                Gerencie seus recebimentos e saques
              </p>
            </div>
          </div>
        </motion.button>

        {/* ═══ CAMPANHA — item destacado, separado da lista ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="mt-5 mx-5"
        >
          <CampaignMenuItem onClick={() => navigate(`${basePath}/promocoes/preparando`)} />
        </motion.div>

        {/* ═══ ITENS DE CONFIGURAÇÃO ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.24 }}
          className="mt-6 mx-5"
        >


          <ProfileMenuItem
            label="Barbearias"
            description={
              unitsCount > 0
                ? `${unitsCount === 1 ? "1 barbearia" : `${unitsCount} barbearias`} · toque para gerenciar`
                : "Visualize e gerencie suas barbearias"
            }
            onClick={() => navigate(`${basePath}/unidades`)}
          />


          <div className="h-px bg-border/40" />

          <ProfileMenuItem
            label="Clientes"
            description="Seus clientes atendidos"
            onClick={() => navigate(`${basePath}/meus-clientes`)}
          />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem
            label="Avaliação"
            description="Notas e comentários dos seus clientes"
            onClick={() => navigate(`${basePath}/avaliacoes`)}
          />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem
            label="Horário de funcionamento"
            description="Dias e horários de trabalho"
            onClick={() => {
              const goWithScope = (scope: ApplyScope) => {
                const qs =
                  scope.type === "self"
                    ? "?scope=self"
                    : `?scope=units&unit_ids=${scope.unitIds.join(",")}`;
                navigate(`${basePath}/horarios${qs}`);
              };

              // Se só existe o próprio admin, pula a pergunta e vai direto
              if (!hasMultipleBarbers) {
                goWithScope({ type: "self" });
                return;
              }

              setScopeConfig({
                title: "Aplicar horário a...",
                description: "Escolha se esse horário vale só pra você ou pras barbearias.",
                onConfirm: goWithScope,
              });
              setScopeOpen(true);
            }}
          />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem
            label="Portfólio"
            description="Fotos dos melhores cortes da barbearia"
            onClick={() => navigate(`${basePath}/portfolio`)}
          />
          <div className="h-px bg-border/40" />

          <ProfileMenuItem
            label="Relatórios"
            description="Dados e métricas do seu negócio"
            onClick={() => navigate(`${basePath}/relatorios`)}
          />
        </motion.div>

        {/* ═══ RODAPÉ: Sair da conta (esq) + Tema claro/escuro (dir) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.28 }}
          className="mt-8 mb-2 px-5 flex items-center justify-between gap-3"
        >
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
        </motion.div>

      </div>




      {/* ═══ BOTÃO FLUTUANTE: Suporte ═══ */}
      <div
        className="fixed right-4 z-40 flex flex-col gap-2.5 items-end"
        style={{ bottom: "calc(5rem + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))" }}
      >
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          onClick={() => window.open("https://wa.me/5511963390043?text=" + encodeURIComponent("Olá! Preciso de suporte no app DUB 🙏"), "_blank", "noopener,noreferrer")}
          className="flex items-center gap-2 h-11 px-5 rounded-full bg-foreground text-background shadow-premium hover:shadow-premium-hover active:scale-[0.97] transition-all"
        >
          <div className="relative">
            <Headset className="w-4 h-4" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-background" />
          </div>
          <span className="text-[13px] font-semibold">Suporte</span>
        </motion.button>
      </div>

      <AvatarEditSheet
        open={avatarEditOpen}
        onOpenChange={setAvatarEditOpen}
        userId={userId}
        initials={initials}
        storagePath="admins"
        selectedFile={selectedFile}
        onAvatarUpdated={(url) => { setAvatarUrl(url); patchProfileCache({ avatarUrl: url }); setSelectedFile(null); }}
      />

      <ApplyScopeSheet
        open={scopeOpen}
        onOpenChange={(o) => {
          setScopeOpen(o);
          if (!o) setScopeConfig(null);
        }}
        tenantId={tenantId}
        title={scopeConfig?.title}
        description={scopeConfig?.description}
        onConfirm={(scope) => scopeConfig?.onConfirm(scope)}
      />
    </>
  );
}

/* ─── Subcomponent ─── */
function ProfileMenuItem({ label, description, onClick }: { label: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-4 text-left active:opacity-70 transition-opacity"
    >
      <div>
        <span className="text-[15px] font-medium text-foreground block">{label}</span>
        <span className="text-[12px] text-muted-foreground">{description}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
    </button>
  );
}

/* ─── Campanha: item diferenciado com micro-CTA ─── */
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

