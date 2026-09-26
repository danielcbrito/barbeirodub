import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, AlertCircle, Activity, Settings } from "lucide-react";
import { AdminSuporteTickets } from "./AdminSuporteTickets";
import { AdminSuporteTicketsPendentes } from "./AdminSuporteTicketsPendentes";
import { AdminSuporteLogsIA } from "./AdminSuporteLogsIA";
import { AdminSuporteConfig } from "./AdminSuporteConfig";

export function AdminSuportePanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Suporte & IA</h2>
        <p className="text-muted-foreground mt-2">
          Gerencie tickets, monitore ações da IA e configure comportamentos
        </p>
      </div>

      <Tabs defaultValue="tickets" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-card/50 backdrop-blur-xl">
          <TabsTrigger value="tickets" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Tickets
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Pendentes
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Logs da IA
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-4 mt-6">
          <AdminSuporteTickets />
        </TabsContent>

        <TabsContent value="pending" className="space-y-4 mt-6">
          <AdminSuporteTicketsPendentes />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4 mt-6">
          <AdminSuporteLogsIA />
        </TabsContent>

        <TabsContent value="config" className="space-y-4 mt-6">
          <AdminSuporteConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}