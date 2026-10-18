/**
 * ═══════════════════════════════════════════════════════════
 * AUTH — Helpers compartilhados de autenticação para Edge Functions
 * ═══════════════════════════════════════════════════════════
 *
 * Padrão unificado para verificar tokens e roles.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fail } from "./response.ts";

/**
 * Cria um cliente Supabase autenticado a partir do header Authorization.
 * Retorna { supabase, user } ou lança Response de erro.
 */
export async function authenticateRequest(
  req: Request
): Promise<
  | { supabase: SupabaseClient<any>; user: { id: string; email?: string } }
  | Response
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return fail("UNAUTHORIZED", "Token ausente", 401);
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error,
  } = await supabaseUser.auth.getUser();

  if (error || !user) {
    return fail("INVALID_TOKEN", "Token inválido", 401);
  }

  return { supabase: supabaseUser, user: { id: user.id, email: user.email } };
}

/**
 * Verifica se o usuário possui um role específico.
 * Retorna true/false sem lançar erro.
 */
export async function hasRole(
  supabase: SupabaseClient<any>,
  userId: string,
  role: string
): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();

  return !!data;
}

/**
 * Cria cliente Supabase com service role (para operações admin).
 */
export function createServiceClient(): SupabaseClient<any> {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}
