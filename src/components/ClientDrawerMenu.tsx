import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { 
  History, 
  ShoppingBag, 
  Bell, 
  HelpCircle, 
  ChevronRight
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AppointmentHistorySheet } from "./AppointmentHistorySheet";


interface MenuItemProps {
  icon: React.ElementType;
  label: string;
  description?: string;
  onClick: () => void;
  badge?: string;
  comingSoon?: boolean;
}

function MenuItem({ icon: Icon, label, description, onClick, badge, comingSoon }: MenuItemProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-all duration-200"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-700/50 flex items-center justify-center">
          <Icon className="w-5 h-5 text-zinc-300" />
        </div>
        <div className="text-left">
          <span className="font-medium text-sm text-foreground block">{label}</span>
          {description && (
            <span className="text-xs text-zinc-500">{description}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badge && (
          <span className="px-2 py-0.5 bg-red-500 text-foreground text-xs font-bold rounded-full">
            {badge}
          </span>
        )}
        {comingSoon && (
          <span className="px-2 py-0.5 bg-zinc-700 text-zinc-400 text-xs font-medium rounded-full">
            Em breve
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-zinc-600" />
      </div>
    </motion.button>
  );
}

interface ClientDrawerMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
}

export function ClientDrawerMenu({ open, onOpenChange, userId }: ClientDrawerMenuProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  

  const handleNotifications = () => {
    toast.info("Notificações em breve");
  };

  const handleHelp = () => {
    toast.info("Central de ajuda em breve");
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="right" 
          className="w-[85vw] max-w-sm bg-gradient-to-b from-zinc-900 to-zinc-950 border-zinc-800 p-0"
        >
          <SheetHeader className="p-5 pb-0">
            <SheetTitle className="text-foreground text-lg font-bold text-left">
              Menu
            </SheetTitle>
          </SheetHeader>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-5 pt-4 space-y-3"
          >
            <MenuItem
              icon={History}
              label="Histórico de Cortes"
              description="Veja seus agendamentos anteriores"
              onClick={() => setHistoryOpen(true)}
            />
            
            <MenuItem
              icon={ShoppingBag}
              label="Loja"
              description="Produtos exclusivos"
              onClick={() => {
                onOpenChange(false);
                toast.info("Acesse a aba Loja na navegação inferior");
              }}
            />
            
            <MenuItem
              icon={Bell}
              label="Avisos"
              description="Notificações importantes"
              onClick={handleNotifications}
            />
            
            <MenuItem
              icon={HelpCircle}
              label="Ajuda"
              description="Dúvidas frequentes"
              onClick={handleHelp}
            />
          </motion.div>
        </SheetContent>
      </Sheet>

      {/* Nested Components */}
      <AppointmentHistorySheet 
        open={historyOpen} 
        onOpenChange={setHistoryOpen}
        userId={userId}
      />
      
    </>
  );
}
