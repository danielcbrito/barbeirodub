import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Acc = { id: string; full_name: string | null; tax_id: string | null; email: string | null; phone: string | null; pix_key: string | null; status: string; status_message: string | null };

const FIELDS = [["full_name", "Nome completo"], ["tax_id", "CPF ou CNPJ"], ["email", "E-mail"], ["phone", "Telefone"], ["pix_key", "Chave Pix para saque"]] as const;

/** Finanças só abre depois que o barbeiro cria a conta dele. Quem não tem cadastro (conta principal) passa direto. */
export function OwnAccountGate({ barbeiroId, onBack, children }: { barbeiroId: string; onBack?: () => void; children: ReactNode }) {
  const [acc, setAcc] = useState<Acc | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (supabase as any).from("barber_payment_accounts").select("id,full_name,tax_id,email,phone,pix_key,status,status_message")
      .eq("barbeiro_id", barbeiroId).maybeSingle().then(({ data }: { data: Acc | null }) => { if (alive) setAcc(data); });
    return () => { alive = false; };
  }, [barbeiroId]);

  if (acc === undefined) return <div className="min-h-[var(--app-height,100dvh)] bg-background" />;
  if (acc === null || acc.status === "approved") return <>{children}</>;

  const editable = acc.status === "draft" || acc.status === "rejected";
  const set = (k: keyof Acc) => (e: React.ChangeEvent<HTMLInputElement>) => setAcc({ ...acc, [k]: e.target.value });

  const submit = async () => {
    setBusy(true);
    const { error: saveErr } = await (supabase as any).from("barber_payment_accounts").update({
      full_name: acc.full_name, tax_id: acc.tax_id, email: acc.email, phone: acc.phone, pix_key: acc.pix_key,
    }).eq("id", acc.id);
    if (saveErr) { setBusy(false); toast.error("Não foi possível salvar seus dados."); return; }
    const { data, error } = await invokeAuthenticatedFunction<{ status: string; message?: string }>("barber-account-onboard", { body: { action: "submit" } });
    setBusy(false);
    if (data?.status === "unavailable") { toast.error(data.message || "Criação de conta indisponível no momento."); return; }
    if (error || !data) { toast.error(error?.message || "Não foi possível criar sua conta."); return; }
    setAcc({ ...acc, status: data.status, status_message: "Confira seu e-mail e SMS para validar a conta." });
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
        <h1 className="text-2xl font-semibold mt-4">{editable ? "Crie sua conta" : "Conta em análise"}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {editable ? "Sua conta fica no seu nome. Leva menos de um minuto."
            : acc.status_message || "Assim que a validação terminar, suas finanças são liberadas aqui."}
        </p>
        {acc.status === "rejected" && <p className="text-sm text-destructive mt-2">Os dados foram recusados. Confira e envie novamente.</p>}

        {editable ? (
          <div className="mt-6 space-y-4">
            {FIELDS.map(([k, l]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`own-${k}`}>{l}</Label>
                <Input id={`own-${k}`} className="h-12 rounded-xl" value={(acc[k] as string) ?? ""} onChange={set(k)} />
              </div>
            ))}
            <Button className="w-full h-[54px] rounded-full mt-2" disabled={busy} onClick={submit}>{busy ? "Criando..." : "Criar minha conta"}</Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full h-[54px] rounded-full mt-6" disabled={busy} onClick={sync}>{busy ? "Verificando..." : "Verificar status"}</Button>
        )}
      </div>
    </div>
  );
}
