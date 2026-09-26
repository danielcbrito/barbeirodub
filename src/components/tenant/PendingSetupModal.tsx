import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ChevronRight, X, Settings2 } from "lucide-react";
import whatsappIcon from "@/assets/whatsapp-icon.png";

interface PendingSetupModalProps {
  open: boolean;
  onClose: () => void;
  whatsappConnected: boolean;
  walletActive: boolean;
  basePath: string;
}

/**
 * Modal dispensável que aparece ao entrar no painel do tenant
 * quando há pendências (WhatsApp e/ou Carteira não ativados).
 * Reaparece a cada sessão até que ambas estejam completas.
 */
export function PendingSetupModal({
  open,
  onClose,
  whatsappConnected,
  walletActive,
  basePath,
}: PendingSetupModalProps) {
  const navigate = useNavigate();

  const allSteps = [
    {
      id: "whatsapp",
      customIcon: whatsappIcon,
      title: "Conectar WhatsApp",
      description: "Receba notificações e envie lembretes automáticos para seus clientes.",
      completed: whatsappConnected,
      action: () => {
        onClose();
        navigate(`${basePath}/whatsapp`);
      },
    },
    {
      id: "wallet",
      icon: Wallet,
      title: "Ativar pagamento via Pix",
      description: "Aceite pagamentos digitais e gerencie seu financeiro direto no painel.",
      completed: walletActive,
      action: () => {
        onClose();
        navigate(`${basePath}/financeiro`);
      },
    },
  ];

  // Mostrar APENAS os itens pendentes
  const steps = allSteps.filter((s) => !s.completed);
  const totalSteps = allSteps.length;
  const completedCount = totalSteps - steps.length;

  // Se tudo completo, não renderiza
  if (steps.length === 0) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.25, 0.9, 0.35, 1] }}
            className="relative z-10 w-full max-w-md mx-4 sm:mx-auto bg-background rounded-t-3xl sm:rounded-3xl border border-border overflow-hidden shadow-2xl"
          >
            {/* Botão fechar */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors z-10"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="px-6 pt-8 pb-4 text-center">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 15 }}
                className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5"
              >
                <Settings2 className="w-7 h-7 text-primary" />
              </motion.div>

              <h2 className="text-[20px] font-bold text-foreground tracking-tight">
                Finalize sua configuração
              </h2>
              <p className="text-[13px] text-foreground/70 mt-1.5 leading-relaxed max-w-xs mx-auto">
                Complete as etapas abaixo para desbloquear todos os recursos do seu painel.
              </p>

              {/* Indicador de progresso */}
              <div className="flex items-center justify-center gap-2 mt-4">
                <span className="text-[11px] font-semibold text-foreground/60 uppercase tracking-wider">
                  {completedCount} de {totalSteps} concluídas
                </span>
              </div>
              <div className="w-full max-w-[180px] mx-auto mt-2 h-[3px] rounded-full bg-border overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(completedCount / totalSteps) * 100}%` }}
                  transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  className="h-full rounded-full bg-emerald-500"
                />
              </div>
            </div>

            {/* Steps */}
            <div className="px-6 pb-2 space-y-3">
              {steps.map((step, i) => (
                <motion.button
                  key={step.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  onClick={step.action}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-card hover:border-border hover:shadow-md active:scale-[0.98] transition-all text-left"
                >
                  {/* Ícone */}
                  {step.customIcon ? (
                    <img src={step.customIcon} alt={step.title} className="w-11 h-11 -my-0.5 object-cover rounded-full flex-shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                      <step.icon className="w-5 h-5" />
                    </div>
                  )}

                  {/* Texto */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-foreground">
                      {step.title}
                    </p>
                    <p className="text-[11px] text-foreground/60 mt-0.5 leading-relaxed">
                      {step.description}
                    </p>
                  </div>

                  {/* Chevron */}
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </motion.button>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
              <button
                onClick={onClose}
                className="w-full h-11 rounded-xl text-[13px] font-medium text-foreground/60 hover:text-foreground hover:bg-secondary/50 transition-colors"
              >
                Configurar depois
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
