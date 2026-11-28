import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import mercadoPagoYellowLogo from "@/assets/banks/mercado-pago-yellow.png";

type Acc = {
  id: string | null;
  user_id: string;
  tenant_id: string | null;
  full_name: string | null;
  tax_id: string | null;
  owner_cpf: string | null;
  email: string | null;
  phone: string | null;
  pix_key: string | null;
  provider: string;
  status: string;
  status_message: string | null;
};

const MAIN_ACCOUNT_BARBER_ID = "767c51a7-7323-4933-8fc5-9a666f6baa7c";
const ACCOUNT_FIELDS = "id,user_id,tenant_id,full_name,tax_id,owner_cpf,email,phone,pix_key,provider,status,status_message";
const FIELDS = [["full_name", "Nome completo"], ["tax_id", "CNPJ da barbearia / MEI"], ["owner_cpf", "CPF do titular"], ["email", "E-mail"], ["phone", "Telefone"], ["pix_key", "Chave Pix para saque"]] as const;

const OwnAccountContext = createContext<Acc | null>(null);
export function useOwnAccount() { return useContext(OwnAccountContext); }

/** Finanças só abre depois que o barbeiro cria a conta dele. A conta principal existente do Túlio passa direto. */
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
    const load = async () => {
      const [{ data: account }, { data: barber }] = await Promise.all([
        (supabase as any).from("barber_payment_accounts").select(ACCOUNT_FIELDS).eq("barbeiro_id", barbeiroId).maybeSingle(),
        (supabase as any).from("barbeiros").select("user_id,tenant_id").eq("id", barbeiroId).maybeSingle(),
      ]);
      if (!alive) return;
      if (account) {
        setAcc(account as Acc);
      } else if (barber?.user_id) {
        setAcc({
          id: null,
          user_id: barber.user_id,
          tenant_id: barber.tenant_id,
          full_name: null,
          tax_id: null,
          owner_cpf: null,
          email: null,
          phone: null,
          pix_key: null,
          provider: "woovi",
          status: "draft",
          status_message: null,
        });
      } else {
        setAcc(null);
      }
    };
    load();
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

  if (barbeiroId === MAIN_ACCOUNT_BARBER_ID) return <>{children}</>;
  if (acc === undefined) return <div className="min-h-[var(--app-height,100dvh)] bg-background" />;
  if (acc === null) {
    return (
      <div className="min-h-[var(--app-height,100dvh)] bg-background text-foreground px-5 pt-16">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-semibold">Cadastro indisponível</h1>
          <p className="text-sm text-muted-foreground mt-2">Não foi possível carregar os dados do barbeiro. Tente novamente.</p>
          <Button className="w-full h-[54px] rounded-full mt-6" onClick={() => window.location.reload()}>Tentar novamente</Button>
          {onBack && <Button variant="ghost" className="w-full h-[54px] rounded-full mt-2" onClick={onBack}>Voltar</Button>}
        </div>
      </div>
    );
  }
  if (acc.status === "approved") {
    return <OwnAccountContext.Provider value={acc}>{children}</OwnAccountContext.Provider>;
  }

  const editable = reselect || acc.status === "draft" || acc.status === "rejected";
  const set = (k: keyof Acc) => (e: React.ChangeEvent<HTMLInputElement>) => setAcc({ ...acc, [k]: e.target.value });

  const submit = async () => {
    setBusy(true);
    const values = {
      full_name: acc.full_name,
      tax_id: acc.tax_id,
      owner_cpf: acc.owner_cpf,
      email: acc.email,
      phone: acc.phone,
      pix_key: acc.pix_key,
    };
    let savedAcc: Acc;
    if (acc.id) {
      const { data, error } = await (supabase as any).from("barber_payment_accounts").update(values).eq("id", acc.id).select(ACCOUNT_FIELDS).single();
      if (error) { setBusy(false); toast.error("Não foi possível salvar seus dados."); return; }
      savedAcc = data as Acc;
    } else {
      const { data, error } = await (supabase as any).from("barber_payment_accounts").insert({
        ...values,
        barbeiro_id: barbeiroId,
        user_id: acc.user_id,
        tenant_id: acc.tenant_id,
        provider: "woovi",
        status: "draft",
      }).select(ACCOUNT_FIELDS).single();
      if (error) { setBusy(false); toast.error("Não foi possível iniciar seu cadastro."); return; }
      savedAcc = data as Acc;
    }
    setAcc(savedAcc);
    const { data, error } = await invokeAuthenticatedFunction<{ status: string; message?: string }>("barber-account-onboard", { body: { action: "submit" } });
    setBusy(false);
    if (data?.status === "unavailable") { toast.error(data.message || "Criação de conta indisponível no momento."); return; }
    if (error || !data) { toast.error(error?.message || "Não foi possível criar sua conta."); return; }
    setAcc({ ...savedAcc, status: data.status, status_message: `Abra o e-mail do banco em ${savedAcc.email ?? "seu e-mail"} e toque em "Validar cadastro" para enviar os documentos. Suas finanças abrem sozinhas quando o banco aprovar.` });
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
          <button
            onClick={onBack}
            aria-label="Voltar"
            className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center hover:bg-secondary/70 active:scale-95 transition-all"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {editable && choice === "woovi" ? (
          <div className="flex items-center gap-3 mt-4">
            <div className="w-11 h-11 rounded-2xl bg-white dark:bg-white/10 border border-border/60 dark:border-white/10 flex items-center justify-center p-2 shrink-0 shadow-xs">
              <img
                src="/auth-assets/dub_logo_d.png"
                alt="Barbearia DUB"
                className="w-full h-full object-contain block dark:invert select-none"
                draggable={false}
              />
            </div>
            <h1 className="text-2xl font-semibold">Conta Barbearia DUB</h1>
          </div>
        ) : !editable ? (
          <div className="flex items-center gap-3 mt-4">
            {acc.provider === "mercadopago" ? (
              <div className="w-11 h-11 rounded-2xl overflow-hidden bg-[#FFE700] ring-1 ring-[#FFE700] shadow-xs shrink-0">
                <img
                  src={mercadoPagoYellowLogo}
                  alt="Mercado Pago"
                  className="w-full h-full object-cover select-none"
                  draggable={false}
                />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-white dark:bg-white/10 border border-border/60 dark:border-white/10 flex items-center justify-center p-2 shrink-0 shadow-xs">
                <img
                  src="/auth-assets/dub_logo_d.png"
                  alt="Barbearia DUB"
                  className="w-full h-full object-contain block dark:invert select-none"
                  draggable={false}
                />
              </div>
            )}
            <h1 className="text-2xl font-semibold">Conta em análise</h1>
          </div>
        ) : (
          <h1 className="text-2xl font-semibold mt-4">Como você quer receber?</h1>
        )}

        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {editable ? (choice === "woovi" ? "Preencha seus dados aqui. Depois o banco envia um e-mail para você terminar o cadastro."
            : "O dinheiro dos seus clientes cai direto na sua conta, no seu nome. Enquanto a conta não estiver ativa, seus clientes não verão a opção Pix.")
            : acc.status_message || "Assim que a validação terminar, suas finanças são liberadas aqui."}
        </p>
        {acc.status === "rejected" && <p className="text-sm text-destructive mt-2">Os dados foram recusados. Confira e envie novamente.</p>}

        {editable && choice !== "woovi" ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="mt-7 space-y-4"
          >
            {/* Parte 1: Banner & Conexão Mercado Pago (Paleta oficial: Amarelo #FFE700, Azul #01BCFF/#009EE3/#090080 e Branco #FFFFFF) */}
            <div className="rounded-[22px] overflow-hidden border border-[#FFE700] dark:border-[#FFE700]/45 bg-white dark:bg-card shadow-[0_12px_32px_rgba(0,158,227,0.10)]">
              <div className="relative overflow-hidden bg-[#FFE700] px-5 py-4">
                <div className="pointer-events-none absolute -right-8 -bottom-10 w-32 h-32 rounded-full bg-[#01BCFF]/20" />
                <div className="pointer-events-none absolute -top-10 right-8 w-24 h-24 rounded-full bg-white/30" />

                <div className="relative z-10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#FFE700] ring-2 ring-white shadow-sm shrink-0">
                      <img
                        src={mercadoPagoYellowLogo}
                        alt="Mercado Pago"
                        className="w-full h-full object-cover select-none"
                        draggable={false}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[17px] font-extrabold text-[#090080] tracking-tight leading-tight">
                        Mercado Pago
                      </p>
                      <p className="text-[12px] font-semibold text-[#090080]/80 mt-0.5 truncate">
                        Pix direto na sua conta
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#090080] text-white shadow-xs tracking-tight shrink-0">
                    Recomendado
                  </span>
                </div>
              </div>

              <div className="h-[3px] w-full bg-gradient-to-r from-[#090080] via-[#009EE3] to-[#01BCFF]" />

              <div className="p-5 pt-4">
                <p className="text-[13.5px] text-muted-foreground leading-relaxed">
                  Funciona com CPF ou CNPJ, sem documentos. O cadastro leva apenas um minuto.
                </p>
                <Button
                  type="button"
                  className="w-full h-[54px] rounded-full mt-4 bg-[#009EE3] hover:bg-[#0089C7] text-white font-bold text-[15px] shadow-[0_8px_22px_rgba(0,158,227,0.28)] active:scale-[0.985] transition-all cursor-pointer border-0"
                  disabled={busy}
                  onClick={connectMp}
                >
                  {busy ? "Abrindo..." : "Conectar Mercado Pago"}
                </Button>
              </div>
            </div>

            {/* Parte 2: Criar conta na Barbearia DUB com a logo oficial D */}
            <div className="rounded-[22px] overflow-hidden border border-border/80 dark:border-white/10 bg-card shadow-[0_8px_24px_rgb(0,0,0,0.04)] dark:shadow-none">
              <div className="bg-secondary/45 dark:bg-white/[0.04] px-5 py-3.5 border-b border-border/50 dark:border-white/[0.08] flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-white/10 border border-border/60 dark:border-white/10 flex items-center justify-center p-2 shrink-0 shadow-xs">
                  <img
                    src="/auth-assets/dub_logo_d.png"
                    alt="Barbearia DUB"
                    className="w-full h-full object-contain block dark:invert select-none"
                    draggable={false}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[15.5px] font-bold text-foreground tracking-tight leading-tight">
                    Criar conta na Barbearia DUB
                  </p>
                  <p className="text-[12px] font-medium text-muted-foreground mt-0.5 truncate">
                    Conta própria integrada
                  </p>
                </div>
              </div>

              <div className="p-5 pt-4">
                <p className="text-[13.5px] text-muted-foreground leading-relaxed">
                  Taxa menor por Pix. Exige CNPJ/MEI e documentos, que o banco pede por e-mail.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-[54px] rounded-full mt-4 font-semibold text-[15px] border-border/80 hover:bg-secondary/60 active:scale-[0.985] transition-all cursor-pointer"
                  disabled={busy}
                  onClick={() => setChoice("woovi")}
                >
                  Criar conta
                </Button>
              </div>
            </div>
          </motion.div>
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
