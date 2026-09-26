import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle, Clock, ExternalLink, Phone, Mail, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PendingTicket {
  id: string;
  pending_ticket_id: string;
  created_at: string;
  user_name: string;
  user_phone: string;
  user_email: string;
  summary: string;
  description: string;
  priority: string;
  category: string;
  retry_count: number;
  status: string;
  last_error: string;
  conversation_id: string;
}

export function AdminSuporteTicketsPendentes() {
  const [pendingTickets, setPendingTickets] = useState<PendingTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    fetchPendingTickets();
    
    // Atualizar a cada 30 segundos
    const interval = setInterval(fetchPendingTickets, 30000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  const fetchPendingTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('pending_tickets')
        .select('id, pending_ticket_id, summary, description, category, priority, status, user_id, user_name, user_email, user_phone, retry_count, last_error, created_at, updated_at, conversation_id')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!mountedRef.current) return;
      setPendingTickets(data || []);
    } catch (error) {
      console.error('Erro ao buscar tickets pendentes:', error);
      toast({
        title: "Erro ao carregar tickets pendentes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (ticketId: string) => {
    try {
      const { error } = await supabase
        .from('pending_tickets')
        .update({ 
          status: 'resolved',
          resolved_at: new Date().toISOString()
        })
        .eq('id', ticketId);

      if (error) throw error;

      toast({
        title: "Ticket marcado como resolvido",
        description: "O ticket pendente foi resolvido manualmente",
      });

      fetchPendingTickets();
    } catch (error) {
      console.error('Erro ao resolver ticket:', error);
      toast({
        title: "Erro ao resolver ticket",
        variant: "destructive",
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'pending': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (pendingTickets.length === 0) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Nenhum ticket pendente</h3>
        <p className="text-sm text-muted-foreground">
          Todos os tickets foram criados com sucesso
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="h-5 w-5 text-orange-500" />
        <h3 className="text-lg font-semibold">
          Tickets Pendentes ({pendingTickets.length})
        </h3>
      </div>

      {pendingTickets.map((ticket) => (
        <Card key={ticket.id} className="p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={getPriorityColor(ticket.priority)}>
                  {ticket.priority}
                </Badge>
                <Badge variant="outline" className={getStatusColor(ticket.status)}>
                  {ticket.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  ID: {ticket.pending_ticket_id}
                </span>
              </div>
              
              <h4 className="font-semibold text-lg">{ticket.summary}</h4>
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {format(new Date(ticket.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </div>
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {ticket.retry_count} tentativas
                </div>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleResolve(ticket.id)}
              disabled={ticket.status === 'resolved'}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Marcar Resolvido
            </Button>
          </div>

          {/* Informações do cliente */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
            {ticket.user_name && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{ticket.user_name}</span>
              </div>
            )}
            {ticket.user_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${ticket.user_phone}`} className="text-sm hover:text-primary">
                  {ticket.user_phone}
                </a>
              </div>
            )}
            {ticket.user_email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${ticket.user_email}`} className="text-sm hover:text-primary">
                  {ticket.user_email}
                </a>
              </div>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground font-medium">Descrição:</p>
            <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">
              {ticket.description}
            </p>
          </div>

          {/* Erro */}
          {ticket.last_error && (
            <div className="space-y-2">
              <p className="text-sm text-red-500 font-medium">Último erro:</p>
              <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-lg font-mono">
                {ticket.last_error}
              </p>
            </div>
          )}

          {/* Link para conversa */}
          {ticket.conversation_id && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => window.open(`/admin/suporte?conversation=${ticket.conversation_id}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Ver conversa completa
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}