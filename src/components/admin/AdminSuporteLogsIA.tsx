import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Clock, Search, Filter, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { QUERY_KEYS } from "@/lib/queryKeys";

interface AIActionLog {
  id: string;
  created_at: string;
  action_type: string;
  action_name: string;
  parameters: any;
  result: any;
  success: boolean;
  error_message: string;
  user_id: string;
  auto_approved?: boolean;
  reverted_at?: string;
}

/** Busca logs de IA com filtros */
async function fetchAILogs(filterType: string, filterSuccess: string): Promise<AIActionLog[]> {
  let query = supabase
    .from("ai_actions_log")
    .select("id, action_name, action_type, success, created_at, user_id, error_message, parameters, result, auto_approved, reverted_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filterType !== "all") {
    query = query.eq("action_type", filterType);
  }

  if (filterSuccess !== "all") {
    query = query.eq("success", filterSuccess === "success");
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export function AdminSuporteLogsIA() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSuccess, setFilterSuccess] = useState<string>("all");
  const { toast } = useToast();

  /* ── TanStack Query: substitui polling manual de 10s ── */
  const { data: logs = [], isLoading: loading, isFetching } = useQuery({
    queryKey: QUERY_KEYS.adminSub.suporteLogsIA(filterType, filterSuccess),
    queryFn: () => fetchAILogs(filterType, filterSuccess),
    staleTime: 1000 * 30, // 30s — dados de monitoramento
    refetchInterval: 1000 * 30, // Atualiza a cada 30s (não 10s — reduz carga)
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminSub.suporteLogsIAPrefix() });
  };

  const filteredLogs = logs.filter((log) =>
    log.action_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const actionTypes = [...new Set(logs.map((log) => log.action_type))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Logs de Ações da IA</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar ação..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {actionTypes.map((type) => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterSuccess} onValueChange={setFilterSuccess}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="success">Sucesso</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold">{logs.length}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-emerald-500">
            {logs.filter((l) => l.success).length}
          </p>
          <p className="text-xs text-muted-foreground">Sucesso</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-red-500">
            {logs.filter((l) => !l.success).length}
          </p>
          <p className="text-xs text-muted-foreground">Erros</p>
        </Card>
      </div>

      {/* Logs */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>Nenhum log encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => (
            <Card key={log.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="mt-0.5">
                    {log.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{log.action_name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{log.action_type}</Badge>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </span>
                      {log.auto_approved && (
                        <Badge className="text-[10px] bg-amber-500/10 text-amber-500 border-0">Auto</Badge>
                      )}
                      {log.reverted_at && (
                        <Badge className="text-[10px] bg-red-500/10 text-red-500 border-0">Revertido</Badge>
                      )}
                    </div>
                    {log.error_message && (
                      <p className="text-xs text-red-400 mt-1 truncate">{log.error_message}</p>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
