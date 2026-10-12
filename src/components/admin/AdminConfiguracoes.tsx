import { Settings, MessageSquare, Webhook, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminMensagens } from "./AdminMensagens";
import { AdminWebhook } from "./AdminWebhook";
import { AdminManutencao } from "./AdminManutencao";

export function AdminConfiguracoes() {
  const handleGoogleCalendarInfo = () => {
    toast.info(
      "As credenciais do Google Calendar foram configuradas com sucesso. " +
      "Para atualizá-las, entre em contato com o suporte técnico.",
      { duration: 5000 }
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Tabs defaultValue="maintenance" className="w-full">
        <TabsList className="grid w-full grid-cols-4 card-glass">
          <TabsTrigger value="maintenance" className="flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            <span className="sm:hidden">Manut.</span>
            <span className="hidden sm:inline">Manutenção</span>
          </TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
          <TabsTrigger value="messages">Mensagens</TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance">
          <AdminManutencao />
        </TabsContent>

        <TabsContent value="integrations">
          <Card className="p-6 card-glass">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="w-6 h-6 text-primary" />
              <h3 className="font-semibold text-lg">Integrações</h3>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-sm mb-2">📅 Google Calendar</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Sincronize automaticamente os agendamentos com o Google Calendar.
                </p>
                <button
                  onClick={handleGoogleCalendarInfo}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
                >
                  Ver Status da Integração
                </button>
              </div>

              <div>
                <h4 className="font-semibold text-sm mb-2">⚙️ Configurações Avançadas</h4>
                <p className="text-xs text-muted-foreground">
                  Para alterar credenciais ou configurações técnicas avançadas, entre em contato com o suporte.
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="webhook">
          <AdminWebhook />
        </TabsContent>

        <TabsContent value="messages">
          <AdminMensagens />
        </TabsContent>
      </Tabs>
    </div>
  );
}
