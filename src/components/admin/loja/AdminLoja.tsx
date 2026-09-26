import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, ShoppingBag, ClipboardList, Ticket, BarChart3 } from "lucide-react";
import { AdminLojaStats } from "./AdminLojaStats";
import { ProdutoGrid } from "./ProdutoGrid";
import { ProdutoFormModal } from "./ProdutoFormModal";
import { PedidosAdmin } from "./PedidosAdmin";
import { LojaCupons } from "./LojaCupons";
import { LojaVendas } from "./LojaVendas";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { Badge } from "@/components/ui/badge";


interface AdminLojaProps {
  tenantId: string;
  /** Modo somente leitura para produtos — oculta ações de criação/edição */
  readOnly?: boolean;
  /** Permite exclusão de produtos (default true) */
  canDelete?: boolean;
  /** Exibe anotações internas no detalhe do pedido (default true) */
  showAdminNotes?: boolean;
  /** Modo somente leitura para pedidos — se omitido usa o valor de readOnly */
  pedidosReadOnly?: boolean;
}

/**
 * Módulo Loja — raiz com tabs "Produtos" e "Pedidos".
 * Renderiza KPIs no topo e controla abertura do modal de produto.
 */
export function AdminLoja({ tenantId, readOnly = false, canDelete = true, showAdminNotes = true, pedidosReadOnly }: AdminLojaProps) {
  const effectivePedidosReadOnly = pedidosReadOnly ?? readOnly;
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduto, setEditingProduto] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("produtos");

  // Contagem de pedidos pendentes para badge
  const { data: pendingCount } = useQuery({
    queryKey: [...QUERY_KEYS.loja.pedidos(tenantId), "pending-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("pedidos")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["pending_payment", "paid", "preparing"]);
      return count || 0;
    },
    staleTime: 30_000,
  });

  const handleEdit = (produto: any) => {
    setEditingProduto(produto);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditingProduto(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            Loja
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie produtos e pedidos da sua barbearia
          </p>
        </div>
        {!readOnly && (
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo produto
          </Button>
        )}
      </div>

      {/* KPIs */}
      <AdminLojaStats tenantId={tenantId} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="produtos" className="gap-2">
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Produtos</span>
          </TabsTrigger>
          <TabsTrigger value="pedidos" className="gap-2 relative">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Pedidos</span>
            {!!pendingCount && pendingCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1 text-xs">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="cupons" className="gap-2">
            <Ticket className="h-4 w-4" />
            <span className="hidden sm:inline">Cupons</span>
          </TabsTrigger>
          <TabsTrigger value="vendas" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Vendas</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="mt-4">
          <ProdutoGrid
            tenantId={tenantId}
            onEdit={readOnly ? undefined : handleEdit}
            onCreateFirst={readOnly ? undefined : handleCreate}
            readOnly={readOnly}
            canDelete={canDelete}
          />
        </TabsContent>

        <TabsContent value="pedidos" className="mt-4">
          <PedidosAdmin tenantId={tenantId} readOnly={effectivePedidosReadOnly} showAdminNotes={showAdminNotes} />
        </TabsContent>

        <TabsContent value="cupons" className="mt-4">
          <LojaCupons tenantId={tenantId} readOnly={readOnly} />
        </TabsContent>

        <TabsContent value="vendas" className="mt-4">
          <LojaVendas tenantId={tenantId} />
        </TabsContent>
      </Tabs>


      {/* Modal criar/editar produto */}
      <ProdutoFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        tenantId={tenantId}
        produto={editingProduto}
      />
    </div>
  );
}
