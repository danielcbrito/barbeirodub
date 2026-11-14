import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signOutAndClearDevice } from "@/lib/sessionGuard";
import { Label } from "@/components/ui/label";
import { 
  User, 
  Mail, 
  CreditCard, 
  Calendar, 
  Lock, 
  Save, 
  X, 
  Phone,
  Wallet,
  Bell,
  LogOut,
  ChevronRight,
  UserCircle,
  History,
  Gift,
  HelpCircle
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { validateCPF, formatCPF, formatPhone, validatePhone } from "@/lib/validators";
import { motion, AnimatePresence } from "framer-motion";
import { WalletSheet } from "./WalletSheet";
import { MyPlansSheet } from "./MyPlansSheet";
import { NotificationsSheet } from "./NotificationsSheet";
import { AppointmentHistorySheet } from "./AppointmentHistorySheet";
import { PointsDetailModal } from "./PointsDetailModal";
import { useNavigate } from "react-router-dom";

interface ProfileMenuItemProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  badge?: string;
  danger?: boolean;
  comingSoon?: boolean;
}

function ProfileMenuItem({ icon: Icon, label, onClick, badge, danger, comingSoon }: ProfileMenuItemProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full flex items-center justify-between p-4 rounded-xl transition-all duration-200 ${
        danger 
          ? "bg-red-500/10 hover:bg-red-500/20 text-red-500" 
          : "bg-zinc-800/50 hover:bg-zinc-800 text-foreground"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${danger ? "text-red-500" : "text-zinc-400"}`} />
        <span className="font-medium text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge && (
          <span className="px-2 py-0.5 bg-red-500 text-foreground text-xs font-bold rounded-full">
            {badge}
          </span>
        )}
        {comingSoon && (
          <span className="px-2 py-0.5 bg-zinc-700 text-zinc-400 text-xs font-medium rounded-full">
            Em breve
          </span>
        )}
        <ChevronRight className={`w-4 h-4 ${danger ? "text-red-500/50" : "text-zinc-600"}`} />
      </div>
    </motion.button>
  );
}

interface MyProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
  profile: any;
  onProfileUpdate: () => void;
  credits?: number;
  points?: number;
  completedAppointments?: number;
  redemptions?: number;
  requiredPoints?: number;
}

export function MyProfileSheet({ 
  open, 
  onOpenChange, 
  userId, 
  profile, 
  onProfileUpdate,
  credits = 0,
  points = 0,
  completedAppointments = 0,
  redemptions = 0,
  requiredPoints = 5
}: MyProfileSheetProps) {
  const navigate = useNavigate();
  const [view, setView] = useState<"menu" | "edit">("menu");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    cpf: "",
    telefone: ""
  });
  const [userEmail, setUserEmail] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [telefoneError, setTelefoneError] = useState("");
  
  // Sub-sheets
  const [walletOpen, setWalletOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (open && profile) {
      setFormData({
        nome: profile.nome || "",
        email: userEmail || "",
        cpf: formatCPF(profile.cpf || ""),
        telefone: formatPhone(profile.telefone || "")
      });
      loadUserData();
      setView("menu");
      setEditing(false);
    }
  }, [open, profile]);

  const loadUserData = async () => {
    if (!userId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserEmail(user.email || "");
      setCreatedAt(user.created_at || "");
      setFormData(prev => ({ ...prev, email: user.email || "" }));
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSave = async () => {
    if (!userId) return;

    const cleanCPF = formData.cpf.replace(/\D/g, '');
    const cleanPhone = formData.telefone.replace(/\D/g, '');

    if (cleanCPF && !validateCPF(cleanCPF)) {
      toast.error("CPF inválido. Verifique e tente novamente.");
      return;
    }

    if (cleanPhone && !validatePhone(cleanPhone)) {
      toast.error("Por favor, insira um telefone válido.");
      return;
    }

    setLoading(true);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        nome: formData.nome,
        cpf: cleanCPF,
        telefone: cleanPhone
      })
      .eq("id", userId);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      toast.error("Erro ao atualizar perfil");
      setLoading(false);
      return;
    }

    if (formData.email !== userEmail) {
      const { error: emailError } = await supabase.auth.updateUser({
        email: formData.email
      });

      if (emailError) {
        console.error("Error updating email:", emailError);
        toast.error("Erro ao atualizar e-mail");
        setLoading(false);
        return;
      }
    }

    toast.success("Perfil atualizado com sucesso!");
    setEditing(false);
    setView("menu");
    onProfileUpdate();
    setLoading(false);
  };

  const handleCancel = () => {
    setFormData({
      nome: profile?.nome || "",
      email: userEmail || "",
      cpf: formatCPF(profile?.cpf || ""),
      telefone: formatPhone(profile?.telefone || "")
    });
    setCpfError("");
    setTelefoneError("");
    setEditing(false);
    setView("menu");
  };

  const handleInputChange = (field: string, value: string) => {
    let formattedValue = value;

    if (field === "cpf") {
      formattedValue = formatCPF(value);
      const cleanCPF = value.replace(/\D/g, '');
      if (cleanCPF.length === 11) {
        if (!validateCPF(cleanCPF)) {
          setCpfError("CPF inválido. Verifique e tente novamente.");
        } else {
          setCpfError("");
        }
      } else {
        setCpfError("");
      }
    } else if (field === "telefone") {
      formattedValue = formatPhone(value);
      const cleanPhone = value.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        if (!validatePhone(cleanPhone)) {
          setTelefoneError("Por favor, insira um telefone válido.");
        } else {
          setTelefoneError("");
        }
      } else {
        setTelefoneError("");
      }
    }

    setFormData({ ...formData, [field]: formattedValue });
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOutAndClearDevice((url) => navigate(url));
      toast.success("Você saiu da conta");
    } catch (error) {
      toast.error("Erro ao sair da conta");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleEditProfile = () => {
    setView("edit");
    setEditing(true);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="bottom" 
          className="h-[90vh] bg-gradient-to-b from-zinc-900 to-zinc-950 border-zinc-800 rounded-t-3xl p-0"
        >
          <SheetHeader className="p-5 pb-0">
            <SheetTitle className="text-foreground text-lg font-bold text-left flex items-center gap-2">
              {view === "edit" && (
                <button 
                  onClick={handleCancel}
                  className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition-colors"
                >
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              )}
              {view === "menu" ? "Meu Perfil" : "Editar Dados"}
            </SheetTitle>
          </SheetHeader>

          <AnimatePresence mode="wait">
            {view === "menu" ? (
              <motion.div 
                key="menu"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-5 pt-4 space-y-5 overflow-y-auto h-full pb-32"
              >
                {/* User Info Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700/50"
                >
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                    <span className="text-foreground font-bold text-lg">
                      {profile?.nome ? getInitials(profile.nome) : "U"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground font-semibold text-base truncate">
                      {profile?.nome || "Usuário"}
                    </p>
                    <p className="text-zinc-400 text-sm truncate">
                      {userEmail || "email@exemplo.com"}
                    </p>
                  </div>
                </motion.div>

                {/* Account Section */}
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold px-1">
                    Conta
                  </p>
                  <div className="space-y-2">
                    <ProfileMenuItem
                      icon={Wallet}
                      label="Minha Carteira"
                      onClick={() => setWalletOpen(true)}
                      badge={credits > 0 ? `R$ ${credits}` : undefined}
                    />
                    <ProfileMenuItem
                      icon={CreditCard}
                      label="Meus Planos"
                      onClick={() => setPlansOpen(true)}
                    />
                    <ProfileMenuItem
                      icon={UserCircle}
                      label="Meus Dados"
                      onClick={handleEditProfile}
                    />
                  </div>
                </div>

                {/* Preferences Section */}
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold px-1">
                    Preferências
                  </p>
                  <div className="space-y-2">
                    <ProfileMenuItem
                      icon={Bell}
                      label="Notificações"
                      onClick={() => setNotificationsOpen(true)}
                    />
                  </div>
                </div>

                {/* More Section */}
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold px-1">
                    Mais
                  </p>
                  <div className="space-y-2">
                    <ProfileMenuItem
                      icon={History}
                      label="Histórico de Agendamentos"
                      onClick={() => setHistoryOpen(true)}
                    />
                    <ProfileMenuItem
                      icon={Gift}
                      label="Programa de Pontos"
                      onClick={() => setPointsModalOpen(true)}
                      badge={redemptions > 0 ? `${redemptions} disponível` : undefined}
                    />
                    <ProfileMenuItem
                      icon={HelpCircle}
                      label="Central de Ajuda"
                      onClick={() => toast.info("Em breve")}
                      comingSoon
                    />
                  </div>
                </div>

                {/* Logout Section */}
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full h-12 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl font-semibold"
                  >
                    <LogOut className="w-5 h-5 mr-2" />
                    {isLoggingOut ? "Saindo..." : "Sair da Conta"}
                  </Button>
                </div>

                {/* Version */}
                <p className="text-center text-xs text-zinc-600 pt-4">
                  Barbearia Dub • v1.0.0
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key="edit"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-5 pt-4 space-y-4 overflow-y-auto h-full pb-32"
              >
                <div className="space-y-4 bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50">
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-2 text-zinc-400">
                      <User className="w-3.5 h-3.5" />
                      Nome completo
                    </Label>
                    <Input
                      value={formData.nome}
                      onChange={(e) => handleInputChange('nome', e.target.value)}
                      className="h-11 bg-zinc-900 border-zinc-700 text-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-2 text-zinc-400">
                      <Mail className="w-3.5 h-3.5" />
                      E-mail
                    </Label>
                    <Input
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      type="email"
                      className="h-11 bg-zinc-900 border-zinc-700 text-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-2 text-zinc-400">
                      <CreditCard className="w-3.5 h-3.5" />
                      CPF
                    </Label>
                    <Input
                      value={formData.cpf}
                      onChange={(e) => handleInputChange('cpf', e.target.value)}
                      maxLength={14}
                      className={`h-11 bg-zinc-900 border-zinc-700 text-foreground ${cpfError ? 'border-red-500' : ''}`}
                      placeholder="000.000.000-00"
                    />
                    {cpfError && (
                      <p className="text-xs text-red-500">{cpfError}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-2 text-zinc-400">
                      <Phone className="w-3.5 h-3.5" />
                      Telefone
                    </Label>
                    <Input
                      value={formData.telefone}
                      onChange={(e) => handleInputChange('telefone', e.target.value)}
                      maxLength={15}
                      className={`h-11 bg-zinc-900 border-zinc-700 text-foreground ${telefoneError ? 'border-red-500' : ''}`}
                      placeholder="(99) 99999-9999"
                    />
                    {telefoneError && (
                      <p className="text-xs text-red-500">{telefoneError}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-2 text-zinc-400">
                      <Lock className="w-3.5 h-3.5" />
                      Senha
                    </Label>
                    <Input
                      value="••••••••"
                      disabled
                      type="password"
                      className="h-11 bg-zinc-900 border-zinc-700 text-zinc-500"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-500 hover:bg-red-500/10"
                      onClick={() => toast.info("Alteração de senha em breve")}
                    >
                      Alterar senha
                    </Button>
                  </div>

                  {createdAt && (
                    <div className="pt-3 border-t border-zinc-700">
                      <Label className="text-xs flex items-center gap-2 text-zinc-500">
                        <Calendar className="w-3.5 h-3.5" />
                        Membro desde {format(new Date(createdAt), "dd/MM/yyyy", { locale: ptBR })}
                      </Label>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleCancel}
                    variant="ghost"
                    className="flex-1 h-12 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={loading || !!cpfError || !!telefoneError}
                    className="flex-1 h-12 bg-red-500 hover:bg-red-600 text-foreground rounded-xl"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {loading ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SheetContent>
      </Sheet>

      {/* Nested Sheets */}
      <WalletSheet 
        open={walletOpen} 
        onOpenChange={setWalletOpen}
        userId={userId}
      />
      <MyPlansSheet 
        open={plansOpen} 
        onOpenChange={setPlansOpen}
        userId={userId}
      />
      <NotificationsSheet 
        open={notificationsOpen} 
        onOpenChange={setNotificationsOpen}
        userId={userId}
      />
      <AppointmentHistorySheet 
        open={historyOpen} 
        onOpenChange={setHistoryOpen}
        userId={userId}
      />
      <PointsDetailModal
        open={pointsModalOpen}
        onOpenChange={setPointsModalOpen}
        points={points}
        completedAppointments={completedAppointments}
        redemptions={redemptions}
        requiredPoints={requiredPoints}
      />
    </>
  );
}
