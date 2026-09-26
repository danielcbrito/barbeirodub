import { useState } from "react";
import { Building2, Store, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type ApplyScope = "single" | "all";

interface ApplyHorariosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: ApplyScope) => void;
  saving: boolean;
}

/**
 * Modal de escopo ao salvar horários via Configurações da Empresa.
 * Pergunta se a alteração deve ser aplicada apenas à unidade atual
 * ou propagada para todas as unidades do tenant.
 */
export function ApplyHorariosDialog({
  open,
  onOpenChange,
  onConfirm,
  saving,
}: ApplyHorariosDialogProps) {
  const [selected, setSelected] = useState<ApplyScope>("single");

  const handleConfirm = () => {
    onConfirm(selected);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold">
            Aplicar alteração de horários
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            Deseja aplicar esta configuração de horários para qual escopo?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          {/* Opção 1: Apenas esta unidade */}
          <button
            type="button"
            onClick={() => setSelected("single")}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
              selected === "single"
                ? "border-primary bg-primary/5"
                : "border-border/30 hover:border-border/60"
            }`}
          >
            <Store className={`h-5 w-5 shrink-0 ${selected === "single" ? "text-primary" : "text-muted-foreground"}`} />
            <div>
              <p className="text-sm font-semibold text-foreground">Apenas esta barbearia</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Altera somente os horários da unidade atual
              </p>
            </div>
          </button>

          {/* Opção 2: Todas as unidades */}
          <button
            type="button"
            onClick={() => setSelected("all")}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
              selected === "all"
                ? "border-primary bg-primary/5"
                : "border-border/30 hover:border-border/60"
            }`}
          >
            <Building2 className={`h-5 w-5 shrink-0 ${selected === "all" ? "text-primary" : "text-muted-foreground"}`} />
            <div>
              <p className="text-sm font-semibold text-foreground">Todas as unidades</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Aplica os mesmos horários para todas as barbearias
              </p>
            </div>
          </button>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleConfirm}
            disabled={saving}
            className="w-full h-[48px] rounded-xl font-semibold"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Aplicando...
              </>
            ) : (
              "Confirmar"
            )}
          </Button>
          <AlertDialogCancel
            disabled={saving}
            className="w-full mt-0 rounded-xl"
          >
            Cancelar
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
