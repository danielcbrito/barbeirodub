import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";

interface Promocao {
  id: string;
  nome: string;
  descricao: string | null;
  pontos_necessarios: number;
  ativo: boolean;
  weekly_required: boolean;
}

interface EditPromotionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promocao: Promocao | null;
  onSuccess: () => void;
  tenantId?: string | null;
}

export function EditPromotionModal({ open, onOpenChange, promocao, onSuccess, tenantId }: EditPromotionModalProps) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [pontosNecessarios, setPontosNecessarios] = useState(5);
  const [weeklyRequired, setWeeklyRequired] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (promocao) {
      setNome(promocao.nome);
      setDescricao(promocao.descricao || "");
      setPontosNecessarios(promocao.pontos_necessarios);
      setWeeklyRequired(promocao.weekly_required);
    }
  }, [promocao]);

  const updateMutation = useMutation({
    mutationFn: async (payload: { nome: string; descricao: string | null; pontos_necessarios: number; weekly_required: boolean }) => {
      if (!promocao) throw new Error("Promoção não encontrada");
      const { error } = await supabase
        .from("promocoes")
        .update(payload)
        .eq("id", promocao.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Promoção atualizada com sucesso! As alterações já estão visíveis para os clientes.");
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      console.error("Error updating promotion:", error);
      toast.error(error.message || "Erro ao atualizar promoção");
    },
  });

  const handleSave = () => {
    if (!promocao) return;
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (pontosNecessarios < 1) {
      toast.error("Pontos necessários deve ser no mínimo 1");
      return;
    }

    updateMutation.mutate({
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      pontos_necessarios: pontosNecessarios,
      weekly_required: weeklyRequired,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="card-glass border-border-glow max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-wide">
            Editar Promoção
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Alterações nos pontos serão refletidas em tempo real no app do cliente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Nome */}
          <div>
            <Label htmlFor="edit-nome" className="text-sm font-bold tracking-wide uppercase text-muted-foreground">
              Nome da Promoção
            </Label>
            <Input
              id="edit-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Corte Grátis"
              className="input-premium mt-2"
            />
          </div>

          {/* Descrição */}
          <div>
            <Label htmlFor="edit-descricao" className="text-sm font-bold tracking-wide uppercase text-muted-foreground">
              Descrição
            </Label>
            <Textarea
              id="edit-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva a promoção..."
              className="input-premium mt-2"
              rows={3}
            />
          </div>

          {/* Pontos Necessários */}
          <div>
            <Label htmlFor="edit-pontos" className="text-sm font-bold tracking-wide uppercase text-muted-foreground">
              Pontos Necessários para Resgate
            </Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              Quantidade de cortes pagos que o cliente precisa fazer para ganhar 1 grátis
            </p>
            <Input
              id="edit-pontos"
              type="number"
              min={1}
              value={pontosNecessarios}
              onChange={(e) => setPontosNecessarios(Number(e.target.value))}
              className="input-premium"
            />
          </div>

          {/* Weekly Required */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50">
            <div>
              <p className="text-sm font-semibold">Requer frequência semanal</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cliente precisa manter frequência semanal para acumular pontos
              </p>
            </div>
            <Switch
              checked={weeklyRequired}
              onCheckedChange={setWeeklyRequired}
            />
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !nome.trim()}
            className="w-full gap-3 h-12 text-base font-bold tracking-wide bg-foreground text-background hover:bg-foreground/90"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                SALVAR ALTERAÇÕES
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
