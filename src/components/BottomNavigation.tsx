import { motion } from "framer-motion";
import { BottomNavItem } from "@/components/client/BottomNavItem";
import { ShoppingCart, Scissors, User } from "lucide-react";
import { HomeNavIcon } from "@/components/layout/AppNavIcons";

export type ClienteTab = "inicio" | "loja" | "suporte" | "perfil";

interface BottomNavigationProps {
  activeTab?: ClienteTab;
  onTabChange?: (tab: ClienteTab) => void;
  onProfileClick?: () => void;
}

/**
 * Bottom navigation do painel do cliente.
 * 4 abas: Início, Loja, Suporte, Perfil.
 */
export function BottomNavigation({ 
  activeTab = "inicio",
  onTabChange,
  onProfileClick,
}: BottomNavigationProps) {
  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 z-[60] overflow-visible"
      style={{ paddingBottom: "var(--app-safe-bottom, env(safe-area-inset-bottom, 0px))" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-background"
        style={{ height: "var(--app-bottom-nav-bleed, 0px)" }}
      />
      {/* Background with blur */}
      <div 
        className="absolute inset-0 bg-background/95 backdrop-blur-md border-t border-border/30"
      />
      
      {/* Navigation Items */}
      <div className="relative flex h-16 items-stretch justify-around px-1 max-w-lg mx-auto">
        <BottomNavItem
          icon={HomeNavIcon}
          label="Início"
          isActive={activeTab === "inicio"}
          onClick={() => onTabChange?.("inicio")}
        />
        
        <BottomNavItem
          icon={ShoppingCart}
          label="Loja"
          isActive={activeTab === "loja"}
          onClick={() => onTabChange?.("loja")}
        />

        <BottomNavItem
          icon={Scissors}
          label="Suporte"
          isActive={activeTab === "suporte"}
          onClick={() => onTabChange?.("suporte")}
        />
        
        <BottomNavItem
          icon={User}
          label="Perfil"
          isActive={activeTab === "perfil"}
          onClick={() => {
            onTabChange?.("perfil");
            onProfileClick?.();
          }}
        />
      </div>
    </motion.nav>
  );
}
