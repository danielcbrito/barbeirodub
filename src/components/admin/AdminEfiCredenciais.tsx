import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronLeft, ShieldCheck, KeyRound, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";

interface Barbeiro {
  id: string;
  apelido: string;
  has_credentials?: boolean;
  ambiente?: string | null;
  pix_key?: string | null;
}

const formSchema = z.object({
  barbeiro_id: z.string().uuid({ message: "Selecione um barbeiro" }),
  ambiente: z.enum(["test", "prod"]),
  client_id: z.string().trim().min(4, "Client ID muito curto").max(200),
  client_secret: z.string().trim().min(4, "Client Secret muito curto").max(200),
  pix_key: z.string().trim().min(3, "Chave PIX inválida").max(200),
  cert_p12_base64: z.string().min(100, "Certificado .p12 obrigatório"),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * AdminEfiCredenciais — cadastro seguro de credenciais Efí Bank por barbeiro.
 * Apenas admins/TI acessam. Os 3 campos sensíveis (client_id, client_secret, cert.p12)
 * trafegam por HTTPS e são criptografados com AES-256-GCM no servidor antes de gravar.
 */
export function AdminEfiCredenciais() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [certFileName, setCertFileName] = useState<string>("");

  const [form, setForm] = useState<FormValues>({
    barbeiro_id: "",
    ambiente: "prod",
    client_id: "",
    client_secret: "",
    pix_key: "",
    cert_p12_base64: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: bs }, { data: cred }] = await Promise.all([
      supabase.from("barbeiros").select("id, apelido").eq("ativo", true).order("apelido"),
      supabase.from("efi_credenciais").select("barbeiro_id, ambiente, pix_key, ativo"),
    ]);

    const credMap = new Map((cred ?? []).map((c: any) => [c.barbeiro_id, c]));
    const enriched: Barbeiro[] = (bs ?? []).map((b: any) => {
      const c = credMap.get(b.id);
      return {
        id: b.id,
        apelido: b.apelido,
        has_credentials: !!c,
        ambiente: c?.ambiente ?? null,
        pix_key: c?.pix_key ?? null,
      };
    });
    setBarbeiros(enriched);
    setLoading(false);
  }

  const selectedBarbeiro = useMemo(
    () => barbeiros.find((b) => b.id === form.barbeiro_id),
    [barbeiros, form.barbeiro_id],
  );

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleCertFile(file: File | null) {
    if (!file) {
      update("cert_p12_base64", "");
      setCertFileName("");
      return;
    }
    if (file.size > 200 * 1024) {
      toast.error("Certificado muito grande (máx. 200 KB)");
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    update("cert_p12_base64", btoa(bin));
    setCertFileName(file.name);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: any = {};
      parsed.error.issues.forEach((iss) => {
        fieldErrors[iss.path[0]] = iss.message;
      });
      setErrors(fieldErrors);
      toast.error("Verifique os campos do formulário");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("save-efi-credentials", {
        body: parsed.data,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(`Credenciais Efí salvas para ${selectedBarbeiro?.apelido}`);
      // Reset campos sensíveis (mantém barbeiro selecionado)
      setForm((f) => ({
        ...f,
        client_id: "",
        client_secret: "",
        cert_p12_base64: "",
      }));
      setCertFileName("");
      await loadData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao salvar credenciais");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <ScheduleHeader
        title="Credenciais Efí Bank"
        subtitle="Cadastro seguro das credenciais individuais de cada barbeiro na Efí Bank"
        onBack={() => navigate(-1)}
      />
      <div className="space-y-6 max-w-4xl mx-auto px-4 md:px-0">

      {/* Aviso de segurança */}
      <Card className="p-4 border-primary/30 bg-primary/5">
        <div className="flex gap-3">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-medium">Criptografia ponta-a-ponta</p>
            <p className="text-muted-foreground">
              Client ID, Client Secret e o certificado <code className="bg-muted px-1 rounded">.p12</code> são
              criptografados com <strong>AES-256-GCM</strong> antes de serem gravados. A chave mestre
              <code className="bg-muted px-1 rounded ml-1">EFI_ENCRYPTION_KEY</code> nunca sai do servidor.
            </p>
          </div>
        </div>
      </Card>

      {/* Lista de barbeiros já cadastrados */}
      {!loading && barbeiros.some((b) => b.has_credentials) && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Barbeiros configurados
          </h2>
          <div className="flex flex-wrap gap-2">
              {barbeiros.filter((b) => b.has_credentials).map((b) => (
              <Badge key={b.id} variant="secondary" className="gap-1.5 py-1.5 px-3">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {b.apelido}
                <span className="text-xs opacity-60">({b.ambiente})</span>
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Formulário */}
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Barbeiro + Ambiente */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="barbeiro">Barbeiro *</Label>
              <Select
                value={form.barbeiro_id}
                onValueChange={(v) => update("barbeiro_id", v)}
                disabled={saving || loading}
              >
                <SelectTrigger id="barbeiro">
                  <SelectValue placeholder={loading ? "Carregando..." : "Selecione o barbeiro"} />
                </SelectTrigger>
                <SelectContent>
                  {barbeiros.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      <div className="flex items-center gap-2">
                        {b.has_credentials && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                        {b.apelido}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.barbeiro_id && <p className="text-xs text-destructive">{errors.barbeiro_id}</p>}
              {selectedBarbeiro?.has_credentials && (
                <p className="text-xs text-warning flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Este barbeiro já tem credenciais — salvar irá sobrescrever.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ambiente">Ambiente *</Label>
              <Select
                value={form.ambiente}
                onValueChange={(v) => update("ambiente", v as "test" | "prod")}
                disabled={saving}
              >
                <SelectTrigger id="ambiente">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prod">Produção</SelectItem>
                  <SelectItem value="test">Homologação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Client ID */}
          <div className="space-y-2">
            <Label htmlFor="client_id">Client ID *</Label>
            <Input
              id="client_id"
              type="text"
              autoComplete="off"
              value={form.client_id}
              onChange={(e) => update("client_id", e.target.value)}
              placeholder="Client_Id_xxxxxxxxxxxxxxxx"
              disabled={saving}
            />
            {errors.client_id && <p className="text-xs text-destructive">{errors.client_id}</p>}
          </div>

          {/* Client Secret */}
          <div className="space-y-2">
            <Label htmlFor="client_secret">Client Secret *</Label>
            <Input
              id="client_secret"
              type="password"
              autoComplete="new-password"
              value={form.client_secret}
              onChange={(e) => update("client_secret", e.target.value)}
              placeholder="Client_Secret_xxxxxxxxxxxxxxxx"
              disabled={saving}
            />
            {errors.client_secret && <p className="text-xs text-destructive">{errors.client_secret}</p>}
          </div>

          {/* Chave PIX */}
          <div className="space-y-2">
            <Label htmlFor="pix_key" className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              Chave PIX da conta Efí *
            </Label>
            <Input
              id="pix_key"
              type="text"
              autoComplete="off"
              value={form.pix_key}
              onChange={(e) => update("pix_key", e.target.value)}
              placeholder="Ex.: 12345678900 (CPF) ou email@dominio.com"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Chave que o barbeiro cadastrou <strong>dentro do painel da Efí</strong> — ela identifica
              em qual conta o dinheiro será creditado.
            </p>
            {errors.pix_key && <p className="text-xs text-destructive">{errors.pix_key}</p>}
          </div>

          {/* Certificado .p12 */}
          <div className="space-y-2">
            <Label htmlFor="cert" className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Certificado .p12 *
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="cert"
                type="file"
                accept=".p12,application/x-pkcs12"
                onChange={(e) => handleCertFile(e.target.files?.[0] ?? null)}
                disabled={saving}
                className="cursor-pointer"
              />
              {certFileName && (
                <Badge variant="outline" className="gap-1 shrink-0">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  {certFileName}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Arquivo <code className="bg-muted px-1 rounded">.p12</code> baixado do painel da Efí.
              Convertido para base64 no navegador antes do envio.
            </p>
            {errors.cert_p12_base64 && <p className="text-xs text-destructive">{errors.cert_p12_base64}</p>}
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving || loading} size="lg" className="min-w-[200px]">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criptografando e salvando...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Salvar credenciais
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>
      </div>
    </div>
  );
}
