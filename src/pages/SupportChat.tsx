import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { SupportChatInterface } from "@/components/support/SupportChatInterface";
import { motion } from "framer-motion";

/**
 * Chat de Suporte — Interface Fluida Premium 2025
 * Sem barras fixas, visual flutuante e moderno
 */
export default function SupportChat() {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate("/cliente");
  };

  // Lock body scroll e altura dinâmica para mobile
  useEffect(() => {
    document.documentElement.classList.add('lock-scroll');
    document.body.classList.add('lock-scroll');
    
    const setFullHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setFullHeight();
    window.addEventListener('resize', setFullHeight);
    
    return () => {
      document.documentElement.classList.remove('lock-scroll');
      document.body.classList.remove('lock-scroll');
      window.removeEventListener('resize', setFullHeight);
    };
  }, []);

  return (
    <div
      className="w-full flex flex-col overflow-hidden relative"
      style={{ 
        height: 'calc(var(--vh, 1vh) * 100)',
        width: '100vw',
        background: 'linear-gradient(180deg, #0A0A0A 0%, #0F0F0F 50%, #0A0A0A 100%)'
      }}
    >
      {/* Botão voltar flutuante — discreto e elegante */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        onClick={handleBack}
        className="absolute left-4 z-20 h-10 w-10 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] hover:bg-foreground/[0.08] flex items-center justify-center transition-all duration-200"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
        aria-label="Voltar"
      >
        <ArrowLeft className="h-5 w-5 text-foreground/60" />
      </motion.button>

      {/* Chat Interface — ocupa toda a tela */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <SupportChatInterface />
      </div>
    </div>
  );
}
