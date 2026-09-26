import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Webhook, Save, Loader2, CheckCircle, XCircle, TestTube } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  tenantId: string;
}

/**
 * TenantWebhookConfig — Configuração de webhook independente por barbearia
 * Permite que cada tenant configure sua própria URL de webhook para disparo de mensagens.
 */
export function TenantWebhookConfig({ tenantId }: Props) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    loadConfig();
  }, [tenantId]);

  const loadConfig = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tenant_webhook_config")
      .select("id, webhook_url, ativo")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (data) {
      setWebhookUrl(data.webhook_url || "");
      setAtivo(data.ativo || false);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tenant_webhook_config")
        .upsert({
          tenant_id: tenantId,
          webhook_url: webhookUrl.trim() || null,
          ativo,
        }, { onConflict: "tenant_id" });

      if (error) throw error;
      toast.success("Configuração salva!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "Tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!webhookUrl.trim()) { toast.error("Informe a URL do webhook"); return; }
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(webhookUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento: "teste_webhook",
          timestamp: new Date().toISOString(),
          mensagem: "Teste de conexão da sua barbearia no DUB",
        }),
      });

      setTestResult(res.ok ? "success" : "error");
      if (res.ok) toast.success("Webhook respondeu com sucesso!");
      else toast.error(`Webhook respondeu com status ${res.status}`);
    } catch {
      setTestResult("error");
      toast.error("Não foi possível conectar ao webhook");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Configurações de Mensagens</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure o webhook para envio de notificações automáticas da sua barbearia
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-card border border-border/20 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Webhook className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Webhook de Notificações</h3>
            <p className="text-xs text-muted-foreground">
              URL para receber eventos de agendamento, confirmação e cancelamento
            </p>
          </div>
        </div>

        {/* Ativo toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/10">
          <span className="text-sm font-medium text-foreground">Webhook ativo</span>
          <button
            onClick={() => setAtivo(!ativo)}
            className={cn(
              "w-12 h-7 rounded-full transition-colors relative",
              ativo ? "bg-primary" : "bg-muted"
            )}
          >
            <div
              className={cn(
                "w-5 h-5 rounded-full bg-white absolute top-1 transition-all",
                ativo ? "left-6" : "left-1"
              )}
            />
          </button>
        </div>

        {/* URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">URL do Webhook</label>
          <Input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://seu-webhook.com/api/notificacoes"
            className="h-12 bg-muted/30 border-border/30 rounded-xl text-sm"
          />
        </div>

        {/* Test result */}
        {testResult && (
          <div className={cn(
            "flex items-center gap-2 p-3 rounded-xl text-sm",
            testResult === "success"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-destructive/10 text-destructive"
          )}>
            {testResult === "success" ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {testResult === "success"
              ? "Webhook respondeu com sucesso!"
              : "Falha ao conectar ao webhook"}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleTest}
            disabled={testing || !webhookUrl.trim()}
            className="h-10 px-4 rounded-xl border border-border/30 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors flex items-center gap-2 disabled:opacity-40"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
            Testar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
