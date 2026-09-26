/**
 * HorariosExcepcionais.tsx
 *
 * Gerencia exceções de horário no painel admin.
 * Fluxo:
 *   1. Lista de exceções
 *   2. Formulário: data + horários + motivo
 *   3. Ao salvar → drawer pergunta: "Só pra mim" ou "Para as barbearias"
 *   4. Se "Para as barbearias" → expande seleção de unidades inline no drawer
 */

import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Users, UserRound, Building2, ChevronLeft } from 'lucide-react';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Textarea } from '@/components/ui/textarea';
import { NumericDateInput } from '@/components/shared/NumericDateInput';
import { NumericTimeInput } from '@/components/shared/NumericTimeInput';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/lib/queryKeys';
import { STALE_TIMES } from '@/lib/queryConstants';
import { useAddHorarioExcepcional, useDeleteHorarioExcepcional } from '@/hooks/useAdminMutations';
import { useAdminHorarioScope } from '@/hooks/useAdminHorarioScope';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════

interface ExcecaoUnificada {
  id: string;
  data: string;
  aberto: boolean;
  hora_abertura: string | null;
  hora_fechamento: string | null;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  motivo: string | null;
  tipo: 'global' | 'barbeiro';
}

interface NovaExcecao {
  data: string;
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string;
  hora_almoco_fim: string;
  motivo: string;
}

interface BarbeariaOption {
  id: string;
  nome: string;
  cidade: string | null;
  source: 'tenant' | 'unidade';
}

/** Telas internas do componente */
type Screen = 'list' | 'form';

interface HorariosExcepcionaisProps {
  barbeiroId?: string;
}

const normalizeOptionLabel = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════

export default function HorariosExcepcionais({ barbeiroId }: HorariosExcepcionaisProps) {
  const queryClient = useQueryClient();
  const [screen, setScreen] = useState<Screen>('list');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'scope' | 'units'>('scope');
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [savingUnits, setSavingUnits] = useState(false);
  const [novaExcecao, setNovaExcecao] = useState<NovaExcecao>({
    data: '', aberto: true, hora_abertura: '09:00', hora_fechamento: '20:00',
    hora_almoco_inicio: '13:00', hora_almoco_fim: '14:00', motivo: ''
  });

  const addMutation = useAddHorarioExcepcional();
  const deleteMutation = useDeleteHorarioExcepcional();

  const { data: scopeData, isLoading: loadingScope } = useAdminHorarioScope(barbeiroId);
  const effectiveBarbeiroId = scopeData?.effectiveBarbeiroId ?? null;
  const tenantData = scopeData?.tenantData ?? null;
  const rawUnidades = scopeData?.rawUnidades ?? [];

  const tenantId = tenantData?.id || null;

  /** Lista completa de barbearias: tenant principal + sub-unidades */
  const barbearias: BarbeariaOption[] = useMemo(() => {
    const list: BarbeariaOption[] = [];
    const seenIds = new Set<string>();
    const seenComposites = new Set<string>();
    const tenantNameKey = normalizeOptionLabel(tenantData?.nome);

    const pushUnique = (option: BarbeariaOption) => {
      const normalizedId = option.id.trim();
      const normalizedComposite = `${normalizeOptionLabel(option.nome)}::${normalizeOptionLabel(option.cidade)}`;

      if (seenIds.has(normalizedId) || seenComposites.has(normalizedComposite)) {
        return;
      }

      seenIds.add(normalizedId);
      seenComposites.add(normalizedComposite);
      list.push(option);
    };

    // Sempre adiciona a barbearia principal (tenant)
    if (tenantData) {
      pushUnique({
        id: tenantData.id,
        nome: tenantData.nome || 'Barbearia Principal',
        cidade: tenantData.cidade || null,
        source: 'tenant',
      });
    }

    // Sub-unidades
    rawUnidades.forEach(u => {
      const unitNameKey = normalizeOptionLabel(u.nome);
      const duplicatesTenant = !!tenantData && (
        u.id === tenantData.id ||
        (tenantNameKey.length > 0 && tenantNameKey === unitNameKey)
      );

      if (duplicatesTenant) return;

      pushUnique({
        id: u.id,
        nome: u.nome,
        cidade: u.cidade,
        source: 'unidade',
      });
    });
    return list;
  }, [tenantData, rawUnidades]);

  // ─── Query: exceções do tenant (escopadas para evitar vazamento entre barbearias) ───
  const currentTenantId = tenantData?.id ?? null;
  const { data: excGlobais = [], isLoading: loadingGlobais } = useQuery({
    queryKey: [...QUERY_KEYS.admin.horariosExcepcionais(), currentTenantId ?? 'notenant'],
    queryFn: async () => {
      if (!currentTenantId) return [];
      const { data, error } = await supabase
        .from('horarios_excepcionais')
        .select('id, data, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, motivo')
        .eq('tenant_id', currentTenantId)
        .order('data', { ascending: true });
      if (error) throw error;
      return (data || []).map(e => ({ ...e, tipo: 'global' as const }));
    },
    enabled: !!currentTenantId,
    staleTime: STALE_TIMES.HORARIOS,
  });

  // ─── Query: exceções individuais do barbeiro ───
  const { data: excBarbeiro = [], isLoading: loadingBarbeiro } = useQuery({
    queryKey: effectiveBarbeiroId ? QUERY_KEYS.barbeiro.horariosExcepcionais(effectiveBarbeiroId) : ['noop-exc'],
    queryFn: async () => {
      if (!effectiveBarbeiroId) return [];
      const { data, error } = await supabase
        .from('horarios_excepcionais_barbeiro')
        .select('id, data, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, motivo')
        .eq('barbeiro_id', effectiveBarbeiroId)
        .order('data', { ascending: true });
      if (error) throw error;
      return (data || []).map(e => ({ ...e, tipo: 'barbeiro' as const }));
    },
    enabled: !!effectiveBarbeiroId,
    staleTime: STALE_TIMES.HORARIOS,
  });

  const excecoes: ExcecaoUnificada[] = useMemo(() => {
    return [...excGlobais, ...excBarbeiro].sort((a, b) => a.data.localeCompare(b.data));
  }, [excGlobais, excBarbeiro]);

  const loading = loadingGlobais || loadingBarbeiro || loadingScope;

  // ─── Helpers ───
  const buildPayload = () => ({
    data: novaExcecao.data,
    aberto: novaExcecao.aberto,
    hora_abertura: novaExcecao.aberto ? novaExcecao.hora_abertura : null,
    hora_fechamento: novaExcecao.aberto ? novaExcecao.hora_fechamento : null,
    hora_almoco_inicio: novaExcecao.aberto && novaExcecao.hora_almoco_inicio ? novaExcecao.hora_almoco_inicio : null,
    hora_almoco_fim: novaExcecao.aberto && novaExcecao.hora_almoco_fim ? novaExcecao.hora_almoco_fim : null,
    motivo: novaExcecao.motivo || null,
  });

  const resetAndGoList = () => {
    setNovaExcecao({ data: '', aberto: true, hora_abertura: '09:00', hora_fechamento: '20:00', hora_almoco_inicio: '13:00', hora_almoco_fim: '14:00', motivo: '' });
    setSelectedUnits([]);
    setDrawerOpen(false);
    setDrawerMode('scope');
    setScreen('list');
  };

  const validateForm = (): boolean => {
    if (!novaExcecao.data) { toast.error('Selecione uma data'); return false; }
    if (isBefore(parseISO(novaExcecao.data), startOfDay(new Date()))) { toast.error('A data deve ser hoje ou no futuro'); return false; }
    return true;
  };

  // ─── Ações de salvamento ───

  /** Salvar só pra mim (barbeiro individual) */
  const handleSaveForMe = () => {
    if (!effectiveBarbeiroId) { toast.error('Não foi possível identificar seu perfil'); return; }
    addMutation.mutate(
      { escopo: 'barbeiro', barbeiro_id: effectiveBarbeiroId, ...buildPayload() },
      { onSuccess: resetAndGoList }
    );
  };

  /** Salvar para barbeiros das unidades/tenant selecionadas */
  const handleSaveForUnits = async () => {
    if (selectedUnits.length === 0) { toast.error('Selecione pelo menos uma barbearia'); return; }
    setSavingUnits(true);
    try {
      const payload = buildPayload();
      const isTenantSelected = tenantData && selectedUnits.includes(tenantData.id);
      const unitIds = selectedUnits.filter(id => id !== tenantData?.id);

      // Se o tenant principal foi selecionado, aplica como exceção GLOBAL (unidade_id = NULL)
      // — vale para todos os barbeiros de todas as unidades do tenant.
      // Caso contrário, cria uma exceção por unidade selecionada.
      const rows: Array<Record<string, unknown>> = [];
      if (isTenantSelected) {
        rows.push({ ...payload, unidade_id: null });
      }
      for (const uid of unitIds) {
        rows.push({ ...payload, unidade_id: uid });
      }

      if (rows.length === 0) {
        toast.error('Nenhuma barbearia válida selecionada');
        setSavingUnits(false);
        return;
      }

      const { error: insertErr } = await supabase
        .from('horarios_excepcionais')
        .insert(rows as never[]);
      if (insertErr) throw insertErr;

      toast.success(
        isTenantSelected
          ? 'Exceção aplicada a toda a barbearia'
          : `Exceção aplicada a ${unitIds.length} unidade(s)`
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.admin.horariosExcepcionais() });
      queryClient.invalidateQueries({ queryKey: ['barbeiro'], exact: false });
      resetAndGoList();
    } catch (err: any) {
      if (err?.code === '23505') toast.error('Já existe exceção para esta data em algum barbeiro');
      else { toast.error('Erro ao aplicar exceção'); console.error(err); }
    } finally {
      setSavingUnits(false);
    }
  };

  const toggleUnit = (id: string) => setSelectedUnits(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAllUnits = () => setSelectedUnits(p => p.length === barbearias.length ? [] : barbearias.map(u => u.id));

  const formatDateShort = (d: string) => { try { return format(parseISO(d), "dd 'de' MMM, yyyy", { locale: ptBR }); } catch { return d; } };
  const isDatePast = (d: string) => { try { return isBefore(parseISO(d), startOfDay(new Date())); } catch { return false; } };

  const excecoesFuturas = excecoes.filter(e => !isDatePast(e.data));
  const excecoesPassadas = excecoes.filter(e => isDatePast(e.data));

  const isSaving = addMutation.isPending || savingUnits;

  /** Abre o drawer de escopo ao clicar em "Salvar Exceção" */
  const handleSaveClick = () => {
    if (!validateForm()) return;
    setDrawerMode('scope');
    setSelectedUnits([]);
    setDrawerOpen(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  // ═══════════════════════════════════════════════════════════
  // TELA 2: Formulário (data, horários, motivo)
  // ═══════════════════════════════════════════════════════════
  if (screen === 'form') {
    return (
      <>
        <AnimatePresence mode="wait">
          <motion.div
            key="form"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col min-h-[calc(100vh-200px)]"
          >
            <div className="flex-1 space-y-6 pb-24">
              <p className="text-xs font-extralight text-muted-foreground">
                Preencha a data e os horários da exceção.
              </p>

              {/* ── Data ── */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">Data</p>
                <NumericDateInput
                  value={novaExcecao.data}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(iso) => setNovaExcecao(prev => ({ ...prev, data: iso }))}
                />
              </div>

              {/* ── Toggle aberto/fechado ── */}
              <div className="rounded-xl border border-border/30 bg-muted/5 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {novaExcecao.aberto ? 'Aberto com horário especial' : 'Fechado o dia inteiro'}
                    </p>
                    <p className="text-[11px] text-muted-foreground/50 font-extralight">
                      {novaExcecao.aberto
                        ? 'Funcionará com horário diferente do habitual'
                        : 'Nenhum agendamento será aceito neste dia'
                      }
                    </p>
                  </div>
                  <Switch
                    checked={novaExcecao.aberto}
                    onCheckedChange={(checked) => setNovaExcecao(prev => ({ ...prev, aberto: checked }))}
                    className="scale-[0.85] data-[state=checked]:bg-emerald-500"
                  />
                </div>
              </div>

              {/* ── Horários (quando aberto) ── */}
              {novaExcecao.aberto && (
                <div className="space-y-5">
                  <div className="border-t border-border/20" />
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">Horário de funcionamento</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground/60 font-extralight">Abertura</p>
                        <NumericTimeInput value={novaExcecao.hora_abertura} onChange={(v) => setNovaExcecao(prev => ({ ...prev, hora_abertura: v }))} />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground/60 font-extralight">Fechamento</p>
                        <NumericTimeInput value={novaExcecao.hora_fechamento} onChange={(v) => setNovaExcecao(prev => ({ ...prev, hora_fechamento: v }))} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">Intervalo / Almoço</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground/60 font-extralight">Início</p>
                        <NumericTimeInput value={novaExcecao.hora_almoco_inicio} onChange={(v) => setNovaExcecao(prev => ({ ...prev, hora_almoco_inicio: v }))} />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground/60 font-extralight">Fim</p>
                        <NumericTimeInput value={novaExcecao.hora_almoco_fim} onChange={(v) => setNovaExcecao(prev => ({ ...prev, hora_almoco_fim: v }))} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Motivo ── */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">Motivo (opcional)</p>
                <Textarea
                  placeholder="Ex: Consulta médica, feriado municipal, evento..."
                  value={novaExcecao.motivo}
                  onChange={(e) => setNovaExcecao(prev => ({ ...prev, motivo: e.target.value }))}
                  rows={2}
                  className="text-sm resize-none rounded-xl"
                />
              </div>
            </div>

            {/* ── Botão salvar — abre drawer de escopo ── */}
            <div className="sticky bottom-0 left-0 right-0 p-4 pb-6 bg-background border-t border-border/20">
              <Button
                onClick={handleSaveClick}
                disabled={!novaExcecao.data}
                className="w-full h-[48px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-sm shadow-sm transition-colors"
              >
                Salvar Exceção
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ═══ DRAWER: Escopo + Seleção de barbearias ═══ */}
        <ScopeDrawer
          open={drawerOpen}
          mode={drawerMode}
          onClose={() => { setDrawerOpen(false); setDrawerMode('scope'); }}
          onSaveForMe={handleSaveForMe}
          onGoToUnits={() => setDrawerMode('units')}
          onBackToScope={() => setDrawerMode('scope')}
          barbearias={barbearias}
          selectedUnits={selectedUnits}
          toggleUnit={toggleUnit}
          toggleAllUnits={toggleAllUnits}
          onSaveForUnits={handleSaveForUnits}
          isSaving={isSaving}
          isLoadingBarbearias={loadingScope}
          novaExcecao={novaExcecao}
          formatDateShort={formatDateShort}
        />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // TELA 1: Lista principal
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 px-1">
      <p className="text-xs font-extralight text-muted-foreground">
        Altere horários ou feche em dias específicos.
      </p>

      <div className="border-t border-border/20" />

      <button
        onClick={() => setScreen('form')}
        className="w-full py-3.5 rounded-xl border border-dashed border-border/40 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors"
      >
        + Nova exceção
      </button>

      {excecoesFuturas.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
            Próximas ({excecoesFuturas.length})
          </p>
          <div className="divide-y divide-border/40">
            {excecoesFuturas.map((excecao) => (
              <ExcecaoListItem
                key={`${excecao.tipo}-${excecao.id}`}
                excecao={excecao}
                onDelete={(id, tipo) => deleteMutation.mutate({ id, tipo })}
                formatDate={formatDateShort}
                isPast={false}
              />
            ))}
          </div>
        </div>
      )}

      {excecoesPassadas.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium text-muted-foreground/40 uppercase tracking-widest">
            Passadas ({excecoesPassadas.length})
          </p>
          <div className="divide-y divide-border/20 opacity-40">
            {excecoesPassadas.slice(0, 5).map((excecao) => (
              <ExcecaoListItem
                key={`${excecao.tipo}-${excecao.id}`}
                excecao={excecao}
                onDelete={(id, tipo) => deleteMutation.mutate({ id, tipo })}
                formatDate={formatDateShort}
                isPast={true}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE: Drawer de Escopo (desliza de baixo)
// ═══════════════════════════════════════════════════════════

interface ScopeDrawerProps {
  open: boolean;
  mode: 'scope' | 'units';
  onClose: () => void;
  onSaveForMe: () => void;
  onGoToUnits: () => void;
  onBackToScope: () => void;
  barbearias: BarbeariaOption[];
  selectedUnits: string[];
  toggleUnit: (id: string) => void;
  toggleAllUnits: () => void;
  onSaveForUnits: () => void;
  isSaving: boolean;
  isLoadingBarbearias: boolean;
  novaExcecao: NovaExcecao;
  formatDateShort: (d: string) => string;
}

function ScopeDrawer({
  open, mode, onClose, onSaveForMe, onGoToUnits, onBackToScope,
  barbearias, selectedUnits, toggleUnit, toggleAllUnits: _toggleAllUnits, onSaveForUnits,
  isSaving, isLoadingBarbearias, novaExcecao, formatDateShort
}: ScopeDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50"
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 35 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl border-t border-border/30 shadow-2xl max-h-[85vh] flex flex-col"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
            </div>

            <AnimatePresence mode="wait">
              {mode === 'scope' ? (
                <motion.div
                  key="scope-view"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                  className="px-5 pb-6 space-y-4 overflow-y-auto"
                >
                  {/* Título */}
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground">Onde aplicar?</h3>
                    <p className="text-[11px] text-muted-foreground/50 font-extralight">
                      Escolha se essa exceção vale só pra você ou para as barbearias.
                    </p>
                  </div>

                  {/* Resumo */}
                  <div className="rounded-xl border border-border/20 bg-muted/5 p-3 flex items-center gap-2.5">
                    <span className="text-sm font-medium text-foreground capitalize">{formatDateShort(novaExcecao.data)}</span>
                    {novaExcecao.aberto ? (
                      <span className="text-[9px] font-medium uppercase tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Horário especial</span>
                    ) : (
                      <span className="text-[9px] font-medium uppercase tracking-wider text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Fechado</span>
                    )}
                  </div>

                  {/* Opção: Só pra mim */}
                  <button
                    type="button"
                    onClick={onSaveForMe}
                    disabled={isSaving}
                    className="flex items-center gap-3.5 w-full rounded-xl border border-border/30 bg-muted/5 p-4 text-left hover:border-foreground/20 hover:bg-muted/10 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-full bg-muted/30 border border-border/30 flex items-center justify-center shrink-0">
                      <UserRound className="w-4 h-4 text-foreground/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground block">Só pra mim</span>
                      <p className="text-[11px] text-muted-foreground/50 font-extralight">
                        Aplicar apenas na minha agenda pessoal
                      </p>
                    </div>
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
                  </button>

                  {/* Opção: Para as barbearias */}
                  <button
                    type="button"
                    onClick={onGoToUnits}
                    disabled={isSaving}
                    className="flex items-center gap-3.5 w-full rounded-xl border border-border/30 bg-muted/5 p-4 text-left hover:border-foreground/20 hover:bg-muted/10 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-full bg-muted/30 border border-border/30 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-foreground/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground block">Para as barbearias</span>
                      <p className="text-[11px] text-muted-foreground/50 font-extralight">
                        Escolha quais barbearias terão essa exceção
                      </p>
                    </div>
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="units-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  className="px-5 pb-6 space-y-4 overflow-y-auto flex-1"
                >
                  {/* Header */}
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={onBackToScope}
                      className="w-8 h-8 rounded-full border border-border/40 bg-muted/10 flex items-center justify-center hover:bg-muted/30 active:scale-95 transition-all"
                      aria-label="Voltar"
                    >
                      <ChevronLeft className="w-4 h-4 text-foreground strokeWidth-[2.5]" />
                    </button>
                    <h3 className="text-base font-semibold text-foreground">Selecionar barbearia</h3>
                  </div>

                  {/* Lista de barbearias */}
                  <div className="rounded-xl border border-border/30 bg-muted/5 divide-y divide-border/20 overflow-hidden">
                    {barbearias.map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleUnit(b.id)}
                        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/10 transition-colors"
                      >
                        <Checkbox
                          checked={selectedUnits.includes(b.id)}
                          className="data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
                        />
                        <span className="text-sm font-medium text-foreground block truncate">{b.nome}</span>
                      </button>
                    ))}

                    {isLoadingBarbearias && (
                      <div className="px-4 py-6 text-center">
                        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-muted-foreground/60" />
                        <p className="text-sm text-muted-foreground/50">Carregando barbearias...</p>
                      </div>
                    )}

                    {!isLoadingBarbearias && barbearias.length === 0 && (
                      <div className="px-4 py-6 text-center">
                        <p className="text-sm text-muted-foreground/50">Nenhuma barbearia encontrada</p>
                      </div>
                    )}
                  </div>

                  {/* Botão salvar */}
                  <Button
                    onClick={onSaveForUnits}
                    disabled={isSaving || selectedUnits.length === 0}
                    className="w-full h-[48px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-sm shadow-sm transition-colors"
                  >
                    {isSaving ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>
                    ) : (
                      'Aplicar'
                    )}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE: Item da lista
// ═══════════════════════════════════════════════════════════

function ExcecaoListItem({ excecao, onDelete, formatDate, isPast }: {
  excecao: ExcecaoUnificada;
  onDelete: (id: string, tipo: 'global' | 'barbeiro') => void;
  formatDate: (d: string) => string;
  isPast: boolean;
}) {
  if (isPast) {
    return (
      <div className="group flex items-center justify-between py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground capitalize">{formatDate(excecao.data)}</span>
          <ScopeBadge tipo={excecao.tipo} />
          {!excecao.aberto && <span className="text-[10px] text-muted-foreground/50 font-extralight">Fechado</span>}
        </div>
        <button onClick={() => onDelete(excecao.id, excecao.tipo)} className="text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground hover:text-destructive transition-all">Remover</button>
      </div>
    );
  }

  return (
    <div className="group py-3.5 flex items-center justify-between">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground capitalize">{formatDate(excecao.data)}</span>
          {excecao.aberto ? (
            <span className="text-[9px] font-medium uppercase tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Horário especial</span>
          ) : (
            <span className="text-[9px] font-medium uppercase tracking-wider text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Fechado</span>
          )}
          <ScopeBadge tipo={excecao.tipo} />
        </div>
        <p className="text-[11px] text-muted-foreground/50 font-extralight">
          {excecao.aberto ? (
            <>
              {excecao.hora_abertura?.slice(0, 5)} — {excecao.hora_fechamento?.slice(0, 5)}
              {excecao.hora_almoco_inicio && excecao.hora_almoco_fim && (
                <span className="ml-2">· Intervalo {excecao.hora_almoco_inicio?.slice(0, 5)} — {excecao.hora_almoco_fim?.slice(0, 5)}</span>
              )}
            </>
          ) : 'Nenhum agendamento neste dia'}
          {excecao.motivo && <span className="ml-2">· {excecao.motivo}</span>}
        </p>
      </div>
      <button onClick={() => onDelete(excecao.id, excecao.tipo)} className="text-[11px] text-muted-foreground/30 group-hover:text-muted-foreground hover:text-destructive transition-all shrink-0 ml-4">Remover</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE: Badge de escopo
// ═══════════════════════════════════════════════════════════

function ScopeBadge({ tipo }: { tipo: 'global' | 'barbeiro' }) {
  if (tipo === 'global') {
    return (
      <Badge variant="outline" className="text-[9px] font-medium uppercase tracking-wider border-muted-foreground/20 text-muted-foreground bg-muted/20 px-1.5 py-0">
        <Users className="w-2.5 h-2.5 mr-1" />Todos
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] font-medium uppercase tracking-wider border-muted-foreground/20 text-muted-foreground bg-muted/20 px-1.5 py-0">
      <UserRound className="w-2.5 h-2.5 mr-1" />Só eu
    </Badge>
  );
}
