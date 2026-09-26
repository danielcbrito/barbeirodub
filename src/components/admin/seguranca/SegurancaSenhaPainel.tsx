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
 * Sub-tela: Alterar senha do painel (Supabase Auth).
 * Re-autenticação obrigatória com senha atual.
 */
export function SegurancaSenhaPainel({ basePath = "/admin" }: Props) {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const hasChanges = current.length > 0 || newPwd.length > 0 || confirm.length > 0;
  const mismatch = confirm.length > 0 && newPwd !== confirm;
  const canSave = current && newPwd.length >= 6 && newPwd === confirm && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.email) {
        toast.error("Não foi possível verificar o usuário");
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: current,
      });
      if (signInErr) {
        toast.error("Senha atual incorreta");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) {
        if (error.message?.includes("same_password")) {
          toast.error("A nova senha deve ser diferente da atual");
        } else {
          toast.error("Erro ao alterar senha: " + error.message);
        }
        return;
      }

      toast.success("Senha alterada com sucesso");
      navigate(`${basePath}/seguranca`);
    } catch {
      toast.error("Erro inesperado ao alterar senha");
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
          <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">Senha do Painel</h1>
          <button
            onClick={() => setShow(!show)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
            aria-label={show ? "Ocultar senhas" : "Mostrar senhas"}
          >
            {show ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="px-4 pt-5 space-y-4">
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
          Altere a senha de acesso ao painel administrativo. Você precisará confirmar a senha atual por segurança.
        </p>

        <PwdField label="Senha Atual" value={current} onChange={setCurrent} show={show} placeholder="Digite a senha atual" required />
        <PwdField label="Nova Senha" value={newPwd} onChange={setNewPwd} show={show} placeholder="Mínimo 6 caracteres" required />
        <PwdField label="Confirmar Nova Senha" value={confirm} onChange={setConfirm} show={show} placeholder="Digite novamente" required />

        {mismatch && (
          <p className="text-[10px] text-destructive font-medium">As senhas não coincidem</p>
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
          Alterar Senha
        </button>
      </div>
    </div>
  );
}

/* ═══ Campo de senha reutilizável ═══ */
function PwdField({
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || label}
        className="h-9 bg-muted/30 border-border/30 text-[13px] text-foreground placeholder:text-muted-foreground/40 rounded-lg focus:border-border/50 focus:ring-0"
      />
    </div>
  );
}
