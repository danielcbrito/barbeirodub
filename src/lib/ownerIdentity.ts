import { supabase } from "@/integrations/supabase/client";

interface OwnerIdentity {
  displayName: string;
  initials: string;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

/**
 * Resolve a identidade pessoal do dono/barbeiro.
 * Prioridade: barbeiros_private.nome_completo → profiles.nome (nome pessoal do cadastro)
 * → barbeiros.apelido → "Administrador".
 * Nunca usa nome da barbearia para identidade do perfil pessoal.
 */
export async function resolveOwnerIdentity(userId: string): Promise<OwnerIdentity> {
  const { data: barber } = await supabase
    .from("barbeiros")
    .select("id, apelido")
    .eq("user_id", userId)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let displayName = "";

  if (barber?.id) {
    const { data: privateData } = await supabase
      .from("barbeiros_private")
      .select("nome_completo")
      .eq("barbeiro_id", barber.id)
      .maybeSingle();

    displayName = privateData?.nome_completo?.trim() || "";
  }

  if (!displayName) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", userId)
      .maybeSingle();

    displayName = profile?.nome?.trim() || "";
  }

  if (!displayName) {
    displayName = barber?.apelido?.trim() || "Administrador";
  }

  return {
    displayName,
    initials: getInitials(displayName),
  };
}

