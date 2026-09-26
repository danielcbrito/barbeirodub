import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShoppingBag, Package, DollarSign, Store, AlertTriangle,
  Search, ArrowLeft, TrendingUp, Eye,
} from "lucide-react";
import { AdminLoja } from "./AdminLoja";
import { cn } from "@/lib/utils";

/**
 * Visão global de todas as lojas — painel Admin DUB.
 * Mostra KPIs globais + tabela de tenants com loja ativa.
 * Drill-down para AdminLoja com tenantId do tenant selecionado.
 */
export function AdminLojaGlobal() {
  const [search, setSearch] = useState("");
  const [drillTenantId, setDrillTenantId] = useState<string | null>(null);
  const [drillTenantNome, setDrillTenantNome] = useState("");

  // ── Query global stats ───────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["loja", "global-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_all_lojas_stats");
      if (error) throw error;
      return data as any;
    },
    staleTime: 60_000,
  });

  const global = data?.global ?? {};
  const tenants: any[] = data?.tenants ?? [];

  // ── Filtro ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return tenants;
    const q = search.toLowerCase();
    return tenants.filter((t: any) => t.tenant_nome?.toLowerCase().includes(q));
  }, [tenants, search]);

  // ── Drill-down: ver loja de um tenant ────────────────────
  if (drillTenantId) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => setDrillTenantId(null)}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para visão global
        </Button>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-xs">Visualizando loja de</Badge>
          <span className="font-medium text-foreground">{drillTenantNome}</span>
        </div>
        <AdminLoja tenantId={drillTenantId} />
      </div>
    );
  }

  // ── Render principal ─────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShoppingBag className="h-6 w-6 text-primary" />
          Loja — Visão Global
          <Badge variant="secondary" className="text-[10px] ml-1">Admin</Badge>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visão consolidada de todas as lojas da plataforma
        </p>
      </div>

      {/* KPIs globais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Store} label="Lojas ativas" value={String(global.total_lojas_ativas ?? 0)} color="text-blue-500" />
        <KpiCard icon={Package} label="Produtos cadastrados" value={String(global.total_produtos ?? 0)} color="text-purple-500" />
        <KpiCard icon={ShoppingBag} label="Pedidos hoje" value={String(global.pedidos_hoje ?? 0)} color="text-amber-500" />
        <KpiCard
          icon={DollarSign}
          label="Receita hoje"
          value={`R$ ${Number(global.receita_hoje ?? 0).toFixed(2).replace(".", ",")}`}
          color="text-emerald-500"
        />
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar barbearia..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabela de tenants */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center border-border/50">
          <Store className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {search ? "Nenhuma barbearia encontrada." : "Nenhuma barbearia possui loja ativa."}
          </p>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Header da tabela */}
          <div className="hidden md:grid grid-cols-7 gap-2 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
            <div className="col-span-2">Barbearia</div>
            <div className="text-center">Produtos</div>
            <div className="text-center">Estoque baixo</div>
            <div className="text-center">Pedidos/mês</div>
            <div className="text-right">Receita/mês</div>
            <div className="text-right">Ações</div>
          </div>

          {/* Linhas */}
          {filtered.map((t: any) => (
            <TenantRow
              key={t.tenant_id}
              tenant={t}
              onView={() => {
                setDrillTenantId(t.tenant_id);
                setDrillTenantNome(t.tenant_nome || "Barbearia");
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── TenantRow (inline — simples o suficiente) ──────────────
function TenantRow({ tenant, onView }: { tenant: any; onView: () => void }) {
  const hasProducts = (tenant.total_produtos ?? 0) > 0;
  const lowStock = tenant.estoque_baixo ?? 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2 px-4 py-3 border-t border-border/50 items-center hover:bg-muted/30 transition-colors">
      {/* Nome + badge */}
      <div className="col-span-2 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
          {(tenant.tenant_nome || "?").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{tenant.tenant_nome}</p>
          {hasProducts ? (
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Ativa</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">Sem produtos</Badge>
          )}
        </div>
      </div>

      {/* Produtos */}
      <div className="text-center text-sm text-foreground">{tenant.total_produtos ?? 0}</div>

      {/* Estoque baixo */}
      <div className="text-center">
        {lowStock > 0 ? (
          <span className="inline-flex items-center gap-1 text-sm text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> {lowStock}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">0</span>
        )}
      </div>

      {/* Pedidos mês */}
      <div className="text-center text-sm text-foreground">{tenant.pedidos_mes ?? 0}</div>

      {/* Receita mês */}
      <div className="text-right text-sm font-medium text-foreground">
        R$ {Number(tenant.receita_mes ?? 0).toFixed(2).replace(".", ",")}
      </div>

      {/* Ações */}
      <div className="text-right">
        <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={onView}>
          <Eye className="h-3.5 w-3.5" /> Ver loja
        </Button>
      </div>
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card className="p-4 border-border/50">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </Card>
  );
}
