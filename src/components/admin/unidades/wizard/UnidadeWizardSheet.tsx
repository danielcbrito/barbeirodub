import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useCriarUnidade } from "@/hooks/useAdminMutations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { SetupStepIndicator } from "@/components/barber/setup/SetupStepIndicator";
import { WizardStepDados, type UnidadeDados } from "./WizardStepDados";
import { WizardStepEndereco, type UnidadeEndereco } from "./WizardStepEndereco";
import { WizardStepHorarios, type UnidadeHorarios, getDefaultHorarios } from "./WizardStepHorarios";
import { WizardStepBarbeiros } from "./WizardStepBarbeiros";

const TOTAL_STEPS = 4;

interface UnidadeWizardSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  onSaved: () => void;
}

/**
 * Wizard full-screen de criação de nova unidade — 4 etapas.
 * Design idêntico ao BarberSetupScreen:
 * barra de progresso verde, seta de voltar, conteúdo animado, botão preto fixo.
 */
export function UnidadeWizardSheet({ open, onOpenChange, tenantId, onSaved }: UnidadeWizardSheetProps) {
  const criarUnidade = useCriarUnidade(tenantId || "");
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isInSubScreen, setIsInSubScreen] = useState(false);

  // Step data
  const [dados, setDados] = useState<UnidadeDados>({
    nome: "", slogan: "", email: "", telefone: "", whatsapp: "", site: "",
  });
  const [endereco, setEndereco] = useState<UnidadeEndereco>({
    cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  });
  const [horarios, setHorarios] = useState<UnidadeHorarios>(getDefaultHorarios());
  const [selectedBarberIds, setSelectedBarberIds] = useState<string[]>([]);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setStep(0);
      setDirection(1);
      setDados({ nome: "", slogan: "", email: "", telefone: "", whatsapp: "", site: "" });
      setEndereco({ cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "" });
      setHorarios(getDefaultHorarios());
      setSelectedBarberIds([]);
    }
  }, [open]);

  /* ═══ Validação por step ═══ */
  const validateStep = (): boolean => {
    switch (step) {
      case 0:
        if (!dados.nome.trim()) {
          toast.error("Nome da unidade é obrigatório");
          return false;
        }
        return true;
      case 1:
        if (!endereco.cidade.trim() || !endereco.estado.trim()) {
          toast.error("Cidade e estado são obrigatórios");
          return false;
        }
        return true;
      case 2: // Horários — sempre válido
        return true;
      case 3: // Barbeiros — sempre válido
        return true;
      default:
        return true;
    }
  };

  /* ═══ Navegação ═══ */
  const goNext = async () => {
    if (!validateStep()) return;

    if (step === TOTAL_STEPS - 1) {
      await handleFinish();
      return;
    }

    setDirection(1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const goBack = () => {
    if (step === 0) {
      onOpenChange(false);
      return;
    }
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  /* ═══ Finalizar criação ═══ */
  const handleFinish = () => {
    if (!tenantId) return;

    criarUnidade.mutate(
      {
        tenantId,
        nome: dados.nome,
        slogan: dados.slogan,
        email: dados.email,
        telefone: dados.telefone,
        whatsapp: dados.whatsapp,
        site: dados.site,
        cep: endereco.cep,
        rua: endereco.rua,
        numero: endereco.numero,
        complemento: endereco.complemento,
        bairro: endereco.bairro,
        cidade: endereco.cidade,
        estado: endereco.estado,
        barbeiroIds: selectedBarberIds,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSaved();
        },
      }
    );
  };

  /* ═══ Botão label ═══ */
  const getButtonLabel = () => {
    if (criarUnidade.isPending) return "Criando...";
    if (step === TOTAL_STEPS - 1) return "Criar unidade";
    return "Continuar";
  };

  /* ═══ Render step content ═══ */
  const renderStep = () => {
    switch (step) {
      case 0:
        return <WizardStepDados data={dados} onChange={setDados} tenantId={tenantId} />;
      case 1:
        return <WizardStepEndereco data={endereco} onChange={setEndereco} />;
      case 2:
        return <WizardStepHorarios data={horarios} onChange={setHorarios} onSubScreenChange={setIsInSubScreen} />;
      case 3:
        return tenantId ? (
          <WizardStepBarbeiros
            tenantId={tenantId}
            selectedBarberIds={selectedBarberIds}
            onChange={setSelectedBarberIds}
          />
        ) : null;
      default:
        return null;
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col pt-[env(safe-area-inset-top)]">
      {!isInSubScreen && <SetupStepIndicator currentStep={step} totalSteps={TOTAL_STEPS} />}

      {!isInSubScreen && (
        <div className="px-5 pt-5">
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
        </div>
      )}

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

      {!isInSubScreen && (
        <div className="px-6 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <button
            onClick={goNext}
            disabled={criarUnidade.isPending}
            className={cn(
              "w-full h-[52px] rounded-2xl text-[15px] font-semibold flex items-center justify-center gap-2",
              "transition-all duration-200 active:scale-[0.98]",
              "bg-foreground text-background",
              "hover:opacity-90",
              criarUnidade.isPending && "opacity-60 cursor-not-allowed"
            )}
          >
            {criarUnidade.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {getButtonLabel()}
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
