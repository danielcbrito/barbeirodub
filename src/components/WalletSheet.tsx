import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Wallet,
  History,
  TrendingUp,
  TrendingDown,
  Coins,
  ChevronLeft,
  Gift,
  RefreshCw,
  AlertCircle,
  User,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface WalletSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
}

interface Credit {
  id: string;
  valor: number;
  origem: string;
  usado: boolean;
  created_at: string;
  expires_at: string | null;
  agendamento_origem_id: string | null;
}

// Componente do Card de Crédito Premium
function CreditCard({ credito }: { credito: Credit }) {
  const isUsed = credito.usado;
  const isExpired = credito.expires_at && new Date(credito.expires_at) < new Date();

  const getOriginIcon = (origem: string) => {
    switch (origem) {
      case "cancelamento":
        return <RefreshCw className="w-4 h-4 text-blue-500" />;
      case "reembolso":
        return <TrendingDown className="w-4 h-4 text-orange-500" />;
      case "promocao":
        return <Gift className="w-4 h-4 text-purple-500" />;
      default:
        return <Coins className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getOriginLabel = (origem: string) => {
    switch (origem) {
      case "cancelamento":
        return "Cancelamento de agendamento";
      case "reembolso":
        return "Reembolso";
      case "promocao":
        return "Promoção";
      default:
        return origem;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl p-4 border transition-all",
        isUsed || isExpired 
          ? "bg-zinc-900/30 border-zinc-800 opacity-60" 
          : "bg-zinc-900/50 border-zinc-700"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            isUsed || isExpired ? "bg-zinc-800" : "bg-zinc-700/50"
          )}>
            {getOriginIcon(credito.origem)}
          </div>
          <div>
            <h4 className={cn(
              "font-semibold mb-1",
              isUsed || isExpired ? "text-zinc-500" : "text-foreground"
            )}>
              {getOriginLabel(credito.origem)}
            </h4>
            <p className="text-xs text-zinc-500">
              {format(new Date(credito.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className={cn(
            "text-xl font-bold",
            isUsed || isExpired ? "text-zinc-600 line-through" : "text-green-500"
          )}>
            +R$ {credito.valor.toFixed(2).replace('.', ',')}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end">
        {isUsed ? (
          <span className="text-xs bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full">
            Crédito já utilizado
          </span>
        ) : isExpired ? (
          <span className="text-xs bg-red-500/20 text-red-400 px-2.5 py-1 rounded-full border border-red-500/20 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Expirado
          </span>
        ) : (
          <span className="text-xs bg-green-500/20 text-green-400 px-2.5 py-1 rounded-full border border-green-500/20">
            ✓ Disponível
          </span>
        )}
      </div>
    </motion.div>
  );
}

export function WalletSheet({ open, onOpenChange, userId }: WalletSheetProps) {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<{ nome: string | null; avatar_url: string | null }>({ nome: null, avatar_url: null });
  const [avatarFailed, setAvatarFailed] = useState(false);

  const initials = (profile.nome ?? "")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Calcular totais
  const totalRecebido = credits.reduce((acc, c) => acc + c.valor, 0);
  const totalUtilizado = credits.filter(c => c.usado).reduce((acc, c) => acc + c.valor, 0);

  useEffect(() => {
    if (open && userId) {
      loadCredits();
      loadProfile();
    }
  }, [open, userId]);

  const loadProfile = async () => {
    if (!userId) return;
    setAvatarFailed(false);
    const { data } = await supabase
      .from("profiles")
      .select("nome, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (data) setProfile({ nome: data.nome ?? null, avatar_url: data.avatar_url ?? null });
  };

  const loadCredits = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      // Get all credits
      /* Select apenas campos usados pela interface Credit */
      const { data: creditsData, error: creditsError } = await supabase
        .from("creditos")
        .select("id, valor, origem, usado, created_at, expires_at, agendamento_origem_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (creditsError) throw creditsError;
      
      setCredits(creditsData || []);

      // Get available balance
      const { data: balanceData, error: balanceError } = await supabase
        .rpc("get_user_available_credits", { p_user_id: userId });

      if (balanceError) throw balanceError;
      
      setAvailableBalance(balanceData || 0);
    } catch (error) {
      console.error("Error loading credits:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 bg-zinc-950 border-zinc-800">
        
        {/* HEADER COM GRADIENTE */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-red-950/30 p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3 mb-6">
            <button 
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center bg-primary-foreground/10 border border-primary-foreground/20 text-primary-foreground shrink-0">
                {profile.avatar_url && !avatarFailed ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.nome ?? "Avatar"}
                    className="w-full h-full object-cover"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : initials ? (
                  <span className="text-sm font-semibold">{initials}</span>
                ) : (
                  <User className="w-5 h-5" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold">Minha Carteira</h2>
                <p className="text-sm text-zinc-400">Gerencie seus créditos</p>
              </div>
            </div>
          </div>

          {/* SALDO PRINCIPAL */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-red-500 to-orange-600 rounded-2xl p-6 shadow-2xl shadow-red-500/20"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-red-100/80 font-medium">
                Créditos Disponíveis
              </span>
              <div className="w-8 h-8 bg-foreground/20 backdrop-blur rounded-full flex items-center justify-center">
                <Coins className="w-4 h-4 text-foreground" />
              </div>
            </div>
            
            <div className="text-5xl font-bold text-foreground mb-1">
              R$ {availableBalance.toFixed(2).replace('.', ',')}
            </div>
            
            <p className="text-sm text-red-100/70">
              Válido para qualquer agendamento
            </p>
          </motion.div>
        </div>

        {/* CONTEÚDO */}
        <div className="p-4 max-h-[calc(100vh-320px)] overflow-y-auto">
          
          {/* Info rápida */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800"
            >
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-xs text-zinc-500">Total Recebido</span>
              </div>
              <span className="text-xl font-bold text-foreground">
                R$ {totalRecebido.toFixed(2).replace('.', ',')}
              </span>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800"
            >
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-zinc-500" />
                <span className="text-xs text-zinc-500">Utilizados</span>
              </div>
              <span className="text-xl font-bold text-zinc-400">
                R$ {totalUtilizado.toFixed(2).replace('.', ',')}
              </span>
            </motion.div>
          </div>

          {/* Histórico */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <History className="w-5 h-5 text-zinc-400" />
              <h3 className="text-lg font-bold">Histórico de Créditos</h3>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : credits.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-12"
              >
                <div className="w-20 h-20 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Wallet className="w-10 h-10 text-zinc-600" />
                </div>
                <h4 className="text-lg font-semibold text-zinc-400 mb-2">
                  Nenhum crédito no momento
                </h4>
                <p className="text-sm text-zinc-500 max-w-xs mx-auto">
                  Quando você receber créditos por cancelamentos ou promoções, eles aparecerão aqui
                </p>
              </motion.div>
            ) : (
              <AnimatePresence>
                <div className="space-y-3 pb-20">
                  {credits.map((credito, index) => (
                    <motion.div
                      key={credito.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <CreditCard credito={credito} />
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            )}
          </div>

        </div>

      </SheetContent>
    </Sheet>
  );
}
