import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Plus, Ticket, Search, Pencil, Trash2 } from "lucide-react";
import { CupomFormModal } from "./CupomFormModal";

interface LojaCuponsProps {
  tenantId: string;
  readOnly?: boolean;
}

/**
 * Gestão de cupons de desconto da loja (por produto ou para toda a loja).
 */
export function LojaCupons({ tenantId, readOnly = false }: LojaCuponsProps) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: cupons, isLoading } = useQuery({
    queryKey: QUERY_KEYS.loja.cupons(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loja_cupons")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  const { data: produtos } = useQuery({
    queryKey: [...QUERY_KEYS.loja.produtosAdmin(tenantId), "nomes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome")
        .eq("tenant_id", tenantId)
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    staleTime: 120_000,
  });

  const produtoNome = useMemo(() => {
    const map = new Map<string, string>();
    (produtos || []).forEach((p: any) => map.set(p.id, p.nome));
    return map;
  }, [produtos]);

  const toggleAtivo = useMutation({
    mutationFn: async (cupom: any) => {
      const { error } = await supabase
        .from("loja_cupons")
        .update({ ativo: !cupom.ativo })
        .eq("id", cupom.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.cupons(tenantId) }),
    onError: () => toast.error("Erro ao atualizar cupom"),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loja_cupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cupom excluído!");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.cupons(tenantId) });
    },
    onError: () => toast.error("Erro ao excluir cupom"),
  });

  const filtrados = useMemo(() => {
    const list = cupons || [];
    if (!busca.trim()) return list;
    const q = busca.toLowerCase();
    return list.filter(
      (c: any) =>
        c.codigo?.toLowerCase().includes(q) ||
        c.descricao?.toLowerCase().includes(q) ||
        (c.produto_id && produtoNome.get(c.produto_id)?.toLowerCase().includes(q))
    );
  }, [cupons, busca, produtoNome]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const vazio = !cupons || cupons.length === 0;

  return (
    <div className="space-y-4">
      {!vazio && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cupom..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-11 h-14 rounded-2xl"
            />
          </div>
          {!readOnly && (
            <Button className="gap-2 h-14 rounded-2xl sm:w-auto" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" />
              Novo cupom
            </Button>
          )}
        </div>
      )}

      {vazio ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Ticket className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhum cupom criado</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            {readOnly
              ? "A barbearia ainda não criou cupons para a loja."
              : "Crie cupons de desconto para produtos específicos ou para toda a loja."}
          </p>
          {!readOnly && (
            <Button className="gap-2" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" />
              Criar primeiro cupom
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((c: any) => {
            const expirado = c.valido_ate && new Date(c.valido_ate) < new Date();
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold tracking-wide text-foreground">
                        {c.codigo}
                      </span>
                      <Badge variant="secondary" className="text-[11px]">
                        {c.tipo_desconto === "percentual"
                          ? `${Number(c.valor_desconto)}% off`
                          : `R$ ${Number(c.valor_desconto).toFixed(2).replace(".", ",")} off`}
                      </Badge>
                      {expirado && (
                        <Badge variant="destructive" className="text-[11px]">
                          Expirado
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.produto_id ? produtoNome.get(c.produto_id) || "Produto" : "Toda a loja"}
                      {c.valor_minimo > 0 &&
                        ` · mínimo R$ ${Number(c.valor_minimo).toFixed(2).replace(".", ",")}`}
                      {c.max_usos_total ? ` · ${c.usos_count}/${c.max_usos_total} usos` : ` · ${c.usos_count} usos`}
                    </p>
                    {c.descricao && (
                      <p className="text-xs text-muted-foreground/80 truncate">{c.descricao}</p>
                    )}
                  </div>

                  {!readOnly && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={c.ativo} onCheckedChange={() => toggleAtivo.mutate(c)} />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => { setEditing(c); setFormOpen(true); }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          if (window.confirm(`Excluir o cupom ${c.codigo}?`)) excluir.mutate(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <CupomFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          tenantId={tenantId}
          cupom={editing}
          produtos={(produtos as any[]) || []}
        />
      )}
    </div>
  );
}
