import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar token do chamador
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerId = claimsData.claims.sub as string;

    // Admin client com service role key (sem opções de auth extras)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verificar se o chamador é admin
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const normalizedRoles = (roles ?? [])
      .map((r: any) => String(r.role ?? "").trim().toLowerCase())
      .filter(Boolean);

    if (!normalizedRoles.includes("admin") && !normalizedRoles.includes("ti")) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores ou TI podem redefinir senhas" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { client_id, new_password } = await req.json();

    if (!client_id || typeof client_id !== "string") {
      return new Response(
        JSON.stringify({ error: "client_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!new_password || typeof new_password !== "string" || new_password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Nova senha deve ter no mínimo 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atualizar senha do cliente via admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(client_id, {
      password: new_password,
    });

    if (updateError) {
      console.error("Erro ao redefinir senha:", updateError);
      return new Response(
        JSON.stringify({ error: `Falha ao redefinir senha: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      user_id: callerId,
      action: "admin_reset_client_password",
      entity_type: "auth_user",
      entity_id: client_id,
      new_values: { reset_by: callerId, reset_at: new Date().toISOString() },
    });

    console.log(`Senha do cliente ${client_id} redefinida por admin ${callerId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in reset-client-password:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
