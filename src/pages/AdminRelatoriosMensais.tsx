import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Calendar, 
  DollarSign, 
  Users, 
  Download, 
  Sparkles, 
  ArrowLeft, 
  Search, 
  Trash2, 
  RefreshCw,
  ChevronRight,
  BarChart3,
  CreditCard,
  Wallet,
  Star,
  Clock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { AppHeader } from "@/components/ui/app-shell";

interface MonthlyReport {
  id: string;
  mes: number;
  ano: number;
  receita_total: number;
  receita_app: number;
  receita_barbearia: number;
  receita_credito: number;
  receita_plano: number;
  taxas_asaas: number;
  lucro_liquido: number;
  total_agendamentos: number;
  agendamentos_completados: number;
  agendamentos_cancelados: number;
  agendamentos_no_show: number;
  variacao_receita_percentual: number;
  variacao_agendamentos_percentual: number;
  resumo_ia: string | null;
  insights_ia: unknown;
  created_at: string;
}

const meses = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function AdminRelatoriosMensais() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedId = searchParams.get('id');
  
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("");
  const [selectedReport, setSelectedReport] = useState<MonthlyReport | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<MonthlyReport | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    if (selectedId && reports.length > 0) {
      const report = reports.find(r => r.id === selectedId);
      if (report) {
        setSelectedReport(report);
      }
    }
  }, [selectedId, reports]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('relatorios_mensais')
        .select('id, ano, mes, receita_total, receita_app, receita_barbearia, receita_credito, receita_plano, taxas_asaas, lucro_liquido, total_agendamentos, agendamentos_completados, agendamentos_cancelados, agendamentos_no_show, variacao_receita_percentual, variacao_agendamentos_percentual, resumo_ia, insights_ia, created_at')
        .order('ano', { ascending: false })
        .order('mes', { ascending: false })
        .limit(50);

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error('Erro ao carregar relatórios:', error);
      toast.error('Erro ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async () => {
    if (!reportToDelete) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('relatorios_mensais')
        .delete()
        .eq('id', reportToDelete.id);

      if (error) throw error;
      
      toast.success(`Relatório de ${meses[reportToDelete.mes - 1]}/${reportToDelete.ano} excluído`);
      setReports(prev => prev.filter(r => r.id !== reportToDelete.id));
      
      if (selectedReport?.id === reportToDelete.id) {
        setSelectedReport(null);
        navigate('/admin/relatorios-mensais', { replace: true });
      }
    } catch (error) {
      console.error('Erro ao excluir relatório:', error);
      toast.error('Erro ao excluir relatório');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setReportToDelete(null);
    }
  };

  const downloadReport = (report: MonthlyReport) => {
    const taxaSucesso = report.total_agendamentos > 0 
      ? ((report.agendamentos_completados / report.total_agendamentos) * 100).toFixed(1) 
      : 0;

    const content = `
═══════════════════════════════════════════════════════════════════════════════
                    RELATÓRIO MENSAL - ${meses[report.mes - 1].toUpperCase()} ${report.ano}
═══════════════════════════════════════════════════════════════════════════════

📊 RESUMO FINANCEIRO
───────────────────────────────────────────────────────────────────────────────
Receita Total:               R$ ${report.receita_total.toFixed(2)}
  ├─ App (PIX/Cartão):       R$ ${report.receita_app.toFixed(2)}
  ├─ Barbearia (Dinheiro):   R$ ${report.receita_barbearia.toFixed(2)}
  ├─ Créditos:               R$ ${report.receita_credito.toFixed(2)}
  └─ Planos/Assinaturas:     R$ ${report.receita_plano.toFixed(2)}

Taxas de Gateway (Asaas):    R$ ${report.taxas_asaas.toFixed(2)}
Lucro Líquido:               R$ ${report.lucro_liquido.toFixed(2)}

📅 AGENDAMENTOS DO MÊS
───────────────────────────────────────────────────────────────────────────────
Total de Agendamentos:       ${report.total_agendamentos}
Cortes Concluídos:           ${report.agendamentos_completados}
Cancelamentos:               ${report.agendamentos_cancelados}
No-shows (faltas):           ${report.agendamentos_no_show}
Taxa de Sucesso:             ${taxaSucesso}%

📈 COMPARATIVO COM MÊS ANTERIOR
───────────────────────────────────────────────────────────────────────────────
Variação Receita:            ${report.variacao_receita_percentual > 0 ? '+' : ''}${report.variacao_receita_percentual}%
Variação Agendamentos:       ${report.variacao_agendamentos_percentual > 0 ? '+' : ''}${report.variacao_agendamentos_percentual}%

${report.resumo_ia ? `
🤖 ANÁLISE INTELIGENTE
───────────────────────────────────────────────────────────────────────────────
${report.resumo_ia}
` : ''}

═══════════════════════════════════════════════════════════════════════════════
Relatório gerado em: ${format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
Sistema de Gestão - Barbearia
═══════════════════════════════════════════════════════════════════════════════
    `.trim();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${meses[report.mes - 1].toLowerCase()}_${report.ano}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Relatório baixado com sucesso!');
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (value < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getTrendColor = (value: number) => {
    if (value > 0) return 'text-green-500';
    if (value < 0) return 'text-red-500';
    return 'text-muted-foreground';
  };

  // Filtrar relatórios
  const filteredReports = reports.filter(report => {
    const searchMatch = searchTerm === "" || 
      meses[report.mes - 1].toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.ano.toString().includes(searchTerm);
    
    const yearMatch = yearFilter === "" || report.ano.toString() === yearFilter;
    
    return searchMatch && yearMatch;
  });

  // Anos únicos para filtro
  const uniqueYears = [...new Set(reports.map(r => r.ano))].sort((a, b) => b - a);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Carregando relatórios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Efeitos de luz premium */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-primary/15 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute -bottom-48 -left-48 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
      </div>

      <AppHeader title="Relatórios Mensais" onBack={() => navigate('/admin/financeiro')} />

      <div className="relative z-10 px-4 md:px-8 pt-4 pb-8 max-w-7xl mx-auto">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[13px] text-muted-foreground mb-6 flex items-center gap-2"
        >
          <FileText className="w-4 h-4 text-primary" />
          Histórico completo de todos os relatórios gerados
        </motion.p>


        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Lista de Relatórios */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-5"
          >
            <Card className="bg-card/50 backdrop-blur-xl border-border/50">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Todos os Relatórios</CardTitle>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                    {filteredReports.length} {filteredReports.length === 1 ? 'relatório' : 'relatórios'}
                  </Badge>
                </div>
                
                {/* Barra de busca e filtros */}
                <div className="flex gap-2 mt-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por mês ou ano..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 bg-background/50 border-border/50"
                    />
                  </div>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="px-3 py-2 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Todos os anos</option>
                    {uniqueYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-320px)]">
                  {filteredReports.length === 0 ? (
                    <div className="text-center py-12 px-4">
                      <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground">Nenhum relatório encontrado</p>
                      {searchTerm && (
                        <p className="text-sm text-muted-foreground/70 mt-2">
                          Tente buscar por outro termo
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30">
                      {filteredReports.map((report, index) => (
                        <motion.div
                          key={report.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          onClick={() => {
                            setSelectedReport(report);
                            navigate(`/admin/relatorios-mensais?id=${report.id}`, { replace: true });
                          }}
                          className={`p-4 cursor-pointer transition-all hover:bg-muted/30 group ${
                            selectedReport?.id === report.id ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                selectedReport?.id === report.id 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-primary/10'
                              }`}>
                                <Calendar className={`w-5 h-5 ${selectedReport?.id === report.id ? '' : 'text-primary'}`} />
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">
                                  {meses[report.mes - 1]} {report.ano}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {report.total_agendamentos} agendamentos • R$ {report.receita_total.toFixed(2)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right hidden sm:block">
                                <div className={`flex items-center gap-1 justify-end ${getTrendColor(report.variacao_receita_percentual)}`}>
                                  {getTrendIcon(report.variacao_receita_percentual)}
                                  <span className="text-sm font-medium">
                                    {report.variacao_receita_percentual > 0 ? '+' : ''}{report.variacao_receita_percentual}%
                                  </span>
                                </div>
                              </div>
                              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </motion.div>

          {/* Detalhes do Relatório */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-7"
          >
            <AnimatePresence mode="wait">
              {selectedReport ? (
                <motion.div
                  key={selectedReport.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="bg-card/50 backdrop-blur-xl border-border/50 overflow-hidden">
                    {/* Header do relatório */}
                    <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-6 border-b border-border/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-2xl font-bold text-foreground">
                            {meses[selectedReport.mes - 1]} {selectedReport.ano}
                          </h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            Gerado em {format(new Date(selectedReport.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadReport(selectedReport)}
                            className="gap-2"
                          >
                            <Download className="w-4 h-4" />
                            Baixar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setReportToDelete(selectedReport);
                              setDeleteDialogOpen(true);
                            }}
                            className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                            Excluir
                          </Button>
                        </div>
                      </div>
                    </div>

                    <ScrollArea className="h-[calc(100vh-400px)]">
                      <div className="p-6 space-y-6">
                        {/* Cards de métricas principais */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 text-green-500 mb-2">
                                <DollarSign className="w-4 h-4" />
                                <span className="text-xs font-medium uppercase">Receita Total</span>
                              </div>
                              <p className="text-2xl font-bold text-green-500">
                                R$ {selectedReport.receita_total.toFixed(2)}
                              </p>
                              <div className={`flex items-center gap-1 mt-1 ${getTrendColor(selectedReport.variacao_receita_percentual)}`}>
                                {getTrendIcon(selectedReport.variacao_receita_percentual)}
                                <span className="text-xs">
                                  {selectedReport.variacao_receita_percentual > 0 ? '+' : ''}{selectedReport.variacao_receita_percentual}%
                                </span>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 text-blue-500 mb-2">
                                <Users className="w-4 h-4" />
                                <span className="text-xs font-medium uppercase">Agendamentos</span>
                              </div>
                              <p className="text-2xl font-bold text-blue-500">
                                {selectedReport.total_agendamentos}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {selectedReport.agendamentos_completados} concluídos
                              </p>
                            </CardContent>
                          </Card>

                          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 text-purple-500 mb-2">
                                <BarChart3 className="w-4 h-4" />
                                <span className="text-xs font-medium uppercase">Lucro Líquido</span>
                              </div>
                              <p className="text-2xl font-bold text-purple-500">
                                R$ {selectedReport.lucro_liquido.toFixed(2)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                -R$ {selectedReport.taxas_asaas.toFixed(2)} taxas
                              </p>
                            </CardContent>
                          </Card>

                          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 text-amber-500 mb-2">
                                <Star className="w-4 h-4" />
                                <span className="text-xs font-medium uppercase">Taxa Sucesso</span>
                              </div>
                              <p className="text-2xl font-bold text-amber-500">
                                {selectedReport.total_agendamentos > 0 
                                  ? ((selectedReport.agendamentos_completados / selectedReport.total_agendamentos) * 100).toFixed(1) 
                                  : 0}%
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {selectedReport.agendamentos_cancelados} cancelados
                              </p>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Origem da Receita */}
                        <Card className="bg-background/30 border-border/30">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Wallet className="w-4 h-4 text-primary" />
                              Origem da Receita
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center justify-between py-2 border-b border-border/20">
                              <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-green-500" />
                                <span className="text-sm text-muted-foreground">App (PIX/Cartão)</span>
                              </div>
                              <span className="font-semibold text-green-500">R$ {selectedReport.receita_app.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-border/20">
                              <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-amber-500" />
                                <span className="text-sm text-muted-foreground">Barbearia (Dinheiro)</span>
                              </div>
                              <span className="font-semibold text-amber-500">R$ {selectedReport.receita_barbearia.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-border/20">
                              <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-purple-500" />
                                <span className="text-sm text-muted-foreground">Créditos</span>
                              </div>
                              <span className="font-semibold text-purple-500">R$ {selectedReport.receita_credito.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                              <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-cyan-500" />
                                <span className="text-sm text-muted-foreground">Planos/Assinaturas</span>
                              </div>
                              <span className="font-semibold text-cyan-500">R$ {selectedReport.receita_plano.toFixed(2)}</span>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Estatísticas de Agendamentos */}
                        <Card className="bg-background/30 border-border/30">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Clock className="w-4 h-4 text-primary" />
                              Estatísticas de Agendamentos
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="text-center p-3 rounded-lg bg-muted/20">
                                <p className="text-2xl font-bold text-foreground">{selectedReport.total_agendamentos}</p>
                                <p className="text-xs text-muted-foreground">Total</p>
                              </div>
                              <div className="text-center p-3 rounded-lg bg-green-500/10">
                                <p className="text-2xl font-bold text-green-500">{selectedReport.agendamentos_completados}</p>
                                <p className="text-xs text-muted-foreground">Concluídos</p>
                              </div>
                              <div className="text-center p-3 rounded-lg bg-red-500/10">
                                <p className="text-2xl font-bold text-red-500">{selectedReport.agendamentos_cancelados}</p>
                                <p className="text-xs text-muted-foreground">Cancelados</p>
                              </div>
                              <div className="text-center p-3 rounded-lg bg-amber-500/10">
                                <p className="text-2xl font-bold text-amber-500">{selectedReport.agendamentos_no_show}</p>
                                <p className="text-xs text-muted-foreground">No-shows</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Análise IA */}
                        {selectedReport.resumo_ia && (
                          <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" />
                                Análise Inteligente
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                {selectedReport.resumo_ia}
                              </p>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </ScrollArea>
                  </Card>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex items-center justify-center"
                >
                  <Card className="bg-card/30 backdrop-blur-xl border-border/30 p-12 text-center">
                    <FileText className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-medium text-muted-foreground">
                      Selecione um relatório
                    </h3>
                    <p className="text-sm text-muted-foreground/70 mt-2">
                      Clique em um relatório da lista para ver os detalhes
                    </p>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Relatório?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir o relatório de{' '}
              <strong>{reportToDelete ? `${meses[reportToDelete.mes - 1]}/${reportToDelete.ano}` : ''}</strong>.
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteReport}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}