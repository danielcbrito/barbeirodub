import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Loader2,
  Users,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useWhatsAppStatus } from "@/hooks/useWhatsAppStatus";
import { WhatsAppRequiredBanner } from "@/components/whatsapp/WhatsAppRequiredBanner";
import { getWhatsAppInstance } from "@/lib/whatsappInstanceHelper";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

interface TenantDisparoProps {
  tenantId: string;
  barbeiroId: string;
}

interface ClienteSimples {
  id: string;
  nome: string;
  telefone: string | null;
}

/** Busca webhook, clientes e histórico de disparos */
async function fetchDisparoData(tenantId: string, barbeiroId: string) {
  // Webhook config
  const { data: config } = await supabase
    .from("tenant_webhook_config")
    .select("webhook_url, ativo")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const webhookUrl = (config?.ativo && config?.webhook_url) ? config.webhook_url : null;

  // Excluir barbeiros da lista de clientes
  const { data: allBarbeiros } = await supabase
    .from("barbeiros")
    .select("user_id")
    .not("user_id", "is", null);
  const barberUserIds = allBarbeiros?.map((b) => b.user_id).filter(Boolean) || [];

  // Clientes do barbeiro (via agendamentos)
  const { data: agendamentos } = await supabase
    .from("agendamentos")
    .select("user_id")
    .eq("barbeiro_id", barbeiroId)
    .not("user_id", "is", null);

  const userIds = [...new Set(agendamentos?.map((a) => a.user_id) || [])]
    .filter((id) => !barberUserIds.includes(id));

  let clientes: ClienteSimples[] = [];
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nome, telefone")
      .in("id", userIds)
      .not("telefone", "is", null)
      .order("nome");
    clientes = profiles || [];
  }

  // Histórico de disparos
  const { data: dispatches } = await supabase
    .from("disparos_programados")
    .select("id, mensagem, data_programada, executado, executado_em, contatos_ids, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(10);

  return { webhookUrl, clientes, historico: dispatches || [] };
}

/**
 * Módulo de disparo de mensagens isolado por tenant.
 * Usa o webhook configurado em tenant_webhook_config.
 */
export function TenantDisparo({ tenantId, barbeiroId }: TenantDisparoProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mensagem, setMensagem] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sending, setSending] = useState(false);
  const { isConnected: whatsAppConnected, isLoading: whatsAppLoading } = useWhatsAppStatus(barbeiroId);

  const queryKey = QUERY_KEYS.tenant.disparo(tenantId, barbeiroId);

  const { data, isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => fetchDisparoData(tenantId, barbeiroId),
    staleTime: STALE_TIMES.CLIENTES,
    enabled: !!tenantId && !!barbeiroId,
  });

  const clientes = data?.clientes || [];
  const webhookUrl = data?.webhookUrl || null;
  const historico = data?.historico || [];

  const toggleClient = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const filteredClientes = clientes.filter((c) =>
    c.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectAll = () => {
    if (selected.size === filteredClientes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredClientes.map((c) => c.id)));
    }
  };

  const handleSend = async () => {
    if (!webhookUrl) {
      toast.error("Configure o webhook em Mensagens primeiro");
      return;
    }
    if (selected.size === 0) {
      toast.error("Selecione pelo menos um cliente");
      return;
    }
    if (!mensagem.trim()) {
      toast.error("Escreva uma mensagem");
      return;
    }

    setSending(true);
    try {
      const contatos = clientes
        .filter((c) => selected.has(c.id) && c.telefone)
        .map((c) => ({
          cliente_id: c.id,
          cliente_nome: c.nome,
          cliente_telefone: c.telefone,
          mensagem: mensagem.replace("{nome}", c.nome.split(" ")[0]),
        }));

      const whatsappInstance = await getWhatsAppInstance(barbeiroId);

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento: "disparo_mensagem_lote",
          total_contatos: contatos.length,
          contatos,
          programado: false,
          timestamp: new Date().toISOString(),
          mensagem_original: mensagem,
          whatsapp_instance: whatsappInstance,
        }),
      });

      if (!res.ok) throw new Error(`Webhook retornou ${res.status}`);

      await supabase.from("disparos_programados").insert({
        mensagem,
        contatos_ids: Array.from(selected),
        data_programada: new Date().toISOString(),
        executado: true,
        executado_em: new Date().toISOString(),
        resultado: { success: true, total: contatos.length },
        tenant_id: tenantId,
      });

      toast.success(`Mensagem enviada para ${contatos.length} clientes!`);
      setMensagem("");
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey });
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar mensagens");
    } finally {
      setSending(false);
    }
  };

  if (loading || whatsAppLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!whatsAppConnected) {
    return <WhatsAppRequiredBanner variant="fullblock" basePath={`/tenant/admin`} />;
  }

  if (!webhookUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
        <h3 className="font-semibold text-foreground mb-2">Webhook não configurado</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Para enviar mensagens, configure primeiro o webhook na seção "Mensagens" do menu lateral.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Disparo de Mensagens</h2>
        <p className="text-sm text-muted-foreground">
          Envie mensagens em massa para seus clientes via WhatsApp
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Client selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Clientes ({filteredClientes.length})
            </h3>
            <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">
              {selected.size === filteredClientes.length ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
          </div>

          <div className="relative">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar cliente..."
              className="pl-3"
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-1 rounded-xl border border-border p-2">
            {filteredClientes.length === 0 ? (
              <div className="py-8 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Nenhum cliente encontrado</p>
              </div>
            ) : (
              filteredClientes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleClient(c.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm",
                    selected.has(c.id)
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                      selected.has(c.id)
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {selected.has(c.id) && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">{c.telefone}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Message + Send */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Mensagem
          </h3>

          <Textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Olá {nome}! Temos uma novidade para você..."
            rows={6}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Use <code className="bg-muted px-1 rounded">{"{nome}"}</code> para personalizar com o nome do cliente.
          </p>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <Send className="h-4 w-4 text-primary" />
            <span className="text-sm text-foreground font-medium">
              {selected.size} cliente{selected.size !== 1 ? "s" : ""} selecionado{selected.size !== 1 ? "s" : ""}
            </span>
          </div>

          <Button onClick={handleSend} disabled={sending || selected.size === 0} className="w-full gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar Mensagens
          </Button>
        </div>
      </div>

      {/* History */}
      {historico.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Histórico de Disparos
          </h3>
          <div className="space-y-2">
            {historico.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
              >
                <div>
                  <p className="text-sm text-foreground truncate max-w-[300px]">{h.mensagem}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.executado_em
                      ? format(new Date(h.executado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : "Programado"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {h.contatos_ids?.length || 0} contatos
                  </span>
                  {h.executado ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
