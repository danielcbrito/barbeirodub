import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, BarChart3 } from "lucide-react";
import { toast } from "sonner";

export function AdminRelatorios() {
  const [generating, setGenerating] = useState(false);

  const handleGenerateReport = () => {
    setGenerating(true);
    toast.info("Geração de relatório em processamento...");
    setTimeout(() => setGenerating(false), 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Relatórios Estratégicos</h1>
        <Button onClick={handleGenerateReport} disabled={generating} className="rounded-xl font-medium">
          <BarChart3 className="w-4 h-4 mr-2" />
          Gerar Diagnóstico
        </Button>
      </div>

      <Card className="p-6 bg-card border border-border/80">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-5 h-5 text-foreground" />
          <h3 className="font-bold text-lg text-foreground">Diagnóstico e Indicadores</h3>
        </div>
        <p className="text-muted-foreground text-sm">
          Módulo de consolidação de métricas operacionais e financeiras:
        </p>
        <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2 text-sm">
          <li>Analisar padrões de comportamento dos clientes</li>
          <li>Identificar horários mais rentáveis</li>
          <li>Sugerir estratégias de crescimento e ocupação</li>
          <li>Prever demanda futura por serviço</li>
          <li>Recomendar promoções segmentadas</li>
          <li>Gerar métricas de retenção e LTV</li>
        </ul>
      </Card>
    </div>
  );
}
