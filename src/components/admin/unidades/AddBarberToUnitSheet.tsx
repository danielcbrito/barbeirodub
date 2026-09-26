import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/lib/queryKeys';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { RoleLevel } from '@/hooks/useBarberUnitRoles';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ChevronLeft, ArrowRight, Check, Loader2, Mail, User, Info } from 'lucide-react';

// ── Props ──────────────────────────────────────────────────
interface AddBarberToUnitSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadeId: string;
  unidadeNome: string;
  onSuccess: () => void;
}

// ── Role config ────────────────────────────────────────────
const ROLE_OPTIONS: { value: RoleLevel; label: string; description: string }[] = [
  { value: 'barber', label: 'Barbeiro', description: 'Acessa apenas sua própria agenda e financeiro pessoal.' },
  { value: 'unit_admin', label: 'Admin da Unidade', description: 'Gerencia todos os barbeiros e configurações desta unidade.' },
  { value: 'full_control', label: 'Controle Total', description: 'Acesso idêntico ao dono. Todas as unidades e configurações.' },
];

const ROLE_BADGE: Record<RoleLevel, { label: string; variant: 'secondary' | 'outline'; className?: string }> = {
  barber: { label: 'Barbeiro', variant: 'secondary' },
  unit_admin: { label: 'Admin da Unidade', variant: 'outline', className: 'border-amber-500/50 text-amber-400 bg-amber-500/10' },
  full_control: { label: 'Controle Total', variant: 'outline' },
};

// ── Helpers ────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailLookupStatus = 'idle' | 'checking' | 'found' | 'not_found';

// ── Component ──────────────────────────────────────────────
export function AddBarberToUnitSheet({
  open, onOpenChange, unidadeId, unidadeNome, onSuccess,
}: AddBarberToUnitSheetProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Step state
  const [step, setStep] = useState(1);

  // Form fields
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleLevel>('barber');

  // Email lookup
  const [emailLookup, setEmailLookup] = useState<EmailLookupStatus>('idle');
  const [existingUserId, setExistingUserId] = useState<boolean>(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation
  const nomeValid = nome.trim().length >= 3;
  const emailValid = EMAIL_REGEX.test(email.trim());
  const step1Valid = nomeValid && emailValid;

  const firstName = nome.trim().split(' ')[0] || 'profissional';
  const profileExists = emailLookup === 'found';

  // ── Debounced email lookup ──
  const checkEmail = useCallback(async (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailLookup('idle');
      setExistingUserId(null);
      return;
    }

    setEmailLookup('checking');
    try {
      const { data, error } = await supabase.rpc('check_email_exists', {
        p_email: trimmed,
      });

      if (error) {
        setEmailLookup('idle');
        setExistingUserId(false);
        return;
      }

      if (data) {
        setEmailLookup('found');
        setExistingUserId(true);
      } else {
        setEmailLookup('not_found');
        setExistingUserId(false);
      }
    } catch {
      setEmailLookup('idle');
      setExistingUserId(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      setEmailLookup('idle');
      setExistingUserId(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      checkEmail(email);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email, checkEmail]);

  // ── Reset on close ──
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setStep(1);
      setNome('');
      setEmail('');
      setSelectedRole('barber');
      setIsSubmitting(false);
      setEmailLookup('idle');
      setExistingUserId(null);
    }
    onOpenChange(isOpen);
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();

      if (existingUserId) {
        // User exists — look up barbeiro record by email and link to unit
        const { data: privateRow } = await supabase
          .from('barbeiros_private')
          .select('barbeiro_id')
          .ilike('email', trimmedEmail)
          .limit(1)
          .maybeSingle();

        const barberId = privateRow?.barbeiro_id ?? null;

        if (barberId) {
          const { error: upsertError } = await supabase
            .from('barbeiro_unidades')
            .upsert([{
              barbeiro_id: barberId,
              unidade_id: unidadeId,
              role_level: selectedRole,
            }]);
          if (upsertError) throw new Error(upsertError.message);
        } else {
          // User exists but no barbeiro record — let edge function handle
          const { error } = await supabase.functions.invoke('create-tenant-barber', {
            body: {
              email: trimmedEmail,
              name: nome.trim(),
              unidade_id: unidadeId,
              role_level: selectedRole,
              invite_only: true,
              comissao_pct: 30,
            },
          });
          if (error) throw error;
        }
      } else {
        // New user — call Edge Function
        const { data, error } = await supabase.functions.invoke('create-tenant-barber', {
          body: {
            email: trimmedEmail,
            name: nome.trim(),
            unidade_id: unidadeId,
            role_level: selectedRole,
            invite_only: true,
            comissao_pct: 30,
          },
        });

        if (error) throw error;
        if (data && !data.success && data.error) {
          throw new Error(data.error);
        }
      }

      // Success
      toast({
        title: `${firstName} foi adicionado à ${unidadeNome}`,
        description: profileExists
          ? 'Vínculo realizado com sucesso.'
          : 'Um convite foi enviado por e-mail.',
      });

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shared.unitMembers(unidadeId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shared.unitMembers(unidadeId) });
      onSuccess();
      handleOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({
        title: 'Falha ao adicionar barbeiro',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Email status indicator ──
  const renderEmailStatus = () => {
    if (emailLookup === 'checking') {
      return (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Verificando...
        </p>
      );
    }
    if (emailLookup === 'found') {
      return (
        <p className="text-xs text-green-500 dark:text-green-400">
          Conta encontrada — este barbeiro será vinculado imediatamente.
        </p>
      );
    }
    if (emailLookup === 'not_found') {
      return (
        <p className="text-xs text-muted-foreground">
          Um link de convite será enviado para este e-mail.
        </p>
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        Um convite será enviado para este e-mail.
      </p>
    );
  };

  // ── Step dots ──
  const StepDots = () => (
    <div className="flex items-center justify-center gap-2 py-2">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            s === step ? 'w-6 bg-primary' : s < step ? 'w-1.5 bg-primary/60' : 'w-1.5 bg-muted'
          }`}
        />
      ))}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0">
        {/* ─── IMPROVEMENT 1: Context header ─── */}
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">
            Adicionar barbeiro · {unidadeNome}
          </SheetTitle>
        </SheetHeader>

        <StepDots />

        <div className="flex-1 overflow-y-auto py-4">
          {/* ─── Step 1: Dados ─── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="add-nome" className="text-sm font-medium">
                  Nome completo
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="add-nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="pl-10"
                    autoFocus
                  />
                </div>
                {nome.length > 0 && !nomeValid && (
                  <p className="text-xs text-destructive">Mínimo de 3 caracteres.</p>
                )}
              </div>

              {/* ─── IMPROVEMENT 2: Debounced email validation ─── */}
              <div className="space-y-2">
                <Label htmlFor="add-email" className="text-sm font-medium">
                  E-mail de acesso
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="add-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="barbeiro@email.com"
                    className={`pl-10 ${
                      email.length > 0 && !emailValid ? 'border-destructive' : ''
                    }`}
                  />
                </div>
                {renderEmailStatus()}
              </div>
            </div>
          )}

          {/* ─── Step 2: Acesso ─── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">
                Qual será o nível de acesso de {firstName}?
              </p>

              <RadioGroup
                value={selectedRole}
                onValueChange={(v) => setSelectedRole(v as RoleLevel)}
                className="space-y-2"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <Label
                    key={opt.value}
                    htmlFor={`role-add-${opt.value}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedRole === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:bg-accent/50'
                    }`}
                  >
                    <RadioGroupItem value={opt.value} id={`role-add-${opt.value}`} className="mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium text-foreground">{opt.label}</span>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>

              {selectedRole === 'full_control' && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Este nível eleva o barbeiro ao mesmo acesso do dono da barbearia.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ─── IMPROVEMENT 3: Review step ─── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">Revise antes de confirmar</p>

              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Nome</span>
                  <span className="text-sm font-medium text-foreground">{nome.trim()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">E-mail</span>
                  <span className="text-sm text-foreground">{email.trim()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Acesso</span>
                  <Badge
                    variant={ROLE_BADGE[selectedRole].variant}
                    className={ROLE_BADGE[selectedRole].className}
                  >
                    {ROLE_BADGE[selectedRole].label}
                  </Badge>
                </div>
              </div>

              {/* Elevated access warning */}
              {(selectedRole === 'unit_admin' || selectedRole === 'full_control') && (
                <Alert variant={selectedRole === 'full_control' ? 'destructive' : 'default'}>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {selectedRole === 'full_control'
                      ? 'Confirmação final: este profissional terá acesso idêntico ao dono da barbearia.'
                      : 'Este barbeiro terá acesso elevado para gerenciar esta unidade.'}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <SheetFooter className="flex-row gap-2 pt-2">
          {step > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
              disabled={isSubmitting}
              className="gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Voltar
            </Button>
          )}

          <div className="flex-1" />

          {step < 3 && (
            <Button
              size="sm"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !step1Valid}
              className="gap-1"
            >
              Próximo <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* ─── IMPROVEMENT 3+4: Contextual confirm button ─── */}
          {step === 3 && (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="gap-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  {profileExists ? 'Confirmar e vincular' : 'Confirmar e enviar convite'}
                </>
              )}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
