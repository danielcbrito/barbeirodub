import { useState, useEffect } from "react";
import { Activity, Database, AlertCircle, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface HealthCheck {
  service_name: string;
  status: "healthy" | "degraded" | "down";
  last_check_at: string;
  error_message?: string;
  response_time_ms?: number;
}

interface SystemLog {
  id: string;
  level: string;
  category: string;
  message: string;
  details?: any;
  created_at: string;
}

export function AdminDev() {
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadHealthChecks();
    loadLogs();
  }, []);

  const loadHealthChecks = async () => {
    const { data, error } = await supabase
      .from("system_health_checks")
      .select("service_name, status, last_check_at, error_message, response_time_ms")
      .order("last_check_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setHealthChecks(data as HealthCheck[]);
    }
  };

  const loadLogs = async () => {
    const { data, error } = await supabase
      .from("system_logs")
      .select("id, level, category, message, details, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setLogs(data);
    }
  };

  const runHealthCheck = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("health-check");
      
      if (error) throw error;
      
      toast.success("Health check executado");
      loadHealthChecks();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao executar health check");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "degraded":
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case "down":
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getLevelBadge = (level: string) => {
    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      info: "default",
      warning: "secondary",
      error: "destructive",
      critical: "destructive",
    };
    return <Badge variant={variants[level] || "default"}>{level}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Painel DEV</h1>
        <Button onClick={runHealthCheck} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar Health Checks
        </Button>
      </div>

      <Tabs defaultValue="health" className="w-full">
        <TabsList className="grid w-full grid-cols-2 card-glass">
          <TabsTrigger value="health">Status das Integrações</TabsTrigger>
          <TabsTrigger value="logs">Logs do Sistema</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {healthChecks.map((check) => (
              <Card key={check.service_name} className="p-6 card-glass">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(check.status)}
                    <div>
                      <p className="font-semibold capitalize">
                        {check.service_name.replace("_", " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(check.last_check_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <Badge variant={check.status === "healthy" ? "default" : "destructive"}>
                    {check.status}
                  </Badge>
                </div>
                
                {check.response_time_ms && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Tempo de resposta: {check.response_time_ms}ms
                  </p>
                )}
                
                {check.error_message && (
                  <p className="mt-2 text-xs text-destructive">
                    {check.error_message}
                  </p>
                )}
              </Card>
            ))}

            {healthChecks.length === 0 && (
              <Card className="p-6 card-glass col-span-full text-center">
                <Activity className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Nenhum health check executado ainda. Clique em "Atualizar" para começar.
                </p>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card className="card-glass overflow-hidden">
            <div className="p-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Logs do Sistema</h3>
              </div>
            </div>
            
            <div className="max-h-[600px] overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 border-b border-border/30 hover:bg-foreground/[0.02] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getLevelBadge(log.level)}
                        <Badge variant="outline">{log.category}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-sm">{log.message}</p>
                      {log.details && (
                        <pre className="mt-2 text-xs text-muted-foreground bg-black/20 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {logs.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum log disponível</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
