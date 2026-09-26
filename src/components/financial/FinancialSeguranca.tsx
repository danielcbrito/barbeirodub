import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck,
  Fingerprint,
  Smartphone,
  Clock,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { FinancialRole } from "./FinancialModule";
import { useFinancialSeguranca } from "@/hooks/useFinancialSeguranca";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";

interface Props {
  role: FinancialRole;
  userId?: string;
  onPinChanged?: () => void;
}

/**
 * Segurança Financeira — PIN, Dispositivos, Atividade
 * Migrado para TanStack Query via useFinancialSeguranca.
 */
export function FinancialSeguranca({ role, userId, onPinChanged }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading: loading } = useFinancialSeguranca(userId);

  const hasPin = data?.hasPin ?? false;
  const devices = data?.devices ?? [];

  const [showPinForm, setShowPinForm] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [submittingPin, setSubmittingPin] = useState(false);
  const [removingPin, setRemovingPin] = useState(false);

  /** Invalida cache de segurança após mutação */
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.financeiro.seguranca(userId ?? "") });
  };

  const handleSetPin = async () => {
    if (pin.length !== 4 || pin !== pinConfirm) {
      toast.error("O PIN deve ter 4 dígitos e os campos devem coincidir");
      return;
    }
    setSubmittingPin(true);
    try {
      // Escrita via SECURITY DEFINER — hash bcrypt gerado no servidor.
      const { error } = await supabase.rpc("set_financial_pin", {
        p_new_pin: pin,
        p_current_pin: null,
      });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("current_pin_required") || msg.includes("current_pin_invalid")) {
          toast.error("Para alterar o PIN, use a tela de alteração de PIN.");
        } else {
          toast.error("Erro ao configurar PIN");
        }
        return;
      }

      toast.success(hasPin ? "PIN atualizado com sucesso" : "PIN financeiro configurado");
      setShowPinForm(false);
      setPin("");
      setPinConfirm("");
      invalidate();
    } catch (err: any) {
      toast.error(err.message || "Erro ao configurar PIN");
    } finally {
      setSubmittingPin(false);
    }
  };

  const handleRemovePin = async () => {
    if (!userId) return;
    setRemovingPin(true);
    try {
      await supabase
        .from("pin_financeiro")
        .delete()
        .eq("user_id", userId);

      toast.success("PIN removido. O financeiro agora é acessado sem PIN.");
      setShowPinForm(false);
      setPin("");
      setPinConfirm("");
      invalidate();
      onPinChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover PIN");
    } finally {
      setRemovingPin(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">Segurança</h3>
        <p className="text-xs text-muted-foreground">Proteja sua conta financeira</p>
      </div>

      {/* PIN Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-5 border border-border/30 bg-card/30 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">PIN Financeiro</p>
              <p className="text-xs text-muted-foreground">
                {hasPin ? "Configurado" : "Não configurado"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasPin && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-md font-semibold uppercase">
                Ativo
              </span>
            )}
            {hasPin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemovePin}
                disabled={removingPin}
                className="rounded-lg text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {removingPin ? "Removendo..." : "Remover"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPinForm(!showPinForm)}
              className="rounded-lg text-xs h-8"
            >
              {hasPin ? "Alterar" : "Configurar"}
            </Button>
          </div>
        </div>

        {showPinForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden pt-4 border-t border-border/20 space-y-3"
          >
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
                {hasPin ? "Novo PIN" : "Criar PIN"} (4 dígitos)
              </label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="h-10 bg-secondary/20 border-border/20 rounded-xl text-center tracking-[0.5em] text-lg font-bold"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
                Confirmar PIN
              </label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="h-10 bg-secondary/20 border-border/20 rounded-xl text-center tracking-[0.5em] text-lg font-bold"
              />
            </div>
            <Button
              onClick={handleSetPin}
              disabled={pin.length !== 4 || pin !== pinConfirm || submittingPin}
              className="w-full h-10 rounded-xl"
            >
              {submittingPin ? "Salvando..." : "Salvar PIN"}
            </Button>
          </motion.div>
        )}
      </motion.div>

      {/* Verification */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl p-5 border border-border/30 bg-card/30"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Fingerprint className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Verificação de Identidade</p>
            <p className="text-xs text-muted-foreground">
              Conta verificada via autenticação do sistema
            </p>
          </div>
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        </div>
      </motion.div>

      {/* Connected Devices */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-3"
      >
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-muted-foreground/50" />
          Dispositivos Conectados
        </h4>

        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum dispositivo registrado
          </p>
        ) : (
          <div className="space-y-2">
            {devices.map((d: any) => (
              <div
                key={d.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/10 border border-border/10"
              >
                <Smartphone className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.device_name}</p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{d.browser || d.os}</span>
                    {d.last_activity && (
                      <>
                        <span>·</span>
                        <span>{format(new Date(d.last_activity), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                      </>
                    )}
                  </div>
                </div>
                {d.is_active && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-3"
      >
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground/50" />
          Atividade Recente
        </h4>
        <div className="rounded-2xl p-5 border border-border/30 bg-card/30 text-center">
          <p className="text-sm text-muted-foreground">
            O histórico detalhado de atividade está disponível no painel de segurança principal.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
