import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ShoppingBag, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProdutoCard } from "./ProdutoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface ProdutoGridProps {
  tenantId: string;
  onEdit?: (produto: any) => void;
  onCreateFirst?: () => void;
  /** Modo somente leitura — oculta controles e mostra apenas produtos ativos */
  readOnly?: boolean;
  /** Permite exclusão de produtos (default true) */
  canDelete?: boolean;
}

/**
 * Grid responsivo de produtos com filtros de busca, categoria e status.
 */
export function ProdutoGrid({ tenantId, onEdit, onCreateFirst, readOnly = false, canDelete = true }: ProdutoGridProps) {
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [apenasAtivos, setApenasAtivos] = useState(false);
  const queryClient = useQueryClient();

  // Buscar produtos do tenant (readOnly = apenas ativos)
  const { data: produtos, isLoading } = useQuery({
    queryKey: readOnly ? QUERY_KEYS.loja.produtosAdmin(tenantId).concat("active-only") : QUERY_KEYS.loja.produtosAdmin(tenantId),
    queryFn: async () => {
      let query = supabase
        .from("produtos")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (readOnly) query = query.eq("ativo", true);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  // Toggle ativo/inativo
  const toggleAtivoMutation = useMutation({
    mutationFn: async (produto: any) => {
      const { error } = await supabase
        .from("produtos")
        .update({ ativo: !produto.ativo })
        .eq("id", produto.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.produtosAdmin(tenantId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.stats(tenantId) });
    },
    onError: () => toast.error("Erro ao atualizar produto"),
  });

  // Excluir produto (soft delete via desativar, ou hard delete)
  const excluirMutation = useMutation({
    mutationFn: async (produtoId: string) => {
      const { error } = await supabase
        .from("produtos")
        .delete()
        .eq("id", produtoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto excluído!");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.produtosAdmin(tenantId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.stats(tenantId) });
    },
    onError: () => toast.error("Erro ao excluir produto"),
  });

  // Categorias distintas dos produtos existentes
  const categorias = useMemo(() => {
    if (!produtos) return [];
    const set = new Set(produtos.map((p: any) => p.categoria));
    return Array.from(set).sort();
  }, [produtos]);

  // Filtros client-side
  const filtrados = useMemo(() => {
    if (!produtos) return [];
    return produtos.filter((p: any) => {
      if (apenasAtivos && !p.ativo) return false;
      if (categoriaFiltro !== "todas" && p.categoria !== categoriaFiltro) return false;
      if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [produtos, busca, categoriaFiltro, apenasAtivos]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    );
  }

  // Estado vazio
  if (!produtos || produtos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <ShoppingBag className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1">
          Nenhum produto cadastrado ainda
        </h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          {readOnly
            ? "O estabelecimento ainda não cadastrou produtos na loja."
            : "Cadastre seus produtos para começar a vender na sua barbearia"}
        </p>
        {!readOnly && (
          <Button onClick={onCreateFirst} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar primeiro produto
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {categorias.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Switch
              id="apenas-ativos"
              checked={apenasAtivos}
              onCheckedChange={setApenasAtivos}
            />
            <Label htmlFor="apenas-ativos" className="text-sm whitespace-nowrap">
              Apenas ativos
            </Label>
          </div>
        )}
      </div>

      {/* Grid */}
      {filtrados.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Nenhum produto encontrado com os filtros aplicados.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtrados.map((produto: any) => (
            <ProdutoCard
              key={produto.id}
              produto={produto}
              readOnly={readOnly}
              canDelete={canDelete}
              onEdit={readOnly ? undefined : onEdit}
              onToggleAtivo={readOnly ? undefined : () => toggleAtivoMutation.mutate(produto)}
              onExcluir={readOnly || !canDelete ? undefined : () => {
                if (window.confirm(`Excluir "${produto.nome}"? Essa ação não pode ser desfeita.`)) {
                  excluirMutation.mutate(produto.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
