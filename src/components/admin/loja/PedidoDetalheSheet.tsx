import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { PedidoStatusBadge } from "./PedidoStatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MessageSquare, Phone } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { toast } from "sonner";

interface PedidoDetalheSheetProps {
  pedido: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  /** Modo somente leitura — oculta botões de ação e anotações */
  readOnly?: boolean;
  /** Exibe campo de anotações internas (default true) */
  showAdminNotes?: boolean;
}

/** Limpa telefone para link wa.me */
function waLink(telefone: string | null): string | null {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, "");
  const full = digits.startsWith("55") ? digits : "55" + digits;
  return `https://wa.me/${full}`;
}

/** Labels de ação por status */
const STATUS_ACTIONS: Record<string, { next: string; label: string; nextLabel: string }> = {
  paid: { next: "preparing", label: "Iniciar separação", nextLabel: "Em separação" },
  preparing: { next: "ready_pickup", label: "Marcar como pronto", nextLabel: "Pronto p/ retirada" },
  ready_pickup: { next: "picked_up", label: "Confirmar retirada", nextLabel: "Retirado" },
};

export function PedidoDetalheSheet({ pedido, open, onOpenChange, tenantId, readOnly = false, showAdminNotes = true }: PedidoDetalheSheetProps) {
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [anotacao, setAnotacao] = useState(pedido?.observacoes_admin ?? "");
  const [savingNote, setSavingNote] = useState(false);

  // Quando pedido muda, atualizar anotação
  const currentNote = pedido?.observacoes_admin ?? "";
  if (open && anotacao !== currentNote && !savingNote) {
    // sync only on first open
  }

  /** Mutation: avançar status */
  const advanceMut = useMutation({
    mutationFn: async (nextStatus: string) => {
      const updates: Record<string, any> = { status: nextStatus, updated_at: new Date().toISOString() };
      if (nextStatus === "cancelled") updates.cancelado_em = new Date().toISOString();
      const { error } = await supabase.from("pedidos").update(updates as any).eq("id", pedido.id);
      if (error) throw error;
    },
    onSuccess: (_, nextStatus) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.pedidos(tenantId) });
      const label = nextStatus === "cancelled" ? "Pedido cancelado" : "Status atualizado!";
      toast.success(label);
      if (nextStatus === "cancelled" || nextStatus === "picked_up") onOpenChange(false);
    },
    onError: () => toast.error("Erro ao atualizar status"),
  });

  /** Salvar anotação */
  const handleSaveNote = async () => {
    if (!pedido) return;
    setSavingNote(true);
    const { error } = await supabase
      .from("pedidos")
      .update({ observacoes_admin: anotacao, updated_at: new Date().toISOString() })
      .eq("id", pedido.id);
    setSavingNote(false);
    if (error) {
      toast.error("Erro ao salvar anotação");
    } else {
      toast.success("Anotação salva");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.pedidos(tenantId) });
    }
  };

  if (!pedido) return null;

  const total = pedido.total ?? pedido.valor_total ?? 0;
  const subtotal = pedido.subtotal ?? total;
  const desconto = pedido.desconto ?? 0;
  const clienteNome = pedido.cliente?.nome || "Cliente";
  const clienteTel = pedido.cliente?.telefone;
  const waUrl = waLink(clienteTel);
  const action = STATUS_ACTIONS[pedido.status];
  const canCancel = !["picked_up", "cancelled", "expired"].includes(pedido.status);

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-lg">
              Pedido {pedido.numero_pedido || "#"}
              <PedidoStatusBadge status={pedido.status} />
            </DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-6 space-y-5 overflow-y-auto max-h-[70vh]">
            {/* Cliente */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                {clienteNome.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{clienteNome}</p>
                {clienteTel && (
                  <p className="text-xs text-muted-foreground">{clienteTel}</p>
                )}
              </div>
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              )}
              {clienteTel && (
                <a href={`tel:${clienteTel}`} className="text-muted-foreground hover:text-foreground">
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>

            <Separator />

            {/* Itens */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">Itens do pedido</h4>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-1.5 text-xs text-muted-foreground font-medium">Produto</th>
                      <th className="text-center px-2 py-1.5 text-xs text-muted-foreground font-medium">Qtd</th>
                      <th className="text-right px-3 py-1.5 text-xs text-muted-foreground font-medium">Unit.</th>
                      <th className="text-right px-3 py-1.5 text-xs text-muted-foreground font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pedido.itens || []).map((item: any) => (
                      <tr key={item.id} className="border-t border-border/50">
                        <td className="px-3 py-2 text-foreground">{item.nome_produto || "Produto"}</td>
                        <td className="px-2 py-2 text-center text-muted-foreground">{item.quantidade}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          R$ {Number(item.preco_unitario).toFixed(2).replace(".", ",")}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">
                          R$ {Number(item.subtotal).toFixed(2).replace(".", ",")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border">
                    {desconto > 0 && (
                      <>
                        <tr>
                          <td colSpan={3} className="px-3 py-1 text-right text-xs text-muted-foreground">Subtotal</td>
                          <td className="px-3 py-1 text-right text-sm">
                            R$ {Number(subtotal).toFixed(2).replace(".", ",")}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="px-3 py-1 text-right text-xs text-emerald-600">Desconto</td>
                          <td className="px-3 py-1 text-right text-sm text-emerald-600">
                            -R$ {Number(desconto).toFixed(2).replace(".", ",")}
                          </td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right text-sm font-semibold text-foreground">Total</td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-foreground">
                        R$ {Number(total).toFixed(2).replace(".", ",")}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Observações do cliente */}
            {pedido.observacoes_cliente && (
              <div>
                <h4 className="text-sm font-medium text-foreground mb-1">Observações do cliente</h4>
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  {pedido.observacoes_cliente}
                </p>
              </div>
            )}

            {/* Anotações internas — ocultas no modo somente leitura ou quando showAdminNotes=false */}
            {!readOnly && showAdminNotes && (
              <div>
                <h4 className="text-sm font-medium text-foreground mb-1">Anotações internas</h4>
                <Textarea
                  value={anotacao}
                  onChange={(e) => setAnotacao(e.target.value)}
                  placeholder="Anotações visíveis apenas para a equipe..."
                  className="min-h-[60px] text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleSaveNote}
                  disabled={savingNote || anotacao === currentNote}
                >
                  {savingNote ? "Salvando..." : "Salvar anotação"}
                </Button>
              </div>
            )}

            <Separator />

            {/* Ações por status */}
            <div className="space-y-2">
              {pedido.status === "pending_payment" && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  ⏳ Aguardando confirmação do pagamento
                </p>
              )}

              {pedido.status === "ready_pickup" && !readOnly && (
                <p className="text-xs text-muted-foreground text-center">
                  Confirme quando o cliente retirar o pedido presencialmente
                </p>
              )}

              {pedido.status === "picked_up" && (
                <div className="flex justify-center py-2">
                  <PedidoStatusBadge status="picked_up" size="md" />
                  <span className="ml-2 text-sm text-emerald-600 font-medium">Pedido concluído</span>
                </div>
              )}

              {pedido.status === "cancelled" && (
                <div className="flex justify-center py-2">
                  <PedidoStatusBadge status="cancelled" size="md" />
                </div>
              )}

              {/* Botões de ação — ocultos no modo somente leitura */}
              {!readOnly && action && (
                <Button
                  className="w-full"
                  onClick={() => advanceMut.mutate(action.next)}
                  disabled={advanceMut.isPending}
                >
                  {advanceMut.isPending ? "Atualizando..." : action.label}
                </Button>
              )}

              {!readOnly && canCancel && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setCancelOpen(true)}
                  disabled={advanceMut.isPending}
                >
                  Cancelar pedido
                </Button>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Dialog de confirmação de cancelamento */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? O estoque será devolvido automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                advanceMut.mutate("cancelled");
                setCancelOpen(false);
              }}
            >
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
