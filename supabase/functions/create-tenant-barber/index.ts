import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify caller identity ──
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = user.id;

    // ── Check tenant_admin role ──
    const { data: tenantRole } = await supabaseUser
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "tenant_admin")
      .maybeSingle();

    if (!tenantRole) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores de barbearia podem adicionar barbeiros" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get tenant_id ──
    const { data: tenant } = await supabaseUser
      .from("tenants")
      .select("id")
      .eq("owner_user_id", callerId)
      .maybeSingle();

    if (!tenant) {
      return new Response(
        JSON.stringify({ error: "Barbearia não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Parse body ──
    const body = await req.json();
    const { email, password, nome, telefone, apelido, comissao_pct, cpf, invite_only } = body;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "E-mail é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ════════════════════════════════════════════════════════
    // MODE 1: INVITE ONLY — send magic link, create barber
    // ════════════════════════════════════════════════════════
    if (invite_only) {
      const trimmedEmail = email.trim().toLowerCase();
      const barberName = (nome || apelido || trimmedEmail.split("@")[0]).trim();

      // Service role client
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Check if email already has a barber in this tenant
      const { data: existingPrivates } = await supabaseAdmin
        .from("barbeiros_private")
        .select("barbeiro_id, email")
        .eq("email", trimmedEmail);

      if (existingPrivates && existingPrivates.length > 0) {
        const barberIds = existingPrivates.map(b => b.barbeiro_id);
        const { data: tenantBarbers } = await supabaseAdmin
          .from("barbeiros")
          .select("id, user_id")
          .in("id", barberIds)
          .eq("tenant_id", tenant.id);

        if (tenantBarbers && tenantBarbers.length > 0) {
          // Barber already exists — just resend the invite email
          const existingUserId = tenantBarbers[0].user_id;
          if (existingUserId) {
            try {
              await supabaseAdmin.auth.admin.inviteUserByEmail(trimmedEmail, {
                data: { nome: barberName },
                redirectTo: "https://dubadmin.lovable.app/auth/callback",
              });
            } catch (_) {
              // User might already be confirmed; send magic link instead
              await supabaseAdmin.auth.admin.generateLink({
                type: "magiclink",
                email: trimmedEmail,
                options: { redirectTo: "https://dubadmin.lovable.app/auth/callback" },
              });
            }
          }

          return new Response(
            JSON.stringify({
              success: true,
              barbeiro_id: tenantBarbers[0].id,
              user_id: existingUserId,
              invited: true,
              resent: true,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Create or reuse auth user via invite
      let newUserId: string;

      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(trimmedEmail, {
        data: { nome: barberName },
        redirectTo: "https://dubadmin.lovable.app/auth/callback",
      });

      if (inviteError) {
        // User might already exist — try to find them
        if (inviteError.message.includes("already been registered") || inviteError.message.includes("already registered")) {
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = listData?.users?.find(
            (u) => u.email?.toLowerCase() === trimmedEmail
          );

          if (!existingUser) {
            return new Response(
              JSON.stringify({ error: "Usuário existe mas não foi possível localizá-lo" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          newUserId = existingUser.id;

          // Send a magic link so they can access the app
          await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: trimmedEmail,
            options: { redirectTo: "https://dubadmin.lovable.app/auth/callback" },
          });
        } else {
          console.error("Invite error:", inviteError);
          return new Response(JSON.stringify({ error: inviteError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        newUserId = inviteData.user.id;
      }

      // Create barber record
      const { data: barberData, error: barberError } = await supabaseAdmin
        .from("barbeiros")
        .insert({
          apelido: barberName,
          user_id: newUserId,
          ativo: true,
          setup_completed: false, // barber needs to complete setup
          tenant_id: tenant.id,
          comissao_pct: comissao_pct || 30,
        })
        .select("id")
        .single();

      if (barberError) {
        console.error("Erro ao criar barbeiro:", barberError);
        return new Response(
          JSON.stringify({ error: "Erro ao criar registro do barbeiro" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Store private data
      await supabaseAdmin.from("barbeiros_private").insert({
        barbeiro_id: barberData.id,
        email: trimmedEmail,
        nome_completo: barberName,
      });

      // Assign barber role
      await supabaseAdmin.from("user_roles").delete()
        .eq("user_id", newUserId)
        .eq("role", "cliente");

      await supabaseAdmin.from("user_roles").upsert({
        user_id: newUserId,
        role: "barber",
      }, { onConflict: "user_id,role" });

      return new Response(
        JSON.stringify({
          success: true,
          barbeiro_id: barberData.id,
          user_id: newUserId,
          invited: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ════════════════════════════════════════════════════════
    // MODE 2: FULL CREATE — original flow with password
    // ════════════════════════════════════════════════════════
    if (!password || !apelido) {
      return new Response(
        JSON.stringify({ error: "Email, senha e apelido são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check duplicate in tenant
    const { data: existingBarbers } = await supabaseAdmin
      .from("barbeiros_private")
      .select("barbeiro_id, email")
      .eq("email", email.trim());

    if (existingBarbers && existingBarbers.length > 0) {
      const barberIds = existingBarbers.map(b => b.barbeiro_id);
      const { data: tenantBarbers } = await supabaseAdmin
        .from("barbeiros")
        .select("id")
        .in("id", barberIds)
        .eq("tenant_id", tenant.id);

      if (tenantBarbers && tenantBarbers.length > 0) {
        return new Response(
          JSON.stringify({ error: "Este email já possui um barbeiro cadastrado na sua barbearia" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create auth user
    let newUserId: string;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { nome: (nome || apelido).trim() },
    });

    if (authError) {
      if (authError.message.includes("already been registered")) {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = listData?.users?.find(
          (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
        );

        if (!existingUser) {
          return new Response(
            JSON.stringify({ error: "Usuário existe mas não foi possível localizá-lo" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        newUserId = existingUser.id;
        await supabaseAdmin.auth.admin.updateUserById(newUserId, {
          password,
          email_confirm: true,
          user_metadata: { nome: (nome || apelido).trim() },
        });
      } else {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      newUserId = authData.user.id;
    }

    // Create barber record
    const { data: barberData, error: barberError } = await supabaseAdmin
      .from("barbeiros")
      .insert({
        apelido: apelido.trim(),
        user_id: newUserId,
        ativo: true,
        setup_completed: true,
        tenant_id: tenant.id,
        comissao_pct: comissao_pct || 30,
      })
      .select("id")
      .single();

    if (barberError) {
      console.error("Erro ao criar barbeiro:", barberError);
      return new Response(
        JSON.stringify({ error: "Erro ao criar registro do barbeiro" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store private data
    await supabaseAdmin.from("barbeiros_private").insert({
      barbeiro_id: barberData.id,
      email: email.trim(),
      telefone: telefone?.trim() || null,
      nome_completo: (nome || apelido).trim(),
      cpf: cpf?.trim() || null,
    });

    // Assign barber role
    await supabaseAdmin.from("user_roles").delete()
      .eq("user_id", newUserId)
      .eq("role", "cliente");

    await supabaseAdmin.from("user_roles").upsert({
      user_id: newUserId,
      role: "barber",
    }, { onConflict: "user_id,role" });

    // Auto-create Asaas subaccount (non-blocking)
    let subAccountResult: Record<string, unknown> | null = null;
    if (cpf?.trim() && email?.trim()) {
      try {
        const subAccountResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/create-asaas-subaccount`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ barbeiro_id: barberData.id }),
          }
        );
        subAccountResult = await subAccountResponse.json();
      } catch (subErr) {
        console.error("[create-tenant-barber] Erro subconta Asaas:", subErr);
        subAccountResult = { error: "Falha na criação automática da subconta" };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        barbeiro_id: barberData.id,
        user_id: newUserId,
        asaas_subaccount: subAccountResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
