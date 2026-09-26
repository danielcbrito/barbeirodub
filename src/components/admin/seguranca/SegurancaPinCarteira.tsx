import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  basePath?: string;
}

/**
 * Sub-tela: Alterar PIN financeiro (4 dígitos, tabela pin_financeiro).
 * Se já existir PIN, exige o atual para alteração.
 */
export function SegurancaPinCarteira({ basePath = "/admin" }: Props) {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [current, setCurrent] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const sanitize = (v: string) => v.replace(/\D/g, "").slice(0, 4);
  const hasChanges = current.length > 0 || newPin.length > 0 || confirm.length > 0;
  const mismatch = confirm.length > 0 && newPin !== confirm;
  const canSave = newPin.length === 4 && newPin === confirm && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Toda validação e escrita acontecem no servidor via SECURITY DEFINER.
      const { error, data } = await supabase.rpc("set_financial_pin", {
        p_new_pin: newPin,
        p_current_pin: current || null,
      });

      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("current_pin_required")) toast.error("Digite o PIN atual");
        else if (msg.includes("current_pin_invalid")) toast.error("PIN atual incorreto");
        else if (msg.includes("invalid_pin_format")) toast.error("PIN deve ter 4 dígitos");
        else if (msg.includes("not_authenticated")) toast.error("Usuário não autenticado");
        else toast.error("Erro ao salvar PIN");
        return;
      }

      toast.success(data ? "PIN salvo com sucesso" : "PIN atualizado");
      navigate(`${basePath}/seguranca`);
    } catch {
      toast.error("Erro inesperado ao alterar PIN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-28 -mx-3 -mt-3">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="flex items-center gap-2.5 px-4 h-14">
          <button
            onClick={() => navigate(`${basePath}/seguranca`)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
            aria-label="Voltar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a4 4 0 0 1 4 4v1" />
            </svg>
          </button>
          <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">PIN da Carteira</h1>
          <button
            onClick={() => setShow(!show)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
            aria-label={show ? "Ocultar" : "Mostrar"}
          >
            {show ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="px-4 pt-5 space-y-4">
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
          O PIN de 4 dígitos protege o acesso à carteira financeira. Se já possui um PIN cadastrado, informe o atual para alterá-lo.
        </p>

        <PinField label="PIN Atual" value={current} onChange={(v) => setCurrent(sanitize(v))} show={show} placeholder="PIN atual (se configurado)" />
        <PinField label="Novo PIN" value={newPin} onChange={(v) => setNewPin(sanitize(v))} show={show} placeholder="4 dígitos" required />
        <PinField label="Confirmar Novo PIN" value={confirm} onChange={(v) => setConfirm(sanitize(v))} show={show} placeholder="Digite novamente" required />

        {mismatch && (
          <p className="text-[10px] text-destructive font-medium">Os PINs não coincidem</p>
        )}
      </div>

      {/* Botão salvar fixo — sempre visível, colado embaixo */}
      <div className="fixed bottom-4 left-0 right-0 px-5 z-30" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={cn(
            "w-full h-11 rounded-xl text-[13px] font-semibold tracking-wide flex items-center justify-center gap-2",
            "bg-foreground text-background",
            "active:scale-[0.98] transition-all duration-300",
            "shadow-lg shadow-background/50",
            canSave
              ? "opacity-100 hover:bg-foreground/90"
              : "opacity-30 pointer-events-none"
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar PIN
        </button>
      </div>
    </div>
  );
}

/* ═══ Campo de PIN ═══ */
function PinField({
  label, value, onChange, show, placeholder, required = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  show: boolean; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="text-[9px] text-muted-foreground/60 uppercase tracking-[0.1em] font-medium block mb-1">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <Input
        type={show ? "text" : "password"}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || label}
        maxLength={4}
        className="h-9 bg-muted/30 border-border/30 text-[13px] text-foreground placeholder:text-muted-foreground/40 rounded-lg focus:border-border/50 focus:ring-0 tracking-[0.3em] text-center"
      />
    </div>
  );
}
