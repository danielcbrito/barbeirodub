import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search, Shield, Users, BarChart3, Clock, CreditCard,
  Palette, ChevronRight, LogOut, Loader2, Scissors, MessageCircle, Gift, Headset,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { signOutAndClearDevice } from "@/lib/sessionGuard";

interface BarberSettingsPageProps {
  basePath?: string;
}

interface SettingsItemData {
  icon: React.ElementType;
  label: string;
  description: string;
  path: string;
}

/**
 * Tela de Configurações do Barbeiro — design idêntico ao do Admin (ProfileSettingsPage).
 * Barbeiros funcionários NÃO veem: Serviços/Cortes, Planos, Promoções, Cupons, Disparo.
 */
export function BarberSettingsPage({ basePath = "/barbeiro" }: BarberSettingsPageProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOutAndClearDevice();
      toast.success("Sessão encerrada");
    } catch {
      toast.error("Erro ao sair");
      setLoggingOut(false);
    }
  };

  const items: SettingsItemData[] = [
    { icon: Users, label: "Dados Gerais", description: "Foto de perfil, identificação, contato e endereço", path: `${basePath}/meus-dados` },
    { icon: Shield, label: "Segurança", description: "Altere sua senha, ative autenticação em duas etapas e controle quem pode acessar o painel", path: `${basePath}/seguranca` },
    { icon: Scissors, label: "Meus Serviços", description: "Personalize o tempo que você gasta em cada serviço oferecido pela barbearia", path: `${basePath}/servicos` },
    { icon: Users, label: "Clientes", description: "Veja todos os clientes cadastrados, histórico de agendamentos e informações de contato", path: `${basePath}/clientes` },
    { icon: BarChart3, label: "Relatórios", description: "Acompanhe estatísticas, desempenho e crescimento do seu trabalho", path: `${basePath}/relatorios` },
    { icon: Clock, label: "Gerenciamento de Horários", description: "Configure os horários de funcionamento da barbearia, pausas e datas excepcionais (feriados, folgas)", path: `${basePath}/horarios?empresa=1` },
    { icon: CreditCard, label: "Financeiro", description: "Acompanhe receitas, faça saques, veja extratos detalhados e configure formas de pagamento", path: `${basePath}/financeiro` },
    { icon: Gift, label: "Promoções e Fidelidade", description: "Gerencie o programa de fidelidade, cupons de desconto e promoções para seus clientes", path: `${basePath}/promocoes` },
    { icon: MessageCircle, label: "WhatsApp", description: "Conecte seu WhatsApp para enviar confirmações, lembretes e disparar mensagens automaticamente", path: `${basePath}/whatsapp` },
  ];

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <>
    <div className="pb-8 -mx-3 -mt-3">
      {/* Header — idêntico ao admin */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-2.5 px-4 h-14">
          <button
            onClick={() => navigate(`${basePath}/perfil`)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-primary/15 active:scale-95 transition-all"
            aria-label="Voltar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a4 4 0 0 1 4 4v1" />
            </svg>
          </button>
          <h1 className="text-[19px] font-bold tracking-tight text-foreground flex-1">Configurações</h1>
        </div>

        <div className="px-4 pb-3 pt-5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar..."
              className="w-full h-8 pl-8 pr-3 rounded-[10px] bg-background border border-border text-[12px] font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Lista de configurações */}
      <div className="px-4 pt-3 space-y-0">
        {filteredItems.map((item, index) => (
          <motion.button
            key={item.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.025 }}
            onClick={() => navigate(item.path)}
            className="w-full flex items-center gap-3.5 px-1 py-3.5 text-left hover:bg-primary/10 active:bg-primary/20 active:scale-[0.99] transition-all border-b border-border last:border-b-0"
          >
            <item.icon className="w-6 h-6 text-foreground flex-shrink-0" strokeWidth={1.8} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground leading-tight">{item.label}</p>
              <p className="text-[11px] font-normal text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-foreground flex-shrink-0" strokeWidth={2} />
          </motion.button>
        ))}

        {/* Tema toggle */}
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: filteredItems.length * 0.025 }}
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="w-full flex items-center gap-3.5 px-1 py-3.5 text-left hover:bg-primary/10 active:bg-primary/20 transition-all"
        >
          <Palette className="w-6 h-6 text-foreground flex-shrink-0" strokeWidth={1.8} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground leading-tight">Tema</p>
            <p className="text-[11px] font-normal text-muted-foreground mt-0.5">
              {isDark ? "Modo escuro ativado — toque para mudar" : "Modo claro ativado — toque para mudar"}
            </p>
          </div>
          <div className={cn(
            "relative w-9 h-5 rounded-full border transition-all duration-200",
            isDark ? "bg-primary border-primary shadow-glow-red" : "bg-background-elevated border-border"
          )}>
            <div className={cn(
              "absolute top-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
              isDark ? "translate-x-[18px]" : "translate-x-[2px]"
            )} />
          </div>
        </motion.button>

        {/* Empty state */}
        {filteredItems.length === 0 && search.trim() && (
          <div className="text-center py-10">
            <Search className="w-7 h-7 text-foreground mx-auto" />
            <p className="text-[12px] font-normal text-muted-foreground mt-2">
              Nenhuma configuração encontrada para "{search}"
            </p>
          </div>
        )}

        {/* Sair da conta */}
        <div className="mt-4 pt-3 border-t border-border">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-3.5 px-1 py-3.5 text-left hover:bg-accent-red/10 active:bg-accent-red/15 active:scale-[0.99] transition-all"
          >
            {loggingOut
              ? <Loader2 className="w-6 h-6 text-accent-red animate-spin flex-shrink-0" strokeWidth={1.8} />
              : <LogOut className="w-6 h-6 text-accent-red flex-shrink-0" strokeWidth={1.8} />
            }
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-accent-red leading-tight">Sair da conta</p>
              <p className="text-[11px] font-normal text-muted-foreground mt-0.5">Encerrar sessão e voltar à tela de login</p>
            </div>
          </button>
        </div>
      </div>
    </div>

      {/* ═══ BOTÃO FLUTUANTE SUPORTE ═══ */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        onClick={() => window.open("https://wa.me/5511963390043?text=" + encodeURIComponent("Olá! Preciso de suporte no app DUB 🙏"), "_blank", "noopener,noreferrer")}
        className="fixed bottom-6 right-4 z-40 flex items-center gap-2 h-11 px-5 rounded-full bg-foreground text-background shadow-premium hover:shadow-premium-hover active:scale-[0.97] transition-all"
      >
        <div className="relative">
          <Headset className="w-4 h-4" />
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-background" />
        </div>
        <span className="text-[13px] font-semibold">Suporte</span>
      </motion.button>
    </>
  );
}
