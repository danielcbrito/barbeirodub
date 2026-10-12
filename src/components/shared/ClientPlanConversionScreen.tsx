import { useEffect, useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Check, ChevronLeft, Loader2, User, Scissors, Plus, Clock, X, Wallet, Sparkles } from "lucide-react";
import { sendNovoAgendamentoEvent } from "@/lib/webhookService";
import { toast } from "sonner";
import useEmblaCarousel from "embla-carousel-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ClientSummary {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
}

interface PlanoOption {
  id: string;
  nome: string;
  preco_mensal: number;
  limite_agendamentos_mes: number | null;
  servico_id: string | null;
  descricao?: string | null;
  beneficios_json?: any;
}

interface BarbeiroOption {
  id: string;
  apelido: string;
  foto_url?: string | null;
}

interface ServicoOption {
  id: string;
  nome: string;
  preco: number;
  duracao_minutos: number;
}

interface AgendamentoHoje {
  id: string;
  data: string;
  hora: string;
  servico_id: string;
  servico_nome: string;
  barbeiro_id: string | null;
  barbeiro_nome: string | null;
  preco: number;
}

type CorteIncluso =
  | { tipo: "agendamento"; agendamentoId: string; servicoNome: string; hora: string; barbeiroNome?: string | null }
  | { tipo: "servico"; servicoId: string; servicoNome: string; preco: number };


interface ClientPlanConversionScreenProps {
  client: ClientSummary;
  tenantId: string | null;
  currentUserId?: string | null;
  lockedBarbeiroId?: string | null;
  unitId?: string | null;
  initialServiceId?: string | null;
  initialAppointmentId?: string | null;
  onBack: () => void;
  onConverted?: () => void;
}

/** Tela cheia para transformar um cliente existente em assinante de plano. */
export function ClientPlanConversionScreen({
  client,
  tenantId,
  currentUserId,
  lockedBarbeiroId = null,
  unitId = null,
  initialServiceId = null,
  initialAppointmentId = null,
  onBack,
  onConverted,
}: ClientPlanConversionScreenProps) {
  const [planos, setPlanos] = useState<PlanoOption[]>([]);
  const [barbeiros, setBarbeiros] = useState<BarbeiroOption[]>([]);
  const [planoId, setPlanoId] = useState("");
  const [barbeiroId, setBarbeiroId] = useState(lockedBarbeiroId || "");
  const [dataPagamento, setDataPagamento] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [corteIncluso, setCorteIncluso] = useState<CorteIncluso | null>(null);
  const [corteModalOpen, setCorteModalOpen] = useState(false);
  const [isInitialAutoLoad, setIsInitialAutoLoad] = useState(true);
  const [agendamentosHoje, setAgendamentosHoje] = useState<AgendamentoHoje[]>([]);
  const [servicos, setServicos] = useState<ServicoOption[]>([]);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [barberPickerOpen, setBarberPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [planAddedToast, setPlanAddedToast] = useState<{ titulo: string; subtitulo: string } | null>(null);

  // Buscar dados do barbeiro locked para exibição
  const [lockedBarbeiroNome, setLockedBarbeiroNome] = useState<string>("Barbeiro atual");
  const [lockedBarbeiroFoto, setLockedBarbeiroFoto] = useState<string | null>(null);

  useEffect(() => {
    if (lockedBarbeiroId && tenantId) {
      supabase
        .from("barbeiros")
        .select("apelido, foto_url")
        .eq("id", lockedBarbeiroId)
        .single()
        .then(({ data }) => {
          if (data?.apelido) setLockedBarbeiroNome(data.apelido);
          if (data?.foto_url) setLockedBarbeiroFoto(data.foto_url);
        });
    }
  }, [lockedBarbeiroId, tenantId]);

  useEffect(() => {
    // Log detalhado para rastrear porque o agendamento de hoje não aparece
    console.log("[DEBUG] ClientPlanConversionScreen - Parâmetros:", {
      tenantId,
      clientId: client.id,
      clientNome: client.nome,
      lockedBarbeiroId,
      unitId,
      timestamp: new Date().toLocaleTimeString()
    });
    let cancelled = false;

    const loadOptions = async () => {
      setLoading(true);
      try {
        let planosQuery = supabase
          .from("planos")
          .select("id, nome, preco_mensal, limite_agendamentos_mes, servico_id, descricao, beneficios_json")
          .eq("ativo", true)
          .order("preco_mensal", { ascending: true });

        planosQuery = tenantId ? planosQuery.eq("tenant_id", tenantId) : planosQuery.is("tenant_id", null);

        const { data: planosData, error: planosError } = await planosQuery;
        if (planosError) throw planosError;

        let barbeirosData: BarbeiroOption[] = [];
        if (!lockedBarbeiroId && tenantId) {
          let allowedBarberIds: string[] | null = null;

          if (unitId) {
            const { data: unitLinks } = await supabase
              .from("barbeiro_unidades")
              .select("barbeiro_id")
              .eq("unidade_id", unitId);
            allowedBarberIds = [...new Set((unitLinks || []).map((link) => link.barbeiro_id).filter(Boolean))];
          }

          let barbeirosQuery = supabase
            .from("barbeiros")
            .select("id, apelido, foto_url")
            .eq("tenant_id", tenantId)
            .eq("ativo", true)
            .is("deleted_at", null)
            .order("apelido");

          if (unitId) {
            if (allowedBarberIds && allowedBarberIds.length > 0) {
              barbeirosQuery = barbeirosQuery.or(`unidade_id.eq.${unitId},id.in.(${allowedBarberIds.join(",")})`);
            } else {
              barbeirosQuery = barbeirosQuery.eq("unidade_id", unitId);
            }
          }

          const { data, error } = await barbeirosQuery;
          if (error) throw error;
          barbeirosData = (data || []) as BarbeiroOption[];
        }

        // Agendamentos de hoje do cliente (para opção "incluir corte de hoje")
        const hojeISO = format(new Date(), "yyyy-MM-dd");
        let agendamentosHojeData: AgendamentoHoje[] = [];
        if (tenantId) {
          console.log("[DEBUG] Buscando agendamentos para o dia:", hojeISO);
          let query = supabase
            .from("agendamentos")
            .select("id, data, hora, servico_id, barbeiro_id, preco, status, servicos(nome), barbeiros(apelido)")
            .eq("user_id", client.id);

          if (initialAppointmentId) {
            // Se temos um ID inicial, buscamos ele OU os de hoje
            query = query.or(`id.eq.${initialAppointmentId},data.eq.${hojeISO}`);
          } else {
            query = query.eq("data", hojeISO);
          }

          const { data: agData, error: agError } = await query
            .in("status", ["confirmed", "completed", "pending"] as any)
            .order("hora", { ascending: true });
          
          if (agError) {
            console.error("[DEBUG] Erro na query de agendamentos:", agError);
          }
          console.log("[DEBUG] Agendamentos encontrados no banco:", agData?.length || 0, agData);
          agendamentosHojeData = (agData || []).map((a: any) => ({
            id: a.id,
            data: a.data,
            hora: a.hora,
            servico_id: a.servico_id,
            servico_nome: a.servicos?.nome || "Serviço",
            barbeiro_id: a.barbeiro_id,
            barbeiro_nome: a.barbeiros?.apelido || null,
            preco: Number(a.preco || 0),
          }));
        }

        // Lista de serviços (para o cenário walk-in sem agendamento)
        let servicosData: ServicoOption[] = [];
        if (tenantId) {
          const { data: sData } = await supabase
            .from("servicos")
            .select("id, nome, preco, duracao_minutos")
            .eq("tenant_id", tenantId)
            .eq("ativo", true)
            .order("nome");
          servicosData = (sData || []) as ServicoOption[];
        }

        if (!cancelled) {
          setPlanos((planosData || []) as PlanoOption[]);
          setBarbeiros(barbeirosData);
          setAgendamentosHoje(agendamentosHojeData);
          setServicos(servicosData);

          if (planosData && planosData.length > 0 && isInitialAutoLoad) {
            // Se houver serviceId inicial, priorizar
            let preSelectedPlano = null;
            if (initialServiceId) {
              preSelectedPlano = planosData.find(p => p.servico_id === initialServiceId);
            }

            // Se houver appointmentId inicial, priorizar a seleção do corte incluso
            let preSelectedCorte = null;
            if (initialAppointmentId && agendamentosHojeData.length > 0) {
              const targetAg = agendamentosHojeData.find(a => a.id === initialAppointmentId);
              if (targetAg) {
                preSelectedCorte = {
                  tipo: "agendamento" as const,
                  agendamentoId: targetAg.id,
                  servicoNome: targetAg.servico_nome,
                  hora: targetAg.hora,
                  barbeiroNome: targetAg.barbeiro_nome,
                };
                
                // Se não encontramos plano pelo serviceId inicial, tentamos pelo serviço deste agendamento
                if (!preSelectedPlano) {
                  preSelectedPlano = planosData.find(p => p.servico_id === targetAg.servico_id);
                }
              }
            }

            // Se ainda não temos plano, tentamos o primeiro agendamento de hoje
            if (!preSelectedPlano && agendamentosHojeData.length > 0) {
              const firstAg = agendamentosHojeData[0];
              preSelectedPlano = planosData.find(p => p.servico_id === firstAg.servico_id);
              if (preSelectedPlano && !preSelectedCorte) {
                preSelectedCorte = {
                  tipo: "agendamento" as const,
                  agendamentoId: firstAg.id,
                  servicoNome: firstAg.servico_nome,
                  hora: firstAg.hora,
                  barbeiroNome: firstAg.barbeiro_nome,
                };
              }
            }

            // Aplicar seleções
            if (preSelectedPlano) {
              setPlanoId(preSelectedPlano.id);
            } else {
              setPlanoId(planosData[0].id);
            }

            if (preSelectedCorte) {
              setCorteIncluso(preSelectedCorte);
            }

            setIsInitialAutoLoad(false);
          }
        }
      } catch (error) {
        console.error("[ClientPlanConversionScreen] erro ao carregar opções:", error);
        toast.error("Erro ao carregar planos e barbeiros");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadOptions();
    return () => { cancelled = true; };
  }, [tenantId, lockedBarbeiroId, unitId]);

  useEffect(() => {
    setBarbeiroId(lockedBarbeiroId || "");
  }, [lockedBarbeiroId]);

  const planoSelecionado = useMemo(
    () => planos.find((plano) => plano.id === planoId),
    [planos, planoId]
  );

  const proximaCobranca = useMemo(() => {
    if (!dataPagamento) return null;
    return format(addMonths(new Date(`${dataPagamento}T12:00:00`), 1), "yyyy-MM-dd");
  }, [dataPagamento]);

  const handleSubmit = async () => {
    if (!planoId) return toast.error("Selecione o plano do cliente");
    if (!barbeiroId) return toast.error("Selecione o barbeiro vinculado ao plano");
    if (!dataPagamento || !proximaCobranca) return toast.error("Informe o dia em que o cliente pagou");

    setSubmitting(true);
    try {
      const actingUserId = currentUserId || (await supabase.auth.getUser()).data.user?.id;
      if (!actingUserId) {
        toast.error("Usuário autenticado não encontrado");
        return;
      }
      
      const hojeISO = format(new Date(), "yyyy-MM-dd");
      const agoraHora = format(new Date(), "HH:mm:ss");

      const { data: existing, error: existingError } = await supabase
        .from("assinaturas")
        .select("id")
        .eq("user_id", client.id)
        .in("status", ["active", "pending_cash", "pending_renewal", "suspended"])
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) {
        toast.error("Este cliente já possui um plano ativo ou pendente");
        return;
      }

      const { data: assinatura, error: assinaturaError } = await supabase
        .from("assinaturas")
        .insert({
          user_id: client.id,
          plano_id: planoId,
          barbeiro_id: barbeiroId,
          status: "active",
          payment_method: "cash",
          cash_payment_confirmed: true,
          ciclo_inicio: dataPagamento,
          ciclo_fim: proximaCobranca,
          next_billing_date: proximaCobranca,
          usos_ciclo_atual: 0, // O uso será registrado na tabela plano_agendamentos_usos via insert se incluirCorteHoje for true
          total_renovacoes: 0,
          renovada_antecipadamente: false,
        })
        .select("id")
        .single();

      if (assinaturaError) throw assinaturaError;

      if (corteIncluso) {
        let finalAgendamentoId = corteIncluso.tipo === "agendamento" ? corteIncluso.agendamentoId : null;

        // Se for um corte avulso (servico), criamos um agendamento fantasma concluído para histórico do cliente
        if (corteIncluso.tipo === "servico") {
          const { data: newAg, error: newAgError } = await supabase
            .from("agendamentos")
            .insert({
              user_id: client.id,
              servico_id: corteIncluso.servicoId,
              barbeiro_id: barbeiroId,
              data: hojeISO,
              hora: agoraHora.slice(0, 5),
              status: "completed",
              preco: 0,
              duracao: 30, // Padrão
              tipo_agendamento: "plano",
              payment_method: "plano",
              visivel_para_usuario: true,
              cliente_confirmou: true,
              barbeiro_confirmou: true,
              ponto_liberado: true,
            })
            .select("id")
            .single();
          
          if (!newAgError && newAg) {
            finalAgendamentoId = newAg.id;
          }
        } else {
          // Se já era um agendamento, marcamos como tipo assinatura e preco 0
          await supabase
            .from("agendamentos")
            .update({ 
              tipo_agendamento: "plano",
              payment_method: "plano",
              preco: 0,
              status: "completed",
              barbeiro_confirmou: true,
              cliente_confirmou: true
            } as any)
            .eq("id", finalAgendamentoId);
        }

        // O registro de uso na tabela plano_agendamentos_usos agora é feito automaticamente 
        // pelos triggers do banco de dados (trg_consume_plan_use_on_appointment_insert)
        // tanto no INSERT quanto no UPDATE do agendamento, evitando erros de duplicidade.

        if (finalAgendamentoId) {
          // Sincronização de UI e registros internos mantida,
          // porém o disparo de webhook manual foi removido para evitar mensagens redundantes no WhatsApp.
        } else {
          // Caso raro onde não temos o ID do agendamento mas queremos registrar o uso
          const { error: usoError } = await supabase.from("plano_agendamentos_usos").insert({
            assinatura_id: assinatura.id,
            user_id: client.id,
            competencia: dataPagamento,
            agendamento_id: null,
          });
          if (usoError) throw usoError;
        }
      }

      await supabase.from("pagamentos_plano_barbearia").insert({
        assinatura_id: assinatura.id,
        user_id: client.id,
        barbeiro_id: barbeiroId,
        confirmado_por: actingUserId,
        valor: planoSelecionado?.preco_mensal || 0,
        competencia: dataPagamento,
        observacoes: null,
      });

      await supabase.from("notificacoes").insert({
        user_id: client.id,
        titulo: "Plano ativado!",
        mensagem: `Seu plano ${planoSelecionado?.nome || "mensal"} foi ativado. A próxima cobrança será em ${format(new Date(`${proximaCobranca}T12:00:00`), "dd/MM/yyyy")}.`,
        tipo: "plano_ativado",
      });

      toast.success(`${client.nome} agora tem um plano ativo`);
      onConverted?.();
      onBack();
    } catch (error: any) {
      console.error("[ClientPlanConversionScreen] erro ao ativar plano:", error);
      toast.error(error?.message || "Erro ao transformar cliente em plano");
    } finally {
      setSubmitting(false);
    }
  };

  const barbeiroSelecionado = barbeiros.find((b) => b.id === barbeiroId);
  const barbeiroDisplay = lockedBarbeiroId
    ? { apelido: lockedBarbeiroNome, foto_url: lockedBarbeiroFoto }
    : barbeiroSelecionado
      ? { apelido: barbeiroSelecionado.apelido, foto_url: barbeiroSelecionado.foto_url }
      : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="flex items-center gap-2.5 px-4 h-14">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-semibold text-foreground truncate">Transformar em plano</h1>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex-1 px-4 pt-4 pb-28 space-y-4 max-w-2xl mx-auto w-full overflow-y-auto">
            <div className="rounded-2xl border border-border/30 bg-secondary/15 p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-foreground truncate">{client.nome}</p>
                <p className="text-[12px] text-muted-foreground truncate">{client.email || client.telefone || "Sem contato"}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Plano</Label>
              <button
                type="button"
                onClick={() => setPlanPickerOpen(true)}
                className="w-full h-14 px-4 rounded-2xl border border-border/40 bg-secondary/15 flex items-center justify-between text-left hover:bg-secondary/25 transition-all active:scale-[0.99]"
              >
                {planoSelecionado ? (
                  <span className="flex flex-col min-w-0">
                    <span className="text-[15px] font-semibold text-foreground truncate">{planoSelecionado.nome}</span>
                    <span className="text-[12px] text-muted-foreground font-medium">
                      R$ {Number(planoSelecionado.preco_mensal).toFixed(2).replace(".", ",")}/mês
                    </span>
                  </span>
                ) : (
                  <span className="text-[14px] text-muted-foreground">Selecionar plano</span>
                )}
                <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180 flex-shrink-0" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Barbeiro do plano</Label>
              {lockedBarbeiroId ? (
                <div className="flex items-center gap-3 rounded-2xl border border-border/30 bg-secondary/15 px-4 h-14">
                  <BarberAvatar nome={lockedBarbeiroNome} foto={lockedBarbeiroFoto} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-foreground truncate">{lockedBarbeiroNome}</p>
                    <p className="text-[11px] text-muted-foreground font-medium">Barbeiro responsável</p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setBarberPickerOpen(true)}
                  className="w-full h-14 px-4 rounded-2xl border border-border/40 bg-secondary/15 flex items-center justify-between text-left hover:bg-secondary/25 transition-all active:scale-[0.99]"
                >
                  {barbeiroDisplay ? (
                    <div className="flex items-center gap-3 min-w-0">
                      <BarberAvatar nome={barbeiroDisplay.apelido} foto={barbeiroDisplay.foto_url} size="sm" />
                      <span className="text-[15px] font-semibold text-foreground truncate">{barbeiroDisplay.apelido}</span>
                    </div>
                  ) : (
                    <span className="text-[14px] text-muted-foreground">Selecione o barbeiro responsável</span>
                  )}
                  <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180 flex-shrink-0" />
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Dia que o cliente pagou</Label>
              <button
                type="button"
                onClick={() => setDatePickerOpen(true)}
                className="w-full h-14 px-4 rounded-2xl border border-border/40 bg-secondary/15 flex items-center justify-between text-left hover:bg-secondary/25 transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-foreground/5 border border-border/30 flex items-center justify-center flex-shrink-0">
                    <CalendarDays className="w-4 h-4 text-foreground" />
                  </div>
                  <span className="text-[15px] font-semibold text-foreground truncate">
                    {dataPagamento
                      ? format(new Date(`${dataPagamento}T12:00:00`), "dd 'de' MMMM, yyyy", { locale: ptBR })
                      : "Selecionar data"}
                  </span>
                </div>
                <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180 flex-shrink-0" />
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Corte incluso no plano</Label>
              {corteIncluso ? (
                <div className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => setCorteModalOpen(true)}
                    className="flex-1 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 h-16 text-left hover:bg-primary/10 transition-all active:scale-[0.99]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                      <Scissors className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-foreground truncate leading-tight">
                        {corteIncluso.servicoNome}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-medium mt-1 leading-tight truncate">
                        {corteIncluso.tipo === "agendamento"
                          ? `Agendado hoje às ${corteIncluso.hora?.slice(0, 5)}${corteIncluso.barbeiroNome ? ` • ${corteIncluso.barbeiroNome}` : ""}`
                          : "Avulso (sem agendamento)"}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCorteIncluso(null)}
                    aria-label="Remover corte incluso"
                    className="w-14 rounded-2xl border border-border/40 bg-secondary/15 flex items-center justify-center hover:bg-secondary/30 transition-all active:scale-95"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCorteModalOpen(true)}
                  className="w-full h-14 px-4 rounded-2xl border border-dashed border-border/50 bg-secondary/10 flex items-center justify-between text-left hover:bg-secondary/20 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-foreground/5 border border-border/30 flex items-center justify-center flex-shrink-0">
                      <Plus className="w-5 h-5 text-foreground" />
                    </div>
                    <span className="text-[14px] font-semibold text-foreground">Incluir corte de hoje</span>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180 flex-shrink-0" />
                </button>
              )}
              <p className="text-[11px] text-muted-foreground font-medium leading-snug px-1.5 pt-0.5">
                Já desconta um uso do plano agora — vincula o agendamento de hoje ou registra um corte avulso.
              </p>
            </div>
          </div>

          {/* Botão fixo no rodapé */}
          <div className="sticky bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-md px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <div className="max-w-2xl mx-auto">
              <Button
                onClick={handleSubmit}
                disabled={submitting || !planoId || !barbeiroId || !dataPagamento}
                className={cn(
                  "w-full h-12 font-semibold rounded-xl",
                  "bg-foreground text-background hover:bg-foreground/90",
                  submitting && "opacity-80"
                )}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ativar plano"}
              </Button>
            </div>
          </div>
        </>
      )}

      <PlanCarouselPicker
        open={planPickerOpen}
        onClose={() => setPlanPickerOpen(false)}
        planos={planos}
        selectedId={planoId}
        onSelect={(id) => {
          const escolhido = planos.find((p) => p.id === id);
          setPlanAddedToast({ titulo: "Plano selecionado", subtitulo: escolhido?.nome || "" });
          setPlanoId(id);
          setPlanPickerOpen(false);
        }}
      />

      <BarberCarouselPicker
        open={barberPickerOpen}
        onClose={() => setBarberPickerOpen(false)}
        barbeiros={barbeiros}
        selectedId={barbeiroId}
        onSelect={(id) => {
          const escolhido = barbeiros.find((b) => b.id === id);
          setPlanAddedToast({ titulo: "Barbeiro selecionado", subtitulo: escolhido?.apelido || "" });
          setBarbeiroId(id);
          setBarberPickerOpen(false);
        }}
      />

      <DatePickerOverlay
        open={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        value={dataPagamento}
        onSelect={(iso) => {
          const formatted = format(new Date(`${iso}T12:00:00`), "dd 'de' MMMM, yyyy", { locale: ptBR });
          setPlanAddedToast({ titulo: "Data definida", subtitulo: formatted });
          setDataPagamento(iso);
          setDatePickerOpen(false);
        }}
      />

      <IncluirCorteModal
        open={corteModalOpen}
        onClose={() => setCorteModalOpen(false)}
        clientNome={client.nome}
        agendamentos={agendamentosHoje}
        servicos={servicos}
        planoSelecionado={planoSelecionado}
        selecionado={corteIncluso}
        lockedBarbeiroId={lockedBarbeiroId}
        onConfirm={(payload) => {
          setCorteIncluso(payload);
          setCorteModalOpen(false);
          setPlanAddedToast({ titulo: "Corte incluído", subtitulo: payload.servicoNome });
        }}
      />

      <ActionToast
        toast={planAddedToast}
        onDone={() => setPlanAddedToast(null)}
      />

    </div>
  );
}

/* ─────────────── Action Toast (instantâneo) ─────────────── */

interface ActionToastData {
  titulo: string;
  subtitulo: string;
}

function ActionToast({ toast, onDone }: { toast: ActionToastData | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, 1100);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={`${toast.titulo}-${toast.subtitulo}`}
          initial={{ opacity: 0, scale: 0.9, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="fixed inset-0 z-[90] pointer-events-none flex items-center justify-center"
        >
          <div className="rounded-2xl bg-foreground/95 text-background backdrop-blur-xl px-6 py-5 shadow-2xl flex flex-col items-center gap-3 min-w-[220px] max-w-[80%]">
            <div className="w-12 h-12 rounded-full bg-background/15 flex items-center justify-center">
              <Check className="w-6 h-6 text-background" strokeWidth={3} />
            </div>
            <div className="text-center">
              <p className="text-[15px] font-semibold leading-tight">{toast.titulo}</p>
              {toast.subtitulo && (
                <p className="text-[12px] opacity-70 mt-0.5 truncate max-w-[200px]">{toast.subtitulo}</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─────────────── Barber Avatar ─────────────── */

function BarberAvatar({
  nome,
  foto,
  size = "md",
}: {
  nome: string;
  foto?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const dim =
    size === "xs"
      ? "w-6 h-6 text-[10px]"
      : size === "sm"
        ? "w-9 h-9 text-[11px]"
        : size === "lg"
          ? "w-14 h-14 text-[16px]"
          : "w-10 h-10 text-[12px]";
  const inicial = (nome || "?").trim().charAt(0).toUpperCase();
  if (foto) {
    return (
      <img
        src={foto}
        alt={nome}
        className={cn("rounded-full object-cover border border-border/40 flex-shrink-0", dim)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-semibold text-primary flex-shrink-0",
        dim
      )}
    >
      {inicial}
    </div>
  );
}

/* ─────────────── Plan Carousel Picker ─────────────── */

interface PlanCarouselPickerProps {
  open: boolean;
  onClose: () => void;
  planos: PlanoOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function PlanCarouselPicker({ open, onClose, planos, selectedId, onSelect }: PlanCarouselPickerProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: false,
    loop: false,
    duration: 22,
  });
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelectEmbla = () => setCurrentIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelectEmbla);
    emblaApi.on("reInit", onSelectEmbla);
    onSelectEmbla();
    return () => {
      emblaApi.off("select", onSelectEmbla);
      emblaApi.off("reInit", onSelectEmbla);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!open || !emblaApi) return;
    const idx = planos.findIndex((p) => p.id === selectedId);
    requestAnimationFrame(() => {
      emblaApi.reInit();
      if (idx >= 0) emblaApi.scrollTo(idx, true);
    });
  }, [open, emblaApi, planos, selectedId]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          onClick={onClose}
        >
          {/* Fundo borrado — mostra a tela atrás */}
          <div className="absolute inset-0 bg-background/10 backdrop-blur-md" />

          {/* Viewport tela cheia — sem corte, cards vêm de fora */}
          <div
            ref={emblaRef}
            className="absolute inset-0 z-10 overflow-hidden touch-pan-x flex items-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <div className="flex w-full">
              {planos.map((plano, idx) => {
                const isActive = idx === currentIndex;
                const distance = Math.abs(idx - currentIndex);
                const precoStr = Number(plano.preco_mensal).toFixed(2);
                const [reais, centavos] = precoStr.split(".");
                const beneficios: string[] = Array.isArray(plano.beneficios_json)
                  ? plano.beneficios_json
                      .map((b: any) => (typeof b === "string" ? b : b?.texto || b?.label || ""))
                      .filter(Boolean)
                  : [];
                return (
                  <div
                    key={plano.id}
                    className="flex-[0_0_100%] min-w-0 flex items-center justify-center px-6"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActive) {
                          onSelect(plano.id);
                        } else {
                          emblaApi?.scrollTo(idx);
                        }
                      }}
                      className={cn(
                        "w-full max-w-[320px] text-left rounded-3xl p-6 border backdrop-blur-md",
                        "transition-all duration-300 ease-out will-change-transform",
                        isActive
                          ? "bg-card/95 border-foreground/30 shadow-2xl scale-100 opacity-100"
                          : distance === 1
                            ? "bg-card/50 border-border/20 scale-90 opacity-40"
                            : "bg-card/30 border-border/10 scale-[0.78] opacity-15"
                      )}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">
                        Plano
                      </p>
                      <h3 className="text-[22px] font-bold text-foreground leading-tight mb-1 lowercase">
                        {plano.nome}
                      </h3>
                      {plano.descricao && (
                        <p className="text-[12px] text-muted-foreground leading-snug line-clamp-2">
                          {plano.descricao}
                        </p>
                      )}

                      <div className="flex items-baseline gap-1 mt-5 mb-4">
                        <span className="text-[12px] text-muted-foreground">R$</span>
                        <span className="text-[44px] font-extrabold text-foreground leading-none tracking-tight">
                          {reais}
                        </span>
                        <span className="text-[14px] font-semibold text-foreground self-start mt-2">
                          ,{centavos}
                        </span>
                        <span className="text-[11px] text-muted-foreground ml-1">/mês</span>
                      </div>

                      <div className="h-px bg-border/40 my-4" />

                      <div className="rounded-2xl bg-foreground text-background px-4 py-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-background/15 flex items-center justify-center">
                          <CalendarDays className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[14px] font-semibold leading-tight">
                            {plano.limite_agendamentos_mes ?? "Ilimitado"} agendamentos/mês
                          </p>
                          <p className="text-[10px] opacity-70">Horário prioritário</p>
                        </div>
                      </div>

                      {beneficios.length > 0 && (
                        <ul className="mt-4 space-y-2.5">
                          {beneficios.map((b, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-[13px] text-foreground/90">
                              <span className="mt-0.5 w-4 h-4 rounded-full bg-foreground/10 flex items-center justify-center flex-shrink-0">
                                <Check className="w-2.5 h-2.5 text-foreground" strokeWidth={3} />
                              </span>
                              <span className="leading-snug">{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
/* ─────────────── Barber Carousel Picker (vertical) ─────────────── */

interface BarberCarouselPickerProps {
  open: boolean;
  onClose: () => void;
  barbeiros: BarbeiroOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function BarberCarouselPicker({ open, onClose, barbeiros, selectedId, onSelect }: BarberCarouselPickerProps) {
  const orderedBarbeiros = useMemo(() => [...barbeiros].reverse(), [barbeiros]);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    axis: "y",
    align: "center",
    containScroll: false,
    loop: false,
    dragFree: false,
    skipSnaps: false,
    duration: 22,
  });
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelectEmbla = () => setCurrentIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelectEmbla);
    emblaApi.on("reInit", onSelectEmbla);
    onSelectEmbla();
    return () => {
      emblaApi.off("select", onSelectEmbla);
      emblaApi.off("reInit", onSelectEmbla);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!open || !emblaApi) return;
    const idx = orderedBarbeiros.findIndex((b) => b.id === selectedId);
    const targetIndex = idx >= 0 ? idx : 0;
    requestAnimationFrame(() => {
      emblaApi.reInit();
      emblaApi.scrollTo(targetIndex, true);
      setCurrentIndex(targetIndex);
    });
  }, [open, emblaApi, orderedBarbeiros, selectedId]);

  const activeBarber = orderedBarbeiros[currentIndex];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60]"
          onClick={onClose}
        >
          {/* Fundo borrado — mostra a tela atrás */}
          <div className="absolute inset-0 bg-background/10 backdrop-blur-md" />

          {/* Viewport tela cheia — o slide ativo encaixa um pouco acima do centro. */}
          <div
            ref={emblaRef}
            className="absolute inset-0 z-10 overflow-hidden touch-pan-y"
            style={{ paddingBottom: "18vh" }}
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <div className="flex h-full flex-col">
              {orderedBarbeiros.map((barbeiro, idx) => {
                const isActive = idx === currentIndex;
                const distance = Math.abs(idx - currentIndex);
                return (
                  <div
                    key={barbeiro.id}
                    className="flex-[0_0_140px] min-h-0 flex items-center justify-center px-5"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActive) {
                          onSelect(barbeiro.id);
                        } else {
                          emblaApi?.scrollTo(idx);
                        }
                      }}
                      className={cn(
                        "w-full max-w-[320px] h-[110px] rounded-3xl border backdrop-blur-md flex items-center gap-4 px-5 text-left",
                        "transition-all duration-300 ease-out will-change-transform",
                        isActive
                          ? "bg-card/95 border-foreground/30 shadow-2xl scale-100 opacity-100"
                          : distance === 1
                            ? "bg-card/50 border-border/20 scale-90 opacity-40"
                            : "bg-card/30 border-border/10 scale-[0.78] opacity-[0.15]"
                      )}
                    >
                      <BarberAvatar nome={barbeiro.apelido} foto={barbeiro.foto_url} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                          Barbeiro
                        </p>
                        <h3 className="text-[18px] font-bold text-foreground leading-tight truncate">
                          {barbeiro.apelido}
                        </h3>
                      </div>
                      {isActive && (
                        <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
                          <Check className="w-3.5 h-3.5 text-background" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Botão "Selecionar este barbeiro" fixo na barra inferior */}
          <div
            className="absolute bottom-0 left-0 right-0 z-20 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              onClick={() => activeBarber && onSelect(activeBarber.id)}
              disabled={!activeBarber}
              className="w-full h-12 rounded-xl bg-foreground/90 text-background hover:bg-foreground/95 font-semibold shadow-lg"
            >
              Selecionar este barbeiro
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─────────────── Date Picker Overlay ─────────────── */

interface DatePickerOverlayProps {
  open: boolean;
  onClose: () => void;
  value: string; // yyyy-MM-dd
  onSelect: (iso: string) => void;
}

function DatePickerOverlay({ open, onClose, value, onSelect }: DatePickerOverlayProps) {
  const selectedDate = useMemo(() => {
    if (!value) return undefined;
    return new Date(`${value}T12:00:00`);
  }, [value]);

  const [tempDate, setTempDate] = useState<Date | undefined>(selectedDate);

  useEffect(() => {
    if (open) setTempDate(selectedDate);
  }, [open, selectedDate]);

  const handleConfirm = () => {
    onSelect(format(tempDate || new Date(), "yyyy-MM-dd"));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex flex-col"
          onClick={onClose}
        >
          {/* Fundo borrado */}
          <div className="absolute inset-0 bg-background/10 backdrop-blur-md" />

          {/* Calendário centralizado */}
          <div
            className="relative z-10 flex-1 flex items-center justify-center px-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.94, y: 8, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[360px] rounded-[28px] bg-card/95 border border-foreground/15 backdrop-blur-xl shadow-2xl px-5 pt-5 pb-6"
            >
              <Calendar
                mode="single"
                locale={ptBR}
                selected={tempDate}
                onSelect={(date) => date && setTempDate(date)}
                initialFocus
                className={cn("p-0 pointer-events-auto w-full")}
                classNames={{
                  months: "flex flex-col w-full",
                  month: "space-y-5 w-full",
                  caption: "flex justify-center pt-1 pb-3 relative items-center",
                  caption_label: "text-[15px] font-semibold capitalize text-foreground",
                  nav: "space-x-1 flex items-center",
                  nav_button: "h-8 w-8 rounded-full bg-secondary/40 hover:bg-secondary/70 transition-colors flex items-center justify-center text-foreground/70 hover:text-foreground",
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse",
                  head_row: "flex w-full justify-between mb-2",
                  head_cell: "text-muted-foreground/70 rounded-md flex-1 font-medium text-[11px] uppercase tracking-wider text-center",
                  row: "flex w-full justify-between mt-2",
                  cell: "flex-1 aspect-square text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                  day: "h-10 w-10 mx-auto p-0 font-medium text-[14px] rounded-full hover:bg-secondary/60 transition-colors aria-selected:opacity-100 text-foreground",
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                  day_today: "text-primary font-bold",
                  day_outside: "text-muted-foreground/40",
                  day_disabled: "text-muted-foreground/30 opacity-50",
                  day_hidden: "invisible",
                }}
              />
            </motion.div>
          </div>

          {/* Botão Confirmar fixo na barra inferior */}
          <div
            className="relative z-10 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              onClick={handleConfirm}
              disabled={!tempDate}
              className="w-full h-12 rounded-xl bg-foreground/90 text-background hover:bg-foreground/95 font-semibold shadow-lg"
            >
              Confirmar
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─────────────── Incluir Corte Modal ─────────────── */

interface IncluirCorteModalProps {
  open: boolean;
  onClose: () => void;
  clientNome: string;
  agendamentos: AgendamentoHoje[];
  servicos: ServicoOption[];
  planoSelecionado?: PlanoOption;
  selecionado: CorteIncluso | null;
  lockedBarbeiroId?: string | null;
  onConfirm: (payload: CorteIncluso) => void;
}

function IncluirCorteModal({
  open,
  onClose,
  clientNome,
  agendamentos,
  servicos,
  planoSelecionado,
  selecionado,
  onConfirm,
  lockedBarbeiroId,
}: IncluirCorteModalProps) {
  // Filtra agendamentos pelo serviço do plano selecionado E pelo barbeiro bloqueado (se houver)
  const agendamentosFiltrados = useMemo(() => {
    let filtered = agendamentos;
    
    // Filtro por serviço do plano
    if (planoSelecionado?.servico_id) {
      filtered = filtered.filter(ag => ag.servico_id === planoSelecionado.servico_id);
    }
    
    // Filtro por barbeiro (Pedro Santos ou o barbeiro atual/bloqueado)
    if (lockedBarbeiroId) {
      filtered = filtered.filter(ag => ag.barbeiro_id === lockedBarbeiroId);
    }
    
    return filtered;
  }, [agendamentos, planoSelecionado, lockedBarbeiroId]);

  const [tab, setTab] = useState<"hoje" | "avulso">(
    agendamentosFiltrados.length > 0 ? "hoje" : "avulso"
  );
  const [escolha, setEscolha] = useState<CorteIncluso | null>(selecionado);

  useEffect(() => {
    if (!open) return;
    setEscolha(selecionado);
    setTab(agendamentosFiltrados.length > 0 ? "hoje" : "avulso");
    
    // Auto-select if there is only one appointment today for the plan's service
    if (agendamentosFiltrados.length === 1 && !selecionado) {
      const ag = agendamentosFiltrados[0];
      setEscolha({
        tipo: "agendamento",
        agendamentoId: ag.id,
        servicoNome: ag.servico_nome,
        hora: ag.hora,
        barbeiroNome: ag.barbeiro_nome,
      });
    } else if (agendamentos.length === 0 && planoSelecionado?.servico_id && !selecionado) {
      // Auto-select the plan service if no appointments exist
      const servicoDoPlano = servicos.find(s => s.id === planoSelecionado.servico_id);
      if (servicoDoPlano) {
        setEscolha({
          tipo: "servico",
          servicoId: servicoDoPlano.id,
          servicoNome: servicoDoPlano.nome,
          preco: Number(servicoDoPlano.preco),
        });
      }
    }

  }, [open, selecionado, agendamentosFiltrados.length]);

  const handleConfirmar = () => {
    if (!escolha) return;
    onConfirm(escolha);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] flex items-center justify-center"
          onClick={onClose}
        >
          {/* Fundo borrado — mesmo padrão visual */}
          <div className="absolute inset-0 bg-background/10 backdrop-blur-md" />

          <motion.div
            initial={{ scale: 0.94, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-[92%] max-w-[400px] max-h-[82vh] rounded-[28px] bg-card/95 border border-foreground/15 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                    Incluir no plano
                  </p>
                  <h3 className="text-[18px] font-bold text-foreground leading-tight truncate">
                    Corte de {clientNome}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center flex-shrink-0 transition-colors"
                  aria-label="Fechar"
                >
                  <X className="w-4 h-4 text-foreground" />
                </button>
              </div>

              {/* Tabs */}
              <div className="mt-4 grid grid-cols-2 gap-1 p-1 rounded-xl bg-foreground/5">
                <button
                  type="button"
                  onClick={() => setTab("hoje")}
                  className={cn(
                    "h-9 rounded-lg text-[12px] font-semibold transition-all",
                    tab === "hoje"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Agendado hoje
                </button>
                <button
                  type="button"
                  onClick={() => setTab("avulso")}
                  className={cn(
                    "h-9 rounded-lg text-[12px] font-semibold transition-all",
                    tab === "avulso"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Corte avulso
                </button>
              </div>
            </div>

            {/* Conteúdo rolável */}
            <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2">
            {tab === "hoje" ? (
                agendamentosFiltrados.length === 0 ? (
                  <div className="py-10 text-center px-4">
                    <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center mx-auto mb-3">
                      <CalendarDays className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-[13px] font-semibold text-foreground">
                      {planoSelecionado 
                        ? `Nenhum agendamento de "${planoSelecionado.servico_id ? servicos.find(s => s.id === planoSelecionado.servico_id)?.nome : "serviço do plano"}" hoje`
                        : "Nenhum agendamento hoje"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      {planoSelecionado 
                        ? "O agendamento precisa ser do mesmo serviço que o plano para ser incluído." 
                        : 'Use a aba "Corte avulso" para registrar um serviço sem agendamento.'}
                    </p>
                  </div>
                ) : (
                  agendamentosFiltrados.map((ag) => {
                    const isSel =
                      escolha?.tipo === "agendamento" && escolha.agendamentoId === ag.id;
                    return (
                      <button
                        key={ag.id}
                        type="button"
                        onClick={() =>
                          setEscolha({
                            tipo: "agendamento",
                            agendamentoId: ag.id,
                            servicoNome: ag.servico_nome,
                            hora: ag.hora,
                            barbeiroNome: ag.barbeiro_nome,
                          })
                        }
                        className={cn(
                          "w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99]",
                          isSel
                            ? "bg-foreground text-background border-foreground shadow-md"
                            : "bg-secondary/30 border-border/30 hover:bg-secondary/50"
                        )}
                      >
                        <div
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                            isSel ? "bg-background/15" : "bg-foreground/5"
                          )}
                        >
                          <Scissors className={cn("w-4 h-4", isSel ? "text-background" : "text-foreground")} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-[13px] font-semibold truncate leading-tight", isSel ? "text-background" : "text-foreground")}>
                            {ag.servico_nome}
                          </p>
                          <p className={cn("text-[11px] mt-0.5 truncate leading-tight flex items-center gap-1.5", isSel ? "text-background/70" : "text-muted-foreground")}>
                            <Clock className="w-3 h-3" /> {ag.hora.slice(0, 5)}
                            {ag.barbeiro_nome && <> • {ag.barbeiro_nome}</>}
                          </p>
                        </div>
                        {isSel && (
                          <div className="w-6 h-6 rounded-full bg-background/20 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-background" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })
                )
              ) : !planoSelecionado ? (
                <div className="py-10 text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center mx-auto mb-3">
                    <Wallet className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-[13px] font-semibold text-foreground text-center">Selecione um plano primeiro</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug text-center">
                    O corte avulso será baseado no serviço principal do plano escolhido.
                  </p>
                </div>
              ) : (
                (() => {
                  const servicoDoPlano = servicos.find(s => s.id === planoSelecionado.servico_id);
                  
                  if (!servicoDoPlano) {
                    return (
                      <div className="py-10 text-center px-4">
                        <p className="text-[13px] text-muted-foreground">Este plano não possui um serviço vinculado.</p>
                      </div>
                    );
                  }

                  const isSel = escolha?.tipo === "servico" && escolha.servicoId === servicoDoPlano.id;
                  
                  return (
                    <button
                      type="button"
                      onClick={() =>
                        setEscolha({
                          tipo: "servico",
                          servicoId: servicoDoPlano.id,
                          servicoNome: servicoDoPlano.nome,
                          preco: Number(servicoDoPlano.preco),
                        })
                      }
                      className={cn(
                        "w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99]",
                        isSel
                          ? "bg-foreground text-background border-foreground shadow-md"
                          : "bg-secondary/30 border-border/30 hover:bg-secondary/50"
                      )}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                          isSel ? "bg-background/15" : "bg-foreground/5"
                        )}
                      >
                        <Scissors className={cn("w-4 h-4", isSel ? "text-background" : "text-foreground")} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[13px] font-semibold truncate leading-tight", isSel ? "text-background" : "text-foreground")}>
                          {servicoDoPlano.nome} (Incluso no {planoSelecionado.nome})
                        </p>
                        <p className={cn("text-[11px] mt-0.5 leading-tight", isSel ? "text-background/70" : "text-muted-foreground")}>
                          Confirmar este como o primeiro corte do plano
                        </p>
                      </div>
                      {isSel && (
                        <div className="w-6 h-6 rounded-full bg-background/20 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-background" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })()
              )}
            </div>

            {/* Footer */}
            <div className="px-4 pt-3 pb-4 border-t border-border/30 bg-card/60">
              <Button
                onClick={handleConfirmar}
                disabled={!escolha}
                className="w-full h-12 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-semibold"
              >
                Incluir no plano
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
