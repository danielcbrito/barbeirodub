import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Acc = { id: string; full_name: string | null; tax_id: string | null; owner_cpf: string | null; email: string | null; phone: string | null; pix_key: string | null; status: string; status_message: string | null };

const FIELDS = [["full_name", "Nome completo"], ["tax_id", "CNPJ da barbearia / MEI"], ["owner_cpf", "CPF do titular"], ["email", "E-mail"], ["phone", "Telefone"], ["pix_key", "Chave Pix para saque"]] as const;

/** Finanças só abre depois que o barbeiro cria a conta dele. Quem não tem cadastro (conta principal) passa direto. */
export function OwnAccountGate({ barbeiroId, onBack, children }: { barbeiroId: string; onBack?: () => void; children: ReactNode }) {
  const [acc, setAcc] = useState<Acc | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<"mp" | "woovi" | null>(null);
  const [reselect, setReselect] = useState(false);

  useEffect(() => {
    const mp = new URLSearchParams(window.location.search).get("mp");
    if (!mp) return;
    if (mp === "ok") toast.success("Mercado Pago conectado. Seus Pix já caem na sua conta.");
    else if (mp === "erro") toast.error("Não foi possível conectar o Mercado Pago. Tente novamente.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const connectMp = async () => {
    setBusy(true);
    const { data, error } = await invokeAuthenticatedFunction<{ url: string }>("mercadopago-oauth", { body: { action: "start", origin: window.location.origin } });
    if (error || !data?.url) { setBusy(false); toast.error(error?.message || "Mercado Pago indisponível no momento."); return; }
    window.location.href = data.url;
  };

  useEffect(() => {
    let alive = true;
    (supabase as any).from("barber_payment_accounts").select("id,full_name,tax_id,owner_cpf,email,phone,pix_key,status,status_message")
      .eq("barbeiro_id", barbeiroId).maybeSingle().then(({ data }: { data: Acc | null }) => { if (alive) setAcc(data); });
    return () => { alive = false; };
  }, [barbeiroId]);

  // Enquanto em análise, consulta o banco sozinho (ao abrir e a cada 30s) e libera Finanças ao aprovar.
  const pending = acc?.status === "pending";
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    const check = async () => {
      const { data } = await invokeAuthenticatedFunction<{ status: string }>("barber-account-onboard", { body: { action: "sync" } });
      if (alive && data?.status && data.status !== "pending") setAcc((a) => (a ? { ...a, status: data.status } : a));
    };
    check();
    const t = setInterval(check, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [pending]);

  if (acc === undefined) return <div className="min-h-[var(--app-height,100dvh)] bg-background" />;
  if (acc === null || acc.status === "approved") return <>{children}</>;

  const editable = reselect || acc.status === "draft" || acc.status === "rejected";
  const set = (k: keyof Acc) => (e: React.ChangeEvent<HTMLInputElement>) => setAcc({ ...acc, [k]: e.target.value });

  const submit = async () => {
    setBusy(true);
    const { error: saveErr } = await (supabase as any).from("barber_payment_accounts").update({
      full_name: acc.full_name, tax_id: acc.tax_id, owner_cpf: acc.owner_cpf, email: acc.email, phone: acc.phone, pix_key: acc.pix_key,
    }).eq("id", acc.id);
    if (saveErr) { setBusy(false); toast.error("Não foi possível salvar seus dados."); return; }
    const { data, error } = await invokeAuthenticatedFunction<{ status: string; message?: string }>("barber-account-onboard", { body: { action: "submit" } });
    setBusy(false);
    if (data?.status === "unavailable") { toast.error(data.message || "Criação de conta indisponível no momento."); return; }
    if (error || !data) { toast.error(error?.message || "Não foi possível criar sua conta."); return; }
    setAcc({ ...acc, status: data.status, status_message: `Abra o e-mail do banco em ${acc.email ?? "seu e-mail"} e toque em "Validar cadastro" para enviar os documentos. Suas finanças abrem sozinhas quando o banco aprovar.` });
  };

  const sync = async () => {
    setBusy(true);
    const { data } = await invokeAuthenticatedFunction<{ status: string; message?: string }>("barber-account-onboard", { body: { action: "sync" } });
    setBusy(false);
    if (data) { setAcc({ ...acc, status: data.status }); if (data.message) toast(data.message); }
  };

  return (
    <div className="min-h-[var(--app-height,100dvh)] bg-background text-foreground" style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}>
      <div className="mx-auto w-full max-w-md px-5 pb-10">
        {onBack && (
          <button onClick={onBack} aria-label="Voltar" className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <h1 className="text-2xl font-semibold mt-4">{editable ? (choice === "woovi" ? "Conta Barbearia DUB" : "Como você quer receber?") : "Conta em análise"}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {editable ? (choice === "woovi" ? "Preencha seus dados aqui. Depois o banco envia um e-mail para você terminar o cadastro."
            : "O dinheiro dos seus clientes cai direto na sua conta, no seu nome.")
            : acc.status_message || "Assim que a validação terminar, suas finanças são liberadas aqui."}
        </p>
        {acc.status === "rejected" && <p className="text-sm text-destructive mt-2">Os dados foram recusados. Confira e envie novamente.</p>}

        {editable && choice !== "woovi" ? (
          <div className="mt-8 space-y-3">
            <div className="rounded-2xl border border-border p-5">
              <p className="font-semibold">Conectar Mercado Pago</p>
              <p className="text-sm text-muted-foreground mt-1">Recomendado. Funciona com CPF ou CNPJ, sem documentos. O cadastro leva apenas um minuto.</p>
              <Button className="w-full h-[54px] rounded-full mt-4" disabled={busy} onClick={connectMp}>{busy ? "Abrindo..." : "Conectar Mercado Pago"}</Button>
            </div>
            <div className="rounded-2xl border border-border p-5">
              <p className="font-semibold">Criar conta na Barbearia DUB</p>
              <p className="text-sm text-muted-foreground mt-1">Taxa menor por Pix. Exige CNPJ/MEI e documentos, que o banco pede por e-mail.</p>
              <Button variant="outline" className="w-full h-[54px] rounded-full mt-4" disabled={busy} onClick={() => setChoice("woovi")}>Criar conta</Button>
            </div>
          </div>
        ) : editable ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-muted p-4 text-sm">
              <p className="font-medium">Como funciona</p>
              <p className="text-muted-foreground mt-1">1. Preencha seus dados abaixo.</p>
              <p className="text-muted-foreground">2. Você recebe um e-mail do banco no seu Gmail.</p>
              <p className="text-muted-foreground">3. Toque em "Validar cadastro" e envie: CCMEI (gov.br), comprovante de faturamento, foto do documento e os termos.</p>
              <p className="text-muted-foreground">4. Quando o banco aprovar, suas finanças abrem sozinhas aqui.</p>
            </div>
            {FIELDS.map(([k, l]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`own-${k}`}>{l}</Label>
                <Input id={`own-${k}`} className="h-12 rounded-xl" value={(acc[k] as string) ?? ""} onChange={set(k)} />
              </div>
            ))}
            <Button className="w-full h-[54px] rounded-full mt-2" disabled={busy} onClick={submit}>{busy ? "Criando..." : "Criar minha conta"}</Button>
            <Button variant="ghost" className="w-full h-[54px] rounded-full" disabled={busy} onClick={() => setChoice(null)}>Voltar às opções</Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mt-6">Verificando automaticamente. Suas finanças abrem sozinhas assim que o banco aprovar.</p>
            <Button variant="outline" className="w-full h-[54px] rounded-full mt-4" disabled={busy} onClick={sync}>{busy ? "Verificando..." : "Verificar agora"}</Button>
            <Button variant="ghost" className="w-full h-[54px] rounded-full mt-2" disabled={busy} onClick={() => { setReselect(true); setChoice(null); }}>Escolher outra forma de receber</Button>
          </>
        )}
      </div>
    </div>
  );
}
