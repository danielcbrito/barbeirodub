import { useState, useEffect } from 'react';
import { useBarberUnitRoles, type RoleLevel, type BarberUnitMember } from '@/hooks/useBarberUnitRoles';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle } from 'lucide-react';

interface EditRoleSheetProps {
  member: BarberUnitMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadeId: string;
}

const ROLE_OPTIONS: { value: RoleLevel; label: string; description: string }[] = [
  { value: 'barber', label: 'Barbeiro', description: 'Acessa apenas sua própria agenda e financeiro pessoal.' },
  { value: 'unit_admin', label: 'Admin da Unidade', description: 'Gerencia todos os barbeiros e configurações desta unidade.' },
  { value: 'full_control', label: 'Controle Total', description: 'Acesso idêntico ao dono. Todas as unidades e configurações.' },
];

const ROLE_BADGE_MAP: Record<RoleLevel, { label: string; variant: 'secondary' | 'outline'; className?: string }> = {
  barber: { label: 'Barbeiro', variant: 'secondary' },
  unit_admin: { label: 'Admin da Unidade', variant: 'outline', className: 'border-amber-500/50 text-amber-400 bg-amber-500/10' },
  full_control: { label: 'Controle Total', variant: 'outline' },
};

export function EditRoleSheet({ member, open, onOpenChange, unidadeId }: EditRoleSheetProps) {
  const { updateRole, isUpdating } = useBarberUnitRoles(unidadeId);
  const [selected, setSelected] = useState<RoleLevel>('barber');

  // Sync selected with member's current role when sheet opens
  useEffect(() => {
    if (member) {
      setSelected(member.role_level);
    }
  }, [member]);

  if (!member) return null;

  const currentBadge = ROLE_BADGE_MAP[member.role_level];
  const nome = member.barbeiro.profile?.nome ?? member.barbeiro.apelido;
  const isUnchanged = selected === member.role_level;

  const handleSave = async () => {
    await updateRole(member.barbeiro_id, selected);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {nome}
            <Badge variant={currentBadge.variant} className={currentBadge.className}>
              {currentBadge.label}
            </Badge>
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Esta alteração é aplicada imediatamente. O barbeiro vê a mudança sem precisar relogar.
          </p>
        </SheetHeader>

        <div className="flex-1 py-4 space-y-4">
          <RadioGroup value={selected} onValueChange={(v) => setSelected(v as RoleLevel)} className="space-y-3">
            {ROLE_OPTIONS.map((opt) => (
              <Label
                key={opt.value}
                htmlFor={`role-${opt.value}`}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected === opt.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-accent/50'
                }`}
              >
                <RadioGroupItem value={opt.value} id={`role-${opt.value}`} className="mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </Label>
            ))}
          </RadioGroup>

          {selected === 'full_control' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Atenção: este nível eleva o barbeiro ao mesmo acesso do dono da barbearia.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <SheetFooter>
          <Button
            className="w-full"
            disabled={isUnchanged || isUpdating}
            onClick={handleSave}
          >
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar permissão'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
