import { Home, Calendar, Users, DollarSign, FileText, Gift, Settings, LogOut, CheckCircle, Scissors, Code, ChevronDown, ChevronLeft, ChevronRight, HeadphonesIcon, Clock, BarChart3, CreditCard, Layers, Terminal, Send, User, Wrench, Star, Sun, Moon, ShoppingBag } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logoDub from "@/assets/logo-dub.png";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
// Painel TI foi migrado para outro projeto — modal e menu removidos.
import { AdminProfileSheet } from "@/components/admin/AdminProfileSheet";
import { useTheme } from "next-themes";
import { resolveOwnerIdentity } from "@/lib/ownerIdentity";
import { signOutAndClearDevice } from "@/lib/sessionGuard";

interface AdminSidebarProps {
  basePath?: string;
  tenantNome?: string;
  pendingCount?: number;
}

/**
 * Gera os grupos de menu com base no basePath fornecido.
 * Isso permite reutilizar a mesma sidebar para Admin (/admin) e TenantAdmin (/tenant/admin).
 */
const getMenuGroups = (base: string) => [
  {
    label: "Dashboard",
    items: [
      { title: "Visão Geral", url: base, icon: Home, end: true },
    ],
  },
  {
    label: "Atendimento",
    items: [
      { title: "Agenda", url: "/agenda-fullscreen", icon: Calendar, openInNewTab: true },
      { title: "Confirmações", url: `${base}/confirmacoes-pendentes`, icon: CheckCircle, badge: true },
    ],
  },
  {
    label: "Equipe",
    items: [
      { title: "Equipe", url: `${base}/barbeiros`, icon: Scissors },
      { title: "Clientes", url: `${base}/clientes`, icon: Users },
      { title: "Avaliações", url: `${base}/avaliacoes`, icon: Star },
    ],
  },
  {
    label: "Pagamentos",
    items: [
      { title: "Financeiro", url: `${base}/financeiro`, icon: CreditCard },
      { title: "Relatórios", url: `${base}/relatorios`, icon: BarChart3 },
    ],
  },
  {
    label: "Serviços",
    items: [
      { title: "Cortes", url: `${base}/servicos/cortes`, icon: Scissors },
      { title: "Planos", url: `${base}/servicos/planos`, icon: Layers },
      { title: "Promoções", url: `${base}/promocoes/preparando`, icon: Gift },
      { title: "Indicações", url: `${base}/indicacoes`, icon: Gift },
      { title: "Loja", url: `${base}/loja`, icon: ShoppingBag },
    ],
  },
  {
    label: "Comunicação",
    items: [
      { title: "Disparo de Mensagens", url: `${base}/disparo`, icon: Send },
    ],
  },
  {
    label: "Conteúdo",
    items: [
      { title: "Portfólio", url: `${base}/portfolio`, icon: FileText },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Horários", url: `${base}/horarios`, icon: Clock },
      // "Painel TI" removido (agora vive em outro projeto).
    ],
  },
  {
    label: "Conta",
    items: [
      { title: "Meu Perfil", url: `${base}/perfil`, icon: User },
    ],
  },
];

export function AdminSidebar({ basePath = "/admin", tenantNome, pendingCount: externalPendingCount }: AdminSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [internalPendingCount, setInternalPendingCount] = useState(0);
  const pendingCount = externalPendingCount ?? internalPendingCount;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [showTIPasswordModal, setShowTIPasswordModal] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState<string>("");
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const menuGroups = getMenuGroups(basePath);
  const isTenant = basePath !== "/admin";

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserEmail(data.user?.email || null);
      if (data.user?.id) {
        resolveOwnerIdentity(data.user.id).then((identity) => {
          if (!mounted) return;
          setOwnerName(identity.displayName);
        });
        supabase.from("profiles").select("avatar_url").eq("id", data.user.id).maybeSingle().then(({ data: profile }) => {
          if (!mounted) return;
          setAvatarUrl(profile?.avatar_url || null);
        });
      }
    });
    return () => { mounted = false; };
  }, []);

  // Carregar contagem de pendentes internamente apenas se não for fornecida externamente
  useEffect(() => {
    if (externalPendingCount !== undefined) return;

    const loadPendingCount = async () => {
      const { count } = await supabase
        .from('assinaturas')
        .select('*', { count: 'exact', head: true })
        .eq('payment_method', 'cash')
        .or('status.in.(suspended,pending_cash),and(status.eq.active,cash_payment_confirmed.eq.false)');
      setInternalPendingCount(count || 0);
    };
    loadPendingCount();
    const channel = supabase
      .channel(`admin-sidebar-pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assinaturas' }, () => {
        loadPendingCount();
      })
      .subscribe();
    const interval = setInterval(loadPendingCount, 20000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [externalPendingCount]);

  const handleLogout = async () => {
    try {
      await signOutAndClearDevice();
      toast.success("Logout realizado com sucesso");
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      toast.error("Erro ao fazer logout");
    }
  };

  const isItemActive = (item: any) => {
    if (item.end) return location.pathname === item.url;
    if (item.hasSubmenu) {
      return item.submenuItems?.some((sub: any) => location.pathname === sub.url);
    }
    if (item.url) return location.pathname === item.url;
    return false;
  };

  const toggleMenu = (title: string) => {
    setOpenMenus(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const itemCls = (isActive: boolean) => cn(
    "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-200",
    isActive
      ? "bg-foreground/[0.06] text-foreground font-medium"
      : "text-muted-foreground hover:text-foreground/60 hover:bg-foreground/[0.03]"
  );

  const iconCls = (isActive: boolean) => cn(
    "w-[18px] h-[18px] flex-shrink-0 transition-colors",
    isActive ? "text-foreground" : "text-muted-foreground/50"
  );

  const ActiveIndicator = () => (
    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full bg-accent-red" />
  );

  /** Nome e subtítulo do header */
  const brandName = isTenant ? (ownerName || tenantNome || "Admin") : (tenantNome || "DUB");
  const brandSubtitle = isTenant ? "Perfil do dono" : "Admin Panel";

  return (
    <aside
      className={cn(
        "group/sidebar relative h-screen flex-shrink-0 transition-all duration-500 ease-out flex flex-col",
        "border-r border-border/20",
        isCollapsed ? "w-[60px]" : "w-[220px]"
      )}
      style={{
        background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
      }}
    >

      {/* ── Toggle button ── */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={cn(
          "absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full",
          "border border-border bg-background text-muted-foreground/60 hover:text-foreground",
          "shadow-sm transition-colors duration-200"
        )}
      >
        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* ── Header compacto ── */}
      <div className="h-14 flex items-center px-3">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5">
            {!tenantNome ? (
              <img src={logoDub} alt="DUB" className="w-8 h-8 object-contain" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                {tenantNome.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-semibold text-foreground/85 leading-none truncate">
                {brandName}
              </span>
              <span className="text-[10px] text-muted-foreground/50 leading-none mt-1">
                {brandSubtitle}
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto">
            {!tenantNome ? (
              <img src={logoDub} alt="DUB" className="w-8 h-8 object-contain" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                {tenantNome.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Menu ── */}
      <div className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden scrollbar-none">
        {menuGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {!isCollapsed && (
              <p className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase px-3 mb-1.5">
                {group.label}
              </p>
            )}

            <div className="space-y-0.5">
              {group.items.map((item: any) => {
                const isActive = isItemActive(item);
                const Icon = item.icon;
                const hasBadge = item.badge && pendingCount > 0;

                // Submenu (Collapsible)
                if (item.hasSubmenu) {
                  const isOpen = openMenus[item.title] ?? isActive;
                  return (
                    <Collapsible key={item.title} open={!isCollapsed && isOpen} onOpenChange={() => toggleMenu(item.title)}>
                      <CollapsibleTrigger asChild>
                        <button className={cn(itemCls(isActive), isCollapsed && "justify-center px-0")} title={isCollapsed ? item.title : undefined}>
                          {isActive && <ActiveIndicator />}
                          <Icon className={iconCls(isActive)} />
                          {!isCollapsed && (
                            <>
                              <span className="flex-1 text-left">{item.title}</span>
                              <ChevronDown className={cn("w-3 h-3 text-muted-foreground/40 transition-transform", isOpen && "rotate-180")} />
                            </>
                          )}
                        </button>
                      </CollapsibleTrigger>
                      {!isCollapsed && (
                        <CollapsibleContent className="ml-6 mt-0.5 space-y-0.5">
                          {item.submenuItems?.map((sub: any) => {
                            const subActive = location.pathname === sub.url;
                            return (
                              <NavLink key={sub.url} to={sub.url} className={cn(itemCls(subActive), "text-[12px] py-1.5")}>
                                <div className={cn("w-1.5 h-1.5 rounded-full", subActive ? "bg-foreground" : "bg-muted-foreground/30")} />
                                {sub.title}
                              </NavLink>
                            );
                          })}
                        </CollapsibleContent>
                      )}
                    </Collapsible>
                  );
                }

                // TI com senha (apenas admin global)
                if (item.requiresPassword) {
                  return (
                    <button
                      key={item.title}
                      onClick={() => setShowTIPasswordModal(true)}
                      className={cn(itemCls(isActive), isCollapsed && "justify-center px-0")}
                      title={isCollapsed ? item.title : undefined}
                    >
                      {isActive && <ActiveIndicator />}
                      <Icon className={iconCls(isActive)} />
                      {!isCollapsed && <span className="flex-1 text-left">{item.title}</span>}
                    </button>
                  );
                }

                // Nova aba
                if (item.openInNewTab) {
                  return (
                    <a
                      key={item.title}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(itemCls(isActive), isCollapsed && "justify-center px-0")}
                      title={isCollapsed ? item.title : undefined}
                    >
                      {isActive && <ActiveIndicator />}
                      <Icon className={iconCls(isActive)} />
                      {!isCollapsed && <span className="flex-1">{item.title}</span>}
                    </a>
                  );
                }

                // Item normal
                return (
                  <NavLink
                    key={item.title}
                    to={item.url!}
                    end={item.end}
                    className={cn(itemCls(isActive), isCollapsed && "justify-center px-0")}
                    title={isCollapsed ? item.title : undefined}
                  >
                    {isActive && <ActiveIndicator />}
                    <Icon className={iconCls(isActive)} />
                    {!isCollapsed && <span className="flex-1">{item.title}</span>}
                    {hasBadge && !isCollapsed && (
                      <Badge className="ml-auto text-[10px] h-4 px-1.5 bg-primary/15 text-primary border-0">
                        {pendingCount > 9 ? "9+" : pendingCount}
                      </Badge>
                    )}
                    {hasBadge && isCollapsed && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer compacto ── */}
      <div className="p-2 space-y-1">
        {/* Theme toggle — apenas switch */}
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="ml-auto flex items-center gap-1.5 px-1 py-1 rounded-lg hover:bg-foreground/[0.05] transition-all duration-200"
          title={isDark ? "Modo Claro" : "Modo Escuro"}
        >
          <div className={cn(
            "relative w-8 h-[18px] rounded-full transition-colors duration-200",
            isDark ? "bg-primary" : "bg-muted-foreground/25"
          )}>
            <div className={cn(
              "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-200",
              isDark ? "translate-x-[16px]" : "translate-x-[2px]"
            )} />
          </div>
        </button>

        {/* Profile */}
        <button
          onClick={() => setShowProfileSheet(true)}
          className={cn(
            "w-full flex items-center rounded-lg px-2.5 py-2 transition-all duration-200",
            "hover:bg-foreground/[0.03]",
            isCollapsed ? "justify-center" : "gap-2.5"
          )}
          title={isCollapsed ? "Meu Perfil" : undefined}
        >
          <Avatar className="w-7 h-7 flex-shrink-0">
            <AvatarImage src={avatarUrl || undefined} alt="Admin" className="object-cover" />
            <AvatarFallback className="bg-foreground/[0.06] text-foreground text-[10px] font-semibold">
              {userEmail ? userEmail.charAt(0).toUpperCase() : "A"}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0 text-left">
               <span className="text-[12px] font-medium text-foreground/80 truncate">{isTenant ? (ownerName || tenantNome || "Admin") : "Admin"}</span>
               <span className="text-[10px] text-muted-foreground/40 truncate">{userEmail || "..."}</span>
            </div>
          )}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-200",
            "text-muted-foreground/60 hover:text-destructive hover:bg-destructive/5",
            isCollapsed && "justify-center px-0"
          )}
          title={isCollapsed ? "Sair" : undefined}
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          {!isCollapsed && <span>Sair</span>}
        </button>
      </div>

      {/* TIPasswordModal removido — Painel TI vive em outro projeto */}
      <AdminProfileSheet
        open={showProfileSheet}
        onOpenChange={(open) => {
          setShowProfileSheet(open);
          if (!open) {
            supabase.auth.getUser().then(({ data }) => {
              if (data.user?.id) {
                supabase.from("profiles").select("avatar_url").eq("id", data.user.id).maybeSingle().then(({ data: profile }) => {
                  setAvatarUrl(profile?.avatar_url || null);
                });
              }
            });
          }
        }}
      />
    </aside>
  );
}
