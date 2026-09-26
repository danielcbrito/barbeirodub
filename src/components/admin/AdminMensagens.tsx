import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

interface Message {
  id: number;
  chave: string;
  titulo: string;
  conteudo: string;
  ordem: number;
  ativo: boolean;
}

export function AdminMensagens() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    titulo: "",
    conteudo: "",
    ativo: true,
  });

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("informacoes_aplicativo")
      .select("id, chave, titulo, conteudo, categoria, ordem, ativo, atualizado_em, atualizado_por")
      .eq("categoria", "avisos")
      .order("ordem", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar mensagens");
      console.error(error);
    } else {
      setMessages(data || []);
    }
    setLoading(false);
  };

  const handleOpenDialog = (message?: Message) => {
    if (message) {
      setEditingMessage(message);
      setFormData({
        titulo: message.titulo,
        conteudo: message.conteudo,
        ativo: message.ativo,
      });
    } else {
      setEditingMessage(null);
      setFormData({
        titulo: "",
        conteudo: "",
        ativo: true,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingMessage(null);
    setFormData({
      titulo: "",
      conteudo: "",
      ativo: true,
    });
  };

  const handleSave = async () => {
    if (!formData.titulo.trim() || !formData.conteudo.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    if (editingMessage) {
      // Update existing message
      const { error } = await supabase
        .from("informacoes_aplicativo")
        .update({
          titulo: formData.titulo,
          conteudo: formData.conteudo,
          ativo: formData.ativo,
          atualizado_em: new Date().toISOString(),
          atualizado_por: user?.id,
        })
        .eq("id", editingMessage.id);

      if (error) {
        toast.error("Erro ao atualizar mensagem");
        console.error(error);
      } else {
        toast.success("Mensagem atualizada com sucesso");
        handleCloseDialog();
        loadMessages();
      }
    } else {
      // Create new message
      const maxOrdem = messages.length > 0 
        ? Math.max(...messages.map(m => m.ordem || 0))
        : 0;

      const { error } = await supabase
        .from("informacoes_aplicativo")
        .insert({
          categoria: "avisos",
          chave: `aviso_${Date.now()}`,
          titulo: formData.titulo,
          conteudo: formData.conteudo,
          ordem: maxOrdem + 1,
          ativo: formData.ativo,
          atualizado_por: user?.id,
        });

      if (error) {
        toast.error("Erro ao criar mensagem");
        console.error(error);
      } else {
        toast.success("Mensagem criada com sucesso");
        handleCloseDialog();
        loadMessages();
      }
    }
  };

  const handleToggleActive = async (message: Message) => {
    const { error } = await supabase
      .from("informacoes_aplicativo")
      .update({ ativo: !message.ativo })
      .eq("id", message.id);

    if (error) {
      toast.error("Erro ao atualizar status");
      console.error(error);
    } else {
      toast.success(
        !message.ativo ? "Mensagem ativada" : "Mensagem desativada"
      );
      loadMessages();
    }
  };

  const handleDeleteConfirm = (messageId: number) => {
    setMessageToDelete(messageId);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!messageToDelete) return;

    const { error } = await supabase
      .from("informacoes_aplicativo")
      .delete()
      .eq("id", messageToDelete);

    if (error) {
      toast.error("Erro ao excluir mensagem");
      console.error(error);
    } else {
      toast.success("Mensagem excluída com sucesso");
      loadMessages();
    }
    
    setDeleteDialogOpen(false);
    setMessageToDelete(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mensagens e Avisos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie as mensagens que aparecem para os usuários ao entrar no app
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Mensagem
        </Button>
      </div>

      {loading ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Carregando mensagens...</p>
        </Card>
      ) : messages.length === 0 ? (
        <Card className="p-8 text-center">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-4">
            Nenhuma mensagem cadastrada
          </p>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Criar primeira mensagem
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {messages.map((message) => (
            <Card key={message.id} className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">{message.titulo}</h3>
                    {message.ativo && (
                      <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full">
                        Ativa
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {message.conteudo}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`switch-${message.id}`} className="text-xs">
                      {message.ativo ? "Ativa" : "Inativa"}
                    </Label>
                    <Switch
                      id={`switch-${message.id}`}
                      checked={message.ativo}
                      onCheckedChange={() => handleToggleActive(message)}
                    />
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenDialog(message)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteConfirm(message.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMessage ? "Editar Mensagem" : "Nova Mensagem"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={formData.titulo}
                onChange={(e) =>
                  setFormData({ ...formData, titulo: e.target.value })
                }
                placeholder="Ex: App em fase de testes"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conteudo">Mensagem</Label>
              <Textarea
                id="conteudo"
                value={formData.conteudo}
                onChange={(e) =>
                  setFormData({ ...formData, conteudo: e.target.value })
                }
                placeholder="Digite a mensagem que aparecerá para os usuários..."
                rows={5}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="ativo"
                checked={formData.ativo}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, ativo: checked })
                }
              />
              <Label htmlFor="ativo">
                Mensagem {formData.ativo ? "ativa" : "inativa"}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingMessage ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta mensagem? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
