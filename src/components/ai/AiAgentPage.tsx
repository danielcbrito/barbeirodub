import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2, Bot, MessageCircle, Clock, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolvePrimaryBarberForUser } from "@/lib/tenantOwnership";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface AiAgentPageProps {
  /** Barbeiro (barbearia) alvo. Quando ausente, resolve pelo usuário autenticado. */
  barbeiroId?: string | null;
  userId?: string;
  /** Nome da barbearia/unidade para contextualizar o texto. */
  tenantNome?: string;
  /** Callback para levar o usuário à tela de conexão do WhatsApp. */
  onGoToWhatsApp?: () => void;
}

interface AgentState {
  active: boolean;
  name: string;
  whatsappConnected: boolean;
  instanceName: string | null;
  phoneNumber: string | null;
}

const CAPABILITIES = [
  {
    icon: MessageCircle,
    title: "Responde no WhatsApp",
    desc: "A Bia atende seus clientes automaticamente, 24 horas por dia.",
  },
  {
    icon: Clock,
    title: "Você assume quando quiser",
    desc: "Respondeu direto pelo WhatsApp? A Bia pausa por 30 minutos.",
  },
  {
    icon: ShieldCheck,
    title: "Exclusivo desta barbearia",
    desc: "Usa apenas o WhatsApp conectado nesta barbearia.",
  },
];

/**
 * Ativação do Agente de IA (Bia) por barbearia.
 * Cada barbearia tem seu próprio WhatsApp e, portanto, seu próprio agente.
 */
export function AiAgentPage({ barbeiroId: barbeiroIdProp, userId, tenantNome, onGoToWhatsApp }: AiAgentPageProps) {
  const [barbeiroId, setBarbeiroId] = useState<string | null>(barbeiroIdProp || null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDub, setIsDub] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [evolutionWebhook, setEvolutionWebhook] = useState<string | null>(null);
  const [state, setState] = useState<AgentState>({
    active: false,
    name: "Bia",
    whatsappConnected: false,
    instanceName: null,
    phoneNumber: null,
  });

  /* ─── resolver barbeiro ─── */
  useEffect(() => {
    if (barbeiroIdProp) {
      setBarbeiroId(barbeiroIdProp);
      return;
    }
    if (!userId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await resolvePrimaryBarberForUser<{ id: string }>(userId);
        if (data?.id) setBarbeiroId(data.id);
        else setLoading(false);
      } catch {
        setLoading(false);
      }
    })();
  }, [barbeiroIdProp, userId]);

  const refresh = useCallback(async () => {
    if (!barbeiroId) return;
    try {
      const [{ data, error }, { data: cfg }] = await Promise.all([
        supabase.functions.invoke("whatsapp-proxy", {
          body: { action: "agent_status", barbeiro_id: barbeiroId },
        }),
        (supabase as any)
          .from("agente_config")
          .select("ativo")
          .eq("barbeiro_id", barbeiroId)
          .maybeSingle(),
      ]);
      if (error) throw error;
      setState({
        active: !!data?.active || !!cfg?.ativo,
        name: data?.name || "Bia",
        whatsappConnected: !!data?.whatsapp_connected,
        instanceName: data?.instance_name || null,
        phoneNumber: data?.phone_number || null,
      });
      setEvolutionWebhook(
        data?.evolution_webhook_enabled === false ? null : (data?.evolution_webhook || null),
      );
    } catch (err) {
      console.error("[AiAgentPage] status", err);
    } finally {
      setLoading(false);
    }
  }, [barbeiroId]);

  useEffect(() => { refresh(); }, [refresh]);

  /* ─── webhook global (editável apenas na barbearia DUB) ─── */
  useEffect(() => {
    if (!barbeiroId) return;
    (async () => {
      try {
        const { data: barbeiro } = await supabase
          .from("barbeiros")
          .select("tenant_id, tenants:tenant_id(nome)")
          .eq("id", barbeiroId)
          .maybeSingle();
        const nome = String((barbeiro as any)?.tenants?.nome || tenantNome || "");
        const dub = /dub/i.test(nome);
        setIsDub(dub);
        if (!dub) return;
        const { data: hook } = await (supabase as any)
          .from("agente_webhook_global")
          .select("webhook_url")
          .maybeSingle();
        setWebhookUrl(hook?.webhook_url || "");
      } catch (err) {
        console.error("[AiAgentPage] webhook global", err);
      }
    })();
  }, [barbeiroId, tenantNome]);

  const handleSaveWebhook = async () => {
    if (savingWebhook) return;
    const url = webhookUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      toast.error("Informe um endereço válido começando com https://");
      return;
    }
    setSavingWebhook(true);
    try {
      const { error } = await (supabase as any)
        .from("agente_webhook_global")
        .upsert(
          { id: true, webhook_url: url || null, atualizado_em: new Date().toISOString() },
          { onConflict: "id" },
        );
      if (error) throw error;

      // Reaplica o endereço em todos os agentes já ativos (Evolution)
      const { data: sync, error: syncError } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "agent_resync" },
      });
      if (syncError || sync?.error) throw new Error(sync?.error || syncError?.message);

      const total = Array.isArray(sync?.results) ? sync.results.length : 0;
      const ok = Array.isArray(sync?.results) ? sync.results.filter((r: any) => r.ok).length : 0;
      toast.success(
        total > 0
          ? `Webhook atualizado e aplicado em ${ok}/${total} WhatsApp ativos.`
          : "Webhook atualizado — vale para todas as barbearias.",
      );
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível salvar o webhook.");
    } finally {
      setSavingWebhook(false);
    }
  };

  /** Mantém agente_config sincronizado (usado pelos lembretes de agendamento). */
  const syncAgenteConfig = async (barbId: string, ativo: boolean) => {
    const { data: barbeiro } = await supabase
      .from("barbeiros")
      .select("tenant_id")
      .eq("id", barbId)
      .maybeSingle();

    await (supabase as any)
      .from("agente_config")
      .upsert(
        {
          barbeiro_id: barbId,
          tenant_id: barbeiro?.tenant_id ?? null,
          ativo,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "barbeiro_id" },
      );
  };

  const handleToggle = async (next: boolean) => {
    if (!barbeiroId || saving) return;
    if (next && !state.whatsappConnected) {
      toast.error("Conecte o WhatsApp desta barbearia antes de ativar a Bia.");
      return;
    }
    setSaving(true);
    const previous = state.active;
    setState((s) => ({ ...s, active: next }));
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: next ? "agent_enable" : "agent_disable", barbeiro_id: barbeiroId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await syncAgenteConfig(barbeiroId, next);
      toast.success(next ? "Bia ativada — já está respondendo seus clientes." : "Bia desativada.");
      await refresh();
    } catch (err: any) {
      setState((s) => ({ ...s, active: previous }));
      const msg = typeof err?.message === "string" && err.message.length < 160
        ? err.message
        : "Não foi possível atualizar o agente. Tente novamente.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!barbeiroId) {
    return (
      <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
        Não foi possível identificar a barbearia deste agente.
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* ═══ Cabeçalho do agente ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mx-5 mt-2 flex flex-col items-center text-center"
      >
        <div
          className={cn(
            "h-20 w-20 rounded-full flex items-center justify-center transition-colors",
            state.active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
          )}
        >
          <Bot className="h-9 w-9" strokeWidth={1.5} />
        </div>
        <h2 className="mt-4 text-[22px] font-bold text-foreground">Bia · Agente de IA</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {tenantNome ? `Atendimento automático de ${tenantNome}` : "Atendimento automático no WhatsApp"}
        </p>

        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium",
            state.active
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", state.active ? "bg-emerald-500" : "bg-muted-foreground/50")} />
          {state.active ? "Ativo" : "Inativo"}
        </div>
      </motion.div>

      {/* ═══ Pré-requisito WhatsApp ═══ */}
      {!state.whatsappConnected && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="mx-5 mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" strokeWidth={1.8} />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">WhatsApp não conectado</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Para ativar a Bia, conecte primeiro o WhatsApp desta barbearia na tela de WhatsApp.
              </p>
              {onGoToWhatsApp && (
                <button
                  onClick={onGoToWhatsApp}
                  className="mt-3 h-9 px-4 rounded-xl bg-foreground text-background text-[12px] font-medium active:opacity-70 transition-opacity"
                >
                  Conectar WhatsApp
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ Toggle ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="mx-5 mt-6 rounded-2xl border border-border/60 bg-card p-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-foreground">Ativar a Bia</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {state.whatsappConnected
                ? state.phoneNumber
                  ? `WhatsApp conectado · ${state.phoneNumber}`
                  : "WhatsApp conectado"
                : "Requer WhatsApp conectado"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch
              checked={state.active}
              disabled={saving || (!state.whatsappConnected && !state.active)}
              onCheckedChange={handleToggle}
              aria-label="Ativar agente de IA"
            />
          </div>
        </div>
      </motion.div>

      {/* ═══ Webhook do fluxo (somente DUB) ═══ */}
      {isDub && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12 }}
          className="mx-5 mt-4 rounded-2xl border border-border/60 bg-card p-4"
        >
          <p className="text-[15px] font-medium text-foreground">Webhook do fluxo</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            Endereço usado por todas as barbearias. Use o de teste enquanto estiver testando e troque para o de
            produção depois.
          </p>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://n8n-n8n.xcyr4f.easypanel.host/webhook/whatsapp-barbearia"
            className="mt-3 h-12 w-full rounded-xl border border-border/40 bg-muted/30 px-3 text-[13px] text-foreground outline-none focus:border-foreground/40"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button
            onClick={handleSaveWebhook}
            disabled={savingWebhook}
            className="mt-3 h-10 px-5 rounded-xl bg-foreground text-background text-[13px] font-medium inline-flex items-center gap-2 active:opacity-70 disabled:opacity-50"
          >
            {savingWebhook && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar webhook
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground break-all">
            Em uso agora neste WhatsApp: {evolutionWebhook || "nenhum (mensagens não estão sendo enviadas)"}
          </p>
        </motion.div>
      )}

      {/* ═══ Explicação ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="mx-5 mt-6"
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Quando ativado, a Bia vai responder automaticamente seus clientes no WhatsApp. Você pode assumir a conversa a
          qualquer momento — é só responder direto pelo WhatsApp e a Bia pausa automaticamente por 30 minutos.
        </p>
      </motion.div>

      {/* ═══ O que o agente faz ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="mx-5 mt-6"
      >
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">O que a Bia faz</p>
        <div className="mt-2">
          {CAPABILITIES.map((c, idx) => (
            <div key={c.title}>
              <div className="flex items-start gap-3 py-4">
                <c.icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-foreground">{c.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{c.desc}</p>
                </div>
              </div>
              {idx < CAPABILITIES.length - 1 && <div className="h-px bg-border/40" />}
            </div>
          ))}
        </div>
      </motion.div>

      {state.active && (
        <div className="mx-5 mt-6 flex items-center gap-2 text-[12px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
          Atendimento automático ligado nesta barbearia.
        </div>
      )}
    </div>
  );
}
