/**
 * ClientCampaignsSheet — campanhas da barbearia no app do cliente.
 *
 * Mostra apenas o que o dono ativou no painel (campanhas_config):
 *  • Convide e Ganhe — link de convite, progresso e cortes grátis disponíveis
 *  • Cliente do Mês  — ranking do ciclo mensal em andamento
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Copy, Gift, Crown, Share2, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClientCampaigns } from "@/hooks/useClientCampaigns";
import { buildReferralLink } from "@/lib/referral";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId?: string | null;
}

export function ClientCampaignsSheet({ open, onOpenChange, tenantId }: Props) {
  const { data, isLoading } = useClientCampaigns(tenantId, open);

  const link =
    data?.referralCode ? buildReferralLink(data.referralCode, data.tenantSlug) : "";

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const compartilhar = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Vem cortar comigo", url: link });
        return;
      } catch {
        /* usuário cancelou */
      }
    }
    void copiar();
  };

  const convide = data?.convide;
  const mes = data?.clienteMes;
  const nenhuma = !isLoading && !convide?.ativo && !mes?.ativo;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92dvh] rounded-t-3xl p-0 overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-2">
          <SheetTitle className="text-left text-[19px] font-medium tracking-tight">
            Campanhas
          </SheetTitle>
        </SheetHeader>

        <div className="px-5 pb-10 space-y-5">
          {isLoading && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {nenhuma && (
            <div className="py-16 text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/60">
                <Gift className="h-5 w-5 text-muted-foreground" strokeWidth={1.6} />
              </div>
              <p className="text-[13px] text-muted-foreground">
                Sua barbearia ainda não ativou campanhas.
              </p>
            </div>
          )}

          {/* ── Convide e Ganhe ── */}
          {convide?.ativo && (
            <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <Users className="h-[18px] w-[18px] text-foreground" strokeWidth={1.6} />
                <div>
                  <p className="text-[14px] font-semibold text-foreground">Convide e Ganhe</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    A cada {convide.necessarias}{" "}
                    {convide.necessarias === 1 ? "amigo que cortar" : "amigos que cortarem"}, você ganha 1 corte grátis
                  </p>
                </div>
              </div>

              {/* progresso */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                  <span>{convide.validados} convites validados</span>
                  <span>Faltam {convide.faltam}</span>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: Math.max(convide.necessarias, 1) }).map((_, i) => {
                    const feitos = convide.necessarias
                      ? convide.validados % convide.necessarias
                      : 0;
                    const cheio = convide.validados > 0 && feitos === 0 ? true : i < feitos;
                    return (
                      <span
                        key={i}
                        className={cn(
                          "h-1.5 flex-1 rounded-full",
                          cheio ? "bg-foreground" : "bg-muted",
                        )}
                      />
                    );
                  })}
                </div>
                {convide.pendentes > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {convide.pendentes} convite(s) aguardando o primeiro corte do amigo
                  </p>
                )}
              </div>

              {(data?.creditosDisponiveis ?? 0) > 0 && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
                  <p className="text-[12.5px] font-semibold text-emerald-600">
                    Você tem {data?.creditosDisponiveis} corte(s) grátis disponível(is)
                  </p>
                  <p className="text-[11px] text-emerald-600/80 mt-0.5">
                    É só agendar — o desconto é aplicado pela barbearia no atendimento.
                  </p>
                </div>
              )}

              <div className="rounded-xl bg-secondary/50 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                  Seu link de convite
                </p>
                <p className="mt-1 break-all text-[12px] text-foreground">{link || "—"}</p>
              </div>

              <div className="flex gap-2">
                <Button onClick={compartilhar} className="h-11 flex-1 rounded-xl text-[13px] font-semibold">
                  <Share2 className="mr-2 h-4 w-4" />
                  Compartilhar
                </Button>
                <Button
                  variant="outline"
                  onClick={copiar}
                  className="h-11 rounded-xl px-4"
                  aria-label="Copiar link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </section>
          )}

          {/* ── Cliente do Mês ── */}
          {mes?.ativo && (
            <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <Crown className="h-[18px] w-[18px] text-foreground" strokeWidth={1.6} />
                <div>
                  <p className="text-[14px] font-semibold text-foreground">Cliente do Mês</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    Quem mais trouxer amigos no mês ganha um corte grátis
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-secondary/50 px-4 py-3">
                <p className="text-[12.5px] text-foreground">
                  Seus convites validados no ciclo: <b>{mes.meuTotal}</b>
                </p>
              </div>

              {mes.ranking.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  Nenhum convite validado ainda neste ciclo.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/40">
                  {mes.ranking.slice(0, 5).map((r, i) => (
                    <div
                      key={`${r.nome}-${i}`}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3",
                        i > 0 && "border-t border-border/40",
                        r.eu && "bg-secondary/40",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                          i === 0 ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate text-[13px] font-medium text-foreground">
                        {r.eu ? "Você" : r.nome}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {r.total} {r.total === 1 ? "convite" : "convites"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ClientCampaignsSheet;
