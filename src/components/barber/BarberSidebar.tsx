import { Home, Calendar, Clock, CheckCircle, LogOut, User, BarChart3, CreditCard, ChevronLeft, ChevronRight, Users, Scissors, MessageSquare, Send, Package, Gift, ImageIcon, ShoppingBag, Building2, Ticket } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavLink, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logoDub from "@/assets/logo-dub.png";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BarberContext } from "@/pages/Barbeiro";
import { BarberProfileSheet } from "@/components/barber/BarberProfileSheet";
import { useTenantBarbersCount } from "@/hooks/useTenantBarbersCount";
import { signOutAndClearDevice } from "@/lib/sessionGuard";

interface BarberSidebarProps {
  barberContext: BarberContext;
  pendingCount: number;
  basePath?: string;
  showTeamMenu?: boolean;
  tenantNome?: string;
}

const getMenuGroups = (base: string, showTeamMenu: boolean, isTenantAdmin: boolean, showCompanyConfig: boolean) => [
  {
    label: "Dashboard",
    items: [{ title: "Meu Painel", url: base, icon: Home, end: true }],
  },
  {
    label: "Atendimento",
    items: [
      { title: "Minha Agenda", url: `${base}/agenda`, icon: Calendar },
      { title: "Confirmações", url: `${base}/confirmacoes`, icon: CheckCircle, badge: true },
    ],
  },
  {
    label: "Equipe",
    items: [
      { title: "Meus Clientes", url: `${base}/clientes`, icon: Users },
      ...(showTeamMenu ? [{ title: "Minha Equipe", url: `${base}/barbeiros`, icon: Users }] : []),
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
      { title: "Serviços", url: `${base}/servicos`, icon: Scissors },
      { title: "Planos", url: `${base}/planos`, icon: Package },
      { title: "Loja", url: `${base}/loja`, icon: ShoppingBag },
      { title: "Promoções", url: `${base}/promocoes`, icon: Gift },
      { title: "Cupons ativos", url: `${base}/cupons-ativos`, icon: Ticket },
      ...(isTenantAdmin ? [{ title: "Indicações", url: `${base}/indicacoes`, icon: Gift }] : []),
    ],
  },
  {
    label: "Comunicação",
    items: [
      { title: "Disparo", url: `${base}/disparo`, icon: Send },
      ...(showTeamMenu ? [{ title: "Mensagens", url: `${base}/mensagens`, icon: MessageSquare }] : []),
    ],
  },
  {
    label: "Conteúdo",
    items: [{ title: "Portfólio", url: `${base}/portfolio`, icon: ImageIcon }],
  },
  {
    label: "Sistema",
    items: [{ title: "Meus Horários", url: `${base}/horarios`, icon: Clock }],
  },
  ...(isTenantAdmin && showCompanyConfig ? [{
    label: "Barbearia",
    items: [{ title: "Config. da Empresa", url: `${base}/config-barbearia`, icon: Building2 }],
  }] : []),
  {
    label: "Conta",
    items: [{ title: "Meu Perfil", url: `${base}/perfil`, icon: User }],
  },
];

export function BarberSidebar({ barberContext, pendingCount, basePath = "/barbeiro", showTeamMenu = false, tenantNome }: BarberSidebarProps) {
  const location = useLocation();
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const { hasMultiple: hasMultipleBarbers } = useTenantBarbersCount(barberContext.tenantId);
  const menuGroups = getMenuGroups(basePath, showTeamMenu, barberContext.isTenantAdmin, hasMultipleBarbers);
  const isTenantAdminView = !!tenantNome;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || null);
      if (data.user?.id) {
        supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", data.user.id)
          .maybeSingle()
          .then(({ data: profile }) => {
            setAvatarUrl(profile?.avatar_url || null);
          });
      }
    });
  }, []);

  const handleLogout = async () => {
    try {
      await signOutAndClearDevice();
      toast.success("Logout realizado com sucesso");
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      toast.error("Erro ao fazer logout");
    }
  };

  const isItemActive = (item: { url: string; end?: boolean }) => {
    if (item.end) return location.pathname === item.url;
    return location.pathname === item.url || location.pathname.startsWith(`${item.url}/`);
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

  return (
    <aside
      className={cn(
        "group/sidebar relative h-screen flex-shrink-0 transition-all duration-500 ease-out flex flex-col",
        "border-r border-border/20",
        isCollapsed ? "w-[60px]" : "w-[220px]"
      )}
      style={{
        background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
      }}
    >
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
                {tenantNome || "DUB"}
              </span>
              <span className="text-[10px] text-muted-foreground/50 leading-none mt-1">
                {isTenantAdminView ? "Administrador" : "Barber Panel"}
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

      <div className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden scrollbar-none">
        {menuGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {!isCollapsed && (
              <p className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase px-3 mb-1.5">
                {group.label}
              </p>
            )}

            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = isItemActive(item);
                const Icon = item.icon;
                const hasBadge = item.badge && pendingCount > 0;

                return (
                  <NavLink
                    key={item.title}
                    to={item.url}
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

      <div className="p-2 space-y-1">
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
            <AvatarImage src={avatarUrl || undefined} alt="Barbeiro" className="object-cover" />
            <AvatarFallback className="bg-foreground/[0.06] text-foreground text-[10px] font-semibold">
              {barberContext.apelido?.charAt(0)?.toUpperCase() || "B"}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0 text-left">
              <span className="text-[12px] font-medium text-foreground/80 truncate">{barberContext.apelido}</span>
              <span className="text-[10px] text-muted-foreground/40 truncate">{userEmail || "Barbeiro"}</span>
            </div>
          )}
        </button>

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

      <BarberProfileSheet
        open={showProfileSheet}
        onOpenChange={(open) => {
          setShowProfileSheet(open);
          if (!open) {
            supabase.auth.getUser().then(({ data }) => {
              if (data.user?.id) {
                supabase
                  .from("profiles")
                  .select("avatar_url")
                  .eq("id", data.user.id)
                  .maybeSingle()
                  .then(({ data: profile }) => {
                    setAvatarUrl(profile?.avatar_url || null);
                  });
              }
            });
          }
        }}
        barberContext={barberContext}
      />
    </aside>
  );
}
