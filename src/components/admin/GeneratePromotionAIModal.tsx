import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCriarPromocao } from "@/hooks/useAdminMutations";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface GeneratePromotionAIModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Proposta {
  titulo: string;
  descricao: string;
  desconto_percentual: number;
  regras: string[];
  data_inicio: string;
  data_fim: string;
  texto_divulgacao_curto: string;
  texto_divulgacao_longo: string;
  tags: string[];
}

export function GeneratePromotionAIModal({ open, onOpenChange, onSuccess }: GeneratePromotionAIModalProps) {
  const [servico, setServico] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [duracaoMaximaDias, setDuracaoMaximaDias] = useState(30);
  const [loading, setLoading] = useState(false);
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [selectedProposta, setSelectedProposta] = useState<number | null>(null);

  // Mutation para criar promoção
  const criarPromocao = useCriarPromocao(null);

  const handleGenerate = async () => {
    setLoading(true);
    setPropostas([]);
    setSelectedProposta(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-promotion-ai", {
        body: { servico, objetivo, duracaoMaximaDias },
      });

      if (error) throw error;

      if (data?.propostas) {
        setPropostas(data.propostas);
        toast.success("Promoções geradas com sucesso!");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro ao gerar promoções");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (selectedProposta === null) {
      toast.error("Selecione uma proposta");
      return;
    }

    const proposta = propostas[selectedProposta];
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Não autenticado");

      criarPromocao.mutate(
        {
          nome: proposta.titulo,
          descricao: proposta.descricao,
          pontos_necessarios: 0,
          ativo: true,
          gerada_por_ia: true,
          prompt_ia: JSON.stringify({ servico, objetivo, duracaoMaximaDias }),
          data_inicio: proposta.data_inicio,
          data_fim: proposta.data_fim,
          regras_json: proposta as any,
          aprovada_por: session.session.user.id,
          aprovada_em: new Date().toISOString(),
        },
        {
          onSuccess: () => {
            onSuccess();
            onOpenChange(false);
            // Reset
            setPropostas([]);
            setSelectedProposta(null);
            setServico("");
            setObjetivo("");
            setDuracaoMaximaDias(30);
          },
        }
      );
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro ao criar promoção");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto card-glass border-border-glow">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-2xl tracking-wide">
            <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow-red">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            Gerar Promoção com IA
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-2 tracking-wide">
            Preencha os detalhes e deixe a IA criar 3 propostas de promoções premium personalizadas
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-8 mt-6">
          {/* Form Premium */}
          <div className="grid gap-6 p-6 rounded-xl bg-secondary/30 border border-border/50">
            <div>
              <Label htmlFor="servico" className="text-sm font-bold tracking-wide uppercase text-muted-foreground">
                Serviço Alvo
              </Label>
              <Input
                id="servico"
                placeholder="Ex: Corte + Barba Premium"
                value={servico}
                onChange={(e) => setServico(e.target.value)}
                className="input-premium mt-2"
              />
            </div>

            <div>
              <Label htmlFor="objetivo" className="text-sm font-bold tracking-wide uppercase text-muted-foreground">
                Objetivo da Promoção *
              </Label>
              <Input
                id="objetivo"
                placeholder="Ex: Aumentar vendas às segundas-feiras"
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
                className="input-premium mt-2"
              />
            </div>

            <div>
              <Label htmlFor="duracao" className="text-sm font-bold tracking-wide uppercase text-muted-foreground">
                Duração Máxima (dias)
              </Label>
              <Input
                id="duracao"
                type="number"
                value={duracaoMaximaDias}
                onChange={(e) => setDuracaoMaximaDias(Number(e.target.value))}
                className="input-premium mt-2"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !objetivo}
              className="w-full gap-3 h-14 text-base font-bold tracking-wide bg-foreground text-background hover:bg-foreground/90"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Gerando propostas premium...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  GERAR PROPOSTAS COM IA
                </>
              )}
            </Button>
          </div>

          {/* Propostas Premium */}
          {propostas.length > 0 && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="font-bold text-2xl tracking-widest mb-2">ESCOLHA SUA PROPOSTA</h3>
                <p className="text-muted-foreground text-sm tracking-wide">Clique na proposta desejada para selecioná-la</p>
              </div>
              
              <div className="grid gap-6 md:grid-cols-3">
                {propostas.map((proposta, index) => (
                  <div
                    key={index}
                    className={`card-glass p-6 cursor-pointer hover-elevate transition-all ${
                      selectedProposta === index
                        ? "ring-2 ring-primary shadow-glow-red bg-primary/10"
                        : ""
                    }`}
                    onClick={() => setSelectedProposta(index)}
                  >
                    <div className="space-y-4">
                      <div className="relative">
                        <div className="absolute -top-3 -right-3">
                          <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center shadow-glow-red font-bold text-xl">
                            {proposta.desconto_percentual}%
                          </div>
                        </div>
                        <h4 className="font-bold text-lg tracking-wide text-primary pr-14">{proposta.titulo}</h4>
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                          {proposta.descricao}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground tracking-wide">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {new Date(proposta.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - 
                          {new Date(proposta.data_fim).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>

                      <div className="border-t border-border/50 pt-4">
                        <p className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-2">Regras</p>
                        <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
                          {proposta.regras.slice(0, 3).map((regra, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-primary mt-0.5">•</span>
                              <span>{regra}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {proposta.tags?.slice(0, 3).map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-xs font-semibold tracking-wide bg-secondary/50 border-border/30">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleApprove}
                disabled={selectedProposta === null}
                className="w-full gap-3 h-16 text-lg font-bold tracking-widest bg-foreground text-background hover:bg-foreground/90"
              >
                <Sparkles className="w-6 h-6" />
                APROVAR E PUBLICAR PROMOÇÃO
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
