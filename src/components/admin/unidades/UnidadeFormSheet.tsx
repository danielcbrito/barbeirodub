import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Copy } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Unidade } from "./AdminUnidades";

interface UnidadeFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  unidade: Unidade | null;
  existingUnidades: Unidade[];
  onSaved: () => void;
}

const EMPTY_FORM = {
  nome: "",
  slogan: "",
  cnpj: "",
  cpf: "",
  email: "",
  telefone: "",
  whatsapp: "",
  site: "",
  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  ativo: true,
  is_sede: false,
};

/**
 * Sheet de criação/edição de unidade.
 * Permite copiar dados de outra unidade existente ao criar.
 */
export function UnidadeFormSheet({
  open, onOpenChange, tenantId, unidade, existingUnidades, onSaved,
}: UnidadeFormSheetProps) {
  const isEditing = !!unidade;
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [copyFrom, setCopyFrom] = useState<string>("");

  // Popular form ao abrir
  useEffect(() => {
    if (!open) return;
    if (unidade) {
      setForm({
        nome: unidade.nome || "",
        slogan: unidade.slogan || "",
        cnpj: unidade.cnpj || "",
        cpf: unidade.cpf || "",
        email: unidade.email || "",
        telefone: unidade.telefone || "",
        whatsapp: unidade.whatsapp || "",
        site: unidade.site || "",
        cep: unidade.cep || "",
        rua: unidade.rua || "",
        numero: unidade.numero || "",
        complemento: unidade.complemento || "",
        bairro: unidade.bairro || "",
        cidade: unidade.cidade || "",
        estado: unidade.estado || "",
        ativo: unidade.ativo,
        is_sede: unidade.is_sede,
      });
      setCopyFrom("");
    } else {
      setForm(EMPTY_FORM);
      setCopyFrom("");
    }
  }, [open, unidade]);

  // Copiar dados de unidade existente
  const handleCopyFrom = (unidadeId: string) => {
    setCopyFrom(unidadeId);
    const source = existingUnidades.find((u) => u.id === unidadeId);
    if (!source) return;

    setForm((prev) => ({
      ...prev,
      // Copia tudo exceto nome, is_sede e ativo
      cnpj: source.cnpj || "",
      cpf: source.cpf || "",
      email: source.email || "",
      telefone: source.telefone || "",
      whatsapp: source.whatsapp || "",
      site: source.site || "",
      cep: source.cep || "",
      rua: source.rua || "",
      numero: source.numero || "",
      complemento: source.complemento || "",
      bairro: source.bairro || "",
      cidade: source.cidade || "",
      estado: source.estado || "",
    }));

    toast.success("Dados copiados! Altere o que quiser.");
  };

  const handleSave = async () => {
    if (!tenantId) return;
    if (!form.nome.trim()) {
      toast.error("Nome da unidade é obrigatório");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        nome: form.nome.trim(),
        slogan: form.slogan || null,
        cnpj: form.cnpj || null,
        cpf: form.cpf || null,
        email: form.email || null,
        telefone: form.telefone || null,
        whatsapp: form.whatsapp || null,
        site: form.site || null,
        cep: form.cep || null,
        rua: form.rua || null,
        numero: form.numero || null,
        complemento: form.complemento || null,
        bairro: form.bairro || null,
        cidade: form.cidade || null,
        estado: form.estado || null,
        ativo: form.ativo,
        is_sede: form.is_sede,
      };

      if (isEditing && unidade) {
        const { error } = await supabase
          .from("tenant_unidades")
          .update(payload)
          .eq("id", unidade.id);
        if (error) throw error;
        toast.success("Unidade atualizada!");
      } else {
        const { error } = await supabase
          .from("tenant_unidades")
          .insert(payload);
        if (error) throw error;
        toast.success("Unidade criada com sucesso!");
      }

      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error("Erro ao salvar unidade:", error);
      toast.error("Erro ao salvar unidade");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="text-lg font-bold">
            {isEditing ? "Editar Unidade" : "Nova Unidade"}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-160px)]">
          <div className="px-6 py-5 space-y-6">
            {/* Copiar de outra unidade (somente na criação) */}
            {!isEditing && existingUnidades.length > 0 && (
              <div className="p-4 rounded-xl bg-secondary/50 border border-border space-y-2.5">
                <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <Copy className="h-4 w-4 text-primary" />
                  Copiar dados de outra unidade
                </div>
                <Select value={copyFrom} onValueChange={handleCopyFrom}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecione uma unidade para copiar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingUnidades.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome} {u.is_sede ? "(Sede)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Os dados serão preenchidos automaticamente. Você pode alterar o que quiser.
                </p>
              </div>
            )}

            {/* Nome */}
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium">Nome da Unidade *</Label>
              <Input
                value={form.nome}
                onChange={(e) => updateField("nome", e.target.value)}
                placeholder="Ex: Filial Centro"
                className="h-11"
              />
            </div>

            {/* Slogan */}
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium">Slogan</Label>
              <Input
                value={form.slogan}
                onChange={(e) => updateField("slogan", e.target.value)}
                placeholder="Ex: Transformando seu visual desde 2015"
                className="h-11"
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <Label className="text-[13px] font-medium">Unidade ativa</Label>
                <p className="text-[11px] text-muted-foreground">Desative para ocultar esta unidade</p>
              </div>
              <Switch checked={form.ativo} onCheckedChange={(v) => updateField("ativo", v)} />
            </div>

            {/* Identificação (somente leitura — herdado da sede) */}
            {isEditing && (form.cnpj || form.cpf) && (
              <div className="space-y-3">
                <h4 className="text-[13px] font-semibold text-foreground uppercase tracking-wider">
                  Identificação
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {form.cnpj && (
                    <div className="space-y-1.5">
                      <Label className="text-[12px]">CNPJ</Label>
                      <Input value={form.cnpj} disabled className="h-10 text-[13px] opacity-60 cursor-not-allowed" />
                    </div>
                  )}
                  {form.cpf && (
                    <div className="space-y-1.5">
                      <Label className="text-[12px]">CPF</Label>
                      <Input value={form.cpf} disabled className="h-10 text-[13px] opacity-60 cursor-not-allowed" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Contato */}
            <div className="space-y-3">
              <h4 className="text-[13px] font-semibold text-foreground uppercase tracking-wider">
                Contato
              </h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[12px]">E-mail</Label>
                  <Input value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="contato@barbearia.com" className="h-10 text-[13px]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Telefone</Label>
                    <Input value={form.telefone} onChange={(e) => updateField("telefone", e.target.value)} placeholder="(00) 0000-0000" className="h-10 text-[13px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">WhatsApp</Label>
                    <Input value={form.whatsapp} onChange={(e) => updateField("whatsapp", e.target.value)} placeholder="(00) 00000-0000" className="h-10 text-[13px]" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px]">Site</Label>
                  <Input value={form.site} onChange={(e) => updateField("site", e.target.value)} placeholder="https://..." className="h-10 text-[13px]" />
                </div>
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-3">
              <h4 className="text-[13px] font-semibold text-foreground uppercase tracking-wider">
                Endereço
              </h4>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1 space-y-1.5">
                    <Label className="text-[12px]">CEP</Label>
                    <Input value={form.cep} onChange={(e) => updateField("cep", e.target.value)} placeholder="00000-000" className="h-10 text-[13px]" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-[12px]">Rua</Label>
                    <Input value={form.rua} onChange={(e) => updateField("rua", e.target.value)} placeholder="Rua..." className="h-10 text-[13px]" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Número</Label>
                    <Input value={form.numero} onChange={(e) => updateField("numero", e.target.value)} placeholder="Nº" className="h-10 text-[13px]" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-[12px]">Complemento</Label>
                    <Input value={form.complemento} onChange={(e) => updateField("complemento", e.target.value)} placeholder="Sala, andar..." className="h-10 text-[13px]" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Bairro</Label>
                    <Input value={form.bairro} onChange={(e) => updateField("bairro", e.target.value)} className="h-10 text-[13px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Cidade</Label>
                    <Input value={form.cidade} onChange={(e) => updateField("cidade", e.target.value)} className="h-10 text-[13px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Estado</Label>
                    <Input value={form.estado} onChange={(e) => updateField("estado", e.target.value)} placeholder="SP" maxLength={2} className="h-10 text-[13px]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer fixo */}
        <div className="absolute bottom-0 left-0 right-0 px-6 py-4 border-t border-border bg-background">
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-11">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 h-11 gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar Unidade"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
