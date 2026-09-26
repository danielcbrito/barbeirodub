import { motion } from "framer-motion";
import { LogOut, Loader2 } from "lucide-react";

interface ProfileLogoutButtonProps {
  loading: boolean;
  onLogout: () => void;
}

/**
 * Botão de logout na parte inferior do perfil.
 * Design: texto destructive, sem fundo, feedback hover/active suave.
 */
export function ProfileLogoutButton({ loading, onLogout }: ProfileLogoutButtonProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.5 }}
      className="px-5 pt-2 pb-4"
    >
      <button
        onClick={onLogout}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl text-[13px] font-medium text-accent-red hover:bg-accent-red/10 active:bg-accent-red/15 active:scale-[0.98] transition-all duration-150"
        style={{ minHeight: 48 }}
        aria-label="Sair da conta"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LogOut className="h-4 w-4" />
        )}
        Sair da conta
      </button>
    </motion.div>
  );
}
