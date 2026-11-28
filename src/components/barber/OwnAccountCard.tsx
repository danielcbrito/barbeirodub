import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronLeft, Star } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import mercadoPagoLogo from "@/assets/banks/mercado-pago.png";

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
    <div
      className="min-h-[var(--app-height,100dvh)] bg-[#F8FAFD] dark:bg-background text-foreground"
      style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 16px)" }}
    >
      <div className="mx-auto w-full max-w-md px-4 sm:px-5 pb-32">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Voltar"
            className="w-9 h-9 -ml-2 mb-1 rounded-full flex items-center justify-center hover:bg-secondary/70 active:scale-95 transition-all"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {editable && choice === "woovi" ? (
          <div className="flex items-center gap-3 mt-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E21D2E] to-[#C81422] flex items-center justify-center p-2 shrink-0 shadow-xs">
              <img
                src="/auth-assets/dub_logo_d.png"
                alt="Dub"
                className="w-full h-full object-contain brightness-0 invert select-none"
                draggable={false}
              />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Conta na Dub</h1>
          </div>
        ) : !editable ? (
          <div className="flex items-center gap-3 mt-2">
            {acc.provider === "mercadopago" ? (
              <div className="w-10 h-10 rounded-xl bg-white border border-border/60 flex items-center justify-center p-1.5 shadow-xs shrink-0">
                <img
                  src={mercadoPagoLogo}
                  alt="Mercado Pago"
                  className="w-full h-full object-contain select-none"
                  draggable={false}
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E21D2E] to-[#C81422] flex items-center justify-center p-2 shrink-0 shadow-xs">
                <img
                  src="/auth-assets/dub_logo_d.png"
                  alt="Dub"
                  className="w-full h-full object-contain brightness-0 invert select-none"
                  draggable={false}
                />
              </div>
            )}
            <h1 className="text-xl font-bold tracking-tight">Conta em análise</h1>
          </div>
        ) : (
          <h1 className="text-[21px] sm:text-[23px] font-bold tracking-tight text-foreground mt-2">
            Como você quer{" "}
            <span className="text-[#0066FF] dark:text-[#3B82F6]">receber?</span>
          </h1>
        )}

        <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
          {editable ? (choice === "woovi" ? "Preencha seus dados aqui. Depois o banco envia um e-mail para você terminar o cadastro."
            : "O dinheiro dos seus clientes cai direto na sua conta, no seu nome. Escolha a melhor opção para você.")
            : acc.status_message || "Assim que a validação terminar, suas finanças são liberadas aqui."}
        </p>
        {acc.status === "rejected" && <p className="text-sm text-destructive mt-1.5">Os dados foram recusados. Confira e envie novamente.</p>}

        {editable && choice !== "woovi" ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mt-5 space-y-3.5"
          >
            {/* Cartão 1: Mercado Pago (Recomendado, estrutura vertical limpa e elegante) */}
            <div className="rounded-2xl border border-[#0066FF]/20 dark:border-[#3B82F6]/30 bg-white dark:bg-card p-5 shadow-[0_2px_12px_rgba(0,102,255,0.04)]">
              {/* Topo do cartão: Logo oficial + Selo discreto */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <img
                    src={mercadoPagoLogo}
                    alt="Mercado Pago"
                    className="h-7 w-auto object-contain select-none"
                    draggable={false}
                  />
                  <div className="leading-none tracking-tight select-none">
                    <span className="text-[15px] font-bold text-[#12264A] dark:text-white">mercado</span>
                    <span className="text-[15px] font-bold text-[#00AEEF]"> pago</span>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#0066FF]/10 text-[#0066FF] text-[11px] font-semibold border border-[#0066FF]/20 select-none">
                  <Star className="w-3 h-3 fill-[#0066FF] text-[#0066FF]" />
                  Recomendado
                </span>
              </div>

              {/* Título e descrição */}
              <h2 className="mt-3.5 text-[16px] sm:text-[17px] font-bold text-foreground tracking-tight leading-snug">
                Conectar Mercado Pago
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
                Receba seus pagamentos com a segurança e a confiabilidade do Mercado Pago.
              </p>

              {/* Botão de ação */}
              <Button
                type="button"
                className="w-full h-[46px] rounded-xl mt-4 bg-[#0066FF] hover:bg-[#0055D4] text-white font-medium text-[14px] shadow-xs active:scale-[0.99] transition-all cursor-pointer border-0 flex items-center justify-center gap-1.5"
                disabled={busy}
                onClick={connectMp}
              >
                <span>{busy ? "Abrindo..." : "Conectar Mercado Pago"}</span>
                {!busy && <ArrowRight className="w-4 h-4 stroke-[2]" />}
              </Button>
            </div>

            {/* Cartão 2: Criar conta na Dub (Identidade original e proporção equilibrada) */}
            <div className="rounded-2xl border border-border/70 dark:border-white/10 bg-white dark:bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
              {/* Topo do cartão: Logo oficial Dub */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E21D2E] to-[#C81422] flex items-center justify-center p-1.5 shrink-0 shadow-xs">
                  <img
                    src="/auth-assets/dub_logo_d.png"
                    alt="Dub"
                    className="w-full h-full object-contain brightness-0 invert select-none"
                    draggable={false}
                  />
                </div>
                <span className="text-[15px] font-bold text-foreground tracking-tight">Dub Agenda</span>
              </div>

              {/* Título e descrição */}
              <h2 className="mt-3.5 text-[16px] sm:text-[17px] font-bold text-foreground tracking-tight leading-snug">
                Criar conta na Dub
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
                Taxa menor por Pix. Exige CNPJ/MEI e documentos, que o banco pede por e-mail.
              </p>

              {/* Botão de ação */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-[46px] rounded-xl mt-4 border border-border/80 dark:border-white/15 bg-white dark:bg-transparent hover:bg-secondary/40 text-foreground font-medium text-[14px] active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                disabled={busy}
                onClick={() => setChoice("woovi")}
              >
                <span>Criar conta</span>
                <ArrowRight className="w-4 h-4 stroke-[2]" />
              </Button>
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
