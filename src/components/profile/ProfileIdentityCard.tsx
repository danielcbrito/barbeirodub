import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProfileIdentityCardProps {
  name: string;
  email: string;
  role: string;
  roleVariant?: "admin" | "barber";
  avatarUrl: string | null;
  initials: string;
  onFileSelected: (file: File) => void;
}

/**
 * Card de identidade do perfil — avatar, nome, email, badge de cargo.
 * Design: cartão centralizado com avatar circular proeminente,
 * hierarquia clara e badge de cargo discreto.
 */
export function ProfileIdentityCard({
  name,
  email,
  role,
  roleVariant = "admin",
  avatarUrl,
  initials,
  onFileSelected,
}: ProfileIdentityCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione apenas imagens");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máximo 5MB");
      return;
    }
    onFileSelected(file);
    e.target.value = "";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.9, 0.3, 1] }}
      className="mx-4"
    >
      <div className="rounded-2xl bg-card border border-border/40 p-6 flex flex-col items-center shadow-soft">
        {/* Avatar com botão de câmera */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="relative group"
          aria-label="Alterar foto de perfil"
        >
          <Avatar className="h-[72px] w-[72px] border-2 border-border/30 shadow-sm">
            <AvatarImage src={avatarUrl || undefined} alt={name} className="object-cover" />
            <AvatarFallback className="bg-secondary text-foreground text-2xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {/* Overlay de câmera */}
          <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 group-active:bg-black/40 transition-colors flex items-center justify-center">
            <Camera className="h-5 w-5 text-accent-red opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>

        {/* Input oculto para galeria */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />

        {/* Nome e email */}
        <h2 className="mt-3 text-[17px] font-semibold text-foreground leading-tight">
          {name}
        </h2>

        {/* Badge de cargo */}
        <span
          className={cn(
            "mt-2 inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider",
            roleVariant === "admin"
              ? "bg-primary/10 text-primary"
              : "bg-secondary text-muted-foreground"
          )}
        >
          {role}
        </span>
      </div>
    </motion.div>
  );
}
