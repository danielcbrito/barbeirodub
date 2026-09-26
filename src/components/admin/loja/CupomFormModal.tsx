import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface CupomFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  cupom?: any | null;
  produtos: { id: string; nome: string }[];
}

const EMPTY = {
  codigo: "",
  descricao: "",
  tipo_desconto: "percentual",
  valor_desconto: "",
  valor_minimo: "",
  produto_id: "todos",
  max_usos_total: "",
  max_usos_por_cliente: "1",
  valido_ate: "",
  ativo: true,
};

/**
 * Criação/edição de cupom da loja — vale para um produto específico
 * ou para a loja inteira quando nenhum produto é escolhido.
 */
export function CupomFormModal({ open, onOpenChange, tenantId, cupom, produtos }: CupomFormModalProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY });

  useEffect(() => {
    if (!open) return;
    if (cupom) {
      setForm({
        codigo: cupom.codigo ?? "",
        descricao: cupom.descricao ?? "",
        tipo_desconto: cupom.tipo_desconto ?? "percentual",
        valor_desconto: String(cupom.valor_desconto ?? ""),
        valor_minimo: cupom.valor_minimo ? String(cupom.valor_minimo) : "",
        produto_id: cupom.produto_id ?? "todos",
        max_usos_total: cupom.max_usos_total ? String(cupom.max_usos_total) : "",
        max_usos_por_cliente: cupom.max_usos_por_cliente ? String(cupom.max_usos_por_cliente) : "",
        valido_ate: cupom.valido_ate ? String(cupom.valido_ate).slice(0, 10) : "",
        ativo: cupom.ativo ?? true,
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, cupom]);

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const salvar = useMutation({
    mutationFn: async () => {
      const codigo = form.codigo.trim().toUpperCase();
      if (!codigo) throw new Error("Informe o código do cupom");
      const valor = Number(form.valor_desconto.replace(",", "."));
      if (!valor || valor <= 0) throw new Error("Informe um desconto válido");
      if (form.tipo_desconto === "percentual" && valor > 100)
        throw new Error("Desconto percentual não pode passar de 100%");

      const payload = {
        tenant_id: tenantId,
        codigo,
        descricao: form.descricao.trim() || null,
        tipo_desconto: form.tipo_desconto,
        valor_desconto: valor,
        valor_minimo: form.valor_minimo ? Number(form.valor_minimo.replace(",", ".")) : 0,
        produto_id: form.produto_id === "todos" ? null : form.produto_id,
        max_usos_total: form.max_usos_total ? Number(form.max_usos_total) : null,
        max_usos_por_cliente: form.max_usos_por_cliente ? Number(form.max_usos_por_cliente) : null,
        valido_ate: form.valido_ate ? new Date(`${form.valido_ate}T23:59:59`).toISOString() : null,
        ativo: form.ativo,
      };

      if (cupom?.id) {
        const { error } = await supabase.from("loja_cupons").update(payload).eq("id", cupom.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("loja_cupons").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(cupom ? "Cupom atualizado!" : "Cupom criado!");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.cupons(tenantId) });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast.error(
        e?.message?.includes("loja_cupons_codigo_tenant_uk")
          ? "Já existe um cupom com esse código"
          : e?.message || "Erro ao salvar cupom"
      ),
  });

  const body = (
    <ScrollArea className="max-h-[70vh]">
      <div className="space-y-4 px-1 pb-2">
        <div className="space-y-2">
          <Label>Código</Label>
          <Input
            value={form.codigo}
            onChange={(e) => set("codigo", e.target.value.toUpperCase())}
            placeholder="POMADA10"
            className="uppercase"
          />
        </div>

        <div className="space-y-2">
          <Label>Descrição (opcional)</Label>
          <Textarea
            value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            placeholder="10% off nas pomadas"
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={form.tipo_desconto} onValueChange={(v) => set("tipo_desconto", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentual">Percentual (%)</SelectItem>
                <SelectItem value="valor">Valor fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Desconto</Label>
            <Input
              inputMode="decimal"
              value={form.valor_desconto}
              onChange={(e) => set("valor_desconto", e.target.value)}
              placeholder={form.tipo_desconto === "percentual" ? "10" : "5,00"}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Produto</Label>
          <Select value={form.produto_id} onValueChange={(v) => set("produto_id", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Toda a loja</SelectItem>
              {produtos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Pedido mínimo (R$)</Label>
            <Input
              inputMode="decimal"
              value={form.valor_minimo}
              onChange={(e) => set("valor_minimo", e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-2">
            <Label>Validade</Label>
            <Input type="date" value={form.valido_ate} onChange={(e) => set("valido_ate", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Limite total de usos</Label>
            <Input
              inputMode="numeric"
              value={form.max_usos_total}
              onChange={(e) => set("max_usos_total", e.target.value)}
              placeholder="Ilimitado"
            />
          </div>
          <div className="space-y-2">
            <Label>Usos por cliente</Label>
            <Input
              inputMode="numeric"
              value={form.max_usos_por_cliente}
              onChange={(e) => set("max_usos_por_cliente", e.target.value)}
              placeholder="1"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">Cupom ativo</p>
            <p className="text-xs text-muted-foreground">Visível para os clientes na loja</p>
          </div>
          <Switch checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
        </div>

        <Button className="w-full" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          {salvar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {cupom ? "Salvar alterações" : "Criar cupom"}
        </Button>
      </div>
    </ScrollArea>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="px-0">
            <DrawerTitle>{cupom ? "Editar cupom" : "Novo cupom"}</DrawerTitle>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{cupom ? "Editar cupom" : "Novo cupom"}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
