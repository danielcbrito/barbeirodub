import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function AdminRelatorios() {
  const [generating, setGenerating] = useState(false);

  const handleGenerateAIReport = () => {
    setGenerating(true);
    // TODO: Implement OpenAI integration for reports
    toast.info("Funcionalidade de IA em desenvolvimento");
    setTimeout(() => setGenerating(false), 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Relatórios com IA</h1>
        <Button onClick={handleGenerateAIReport} disabled={generating}>
          <Sparkles className="w-4 h-4 mr-2" />
          Gerar Relatório com IA
        </Button>
      </div>

      <Card className="p-6 card-premium">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-6 h-6 text-primary" />
          <h3 className="font-semibold text-lg">Análises Inteligentes</h3>
        </div>
        <p className="text-muted-foreground">
          Sistema de relatórios com IA em desenvolvimento. Em breve a inteligência artificial irá:
        </p>
        <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
          <li>Analisar padrões de comportamento dos clientes</li>
          <li>Identificar horários mais rentáveis</li>
          <li>Sugerir estratégias de crescimento</li>
          <li>Prever demanda futura</li>
          <li>Recomendar promoções personalizadas</li>
          <li>Gerar insights sobre retenção de clientes</li>
        </ul>
      </Card>
    </div>
  );
}
