/**
 * CREATE-BARBER — Cria um barbeiro DUB (admin global)
 *
 * REFATORADO: Usa _shared/response.ts e _shared/auth.ts
 * 
 * Fluxo: Verifica admin → cria auth user → cria barbeiro →
 *        armazena dados privados → atribui role
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, handleCors, parseBody } from "../_shared/response.ts";

interface CreateBarberBody {
  email: string;
  password: string;
  nome: string;
  telefone?: string;
  cpf: string;
  nome_completo: string;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // ═══ Autenticação ═══
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail("UNAUTHORIZED", "Token ausente", 401);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return fail("INVALID_TOKEN", "Token inválido", 401);
    }

    // ═══ Verificar role admin ═══
    const { data: adminRole } = await supabaseUser
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return fail("FORBIDDEN", "Apenas administradores podem criar barbeiros", 403);
    }

    // ═══ Parse body ═══
    const body = await parseBody<CreateBarberBody>(req);
    if (!body) {
      return fail("INVALID_BODY", "JSON inválido");
    }

    const { email, password, nome, telefone, cpf, nome_completo } = body;

    if (!email || !password || !nome || !cpf || !nome_completo) {
      return fail("MISSING_FIELDS", "Email, senha, nome, CPF e nome completo são obrigatórios");
    }

    if (password.length < 6) {
      return fail("WEAK_PASSWORD", "A senha deve ter pelo menos 6 caracteres");
    }

    // ═══ Service role client ═══
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ═══ Verificar duplicata ═══
    const { data: existingBarber } = await supabaseAdmin
      .from("barbeiros_private")
      .select("barbeiro_id")
      .eq("email", email.trim())
      .maybeSingle();

    if (existingBarber) {
      return fail("DUPLICATE_EMAIL", "Este email já possui um barbeiro cadastrado");
    }

    // ═══ Criar ou reusar auth user ═══
    let newUserId: string;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { nome: nome.trim() },
    });

    if (authError) {
      if (authError.message.includes("already been registered")) {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = listData?.users?.find(
          (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
        );

        if (!existingUser) {
          return fail("USER_NOT_FOUND", "Usuário existe mas não foi possível localizá-lo");
        }

        newUserId = existingUser.id;

        await supabaseAdmin.auth.admin.updateUserById(newUserId, {
          password,
          email_confirm: true,
          user_metadata: { nome: nome.trim() },
        });
      } else {
        return fail("AUTH_ERROR", authError.message);
      }
    } else {
      newUserId = authData.user.id;
    }

    // ═══ Criar registro do barbeiro ═══
    const { data: barberData, error: barberError } = await supabaseAdmin
      .from("barbeiros")
      .insert({
        apelido: nome.trim(),
        user_id: newUserId,
        ativo: true,
        setup_completed: true,
      })
      .select("id")
      .single();

    if (barberError) {
      console.error("[create-barber] Erro ao criar barbeiro:", barberError);
      return fail("DB_ERROR", "Erro ao criar registro do barbeiro", 500);
    }

    // ═══ Dados privados ═══
    await supabaseAdmin.from("barbeiros_private").insert({
      barbeiro_id: barberData.id,
      email: email.trim(),
      telefone: telefone?.trim() || null,
      cpf: cpf?.trim() || null,
      nome_completo: nome_completo?.trim() || null,
    });

    // ═══ Atribuir role ═══
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId).eq("role", "cliente");
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: newUserId, role: "barber" },
      { onConflict: "user_id,role" }
    );

    return ok({
      barbeiro_id: barberData.id,
      user_id: newUserId,
    });
  } catch (err) {
    console.error("[create-barber] Erro fatal:", err);
    return fail("INTERNAL_ERROR", "Erro interno do servidor", 500);
  }
});
