import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, Calendar, CheckCircle2, AlertCircle, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Subscription {
  id: string;
  status: string;
  next_billing_date: string | null;
  payment_method: string | null;
  plano: {
    nome: string;
    descricao: string;
    preco_mensal: number;
    beneficios_json: any;
  };
}

interface MyPlansSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
}

type LoadingState = "idle" | "loading" | "error" | "success";

export function MyPlansSheet({ open, onOpenChange, userId }: MyPlansSheetProps) {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (open && userId) {
      loadSubscription();
    }
  }, [open, userId]);

  const loadSubscription = async () => {
    if (!userId) {
      setLoadingState("error");
      setErrorMessage("Usuário não autenticado");
      return;
    }

    setLoadingState("loading");
    setErrorMessage("");
    
    try {
      const { data, error } = await supabase
        .from("assinaturas")
        .select(`
          id,
          status,
          next_billing_date,
          payment_method,
          plano:planos(
            nome,
            descricao,
            preco_mensal,
            beneficios_json
          )
        `)
        .eq("user_id", userId)
        .in("status", ["active", "suspended", "pending_cash"])
        .maybeSingle();

      if (error) {
        console.error("Error loading subscription:", error);
        setLoadingState("error");
        setErrorMessage("Não foi possível carregar os dados do plano. Tente novamente.");
        toast.error("Erro ao carregar plano");
      } else {
        setSubscription(data);
        setLoadingState("success");
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setLoadingState("error");
      setErrorMessage("Erro inesperado ao carregar planos. Verifique sua conexão.");
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
      active: { label: "Ativo", variant: "default" },
      suspended: { label: "Aguardando Pagamento", variant: "secondary" },
      pending_cash: { label: "Aguardando Confirmação", variant: "secondary" },
      past_due: { label: "Vencido", variant: "destructive" },
      cancelled: { label: "Cancelado", variant: "secondary" },
    };
    return statusMap[status] || { label: status, variant: "secondary" };
  };

  const handleSubscribeClick = () => {
    onOpenChange(false);
    setTimeout(() => navigate("/cliente/assinar"), 300);
  };

  const handleCancelSubscription = async () => {
    setCanceling(true);

    try {
      const { error } = await supabase.functions.invoke('cancel-subscription');

      if (error) throw error;

      toast.success("Assinatura cancelada com sucesso");
      setCancelDialogOpen(false);
      loadSubscription();
    } catch (error: any) {
      console.error('Cancel subscription error:', error);
      toast.error("Erro ao cancelar assinatura: " + error.message);
    } finally {
      setCanceling(false);
    }
  };

  const renderLoadingState = () => (
    <div className="space-y-4 py-4">
      <Card className="p-5 border-0">
        <Skeleton className="h-6 w-3/4 mb-3" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-2/3 mb-4" />
        <Skeleton className="h-20 w-full" />
      </Card>
    </div>
  );

  const renderErrorState = () => (
    <div className="text-center py-12 space-y-6">
      <AlertCircle className="w-16 h-16 mx-auto text-destructive opacity-70" />
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Erro ao carregar planos</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          {errorMessage || "Não foi possível carregar os planos. Tente novamente."}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          onClick={loadSubscription}
          variant="default"
          className="h-11 px-6"
        >
          <Loader2 className="w-4 h-4 mr-2" />
          Tentar Novamente
        </Button>
        <Button
          onClick={() => onOpenChange(false)}
          variant="ghost"
          size="sm"
        >
          Voltar
        </Button>
      </div>
    </div>
  );

  const renderEmptyState = () => (
    <div className="text-center py-12 space-y-6">
      <Gift className="w-16 h-16 mx-auto text-muted-foreground opacity-50" />
      <div className="space-y-2">
        <p className="text-sm font-medium">Você ainda não possui um plano ativo</p>
        <p className="text-xs text-muted-foreground">
          Assine um plano e aproveite benefícios exclusivos
        </p>
      </div>
      <Button
        onClick={handleSubscribeClick}
        className="h-12 px-8 bg-primary hover:bg-primary/90 transition-all duration-300"
      >
        Assinar um Plano
      </Button>
    </div>
  );

  const renderSubscriptionCard = () => (
    <Card className="p-5 border-0 shadow-elegant">
      <div 
        className="space-y-4 p-4 rounded-lg"
        style={{
          background: "linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--primary) / 0.15) 100%)"
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-base font-semibold">{subscription?.plano.nome}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {subscription?.plano.descricao}
            </p>
          </div>
          <Badge variant={getStatusBadge(subscription?.status || "").variant}>
            {getStatusBadge(subscription?.status || "").label}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Gift className="w-4 h-4 text-gold" />
          <span className="font-semibold text-gold">
            R$ {Number(subscription?.plano.preco_mensal || 0).toFixed(2)}/mês
          </span>
        </div>

        {subscription?.next_billing_date && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span>
              Próxima cobrança: {format(new Date(subscription.next_billing_date), "dd/MM/yyyy", { locale: ptBR })}
            </span>
          </div>
        )}

        <div className="space-y-2 pt-3 border-t border-border/20">
          <p className="text-xs font-medium">Benefícios inclusos:</p>
          {subscription?.plano.beneficios_json?.map((benefit: string, index: number) => (
            <div key={index} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-gold flex-shrink-0" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full h-8 text-xs hover:bg-destructive/10 text-destructive transition-all duration-300"
          onClick={() => setCancelDialogOpen(true)}
        >
          <XCircle className="w-3.5 h-3.5 mr-2" />
          Cancelar Assinatura
        </Button>
      </div>
    </Card>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-[10px]">
          <SheetHeader>
            <SheetTitle className="text-lg">Meus Planos</SheetTitle>
            <SheetDescription className="sr-only">
              Gerencie suas assinaturas e planos ativos
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4 overflow-y-auto h-[calc(85vh-80px)] pb-6">
            {loadingState === "loading" && renderLoadingState()}
            {loadingState === "error" && renderErrorState()}
            {loadingState === "success" && !subscription && renderEmptyState()}
            {loadingState === "success" && subscription && renderSubscriptionCard()}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Assinatura</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar sua assinatura? Você perderá acesso aos benefícios do plano.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={canceling}
              className="bg-destructive hover:bg-destructive/90"
            >
              {canceling ? "Cancelando..." : "Confirmar Cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
