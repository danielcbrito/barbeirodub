/**
 * AdminIndicacoes — Painel administrativo do Programa de Indicação.
 * Somente admin, tenant_admin e ti têm acesso.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Gift,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Search,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Plus,
  CalendarDays,
  ChevronLeft,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useIndicacoesResumo,
  useIndicacoesLista,
  useCreditoDaIndicacao,
  useInvalidarIndicacao,
  useFraudesIndicacao,
  useCicloAtivo,
  useRankingCicloAtivo,
  useCriarCiclo,
  type IndicacaoRow,
  type IndicacaoStatus,
  type PeriodoFiltro,
  type CicloIndicacao,
} from "@/hooks/useAdminIndicacoes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_LABEL: Record<IndicacaoStatus, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  confirmado: "Confirmado",
  liberado: "Liberado",
  invalidado: "Invalidado",
};

const STATUS_BADGE: Record<IndicacaoStatus, string> = {
  pendente: "bg-muted text-muted-foreground",
  agendado: "bg-blue-500/10 text-blue-600",
  confirmado: "bg-amber-500/10 text-amber-600",
  liberado: "bg-emerald-500/10 text-emerald-600",
  invalidado: "bg-red-500/10 text-red-600",
};

function fmt(d?: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return "—";
  }
}

/* ═══════════════════════════ */

export default function AdminIndicacoes() {
  const { isDubAdmin, isTenantAdmin, isTI, isLoading } = usePermissions();
  const canAccess = isDubAdmin || isTenantAdmin || isTI;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!canAccess) {
    return (
      <div className="p-8 max-w-md mx-auto">
        <Card className="p-6 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-red-500" />
          <h2 className="text-lg font-semibold mb-1">Acesso negado</h2>
          <p className="text-sm text-muted-foreground">
            Apenas administradores da barbearia podem acessar o painel de indicações.
          </p>
        </Card>
      </div>
    );
  }
  return <IndicacoesContent />;
}

function IndicacoesContent() {
  const [periodo, setPeriodo] = useState<PeriodoFiltro>("30d");
  const [tab, setTab] = useState<"ciclos" | "geral" | "fraudes">("ciclos");
  const resumo = useIndicacoesResumo(periodo);
  const navigate = useNavigate();

  const alertaAbuso =
    (resumo.data?.total ?? 0) >= 10 && (resumo.data?.taxaInvalidacao ?? 0) > 0.2;

  return (
    <div className="p-4 md:p-8 space-y-5 max-w-7xl mx-auto">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="shrink-0 -ml-1 h-10 w-10 inline-flex items-center justify-center rounded-full text-foreground/85 active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <h1 className="text-lg md:text-2xl font-semibold truncate">
          Programa de Indicação
        </h1>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="h-auto p-1 gap-1 w-full grid grid-cols-3">
          <TabsTrigger value="ciclos" className="text-xs md:text-sm px-2 py-1.5">Ciclos</TabsTrigger>
          <TabsTrigger value="geral" className="text-xs md:text-sm px-2 py-1.5">Indicações</TabsTrigger>
          <TabsTrigger value="fraudes" className="text-xs md:text-sm px-2 py-1.5">Possíveis fraudes</TabsTrigger>
        </TabsList>

        <TabsContent value="ciclos" className="mt-4">
          <CiclosTab />
        </TabsContent>

        <TabsContent value="geral" className="mt-4 space-y-5">
          <div className="flex items-center justify-end">
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoFiltro)}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="all">Todos os períodos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ResumoCard
              icon={<Gift className="w-4 h-4" />}
              label="Total"
              value={resumo.data?.total}
              loading={resumo.isLoading}
            />
            <ResumoCard
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="Cortes liberados"
              value={resumo.data?.liberados}
              loading={resumo.isLoading}
              tone="emerald"
            />
            <ResumoCard
              icon={<Clock className="w-4 h-4" />}
              label="Em andamento"
              value={resumo.data?.pendentes}
              loading={resumo.isLoading}
              tone="blue"
            />
            <ResumoCard
              icon={<ShieldAlert className="w-4 h-4" />}
              label="Invalidadas"
              value={resumo.data?.invalidados}
              loading={resumo.isLoading}
              tone={alertaAbuso ? "red" : "amber"}
              badge={
                alertaAbuso
                  ? `${((resumo.data?.taxaInvalidacao ?? 0) * 100).toFixed(0)}% do total`
                  : undefined
              }
            />
          </div>

          {alertaAbuso && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">
                Taxa de invalidação acima de 20%. Verifique a aba{" "}
                <button className="underline" onClick={() => setTab("fraudes")}>
                  Possíveis fraudes
                </button>{" "}
                para identificar padrões suspeitos.
              </p>
            </div>
          )}

          <ListaIndicacoes periodo={periodo} />
        </TabsContent>

        <TabsContent value="fraudes" className="mt-4">
          <PossiveisFraudes />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ────────── Ciclos ────────── */
function CiclosTab() {
  const cicloAtivo = useCicloAtivo();
  const ranking = useRankingCicloAtivo(cicloAtivo.data);
  const criar = useCriarCiclo();

  // Etapa 0: fechado. Etapa 1: escolher tipo. Etapa 2: preencher.
  const [etapa, setEtapa] = useState<0 | 1 | 2>(0);
  const [tipo, setTipo] = useState<"unico" | "fixo">("unico");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [diaInicio, setDiaInicio] = useState<string>("");
  const [diaFim, setDiaFim] = useState<string>("");

  const ciclo = cicloAtivo.data;
  const diasRestantes = useMemo(() => {
    if (!ciclo) return 0;
    const fim = new Date(ciclo.data_fim);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diff = Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [ciclo]);

  const resetForm = () => {
    setEtapa(0);
    setTipo("unico");
    setDataInicio("");
    setDataFim("");
    setDiaInicio("");
    setDiaFim("");
  };

  const handleCriar = async () => {
    try {
      if (tipo === "unico") {
        if (!dataInicio || !dataFim) {
          toast.error("Preencha as duas datas");
          return;
        }
        if (new Date(dataFim) <= new Date(dataInicio)) {
          toast.error("A data final deve ser posterior à data de início");
          return;
        }
        await criar.mutateAsync({ tipo: "unico", data_inicio: dataInicio, data_fim: dataFim });
      } else {
        const di = parseInt(diaInicio, 10);
        const df = parseInt(diaFim, 10);
        if (!di || !df || di < 1 || di > 31 || df < 1 || df > 31) {
          toast.error("Informe dias válidos (1 a 31)");
          return;
        }
        if (df <= di) {
          toast.error("O dia de fim deve ser posterior ao dia de início");
          return;
        }
        await criar.mutateAsync({ tipo: "fixo", dia_inicio_mes: di, dia_fim_mes: df });
      }
      resetForm();
    } catch {
      /* toast já disparado */
    }
  };

  return (
    <div className="space-y-6">
      {/* Ciclo ativo */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Ciclo ativo</h2>
            {ciclo?.tipo === "fixo" && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Fixo mensal · dia {ciclo.dia_inicio_mes} → {ciclo.dia_fim_mes} · renovação automática
              </p>
            )}
          </div>
          {!cicloAtivo.isLoading && !ciclo && (
            <Button size="sm" onClick={() => setEtapa(1)}>
              <Plus className="w-4 h-4 mr-1" /> Criar ciclo
            </Button>
          )}
        </div>

        {cicloAtivo.isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !ciclo ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum ciclo em andamento. Crie um novo para começar.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
              <InfoBloco
                icon={<CalendarDays className="w-4 h-4" />}
                label="Início"
                value={format(new Date(ciclo.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
              />
              <InfoBloco
                icon={<CalendarDays className="w-4 h-4" />}
                label="Fim"
                value={format(new Date(ciclo.data_fim), "dd/MM/yyyy", { locale: ptBR })}
              />
              <InfoBloco
                icon={<Clock className="w-4 h-4" />}
                label="Dias restantes"
                value={`${diasRestantes}`}
                tone={diasRestantes <= 3 ? "amber" : "default"}
              />
            </div>

            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Ranking em tempo real</h3>
              <Badge variant="outline" className="text-[10px]">Parcial · apuração automática no fim</Badge>
            </div>

            {ranking.isLoading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (ranking.data ?? []).length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Nenhuma indicação liberada ainda neste ciclo.
              </div>
            ) : (
              <div className="divide-y divide-border/50 rounded-lg border">
                {(ranking.data ?? []).map((r, i) => (
                  <div
                    key={r.indicador_id}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                          i === 0 && "bg-amber-500/15 text-amber-600",
                          i === 1 && "bg-zinc-400/15 text-zinc-500",
                          i === 2 && "bg-orange-500/15 text-orange-600",
                          i > 2 && "bg-muted text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </div>
                      <span className="text-sm truncate">
                        {r.indicador_nome ?? "Cliente sem nome"}
                      </span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {r.qtd} {r.qtd === 1 ? "indicação" : "indicações"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {/* Etapa 1 — escolher tipo */}
      <AlertDialog open={etapa === 1} onOpenChange={(o) => !o && resetForm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Qual tipo de ciclo?</AlertDialogTitle>
            <AlertDialogDescription>
              Escolha como este ciclo deve funcionar. Você pode ter apenas um ciclo ativo por vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => { setTipo("fixo"); setEtapa(2); }}
              className="text-left rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Ciclo fixo (mensal)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Define dia de início e dia de fim do mês. A apuração e o corte grátis para quem tiver mais indicações no período são automáticos todo mês.
              </p>
            </button>
            <button
              type="button"
              onClick={() => { setTipo("unico"); setEtapa(2); }}
              className="text-left rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Ciclo único</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Define uma data específica de início e fim. Após o fim, o ciclo é apurado e encerrado (sem renovação).
              </p>
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Etapa 2 — preencher */}
      <AlertDialog open={etapa === 2} onOpenChange={(o) => !o && resetForm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tipo === "fixo" ? "Novo ciclo fixo (mensal)" : "Novo ciclo único"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tipo === "fixo"
                ? "O ciclo será renovado automaticamente a cada mês. A apuração acontece no fim do período e o corte grátis vai para quem tiver mais indicações liberadas."
                : "Só é permitido um ciclo ativo por vez. A apuração do vencedor é automática ao final do período."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {tipo === "fixo" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Dia de início do mês</label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    placeholder="Ex: 1"
                    value={diaInicio}
                    onChange={(e) => setDiaInicio(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Dia de fim do mês</label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    placeholder="Ex: 30"
                    value={diaFim}
                    onChange={(e) => setDiaFim(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Se o mês não tiver o dia informado (ex: 31 em fevereiro), o sistema usa automaticamente o último dia do mês.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Data de início</label>
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Data de fim</label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={criar.isPending} onClick={() => setEtapa(1)}>
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCriar();
              }}
              disabled={criar.isPending}
            >
              {criar.isPending ? "Criando..." : "Criar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoBloco({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "amber";
}) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn("text-base font-semibold", tone === "amber" && "text-amber-600")}>
        {value}
      </div>
    </div>
  );
}

/* ────────── Resumo ────────── */
function ResumoCard({
  icon,
  label,
  value,
  loading,
  tone = "default",
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  loading?: boolean;
  tone?: "default" | "emerald" | "blue" | "amber" | "red";
  badge?: string;
}) {
  const toneCls = {
    default: "text-foreground",
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
    red: "text-red-600",
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn("text-2xl font-bold tabular-nums", toneCls)}>
        {loading ? "…" : (value ?? 0).toLocaleString("pt-BR")}
      </div>
      {badge && (
        <Badge variant="outline" className="mt-2 text-red-600 border-red-500/40">
          {badge}
        </Badge>
      )}
    </Card>
  );
}

/* ────────── Lista ────────── */
function ListaIndicacoes({ periodo }: { periodo: PeriodoFiltro }) {
  const [status, setStatus] = useState<IndicacaoStatus | "all">("all");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const { data, isLoading } = useIndicacoesLista({ periodo, status, busca, page, pageSize });
  const [selecionada, setSelecionada] = useState<IndicacaoRow | null>(null);

  const totalPaginas = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <Card className="p-4">
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome do indicador ou indicado…"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as IndicacaoStatus | "all");
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="agendado">Agendado</SelectItem>
            <SelectItem value="confirmado">Confirmado</SelectItem>
            <SelectItem value="liberado">Liberado</SelectItem>
            <SelectItem value="invalidado">Invalidado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {isLoading && (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin inline" />
          </div>
        )}
        {!isLoading && (data?.rows.length ?? 0) === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma indicação encontrada.
          </div>
        )}
        {data?.rows.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelecionada(r)}
            className="w-full text-left rounded-lg border border-border/60 bg-card hover:bg-muted/40 transition-colors p-3"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">Indicador</div>
                <div className="text-sm font-medium truncate">{r.indicador_nome ?? "—"}</div>
              </div>
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium shrink-0",
                  STATUS_BADGE[r.status],
                )}
              >
                {STATUS_LABEL[r.status]}
              </span>
            </div>
            <div className="mb-2">
              <div className="text-xs text-muted-foreground">Indicado</div>
              <div className="text-sm truncate">{r.indicado_nome ?? "—"}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground pt-2 border-t border-border/50">
              <div>
                <div className="opacity-70">Criado</div>
                <div className="text-foreground/80">{fmt(r.criado_em)}</div>
              </div>
              <div>
                <div className="opacity-70">Confirm.</div>
                <div className="text-foreground/80">{fmt(r.confirmado_em)}</div>
              </div>
              <div>
                <div className="opacity-70">Liberado</div>
                <div className="text-foreground/80">{fmt(r.liberado_em)}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="py-2 pr-3 font-medium">Indicador</th>
              <th className="py-2 pr-3 font-medium">Indicado</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Criado</th>
              <th className="py-2 pr-3 font-medium">Confirmado</th>
              <th className="py-2 pr-3 font-medium">Liberado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td>
              </tr>
            )}
            {!isLoading && (data?.rows.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhuma indicação encontrada.
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelecionada(r)}
                className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <td className="py-2.5 pr-3 font-medium">{r.indicador_nome ?? "—"}</td>
                <td className="py-2.5 pr-3">{r.indicado_nome ?? "—"}</td>
                <td className="py-2.5 pr-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                      STATUS_BADGE[r.status],
                    )}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">{fmt(r.criado_em)}</td>
                <td className="py-2.5 pr-3 text-muted-foreground">{fmt(r.confirmado_em)}</td>
                <td className="py-2.5 pr-3 text-muted-foreground">{fmt(r.liberado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted-foreground">
            Página {page + 1} de {totalPaginas} · {data?.total ?? 0} registro(s)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPaginas}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <IndicacaoDetalhe
        indicacao={selecionada}
        onClose={() => setSelecionada(null)}
      />
    </Card>
  );
}

/* ────────── Detalhe ────────── */
function IndicacaoDetalhe({
  indicacao,
  onClose,
}: {
  indicacao: IndicacaoRow | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data: credito } = useCreditoDaIndicacao(indicacao?.id ?? null);
  const invalidar = useInvalidarIndicacao();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  const podeInvalidar = useMemo(() => {
    if (!indicacao) return { ok: false, reason: "" };
    if (indicacao.status === "invalidado")
      return { ok: false, reason: "Esta indicação já foi invalidada." };
    if (credito?.status === "usado")
      return {
        ok: false,
        reason: "O crédito desta indicação já foi consumido em um agendamento.",
      };
    return { ok: true, reason: "" };
  }, [indicacao, credito]);

  const open = !!indicacao;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes da indicação</SheetTitle>
        </SheetHeader>
        {indicacao && (
          <div className="mt-6 space-y-5 text-sm">
            <Section label="Indicador" value={indicacao.indicador_nome ?? "—"} />
            <Section label="Indicado" value={indicacao.indicado_nome ?? "—"} />
            <Section
              label="Status"
              value={
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                    STATUS_BADGE[indicacao.status],
                  )}
                >
                  {STATUS_LABEL[indicacao.status]}
                </span>
              }
            />
            {indicacao.codigo_usado && (
              <Section label="Código usado" value={indicacao.codigo_usado} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Section label="Criado em" value={fmt(indicacao.criado_em)} />
              <Section label="Agendado em" value={fmt(indicacao.agendado_em)} />
              <Section label="Confirmado em" value={fmt(indicacao.confirmado_em)} />
              <Section label="Liberado em" value={fmt(indicacao.liberado_em)} />
            </div>

            {indicacao.agendamento_qualificador_id && (
              <Section
                label="Agendamento qualificador"
                value={
                  <button
                    onClick={() => navigate(`/admin/agenda?ag=${indicacao.agendamento_qualificador_id}`)}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Ver agendamento <ExternalLink className="w-3 h-3" />
                  </button>
                }
              />
            )}

            {indicacao.motivo_invalidacao && (
              <Section label="Motivo da invalidação" value={indicacao.motivo_invalidacao} />
            )}

            <div className="border-t pt-4">
              <h3 className="font-medium mb-2">Crédito gerado</h3>
              {credito ? (
                <div className="rounded-lg border p-3 space-y-1 bg-muted/30">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline">{credito.status}</Badge>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Criado em</span>
                    <span>{fmt(credito.criado_em)}</span>
                  </div>
                  {credito.usado_em && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Usado em</span>
                      <span>{fmt(credito.usado_em)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nenhum crédito gerado para esta indicação ainda.
                </p>
              )}
            </div>

            <div className="border-t pt-4">
              <Button
                variant="destructive"
                className="w-full"
                disabled={!podeInvalidar.ok || invalidar.isPending}
                onClick={() => {
                  setMotivo("");
                  setConfirmOpen(true);
                }}
              >
                Invalidar indicação manualmente
              </Button>
              {!podeInvalidar.ok && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {podeInvalidar.reason}
                </p>
              )}
            </div>
          </div>
        )}
      </SheetContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar invalidação</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação marca a indicação como inválida e expira o crédito associado, se
              houver. Descreva o motivo — ficará registrado na indicação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo da invalidação (mín. 3 caracteres)"
            rows={4}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={motivo.trim().length < 3 || invalidar.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (!indicacao) return;
                try {
                  await invalidar.mutateAsync({ id: indicacao.id, motivo: motivo.trim() });
                  setConfirmOpen(false);
                  onClose();
                } catch {
                  /* toast handled */
                }
              }}
            >
              {invalidar.isPending ? "Invalidando…" : "Invalidar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function Section({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

/* ────────── Possíveis fraudes ────────── */
function PossiveisFraudes() {
  const { data, isLoading } = useFraudesIndicacao();

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="w-6 h-6 animate-spin inline text-muted-foreground" />
      </div>
    );
  }

  const nada =
    !data ||
    (data.altaTaxa.length === 0 &&
      data.sameDay.length === 0 &&
      data.sequenciais.length === 0);

  if (nada) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Nenhum padrão suspeito identificado no momento. ✅
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="font-semibold mb-1">Alta taxa de invalidação</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Clientes com mais de 50% das indicações invalidadas (mínimo 3 indicações).
        </p>
        {data!.altaTaxa.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem ocorrências.</p>
        ) : (
          <ul className="divide-y">
            {data!.altaTaxa.map((it) => (
              <li key={it.indicador_id} className="py-2 flex justify-between text-sm">
                <span>{it.indicador_nome ?? it.indicador_id.slice(0, 8)}</span>
                <span className="text-red-600 font-medium tabular-nums">
                  {it.invalidadas}/{it.total} ({(it.taxa * 100).toFixed(0)}%)
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-1">Múltiplas invalidações no mesmo dia</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Indicações no mesmo dia pelo mesmo indicador, todas invalidadas por identidade
          duplicada.
        </p>
        {data!.sameDay.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem ocorrências.</p>
        ) : (
          <ul className="divide-y">
            {data!.sameDay.map((it, i) => (
              <li key={i} className="py-2 flex justify-between text-sm">
                <span>
                  {it.indicador_nome ?? it.indicador_id.slice(0, 8)}
                  <span className="text-muted-foreground ml-2">{it.dia}</span>
                </span>
                <span className="text-amber-600 font-medium tabular-nums">
                  {it.qtd} tentativas
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-1">Cadastros em sequência</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Contas de indicados criadas no mesmo minuto pelo mesmo indicador — possível
          criação organizada de múltiplas contas.
        </p>
        {data!.sequenciais.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem ocorrências.</p>
        ) : (
          <ul className="divide-y">
            {data!.sequenciais.map((it, i) => (
              <li key={i} className="py-2 text-sm">
                <div className="flex justify-between">
                  <span>{it.indicador_nome ?? it.indicador_id.slice(0, 8)}</span>
                  <span className="text-amber-600 font-medium">
                    {it.indicado_ids.length} contas no mesmo minuto
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {it.minuto.replace("T", " ")} · {it.indicados_nomes.join(", ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
