import { 
  X, Home, Calendar, Clock, CheckCircle, LogOut, User, BarChart3, 
  Users, Scissors, Send, Package, Gift, CreditCard, MessageSquare,
  ChevronRight, ShoppingBag, Building2
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logoDub from "@/assets/logo-dub.png";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { BarberContext } from "@/pages/Barbeiro";
import { useTenantBarbersCount } from "@/hooks/useTenantBarbersCount";

interface BarberMobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pendingCount: number;
  barberContext: BarberContext;
  basePath?: string;
  showTeamMenu?: boolean;
  tenantNome?: string;
}

/**
 * Gera seções de menu do barbeiro — design idêntico ao AdminMobileDrawer.
 */
const getMenuSections = (base: string, showTeamMenu: boolean, isTenantAdmin: boolean, showCompanyConfig: boolean) => {
  const sections = [
    {
      label: "Principal",
      items: [
        { title: "Meu Painel", url: base, icon: Home, end: true },
        { title: "Minha Agenda", url: `${base}/agenda`, icon: Calendar },
        { title: "Confirmações", url: `${base}/confirmacoes`, icon: CheckCircle, badge: true },
      ],
    },
    {
      label: "Gestão",
      items: [
        ...(showTeamMenu ? [{ title: "Minha Equipe", url: `${base}/barbeiros`, icon: Users }] : []),
        { title: "Meus Clientes", url: `${base}/clientes`, icon: Users },
        { title: "Relatórios", url: `${base}/relatorios`, icon: BarChart3 },
        { title: "Financeiro", url: `${base}/financeiro`, icon: CreditCard },
      ],
    },
    {
      label: "Serviços",
      items: [
        { title: "Serviços", url: `${base}/servicos`, icon: Scissors },
        { title: "Planos", url: `${base}/planos`, icon: Package },
        { title: "Loja", url: `${base}/loja`, icon: ShoppingBag },
        { title: "Promoções", url: `${base}/promocoes`, icon: Gift },
        ...(isTenantAdmin ? [{ title: "Indicações", url: `${base}/indicacoes`, icon: Gift }] : []),
      ],
    },
    {
      label: "Comunicação",
      items: [
        { title: "Disparo de Mensagens", url: `${base}/disparo`, icon: Send },
        ...(showTeamMenu ? [{ title: "Mensagens", url: `${base}/mensagens`, icon: MessageSquare }] : []),
      ],
    },
    {
      label: "Sistema",
      items: [
        { title: "Meus Horários", url: `${base}/horarios`, icon: Clock },
      ],
    },
    ...(isTenantAdmin && showCompanyConfig ? [{
      label: "Barbearia",
      items: [
        { title: "Config. da Empresa", url: `${base}/config-barbearia`, icon: Building2 },
      ],
    }] : []),
  ];

  return sections;
};

export function BarberMobileDrawer({ 
  isOpen, onClose, pendingCount, barberContext, 
  basePath = "/barbeiro", showTeamMenu = false, tenantNome 
}: BarberMobileDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasMultiple: hasMultipleBarbers } = useTenantBarbersCount(barberContext.tenantId);
  const menuSections = getMenuSections(basePath, showTeamMenu, barberContext.isTenantAdmin, hasMultipleBarbers);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem("userRole");
      localStorage.removeItem("barbeiroId");
      toast.success("Logout realizado com sucesso");
      onClose();
      window.location.href = "/login";
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      toast.error("Erro ao fazer logout");
    }
  };

  const handleNavigation = (item: { url: string }) => {
    navigate(item.url);
    onClose();
  };

  const isActive = (item: { url: string; end?: boolean }) => {
    if (item.end) return location.pathname === item.url;
    return location.pathname.startsWith(item.url);
  };

  const brandName = tenantNome || "DUB";
  const brandSubtitle = tenantNome ? "Administrador" : barberContext.apelido;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Drawer */}
          <motion.div 
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            className="fixed top-0 left-0 bottom-0 z-50 w-[82%] max-w-[320px]"
          >
            <div 
              className="h-full flex flex-col overflow-hidden rounded-r-2xl"
              style={{ background: 'hsl(var(--background))' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {!tenantNome ? (
                      <img 
                        src={logoDub} 
                        alt="DUB" 
                        className="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]" 
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
                        {tenantNome.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-lg tracking-wider text-foreground">{brandName}</span>
                    <span className="text-[10px] text-muted-foreground tracking-[0.2em] uppercase font-medium">
                      {brandSubtitle}
                    </span>
                  </div>
                </div>
                
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-secondary hover:bg-secondary/80 border border-border transition-all duration-300 active:scale-95"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Menu Content */}
              <ScrollArea className="flex-1 py-4">
                <div className="px-3 space-y-5">
                  {menuSections.map((section, sIdx) => (
                    <motion.div 
                      key={section.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: sIdx * 0.05 }}
                    >
                      {/* Section label */}
                      <div className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground px-3 mb-1.5 uppercase flex items-center gap-2">
                        <span className="w-3 h-px bg-gradient-to-r from-primary/40 to-transparent" />
                        {section.label}
                        <span className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                      </div>
                      
                      <nav className="space-y-0.5">
                        {section.items.map((item: any) => {
                          const active = isActive(item);
                          const hasBadge = item.badge && pendingCount > 0;
                          const Icon = item.icon;
                          
                          return (
                            <button
                              key={item.title}
                              onClick={() => handleNavigation(item)}
                              className={cn(
                                "relative w-full h-11 rounded-xl flex items-center gap-3 px-4",
                                "text-muted-foreground hover:text-foreground",
                                "bg-transparent hover:bg-secondary/60",
                                "transition-all duration-200 ease-out",
                                "active:scale-[0.98]",
                                active && "text-foreground bg-secondary"
                              )}
                            >
                              {active && (
                                <motion.div 
                                  layoutId="drawer-active"
                                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary shadow-[0_0_10px_rgba(239,68,68,0.5)]" 
                                />
                              )}
                              
                              <Icon className={cn(
                                "w-[18px] h-[18px] flex-shrink-0 transition-all duration-200",
                                active && "text-primary drop-shadow-[0_0_6px_rgba(239,68,68,0.4)]"
                              )} />
                              
                              <span className="flex-1 text-[13px] font-medium text-left">{item.title}</span>
                              
                              {hasBadge && (
                                <Badge className="text-[9px] h-[18px] px-2 bg-primary/15 text-primary border-0 shadow-[0_0_8px_rgba(239,68,68,0.3)] animate-pulse">
                                  {pendingCount > 9 ? "9+" : pendingCount}
                                </Badge>
                              )}
                            </button>
                          );
                        })}
                      </nav>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>

              {/* Footer - Logout */}
              <div className="p-4 border-t border-border">
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full px-4 py-3 rounded-xl gap-3 text-muted-foreground hover:text-destructive bg-transparent hover:bg-destructive/10 transition-all duration-200 active:scale-[0.98]"
                >
                  <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className="text-[13px] font-medium">Sair da conta</span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
