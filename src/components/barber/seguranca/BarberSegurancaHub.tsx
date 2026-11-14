import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck, Key, Landmark, ChevronRight } from "lucide-react";

interface Props {
  basePath: string;
}

/**
 * Hub de Segurança do Barbeiro — design idêntico ao AdminSeguranca hub.
 */
export function BarberSegurancaHub({ basePath }: Props) {
  const navigate = useNavigate();

  const sections = [
    {
      icon: Key,
      label: "Senha do Painel",
      description: "Altere a senha de acesso ao seu painel",
      path: `${basePath}/seguranca/senha-painel`,
    },
    {
      icon: Landmark,
      label: "PIN da Carteira",
      description: "Configure ou altere o PIN de 4 dígitos da carteira financeira",
      path: `${basePath}/seguranca/pin-carteira`,
    },
  ];

  return (
    <div className="pb-24 -mx-3 -mt-3">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="flex items-center gap-2.5 px-4 h-14">
          <button
            onClick={() => navigate(`${basePath}/config-barbearia`)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
            aria-label="Voltar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a4 4 0 0 1 4 4v1" />
            </svg>
          </button>
          <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">Segurança</h1>
        </div>
      </div>

      {/* Resumo */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="mx-4 mt-5 mb-2 px-4 py-3.5 rounded-2xl bg-card border border-border/30 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <p className="text-[12px] font-medium text-foreground">Gerenciamento de Senhas</p>
        </div>
        <p className="text-[10.5px] text-muted-foreground/60 mt-1 leading-relaxed">
          Proteja sua conta alterando a senha de acesso e o PIN da carteira financeira.
        </p>
      </motion.div>

      {/* Lista de seções */}
      <div className="px-4 pt-3 space-y-0">
        {sections.map((section, index) => (
          <motion.button
            key={section.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.08 + index * 0.04 }}
            onClick={() => navigate(section.path)}
            className="w-full flex items-center gap-3.5 px-1 py-4 text-left hover:bg-secondary/30 active:bg-secondary/50 active:scale-[0.99] transition-all border-b border-border/40 last:border-b-0"
          >
            <section.icon className="w-6 h-6 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground leading-tight">{section.label}</p>
              <p className="text-[10.5px] font-extralight text-muted-foreground/70 mt-0.5 leading-relaxed">{section.description}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/50 flex-shrink-0" strokeWidth={1.8} />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
