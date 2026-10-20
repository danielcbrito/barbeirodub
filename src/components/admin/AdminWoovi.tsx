import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  KeyRound,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Eye,
  EyeOff,
  Building2,
  Zap,
  Users,
  Wallet,
  Clock,
  ArrowUpRight,
} from "lucide-react";

interface WooviConfigState {
  status: "valid" | "invalid" | "missing" | "loading";
  message: string;
  source: "database" | "environment" | "none";
  maskedAppId: string;
  updated_at: string | null;
  account?: {
    name?: string;
    taxId?: string;
    status?: string;
  } | null;
}

interface BarberStatus {
  id: string;
  apelido: string;
  woovi_pix_key: string | null;
  woovi_pix_key_type: string | null;
  ativo: boolean;
}

export function AdminWoovi() {
  const [config, setConfig] = useState<WooviConfigState>({
    status: "loading",
    message: "Verificando conexão com o banco...",
    source: "none",
    maskedAppId: "",
    updated_at: null,
  });

  const [inputAppId, setInputAppId] = useState("");
  const [showAppId, setShowAppId] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    valid: boolean;
    message?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const [barbers, setBarbers] = useState<BarberStatus[]>([]);
  const [loadingBarbers, setLoadingBarbers] = useState(true);

  useEffect(() => {
    loadConfig();
    loadBarbers();
  }, []);

  const loadConfig = async () => {
    setConfig((prev) => ({ ...prev, status: "loading", message: "Consultando banco Woovi..." }));
    try {
      const { data, error } = await supabase.functions.invoke("woovi-wallet", {
        body: { action: "get_woovi_config" },
      });

      if (error) {
        throw error;
      }

      const res = data?.data || data;
      if (res) {
        setConfig({
          status: res.status || "invalid",
          message: res.message || "",
          source: res.source || "none",
          maskedAppId: res.maskedAppId || "",
          updated_at: res.updated_at || null,
          account: res.account || null,
        });
      } else {
        setConfig({
          status: "invalid",
          message: "Resposta vazia do servidor",
          source: "none",
          maskedAppId: "",
          updated_at: null,
        });
      }
    } catch (err: any) {
      console.error("[AdminWoovi] Erro ao carregar config:", err);
      setConfig({
        status: "invalid",
        message: err.message || "Erro de conexão com o servidor",
        source: "none",
        maskedAppId: "",
        updated_at: null,
      });
    }
  };

  const loadBarbers = async () => {
    setLoadingBarbers(true);
    try {
      const { data, error } = await supabase
        .from("barbeiros")
        .select("id, apelido, woovi_pix_key, woovi_pix_key_type, ativo")
        .order("apelido");

      if (error) throw error;
      setBarbers(data || []);
    } catch (err: any) {
      console.error("[AdminWoovi] Erro ao carregar barbeiros:", err);
    } finally {
      setLoadingBarbers(false);
    }
  };

  const handleTestKey = async () => {
    const keyToTest = inputAppId.trim();
    if (!keyToTest) {
      toast.error("Insira o AppID antes de testar");
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("woovi-wallet", {
        body: { action: "credential_check", appId: keyToTest },
      });

      if (error) throw error;

      const res = data?.data || data;
      if (res?.credential === "valid") {
        setTestResult({
          tested: true,
          valid: true,
          message: "Credencial validada com sucesso! O banco aceitou a autenticação.",
        });
        toast.success("Credencial Woovi válida!");
      } else {
        const errorMsg =
          res?.message ||
          (res?.status === 401
            ? "O banco Woovi recusou este AppID (HTTP 401: appID inválido)"
            : "Falha na validação com o banco Woovi");
        setTestResult({
          tested: true,
          valid: false,
          message: errorMsg,
        });
        toast.error("Credencial recusada pelo banco Woovi");
      }
    } catch (err: any) {
      setTestResult({
        tested: true,
        valid: false,
        message: err.message || "Erro ao conectar com a API",
      });
      toast.error("Erro ao testar credencial");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveKey = async () => {
    const keyToSave = inputAppId.trim();
    if (!keyToSave) {
      toast.error("Informe o AppID para salvar");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("woovi-wallet", {
        body: { action: "save_woovi_app_id", app_id: keyToSave },
      });

      if (error) throw error;

      const res = data;
      if (res?.success) {
        toast.success("AppID salvo e ativado no sistema!");
        setInputAppId("");
        setTestResult(null);
        await loadConfig();
      } else {
        const msg = res?.error?.message || res?.message || "Falha ao salvar credencial";
        toast.error(msg);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar credencial");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Card com Aura Style */}
      <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-card/90 via-card/50 to-background backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              <Building2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl font-bold tracking-tight">Woovi / OpenPix</CardTitle>
                <Badge
                  variant="outline"
                  className="text-[11px] font-mono uppercase tracking-wider border-primary/20 bg-primary/10 text-primary"
                >
                  Pix & Subcontas
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Conexão bancária direta para espelhamento de saldos e saques automáticos
              </CardDescription>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadConfig}
            disabled={config.status === "loading"}
            className="border-border/60 bg-secondary/30 hover:bg-secondary/60 transition-all text-xs gap-1.5 h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${config.status === "loading" ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Connection State Banner */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              config.status === "valid"
                ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                : config.status === "loading"
                ? "bg-secondary/40 border-border/50 text-muted-foreground"
                : "bg-red-950/20 border-red-500/30 text-red-300"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {config.status === "valid" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                ) : config.status === "loading" ? (
                  <RefreshCw className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0 animate-spin" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {config.status === "valid"
                        ? "Banco Conectado & Autenticado"
                        : config.status === "loading"
                        ? "Verificando credenciais..."
                        : "Conexão Bancária Inativa ou Credencial Inválida"}
                    </span>
                    <Badge
                      className={`text-[10px] uppercase font-mono ${
                        config.status === "valid"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : config.status === "loading"
                          ? "bg-secondary text-muted-foreground"
                          : "bg-red-500/20 text-red-300 border-red-500/40"
                      }`}
                    >
                      {config.status === "valid"
                        ? "Tempo Real Ativo"
                        : config.status === "loading"
                        ? "Checando"
                        : "Desconectado"}
                    </Badge>
                  </div>
                  <p className="text-xs opacity-90 mt-1">{config.message}</p>

                  {config.account && (
                    <div className="mt-2 pt-2 border-t border-emerald-500/20 flex items-center gap-4 text-xs font-mono">
                      <span>Titular: {config.account.name || "Woovi IP"}</span>
                      {config.account.taxId && <span>CNPJ/CPF: {config.account.taxId}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Masked Active Key Pill */}
              {config.maskedAppId && (
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-muted-foreground block uppercase font-mono">
                    AppID Ativo ({config.source === "database" ? "Banco de Dados" : "Variável de Ambiente"})
                  </span>
                  <code className="text-xs font-mono bg-background/50 px-2 py-0.5 rounded border border-border/40 inline-block mt-0.5">
                    {config.maskedAppId}
                  </code>
                </div>
              )}
            </div>
          </div>

          {/* Configuration Form Card */}
          <div className="p-5 rounded-xl border border-border/50 bg-secondary/20 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold">Atualizar Woovi AppID (Chave de Produção)</h4>
              </div>
              <a
                href="https://app.woovi.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Painel Woovi / OpenPix
                <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Cole abaixo o <strong>AppID</strong> gerado no painel da Woovi (OpenPix). Ao salvar, a chave é
              validada instantaneamente contra os servidores da Woovi e passa a ser usada por todas as funções do
              sistema, espelhando os saldos dos barbeiros em tempo real.
            </p>

            <div className="space-y-2">
              <Label htmlFor="woovi-app-id-input" className="text-xs font-medium">
                Novo AppID Woovi
              </Label>
              <div className="relative">
                <Input
                  id="woovi-app-id-input"
                  type={showAppId ? "text" : "password"}
                  value={inputAppId}
                  onChange={(e) => {
                    setInputAppId(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="Ex: Q2xpZW50X0lkX... (cole o AppID completo da Woovi)"
                  className="font-mono text-xs pr-10 bg-background/80 border-border/60 focus-visible:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowAppId(!showAppId)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAppId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Test Feedback Box */}
            <AnimatePresence>
              {testResult && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                    testResult.valid
                      ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                      : "bg-red-950/30 border-red-500/40 text-red-300"
                  }`}
                >
                  {testResult.valid ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  )}
                  <span>{testResult.message}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestKey}
                disabled={testing || !inputAppId.trim()}
                className="border-border/60 hover:bg-secondary/50 text-xs h-9 gap-1.5"
              >
                {testing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                )}
                {testing ? "Testando no Banco..." : "Testar Conexão"}
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleSaveKey}
                disabled={saving || !inputAppId.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-9 gap-1.5 shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]"
              >
                {saving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                {saving ? "Salvando e Validando..." : "Salvar e Ativar"}
              </Button>
            </div>
          </div>

          {/* Subcontas dos Barbeiros */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold">Subcontas dos Barbeiros Vinculadas</h4>
              </div>
              <Badge variant="outline" className="text-[11px] font-mono">
                {barbers.length} Barbeiro(s) Cadastrado(s)
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              Cada barbeiro possui sua própria subconta bancária na Woovi identificada pela Chave Pix informada. O
              aplicativo do barbeiro lê o saldo diretamente desta subconta em tempo real.
            </p>

            <div className="rounded-xl border border-border/50 overflow-hidden bg-background/40">
              <table className="w-full text-xs text-left">
                <thead className="bg-secondary/40 text-muted-foreground border-b border-border/40 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Barbeiro</th>
                    <th className="py-2.5 px-3">Chave Pix da Subconta</th>
                    <th className="py-2.5 px-3">Tipo da Chave</th>
                    <th className="py-2.5 px-3 text-right">Status do Vínculo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {loadingBarbers ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-muted-foreground">
                        Carregando subcontas...
                      </td>
                    </tr>
                  ) : barbers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-muted-foreground">
                        Nenhum barbeiro cadastrado.
                      </td>
                    </tr>
                  ) : (
                    barbers.map((b) => {
                      const hasKey = Boolean(b.woovi_pix_key);
                      return (
                        <tr key={b.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="py-2.5 px-3 font-medium flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                b.ativo ? "bg-emerald-400" : "bg-muted-foreground"
                              }`}
                            />
                            {b.apelido}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">
                            {b.woovi_pix_key ? (
                              <span className="text-foreground">{b.woovi_pix_key}</span>
                            ) : (
                              <span className="text-muted-foreground italic">Não configurada</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 uppercase text-[10px] font-mono text-muted-foreground">
                            {b.woovi_pix_key_type || "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {hasKey ? (
                              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                                Espelho Bancário Ativo
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]">
                                Chave Pendente
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
