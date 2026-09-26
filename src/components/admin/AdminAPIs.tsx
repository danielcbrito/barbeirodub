import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Key, Webhook, Mail, MessageSquare, Bell } from "lucide-react";
import { toast } from "sonner";
import { AdminWebhook } from "./AdminWebhook";

export function AdminAPIs() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-wide mb-2">APIs & Integrações</h1>
        <p className="text-muted-foreground text-sm">
          Configure chaves de API e integrações externas
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="webhooks" className="w-full">
        <TabsList className="bg-secondary/50 border border-border/50">
          <TabsTrigger value="webhooks">Webhook</TabsTrigger>
          <TabsTrigger value="payment">Pagamentos</TabsTrigger>
          <TabsTrigger value="communication">Comunicação</TabsTrigger>
        </TabsList>

        {/* Webhooks - Usando componente dedicado */}
        <TabsContent value="webhooks" className="space-y-6 mt-6">
          <AdminWebhook />
        </TabsContent>

        {/* Payment APIs */}
        <TabsContent value="payment" className="space-y-6 mt-6">
          <Card className="card-glass p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow-red">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Asaas</h3>
                <p className="text-xs text-muted-foreground">Gateway de pagamento</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="asaas-api-key">API Key</Label>
                <Input
                  id="asaas-api-key"
                  type="password"
                  placeholder="••••••••••••••••"
                  className="input-premium mt-2"
                />
              </div>

              <div>
                <Label htmlFor="asaas-webhook-secret">Webhook Secret</Label>
                <Input
                  id="asaas-webhook-secret"
                  type="password"
                  placeholder="••••••••••••••••"
                  className="input-premium mt-2"
                />
              </div>

              <Button className="bg-gradient-primary shadow-glow-red hover:scale-[1.02] transition-all">
                Salvar Configurações
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* Communication APIs */}
        <TabsContent value="communication" className="space-y-6 mt-6">
          <Card className="card-glass p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-gold flex items-center justify-center shadow-glow-gold">
                <Mail className="w-6 h-6 text-gold-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">SMTP / Email</h3>
                <p className="text-xs text-muted-foreground">Configuração de envio de emails</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="smtp-host">Host SMTP</Label>
                <Input
                  id="smtp-host"
                  placeholder="smtp.exemplo.com"
                  className="input-premium mt-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="smtp-port">Porta</Label>
                  <Input
                    id="smtp-port"
                    placeholder="587"
                    className="input-premium mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-user">Usuário</Label>
                  <Input
                    id="smtp-user"
                    placeholder="email@exemplo.com"
                    className="input-premium mt-2"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="smtp-password">Senha</Label>
                <Input
                  id="smtp-password"
                  type="password"
                  placeholder="••••••••"
                  className="input-premium mt-2"
                />
              </div>

              <Button className="bg-gradient-gold shadow-glow-gold hover:scale-[1.02] transition-all">
                Salvar Configurações
              </Button>
            </div>
          </Card>

          <Card className="card-glass p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow-red">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">SMS</h3>
                <p className="text-xs text-muted-foreground">Notificações por SMS</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="sms-provider">Provedor</Label>
                <Input
                  id="sms-provider"
                  placeholder="Twilio, Zenvia, etc."
                  className="input-premium mt-2"
                />
              </div>

              <div>
                <Label htmlFor="sms-api-key">API Key</Label>
                <Input
                  id="sms-api-key"
                  type="password"
                  placeholder="••••••••••••••••"
                  className="input-premium mt-2"
                />
              </div>

              <Button className="bg-gradient-primary shadow-glow-red hover:scale-[1.02] transition-all">
                Salvar Configurações
              </Button>
            </div>
          </Card>

          <Card className="card-glass p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-titanium flex items-center justify-center">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Push Notifications</h3>
                <p className="text-xs text-muted-foreground">Notificações push para mobile</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="push-provider">Provedor</Label>
                <Input
                  id="push-provider"
                  placeholder="Firebase, OneSignal, etc."
                  className="input-premium mt-2"
                />
              </div>

              <div>
                <Label htmlFor="push-server-key">Server Key</Label>
                <Input
                  id="push-server-key"
                  type="password"
                  placeholder="••••••••••••••••"
                  className="input-premium mt-2"
                />
              </div>

              <Button className="bg-gradient-titanium hover:scale-[1.02] transition-all">
                Salvar Configurações
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}