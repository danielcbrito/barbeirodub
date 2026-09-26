import { Send, Paperclip, Mic, X, Image as ImageIcon, FileText, StopCircle, AlertTriangle, CreditCard, Lock, Bug, RefreshCw, Loader2 } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import logoImage from "@/assets/logo-dub.png";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachments?: Array<{
    type: "image" | "file" | "audio";
    url: string;
    name: string;
  }>;
  isAction?: boolean;
  actionType?: "loading" | "success" | "error";
}

const quickSuggestions = [
  {
    icon: AlertTriangle,
    title: "Problema com agendamento",
    message: "Estou tendo problemas para agendar um horário"
  },
  {
    icon: CreditCard,
    title: "Erro no pagamento",
    message: "Meu pagamento não foi processado corretamente"
  },
  {
    icon: Lock,
    title: "Não consigo acessar",
    message: "Não estou conseguindo acessar minha conta"
  },
  {
    icon: Bug,
    title: "Reportar bug",
    message: "Encontrei um erro no aplicativo"
  }
];

/**
 * Interface de Chat Premium 2025 — Agente IA Inteligente
 * Com histórico persistente e indicadores de ações
 */
export function SupportChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Carregar usuário e histórico de conversas
  useEffect(() => {
    const loadUserAndHistory = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          setUserId(user.id);
          
          // Buscar conversa ativa mais recente do usuário
          const { data: conversations } = await supabase
            .from('support_conversations')
            .select('id, created_at')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('last_message_at', { ascending: false })
            .limit(1);

          if (conversations && conversations.length > 0) {
            const convId = conversations[0].id;
            setConversationId(convId);
            
            // Carregar mensagens dessa conversa
            const { data: messagesData } = await supabase
              .from('support_messages')
              .select('role, content, created_at, metadata')
              .eq('conversation_id', convId)
              .order('created_at', { ascending: true });

            if (messagesData && messagesData.length > 0) {
              const loadedMessages: Message[] = messagesData.map(msg => {
                const metadata = msg.metadata as Record<string, any> | null;
                return {
                  role: msg.role as "user" | "assistant",
                  content: msg.content,
                  timestamp: new Date(msg.created_at),
                  isAction: metadata?.isAction || false,
                  actionType: metadata?.actionType
                };
              });
              
              setMessages(loadedMessages);
            }
          }
        }
      } catch (error) {
        console.error('Erro ao carregar histórico:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadUserAndHistory();
  }, []);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    adjustTextareaHeight();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(track => track.stop());
        await convertAudioToText(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.success("Ouvindo...");
    } catch (error) {
      console.error("Erro ao iniciar gravação:", error);
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const convertAudioToText = async (audioBlob: Blob) => {
    try {
      toast.info("Convertendo áudio em texto...");
      
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        const { data, error } = await supabase.functions.invoke("speech-to-text", {
          body: { audio: base64Audio }
        });

        if (error) throw error;

        if (data?.text) {
          setInput(data.text);
          toast.success("Mensagem transcrita");
          adjustTextareaHeight();
        }
      };
    } catch (error) {
      console.error("Erro ao converter áudio:", error);
      toast.error("Erro ao converter áudio em texto");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend && selectedFiles.length === 0) return;

    const userMessage: Message = {
      role: "user",
      content: textToSend,
      timestamp: new Date(),
      attachments: selectedFiles.map(file => ({
        type: file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "file",
        url: URL.createObjectURL(file),
        name: file.name
      }))
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setSelectedFiles([]);
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const { data, error } = await supabase.functions.invoke("ai-support-chat", {
        body: {
          message: textToSend,
          conversationId,
          guestName: "Usuário",
          guestEmail: "guest@example.com"
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }
    } catch (error: any) {
      console.error("Erro ao enviar mensagem:", error);
      toast.error("Erro ao enviar mensagem. Tente novamente.");
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewConversation = useCallback(async () => {
    setMessages([]);
    setConversationId(null);
    toast.success("Nova conversa iniciada");
  }, []);

  // Loading de histórico
  if (isLoadingHistory) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-foreground/40 text-sm">Carregando histórico...</p>
        </motion.div>
      </div>
    );
  }

  // Tela de boas-vindas
  const renderWelcomeScreen = () => (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="text-center max-w-md"
      >
        {/* Logo/Avatar */}
        <div className="relative mb-8">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-muted flex items-center justify-center border border-border/80 shadow-md">
            <img src={logoImage} alt="DUB" className="w-12 h-12 object-contain" />
          </div>
        </div>

        {/* Título */}
        <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">
          Suporte Dub
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">
          Atendimento técnico especializado para auxiliar você com seu sistema e suas operações.
        </p>
      </motion.div>

      {/* Sugestões */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
        className="w-full max-w-lg px-4"
      >
        <div className="grid grid-cols-2 gap-3">
          {quickSuggestions.map((suggestion, index) => {
            const Icon = suggestion.icon;
            return (
              <motion.button
                key={index}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
                onClick={() => sendMessage(suggestion.message)}
                className="group p-4 rounded-2xl bg-foreground/[0.03] border border-foreground/[0.06] hover:bg-foreground/[0.06] hover:border-foreground/10 transition-all duration-300 text-left active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-foreground/[0.05] group-hover:bg-primary/10 transition-colors duration-300">
                    <Icon className="h-4 w-4 text-foreground/40 group-hover:text-primary transition-colors duration-300" />
                  </div>
                  <span className="text-[13px] text-foreground/60 group-hover:text-foreground/80 font-medium transition-colors duration-300">
                    {suggestion.title}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );

  // Área de mensagens
  const renderMessages = () => (
    <div ref={scrollAreaRef} className="flex-1 overflow-y-auto px-4 md:px-6">
      {/* Botão nova conversa */}
      {messages.length > 0 && (
        <div className="sticky top-0 z-10 py-3 flex justify-center">
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={startNewConversation}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-foreground/[0.04] border border-foreground/[0.08] hover:bg-foreground/[0.08] text-foreground/50 hover:text-foreground/70 text-xs font-medium transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Nova conversa
          </motion.button>
        </div>
      )}

      <div className="max-w-2xl mx-auto py-6 space-y-5">
        <AnimatePresence mode="popLayout">
          {messages.map((message, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {/* Avatar do assistente */}
              {message.role === "assistant" && (
                <div className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-foreground/10">
                  <img src={logoImage} alt="DUB" className="w-5 h-5 object-contain" />
                </div>
              )}
              
              {/* Balão da mensagem */}
              <div className={cn("max-w-[85%] md:max-w-[75%]", message.role === "user" ? "order-1" : "")}>
                {/* Attachments */}
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {message.attachments.map((attachment, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06]">
                        {attachment.type === "image" ? (
                          <>
                            <ImageIcon className="h-4 w-4 text-foreground/40" />
                            <img src={attachment.url} alt={attachment.name} className="max-w-xs rounded-lg" />
                          </>
                        ) : attachment.type === "audio" ? (
                          <>
                            <Mic className="h-4 w-4 text-foreground/40" />
                            <audio src={attachment.url} controls className="max-w-xs" />
                          </>
                        ) : (
                          <>
                            <FileText className="h-4 w-4 text-foreground/40" />
                            <span className="text-xs text-foreground/60">{attachment.name}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Conteúdo */}
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "bg-primary/90 text-foreground"
                      : "bg-foreground/[0.04] border border-foreground/[0.06] text-foreground/90"
                  )}
                >
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                </div>
                
                {/* Timestamp */}
                <p className={cn(
                  "text-[11px] mt-1.5 px-1",
                  message.role === "user" ? "text-right text-foreground/40" : "text-foreground/30"
                )}>
                  {message.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>

              {/* Avatar do usuário */}
              {message.role === "user" && (
                <div className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center border border-primary/20 order-2">
                  <span className="text-xs font-semibold text-foreground/80">EU</span>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading indicator */}
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-foreground/10">
              <img src={logoImage} alt="DUB" className="w-5 h-5 object-contain" />
            </div>
            <div className="bg-foreground/[0.04] border border-foreground/[0.06] rounded-2xl px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs text-foreground/40">Analisando e resolvendo...</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full relative">
      {/* Área de conteúdo */}
      {messages.length === 0 && !isLoading ? renderWelcomeScreen() : renderMessages()}

      {/* Input flutuante */}
      <div className="shrink-0 px-4 pb-6 pt-2">
        <div className="max-w-2xl mx-auto">
          {/* Preview de arquivos */}
          <AnimatePresence>
            {selectedFiles.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-3 flex flex-wrap gap-2"
              >
                {selectedFiles.map((file, index) => (
                  <div 
                    key={index} 
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-sm"
                  >
                    {file.type.startsWith("image/") ? (
                      <ImageIcon className="h-4 w-4 text-foreground/40" />
                    ) : file.type.startsWith("audio/") ? (
                      <Mic className="h-4 w-4 text-foreground/40" />
                    ) : (
                      <FileText className="h-4 w-4 text-foreground/40" />
                    )}
                    <span className="text-xs text-foreground/60">{file.name}</span>
                    <button 
                      onClick={() => removeFile(index)} 
                      className="hover:text-red-400 transition-colors"
                    >
                      <X className="h-3.5 w-3.5 text-foreground/40" />
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Container do input */}
          <motion.div 
            animate={{ 
              boxShadow: isFocused 
                ? "0 0 0 1px rgba(239, 68, 68, 0.3), 0 8px 40px -8px rgba(0, 0, 0, 0.5)" 
                : "0 4px 24px -4px rgba(0, 0, 0, 0.4)"
            }}
            transition={{ duration: 0.2 }}
            className={cn(
              "relative flex items-end gap-2 p-2 rounded-2xl transition-all duration-200",
              "bg-foreground/[0.04] border",
              isFocused ? "border-primary/30" : "border-foreground/[0.08]"
            )}
          >
            {/* Botão de anexo */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl shrink-0 hover:bg-foreground/[0.06] text-foreground/40 hover:text-foreground/60 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              <Paperclip className="h-[18px] w-[18px]" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Descreva seu problema..."
              disabled={isLoading}
              className="flex-1 min-h-[36px] max-h-[120px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1 py-2 text-[15px] text-foreground placeholder:text-foreground/30 focus:outline-none leading-tight"
              rows={1}
            />

            {/* Botões de ação */}
            <div className="flex items-center gap-1">
              {/* Botão de áudio */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-9 w-9 rounded-xl shrink-0 transition-all duration-200",
                  isRecording 
                    ? "bg-red-500/20 hover:bg-red-500/30 text-red-400" 
                    : "hover:bg-foreground/[0.06] text-foreground/40 hover:text-foreground/60"
                )}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isLoading}
              >
                {isRecording ? <StopCircle className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
              </Button>

              {/* Botão de enviar */}
              <Button
                type="button"
                size="icon"
                className={cn(
                  "h-9 w-9 rounded-xl shrink-0 transition-all duration-200",
                  input.trim() || selectedFiles.length > 0
                    ? "bg-primary hover:bg-primary/90 text-foreground"
                    : "bg-foreground/[0.06] text-foreground/20 cursor-not-allowed"
                )}
                onClick={() => sendMessage()}
                disabled={isLoading || (!input.trim() && selectedFiles.length === 0)}
              >
                <Send className="h-[18px] w-[18px]" />
              </Button>
            </div>
          </motion.div>

          {/* Disclaimer */}
          <p className="text-[11px] text-foreground/20 text-center mt-3">
            IA com acesso aos seus dados para resolver problemas automaticamente
          </p>
        </div>
      </div>
    </div>
  );
}
