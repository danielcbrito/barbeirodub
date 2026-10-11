import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Clock, AlertCircle, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  location: string | null;
  error_message: string | null;
  created_at: string;
  user_id: string;
  profile?: {
    nome: string;
  };
}

/**
 * Painel de tickets de suporte para o admin
 * Visualiza e gerencia todos os tickets reportados
 */
export function AdminSuporteTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTickets();

    // Real-time updates
    const channel = supabase
      .channel(`support-tickets-changes-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'support_tickets' },
        () => loadTickets()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, user_id, title, description, category, status, priority, location, error_message, created_at, updated_at, resolved_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Buscar perfis dos usuários
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(t => t.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        
        setTickets(data.map(ticket => ({
          ...ticket,
          profile: profileMap.get(ticket.user_id)
        })));
      } else {
        setTickets([]);
      }
    } catch (error: any) {
      console.error('Erro ao carregar tickets:', error);
      toast.error('Erro ao carregar tickets');
    } finally {
      setLoading(false);
    }
  };

  const updateTicketStatus = async (ticketId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ 
          status,
          resolved_at: status === 'resolved' ? new Date().toISOString() : null
        })
        .eq('id', ticketId);

      if (error) throw error;

      toast.success(`Ticket ${status === 'resolved' ? 'resolvido' : 'atualizado'}!`);
      loadTickets();
    } catch (error: any) {
      console.error('Erro ao atualizar ticket:', error);
      toast.error('Erro ao atualizar ticket');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-destructive';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-muted';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <Clock className="h-4 w-4" />;
      case 'in_progress': return <AlertCircle className="h-4 w-4" />;
      case 'resolved': return <CheckCircle className="h-4 w-4" />;
      case 'closed': return <CheckCircle className="h-4 w-4" />;
      default: return <MessageCircle className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tickets de Suporte</h1>
        <p className="text-muted-foreground">
          Gerencie todos os tickets e problemas reportados pelos usuários
        </p>
      </div>

      {/* Estatísticas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Abertos</p>
              <p className="text-2xl font-bold">
                {tickets.filter(t => t.status === 'open').length}
              </p>
            </div>
            <Clock className="h-8 w-8 text-yellow-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Em Progresso</p>
              <p className="text-2xl font-bold">
                {tickets.filter(t => t.status === 'in_progress').length}
              </p>
            </div>
            <AlertCircle className="h-8 w-8 text-orange-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Resolvidos</p>
              <p className="text-2xl font-bold">
                {tickets.filter(t => t.status === 'resolved').length}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{tickets.length}</p>
            </div>
            <MessageCircle className="h-8 w-8 text-primary" />
          </div>
        </Card>
      </div>

      {/* Lista de tickets */}
      <div className="space-y-4">
        {tickets.length === 0 ? (
          <Card className="p-12 text-center">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum ticket de suporte ainda</p>
          </Card>
        ) : (
          tickets.map(ticket => (
            <Card key={ticket.id} className="p-6">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className={getPriorityColor(ticket.priority)}>
                        {ticket.priority.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1">
                        {getStatusIcon(ticket.status)}
                        {ticket.status}
                      </Badge>
                      <Badge variant="secondary">{ticket.category}</Badge>
                    </div>
                    <h3 className="text-lg font-semibold mb-1">{ticket.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {ticket.profile?.nome || 'Usuário'} • {format(new Date(ticket.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>

                {/* Conteúdo */}
                <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                  <p className="text-sm">{ticket.description}</p>
                  
                  {ticket.location && (
                    <p className="text-xs text-muted-foreground">
                      📍 Localização: <code className="bg-muted px-2 py-1 rounded">{ticket.location}</code>
                    </p>
                  )}
                  
                  {ticket.error_message && (
                    <p className="text-xs text-destructive">
                      ⚠️ Erro: <code className="bg-destructive/10 px-2 py-1 rounded">{ticket.error_message}</code>
                    </p>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2">
                  {ticket.status === 'open' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => updateTicketStatus(ticket.id, 'in_progress')}
                      >
                        Em Progresso
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateTicketStatus(ticket.id, 'resolved')}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Resolver
                      </Button>
                    </>
                  )}

                  {ticket.status === 'in_progress' && (
                    <Button
                      size="sm"
                      onClick={() => updateTicketStatus(ticket.id, 'resolved')}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Marcar como Resolvido
                    </Button>
                  )}

                  {ticket.status === 'resolved' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateTicketStatus(ticket.id, 'closed')}
                    >
                      Fechar Ticket
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                  >
                    Ver Conversa Completa
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}