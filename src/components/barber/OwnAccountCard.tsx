import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Acc = { id: string; full_name: string | null; tax_id: string | null; email: string | null; phone: string | null; pix_key: string | null; status: string; status_message: string | null };

const STATUS: Record<string, string> = { pending: "Em análise", approved: "Ativa no seu nome", rejected: "Recusada — corrija os dados" };

export function OwnAccountCard({ barbeiroId }: { barbeiroId: string }) {
  const [acc, setAcc] = useState<Acc | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (supabase as any).from("barber_payment_accounts").select("id,full_name,tax_id,email,phone,pix_key,status,status_message")
      .eq("barbeiro_id", barbeiroId).maybeSingle().then(({ data }: { data: Acc | null }) => { if (alive) setAcc(data); });
    return () => { alive = false; };
  }, [barbeiroId]);

  if (!acc) return null;
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
    if (error || !data) { toast.error(error?.message || "Não foi possível enviar o cadastro."); return; }
    setAcc({ ...acc, status: data.status, status_message: "Confira seu e-mail e SMS da Woovi para validar a conta." });
    setOpen(false);
  };

  const sync = async () => {
    setBusy(true);
    const { data } = await invokeAuthenticatedFunction<{ status: string; message?: string }>("barber-account-onboard", { body: { action: "sync" } });
    setBusy(false);
    if (data) { setAcc({ ...acc, status: data.status }); if (data.message) toast(data.message); }
  };

  return (
    <section className="mx-auto w-full max-w-md px-4 mt-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Recebimento no meu nome</p>
        <p className="text-xs text-muted-foreground mt-1">
          {editable ? "Ative para que o Pix dos seus clientes caia direto na sua conta, com seu nome no comprovante." : STATUS[acc.status]}
        </p>
        {acc.status_message && !editable && <p className="text-xs text-muted-foreground mt-1">{acc.status_message}</p>}
        {editable && !open && <Button className="w-full h-[52px] rounded-full mt-3" onClick={() => setOpen(true)}>Ativar recebimento no meu nome</Button>}
        {acc.status === "pending" && <Button variant="outline" className="w-full h-[52px] rounded-full mt-3" disabled={busy} onClick={sync}>Verificar status</Button>}
        {editable && open && (
          <div className="mt-3 space-y-3">
            {([["full_name", "Nome completo"], ["tax_id", "CPF ou CNPJ"], ["email", "E-mail"], ["phone", "Telefone"], ["pix_key", "Chave Pix pessoal (para saque)"]] as const).map(([k, l]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`own-${k}`}>{l}</Label>
                <Input id={`own-${k}`} value={(acc[k] as string) ?? ""} onChange={set(k)} />
              </div>
            ))}
            <Button className="w-full h-[52px] rounded-full" disabled={busy} onClick={submit}>{busy ? "Enviando..." : "Criar minha conta"}</Button>
          </div>
        )}
      </div>
    </section>
  );
}
