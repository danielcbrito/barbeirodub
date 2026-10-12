import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { BarberContext } from "@/pages/Barbeiro";
import { validatePhone } from "@/lib/validators";

import { SetupStepIndicator } from "./setup/SetupStepIndicator";
import { StepSobreVoce, SobreVoceData } from "./setup/StepSobreVoce";
import { StepLocalTrabalho, WorkplaceType } from "./setup/StepLocalTrabalho";
import { StepEndereco, EnderecoData } from "./setup/StepEndereco";
import { StepEquipe, TeamSize } from "./setup/StepEquipe";
import { StepHorarios } from "./setup/StepHorarios";
import { StepServicos } from "./setup/StepServicos";
import { StepBoasVindas } from "./setup/StepBoasVindas";
import { StepDuracaoServicos } from "./setup/StepDuracaoServicos";

/**
 * Wizard de Setup do Barbeiro.
 * 
 * DONO (sem tenant_id ou é dono do tenant) → 7 etapas completas:
 *   0: Sobre Você (nome comercial + nome + telefone)
 *   1: Local de Trabalho
 *   2: Endereço
 *   3: Equipe
 *   4: Horários
 *   5: Serviços (CRUD completo)
 *   6: Boas-vindas
 * 
 * CONVIDADO (tem tenant_id e NÃO é dono) → 4 etapas:
 *   0: Sobre Você (nome + telefone — sem nome comercial)
 *   1: Horários
 *   2: Tempo por Serviço (duração personalizada)
 *   3: Boas-vindas
 */

interface Props {
  barberContext: BarberContext;
  onSetupComplete: () => void;
}

export function BarberSetupScreen({ barberContext, onSetupComplete }: Props) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState(1);

  /** Barbeiro convidado = tem tenant mas NÃO é dono */
  const isInvited = !!barberContext.tenantId && !barberContext.isTenantAdmin;
  const TOTAL_STEPS = isInvited ? 4 : 7;

  // Step 1 — Sobre Você
  const [sobreVoce, setSobreVoce] = useState<SobreVoceData>({
    nome_barbearia: "",
    nome_completo: "",
    telefone: "",
  });
  const [sobreVoceErrors, setSobreVoceErrors] = useState<Partial<Record<keyof SobreVoceData, string>>>({});

  // Step 2 (owner) — Local de trabalho
  const [workplace, setWorkplace] = useState<WorkplaceType>("");

  // Step 3 (owner) — Endereço
  const [endereco, setEndereco] = useState<EnderecoData>({
    cep: "", rua: "", numero: "", bairro: "", cidade: "", estado: "",
  });
  const [enderecoErrors, setEnderecoErrors] = useState<Partial<Record<keyof EnderecoData, string>>>({});

  // Step 4 (owner) — Equipe
  const [teamSize, setTeamSize] = useState<TeamSize>("");

  useEffect(() => {
    let mounted = true;
    const loadExistingData = async () => {
      try {
        const { data: row } = await supabase
          .from("barbeiros_private")
          .select("nome_completo, telefone, endereco_cep, endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado")
          .eq("barbeiro_id", barberContext.barbeiroId)
          .maybeSingle();
        if (!mounted) return;

        if (row) {
          setSobreVoce(prev => ({
            ...prev,
            nome_completo: (row as any).nome_completo || "",
            telefone: row.telefone || "",
          }));
          setEndereco({
            cep: (row as any).endereco_cep || "",
            rua: (row as any).endereco_rua || "",
            numero: (row as any).endereco_numero || "",
            bairro: (row as any).endereco_bairro || "",
            cidade: (row as any).endereco_cidade || "",
            estado: (row as any).endereco_estado || "",
          });
        }

        // Carregar apelido como nome da barbearia (owner only)
        if (!isInvited) {
          const { data: barber } = await supabase
            .from("barbeiros")
            .select("apelido")
            .eq("id", barberContext.barbeiroId)
            .single();
          if (mounted && barber) {
            setSobreVoce(prev => ({ ...prev, nome_barbearia: barber.apelido || "" }));
          }
        }
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadExistingData();
    return () => { mounted = false; };
  }, []);

  /* ═══ Validação por step ═══ */
  const validateStep = (): boolean => {
    if (isInvited) return validateInvitedStep();
    return validateOwnerStep();
  };

  /** Validação do fluxo de barbeiro convidado */
  const validateInvitedStep = (): boolean => {
    switch (step) {
      case 0: {
        const errors: Partial<Record<keyof SobreVoceData, string>> = {};
        if (!sobreVoce.nome_completo.trim()) errors.nome_completo = "Obrigatório";
        else if (sobreVoce.nome_completo.trim().split(" ").length < 2) errors.nome_completo = "Informe nome e sobrenome";
        if (!sobreVoce.telefone.trim()) errors.telefone = "Obrigatório";
        else if (!validatePhone(sobreVoce.telefone)) errors.telefone = "Telefone inválido";
        setSobreVoceErrors(errors);
        return Object.keys(errors).length === 0;
      }
      case 1: // Horários — sempre válido
      case 2: // Duração serviços — sempre válido
        return true;
      default:
        return true;
    }
  };

  /** Validação do fluxo de dono */
  const validateOwnerStep = (): boolean => {
    switch (step) {
      case 0: {
        const errors: Partial<Record<keyof SobreVoceData, string>> = {};
        if (!sobreVoce.nome_barbearia.trim()) errors.nome_barbearia = "Obrigatório";
        if (!sobreVoce.nome_completo.trim()) errors.nome_completo = "Obrigatório";
        else if (sobreVoce.nome_completo.trim().split(" ").length < 2) errors.nome_completo = "Informe nome e sobrenome";
        if (!sobreVoce.telefone.trim()) errors.telefone = "Obrigatório";
        else if (!validatePhone(sobreVoce.telefone)) errors.telefone = "Telefone inválido";
        setSobreVoceErrors(errors);
        return Object.keys(errors).length === 0;
      }
      case 1:
        if (!workplace) { toast.error("Selecione uma opção"); return false; }
        return true;
      case 2: {
        const errors: Partial<Record<keyof EnderecoData, string>> = {};
        if (!endereco.cep.trim()) errors.cep = "Obrigatório";
        if (!endereco.numero.trim()) errors.numero = "Obrigatório";
        if (!endereco.cidade.trim()) errors.cidade = "Obrigatório";
        if (!endereco.estado.trim()) errors.estado = "Obrigatório";
        setEnderecoErrors(errors);
        return Object.keys(errors).length === 0;
      }
      case 3:
        if (!teamSize) { toast.error("Selecione o tamanho da equipe"); return false; }
        return true;
      case 4: // Horários
      case 5: // Serviços
        return true;
      default:
        return true;
    }
  };

  /* ═══ Navegação ═══ */
  const goNext = async () => {
    if (!validateStep()) return;

    // Salvar dados intermediários nos steps críticos
    if (step === 0) await saveData();
    if (!isInvited && step === 2) await saveData();

    if (step === TOTAL_STEPS - 1) {
      await finishSetup();
      return;
    }

    setDirection(1);
    setStep(s => s + 1);
  };

  const goBack = () => {
    if (step === 0) return;
    setDirection(-1);
    setStep(s => s - 1);
  };

  /* ═══ Salvar dados parciais ═══ */
  const saveData = async () => {
    try {
      await supabase
        .from("barbeiros_private")
        .update({
          nome_completo: sobreVoce.nome_completo.trim(),
          telefone: sobreVoce.telefone.trim(),
          endereco_cep: endereco.cep.trim(),
          endereco_rua: endereco.rua.trim(),
          endereco_numero: endereco.numero.trim(),
          endereco_bairro: endereco.bairro.trim(),
          endereco_cidade: endereco.cidade.trim(),
          endereco_estado: endereco.estado.trim(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("barbeiro_id", barberContext.barbeiroId);

      // Atualizar apelido (owner) ou nome exibível (convidado)
      const apelido = isInvited
        ? sobreVoce.nome_completo.trim().split(" ")[0]
        : sobreVoce.nome_barbearia.trim();

      await supabase
        .from("barbeiros")
        .update({ apelido, updated_at: new Date().toISOString() })
        .eq("id", barberContext.barbeiroId);
    } catch (err) {
      console.error("Erro ao salvar rascunho:", err);
    }
  };

  /* ═══ Finalizar setup ═══ */
  const finishSetup = async () => {
    setSaving(true);
    try {
      await saveData();

      await supabase
        .from("barbeiros")
        .update({ setup_completed: true, updated_at: new Date().toISOString() })
        .eq("id", barberContext.barbeiroId);

      toast.success("Cadastro concluído! 🎉");
      setTimeout(() => onSetupComplete(), 1200);
    } catch (err: any) {
      console.error("Erro ao finalizar setup:", err);
      toast.error("Erro ao finalizar cadastro");
      setSaving(false);
    }
  };

  /* ═══ Loading ═══ */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  /* ═══ Renderização do step por tipo de barbeiro ═══ */
  const renderStep = () => {
    if (isInvited) return renderInvitedStep();
    return renderOwnerStep();
  };

  /** Steps do barbeiro convidado */
  const renderInvitedStep = () => {
    switch (step) {
      case 0:
        return (
          <InvitedSobreVoce
            data={sobreVoce}
            onChange={(d) => { setSobreVoce(d); setSobreVoceErrors({}); }}
            errors={sobreVoceErrors}
          />
        );
      case 1:
        return <StepHorarios barbeiroId={barberContext.barbeiroId} />;
      case 2:
        return (
          <StepDuracaoServicos
            barbeiroId={barberContext.barbeiroId}
            tenantId={barberContext.tenantId!}
          />
        );
      case 3:
        return <StepBoasVindas nome={sobreVoce.nome_completo.split(" ")[0] || barberContext.apelido} />;
      default:
        return null;
    }
  };

  /** Steps do dono (fluxo original de 7 etapas) */
  const renderOwnerStep = () => {
    switch (step) {
      case 0:
        return <StepSobreVoce data={sobreVoce} onChange={(d) => { setSobreVoce(d); setSobreVoceErrors({}); }} errors={sobreVoceErrors} />;
      case 1:
        return <StepLocalTrabalho value={workplace} onChange={setWorkplace} nome={sobreVoce.nome_completo.split(" ")[0]} />;
      case 2:
        return <StepEndereco data={endereco} onChange={(d) => { setEndereco(d); setEnderecoErrors({}); }} errors={enderecoErrors} />;
      case 3:
        return <StepEquipe value={teamSize} onChange={setTeamSize} />;
      case 4:
        return <StepHorarios barbeiroId={barberContext.barbeiroId} />;
      case 5:
        return <StepServicos tenantId={null} />;
      case 6:
        return <StepBoasVindas nome={sobreVoce.nome_completo.split(" ")[0] || barberContext.apelido} />;
      default:
        return null;
    }
  };

  const isLastStep = step === TOTAL_STEPS - 1;
  const isFirstStep = step === 0;

  const getButtonLabel = () => {
    if (saving) return "Finalizando...";
    if (isLastStep) return "Acessar meu painel";
    return "Continuar";
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Barra de progresso */}
      <SetupStepIndicator currentStep={step} totalSteps={TOTAL_STEPS} />

      {/* Seta de voltar */}
      <div className="px-5 pt-5">
        {!isFirstStep ? (
          <button
            onClick={goBack}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all -ml-1 mt-0.5"
            aria-label="Voltar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a4 4 0 0 1 4 4v1" />
            </svg>
          </button>
        ) : (
          <div className="h-10" />
        )}
      </div>

      {/* Content com animação */}
      <div className="flex-1 px-6 pt-2 pb-6 overflow-y-auto">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer — botão fixo */}
      <div className="px-6 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <button
          onClick={goNext}
          disabled={saving}
          className={cn(
            "w-full h-[52px] rounded-2xl text-[15px] font-semibold flex items-center justify-center gap-2",
            "transition-all duration-200 active:scale-[0.98]",
            "bg-foreground text-background",
            "hover:opacity-90",
            saving && "opacity-60 cursor-not-allowed"
          )}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {getButtonLabel()}
        </button>
      </div>
    </div>
  );
}

/* ═══ Sobre Você simplificado para barbeiro convidado ═══ */
import { formatPhone } from "@/lib/validators";

function InvitedSobreVoce({
  data,
  onChange,
  errors,
}: {
  data: SobreVoceData;
  onChange: (data: SobreVoceData) => void;
  errors: Partial<Record<keyof SobreVoceData, string>>;
}) {
  const update = (field: keyof SobreVoceData, value: string) => {
    let formatted = value;
    if (field === "telefone") formatted = formatPhone(value);
    onChange({ ...data, [field]: formatted });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[26px] font-bold text-foreground leading-tight tracking-tight">
          Bem-vindo à equipe! 👋
        </h2>
        <p className="text-[14px] text-foreground/90 mt-1.5">
          Complete seus dados para começar a receber agendamentos.
        </p>
      </div>

      <div className="space-y-5">
        <InvitedOutlinedField
          label="Nome e Sobrenome"
          value={data.nome_completo}
          onChange={(v) => update("nome_completo", v)}
          error={errors.nome_completo}
        />

        <InvitedPhoneField
          label="Seu número de telefone"
          value={data.telefone}
          onChange={(v) => update("telefone", v)}
          error={errors.telefone}
        />
      </div>
    </div>
  );
}

/* ═══ Outlined Field reutilizado ═══ */
function InvitedOutlinedField({
  label, value, onChange, error,
}: {
  label: string; value: string; onChange: (v: string) => void; error?: string;
}) {
  const hasValue = !!value?.trim();
  return (
    <div>
      <fieldset className={cn(
        "relative rounded-xl border transition-colors duration-200 px-3.5",
        error ? "border-destructive/50 focus-within:border-destructive" : "border-border focus-within:border-foreground"
      )}>
        <legend className={cn(
          "transition-all duration-200 text-muted-foreground px-1",
          hasValue ? "text-[11px] ml-0.5" : "text-[0px] ml-0 px-0"
        )}>
          {hasValue ? label : ""}
        </legend>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          className={cn(
            "w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground",
            hasValue ? "h-10 pb-2.5" : "h-14 py-4"
          )}
        />
      </fieldset>
      {error && <p className="text-[11px] text-destructive mt-1 ml-1">{error}</p>}
    </div>
  );
}

/* ═══ Phone Field reutilizado ═══ */
import { useState as useStateImport } from "react";

function InvitedPhoneField({
  label, value, onChange, error,
}: {
  label: string; value: string; onChange: (v: string) => void; error?: string;
}) {
  const [showCodes, setShowCodes] = useStateImport(false);
  const [countryCode, setCountryCode] = useStateImport("+55");
  const hasValue = !!value?.trim();

  const COUNTRY_CODES = [
    { code: "+55", country: "BR", flag: "🇧🇷" },
    { code: "+1", country: "US", flag: "🇺🇸" },
    { code: "+351", country: "PT", flag: "🇵🇹" },
  ];

  return (
    <div className="relative">
      <fieldset className={cn(
        "relative rounded-xl border transition-colors duration-200 px-3.5 flex items-center",
        error ? "border-destructive/50 focus-within:border-destructive" : "border-border focus-within:border-foreground"
      )}>
        <legend className={cn(
          "transition-all duration-200 text-muted-foreground px-1",
          hasValue ? "text-[11px] ml-0.5" : "text-[0px] ml-0 px-0"
        )}>
          {hasValue ? label : ""}
        </legend>
        <button
          type="button"
          onClick={() => setShowCodes(!showCodes)}
          className={cn(
            "flex items-center gap-1 pr-3 mr-3 border-r border-border text-foreground shrink-0",
            "hover:text-foreground/80 transition-colors",
            hasValue ? "pb-2.5" : "py-0"
          )}
        >
          <span className="text-[14px] font-medium">{countryCode}</span>
          <svg className={cn("w-3 h-3 text-muted-foreground transition-transform", showCodes && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="tel"
          maxLength={15}
          placeholder={hasValue ? "" : label}
          className={cn(
            "flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground",
            hasValue ? "h-10 pb-2.5" : "h-14 py-4"
          )}
        />
      </fieldset>

      {showCodes && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-border bg-card shadow-xl max-h-60 overflow-y-auto">
          {COUNTRY_CODES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => { setCountryCode(c.code); setShowCodes(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors",
                countryCode === c.code && "bg-muted/10"
              )}
            >
              <span className="text-lg">{c.flag}</span>
              <span className="text-[13px] text-foreground font-medium">{c.country}</span>
              <span className="text-[13px] text-muted-foreground ml-auto">{c.code}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-[11px] text-destructive mt-1 ml-1">{error}</p>}
    </div>
  );
}
