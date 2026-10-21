import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
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

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError?.message);
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    console.log("User authenticated:", userId, user.email);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Buscar papéis do usuário e normalizar para evitar falsos negativos
    const { data: allRoles, error: allRolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const normalizedRoles = (allRoles ?? [])
      .map((entry) => String(entry.role ?? "").trim().toLowerCase())
      .filter(Boolean);

    console.log("All roles for user:", JSON.stringify(allRoles), "error:", allRolesError?.message);

    let resolvedRole: "admin" | "ti" | "tenant_admin" | "barber" | null = null;

    if (normalizedRoles.includes("admin")) {
      resolvedRole = "admin";
    } else if (normalizedRoles.includes("ti")) {
      resolvedRole = "ti";
    } else if (normalizedRoles.includes("tenant_admin")) {
      resolvedRole = "tenant_admin";
    } else if (normalizedRoles.includes("barber") || normalizedRoles.includes("barbeiro")) {
      resolvedRole = "barber";
    }

    let tenantId: string | null = null;

    // Fallback seguro para ambientes com role inconsistente
    if (!resolvedRole) {
      const [tenantOwnerCheck, activeBarberCheck] = await Promise.all([
        supabaseAdmin
          .from("tenants")
          .select("id")
          .eq("owner_user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("barbeiros")
          .select("tenant_id")
          .eq("user_id", userId)
          .eq("ativo", true)
          .maybeSingle(),
      ]);

      if (tenantOwnerCheck.data?.id) {
        resolvedRole = "tenant_admin";
        tenantId = tenantOwnerCheck.data.id;
      } else if (activeBarberCheck.data?.tenant_id) {
        resolvedRole = "barber";
        tenantId = activeBarberCheck.data.tenant_id;
      }
    }

    if (!resolvedRole) {
      return new Response(
        JSON.stringify({ error: "Acesso negado", debug_roles: allRoles }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (resolvedRole === "tenant_admin" && !tenantId) {
      const { data: tenant } = await supabaseAdmin
        .from("tenants")
        .select("id")
        .eq("owner_user_id", userId)
        .single();
      tenantId = tenant?.id || null;
    }

    if (resolvedRole === "barber" && !tenantId) {
      const { data: barber } = await supabaseAdmin
        .from("barbeiros")
        .select("tenant_id")
        .eq("user_id", userId)
        .eq("ativo", true)
        .maybeSingle();
      tenantId = barber?.tenant_id || null;
    }

    const body = await req.json();
    const { action, userId: targetUserId, nome, telefone, email, tenantId: bodyTenantId } = body;
    console.log("Action:", action, "tenantId:", tenantId || bodyTenantId);

    if (action === "list") {
      const perPage = 1000;
      let page = 1;
      let allUsers: Array<{ id: string; email?: string; phone?: string }> = [];

      while (true) {
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });

        if (listError) throw listError;

        const batch = (listData?.users || []).map((u) => {
          const meta = u.user_metadata || {};
          const metaNome = meta.nome || meta.name || meta.full_name || null;
          const metaPhone = u.phone || meta.telefone || meta.phone || null;
          return {
            id: u.id,
            email: u.email,
            phone: metaPhone,
            nome: metaNome,
          };
        });

        allUsers = allUsers.concat(batch);

        // Última página
        if (batch.length < perPage) break;
        page += 1;
      }

      const usersMap = allUsers.reduce((acc, u) => {
        acc[u.id] = { email: u.email, phone: u.phone, nome: u.nome };
        return acc;
      }, {} as Record<string, { email?: string; phone?: string; nome?: string | null }>);

      return new Response(
        JSON.stringify({ users: usersMap }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "create") {
      if (!nome) {
        return new Response(
          JSON.stringify({ error: "Nome é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const clientEmail = email || `client_${crypto.randomUUID().slice(0, 8)}@placeholder.local`;
      const clientPassword = crypto.randomUUID();

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: clientEmail,
        password: clientPassword,
        email_confirm: true,
        user_metadata: { nome, telefone: telefone || null },
      });

      let finalUserId: string;

      if (createError) {
        if (createError.message?.includes("already been registered")) {
          // Usuário já existe — buscar via listUsers com paginação
          let existingUserId: string | null = null;
          let page = 1;
          const perPage = 1000;
          while (!existingUserId) {
            const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
              page,
              perPage,
            });
            if (listErr || !listData?.users?.length) break;
            const found = listData.users.find(
              (u) => u.email?.toLowerCase() === clientEmail.toLowerCase()
            );
            if (found) {
              existingUserId = found.id;
            } else if (listData.users.length < perPage) {
              break;
            } else {
              page++;
            }
          }

          if (!existingUserId) {
            return new Response(
              JSON.stringify({ error: "E-mail registrado mas usuário não localizado. Tente novamente." }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          finalUserId = existingUserId;
          console.log(`Cliente já existente reutilizado: ${finalUserId}`);
        } else {
          throw createError;
        }
      } else {
        finalUserId = newUser.user.id;
        console.log(`Cliente criado: ${finalUserId} por ${userId}`);
      }

      // Garantir que o perfil tenha os dados atualizados
      if (telefone) {
        await supabaseAdmin.from("profiles").update({ telefone }).eq("id", finalUserId);
      }

      // Garantir role de cliente
      await supabaseAdmin.from("user_roles")
        .upsert({ user_id: finalUserId, role: "cliente" }, { onConflict: "user_id,role" });

      // Vincular cliente ao tenant (se aplicável)
      const effectiveTenantId = tenantId || bodyTenantId;
      if (effectiveTenantId) {
        await supabaseAdmin.from("tenant_clientes")
          .upsert(
            { tenant_id: effectiveTenantId, user_id: finalUserId, added_by: userId },
            { onConflict: "tenant_id,user_id" }
          );
        console.log(`Cliente ${finalUserId} vinculado ao tenant ${effectiveTenantId}`);
      }

      return new Response(
        JSON.stringify({ success: true, userId: finalUserId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get-email") {
      const { data: authUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (getUserError || !authUser.user) {
        return new Response(
          JSON.stringify({ email: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ email: authUser.user.email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete") {
      if (!targetUserId) {
        return new Response(
          JSON.stringify({ error: "userId é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
      if (deleteError) throw deleteError;
      console.log(`Cliente ${targetUserId} excluído com sucesso por ${userId}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "impersonate") {
      const { cliente_id } = body;

      if (!cliente_id || typeof cliente_id !== "string") {
        return new Response(
          JSON.stringify({ error: "cliente_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Impedir auto-impersonação
      if (cliente_id === userId) {
        return new Response(
          JSON.stringify({ error: "Não é possível impersonar a si mesmo" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar dados do alvo, roles e vínculos profissionais
      const [profileResult, authResult, targetRolesResult, activeBarberResult, ownedTenantResult] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("nome")
          .eq("id", cliente_id)
          .maybeSingle(),
        supabaseAdmin.auth.admin.getUserById(cliente_id),
        supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", cliente_id),
        supabaseAdmin
          .from("barbeiros")
          .select("id, tenant_id")
          .eq("user_id", cliente_id)
          .eq("ativo", true)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("tenants")
          .select("id, nome, slug")
          .eq("owner_user_id", cliente_id)
          .maybeSingle(),
      ]);

      if (authResult.error || !authResult.data?.user) {
        return new Response(
          JSON.stringify({ error: "Cliente não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const clienteUser = authResult.data.user;
      const clienteEmail = clienteUser.email;
      const clienteNome = profileResult.data?.nome || "Cliente";

      if (!clienteEmail) {
        return new Response(
          JSON.stringify({ error: "Cliente não possui e-mail cadastrado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Detectar contexto profissional do alvo para direcionar ao app correto
      const targetRoleList = (targetRolesResult.data || []).map((r: any) => String(r.role ?? ""));
      const normalizedTargetRoles = targetRoleList
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean);
      const isTenantAdmin = normalizedTargetRoles.includes("tenant_admin") || !!ownedTenantResult.data?.id;
      const isBarberTarget =
        normalizedTargetRoles.includes("barber") ||
        normalizedTargetRoles.includes("barbeiro") ||
        !!activeBarberResult.data?.id;

      const tenantInfo = ownedTenantResult.data ?? null;

      const requestedRedirectApp = String(body.redirect_app ?? "").trim().toLowerCase();
      const requestedDestinationPath = String(body.destination_path ?? "").trim();
      const requestedRedirectOrigin = String(body.redirect_origin ?? "").trim();
      const refererHeader = req.headers.get("referer");
      let requestOrigin = req.headers.get("origin");

      if (!requestOrigin && refererHeader) {
        try {
          requestOrigin = new URL(refererHeader).origin;
        } catch (_) {
          requestOrigin = null;
        }
      }

      const dubAdminOrigin = requestOrigin || "https://dubadmin.lovable.app";
      let clientAppOrigin: string | null = null;

      if (requestedRedirectOrigin) {
        try {
          const parsedRedirectOrigin = new URL(requestedRedirectOrigin);
          if (parsedRedirectOrigin.protocol === "https:" || parsedRedirectOrigin.protocol === "http:") {
            clientAppOrigin = parsedRedirectOrigin.origin;
          }
        } catch (_) {
          clientAppOrigin = null;
        }
      }

      const shouldRedirectToDubAdmin =
        requestedRedirectApp === "dubadmin" ||
        (requestedRedirectApp !== "client" && (isTenantAdmin || isBarberTarget));
      const safeDestinationPath =
        requestedDestinationPath.startsWith("/") && !requestedDestinationPath.startsWith("//")
          ? requestedDestinationPath
          : null;
      const redirectBaseOrigin = shouldRedirectToDubAdmin ? dubAdminOrigin : clientAppOrigin;
      const redirectTo = redirectBaseOrigin
        ? `${redirectBaseOrigin}/auth/callback${safeDestinationPath ? `?next=${encodeURIComponent(safeDestinationPath)}` : ""}`
        : undefined;

      // Gerar magic link temporário (15 min)
      const { data: linkData, error: linkError } = await supabaseAdmin
        .auth.admin.generateLink({
          type: "magiclink",
          email: clienteEmail,
          ...(redirectTo
            ? {
                options: {
                  redirectTo,
                },
              }
            : {}),
        });

      if (linkError || !linkData) {
        console.error("Erro ao gerar magic link:", linkError);
        return new Response(
          JSON.stringify({ error: `Falha ao gerar link: ${linkError?.message || "erro desconhecido"}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const magicLink = linkData.properties?.action_link || "";

      if (!magicLink) {
        return new Response(
          JSON.stringify({ error: "Link gerado está vazio" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Token de rastreamento e log
      const trackingToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const operadorEmail = user.email || "desconhecido";

      // Log com identificação de tipo (cliente vs barbearia)
      const logNome = isTenantAdmin
        ? `[BARBEARIA] ${tenantInfo?.nome || clienteNome}`
        : clienteNome;

      // (tabela ti_impersonation_logs removida — auditoria continua via audit_logs abaixo)



      await supabaseAdmin.from("audit_logs").insert({
        user_id: userId,
        action: isTenantAdmin ? "ti_impersonate_tenant_admin" : "ti_impersonate_client",
        entity_type: isTenantAdmin ? "tenant" : "auth_user",
        entity_id: isTenantAdmin ? (tenantInfo?.id || cliente_id) : cliente_id,
        new_values: {
          operador_email: operadorEmail,
          cliente_email: clienteEmail,
          cliente_nome: logNome,
          target_roles: targetRoleList,
          tenant_info: tenantInfo,
          tracking_token: trackingToken,
          expires_at: expiresAt.toISOString(),
        },
      });

      console.log(`[IMPERSONAÇÃO] ${operadorEmail} impersonou ${logNome} (${clienteEmail}) roles=${targetRoleList.join(",")}`);

      return new Response(
        JSON.stringify({
          magic_link: magicLink,
          tracking_token: trackingToken,
          expires_at: expiresAt.toISOString(),
          cliente_email: clienteEmail,
          cliente_nome: logNome,
          is_tenant_admin: isTenantAdmin,
          is_barber_target: isBarberTarget,
          redirect_app: shouldRedirectToDubAdmin ? "dubadmin" : "default",
          redirect_to: redirectTo,
          tenant_info: tenantInfo,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "create_tenant_admin") {
      const { nome_dono, senha, barbearia_nome, cidade, estado } = body;
      const adminEmail = body.email;

      if (!adminEmail || !senha || !barbearia_nome) {
        return new Response(
          JSON.stringify({ error: "email, senha e barbearia_nome são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Criar usuário no auth
      const { data: newUser, error: userError } =
        await supabaseAdmin.auth.admin.createUser({
          email: adminEmail,
          password: senha,
          email_confirm: true,
          user_metadata: { nome: nome_dono || adminEmail },
        });

      if (userError) {
        return new Response(
          JSON.stringify({ error: userError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const newUserId = newUser.user.id;

      // 2. Criar profile
      await supabaseAdmin.from("profiles").upsert({
        id: newUserId,
        nome: nome_dono || adminEmail,
      });

      // 3. Criar tenant com slug único
      const slug = barbearia_nome
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const { data: tenant, error: tenantError } =
        await supabaseAdmin.from("tenants").insert({
          owner_user_id: newUserId,
          nome: barbearia_nome,
          slug: `${slug}-${Date.now().toString(36)}`,
          cidade: cidade || null,
          estado: estado || null,
          ativo: true,
          onboarding_completed: false,
          trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }).select().single();

      if (tenantError) {
        // Rollback: deletar usuário criado
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        return new Response(
          JSON.stringify({ error: tenantError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 4. Atribuir role tenant_admin
      await supabaseAdmin.from("user_roles").insert({
        user_id: newUserId,
        role: "tenant_admin",
      });

      // 5. Log de auditoria
      const operadorEmail = user.email || "desconhecido";
      await supabaseAdmin.from("audit_logs").insert({
        user_id: userId,
        action: "ti_create_tenant",
        entity_type: "tenants",
        entity_id: tenant.id,
        new_values: {
          barbearia_nome,
          owner_email: adminEmail,
          criado_por: operadorEmail,
        },
      });

      console.log(`[TI] Barbearia "${barbearia_nome}" criada por ${operadorEmail}`);

      return new Response(
        JSON.stringify({
          success: true,
          tenant_id: tenant.id,
          user_id: newUserId,
          slug: tenant.slug,
          mensagem: `Barbearia "${barbearia_nome}" criada com sucesso`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "create_ti_user") {
      // Apenas admin e ti podem criar usuários TI
      if (resolvedRole !== "admin" && resolvedRole !== "ti") {
        return new Response(
          JSON.stringify({ error: "Apenas admin/ti podem criar usuários TI" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tiEmail = body.email;
      const tiNome = body.nome;
      const tiSenha = body.senha;

      if (!tiEmail || !tiNome || !tiSenha || tiSenha.length < 8) {
        return new Response(
          JSON.stringify({ error: "email, nome e senha (mín. 8 chars) são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Criar usuário no auth
      const { data: newTIUser, error: tiUserError } =
        await supabaseAdmin.auth.admin.createUser({
          email: tiEmail,
          password: tiSenha,
          email_confirm: true,
          user_metadata: { nome: tiNome },
        });

      if (tiUserError) {
        return new Response(
          JSON.stringify({ error: tiUserError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tiUserId = newTIUser.user.id;

      // 2. Criar profile
      await supabaseAdmin.from("profiles").upsert({
        id: tiUserId,
        nome: tiNome,
      });

      // 3. Atribuir role 'ti'
      await supabaseAdmin.from("user_roles").insert({
        user_id: tiUserId,
        role: "ti",
      });

      // 4. Log de auditoria
      const operadorEmail = user.email || "desconhecido";
      await supabaseAdmin.from("audit_logs").insert({
        user_id: userId,
        action: "ti_create_ti_user",
        entity_type: "user_ti",
        entity_id: tiUserId,
        new_values: {
          email: tiEmail,
          nome: tiNome,
          criado_por: operadorEmail,
        },
      });

      console.log(`[TI] Usuário TI "${tiNome}" (${tiEmail}) criado por ${operadorEmail}`);

      return new Response(
        JSON.stringify({
          success: true,
          user_id: tiUserId,
          mensagem: `Usuário TI "${tiNome}" criado com sucesso`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════════════════
    // ACTION: setup_test_accounts — Cria contas de teste
    // ══════════════════════════════════════════════════════
    if (action === "setup_test_accounts") {
      // Apenas admin e ti podem criar contas de teste
      if (resolvedRole !== "admin" && resolvedRole !== "ti") {
        return new Response(
          JSON.stringify({ error: "Apenas admin/ti podem criar contas de teste" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificar se contas já existem
      const { data: existingConfig } = await supabaseAdmin
        .from("system_config")
        .select("chave, valor")
        .in("chave", ["test_tenant_id", "test_client_id"]);

      const tenantConfig = existingConfig?.find((c: any) => c.chave === "test_tenant_id");

      if (tenantConfig?.valor) {
        return new Response(
          JSON.stringify({
            ja_existe: true,
            mensagem: "Contas de teste já existem",
            test_tenant_id: tenantConfig.valor,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── Criar dono da barbearia teste ────────────
      let barberOwnerId: string | undefined;
      const { data: barberOwner, error: e1 } =
        await supabaseAdmin.auth.admin.createUser({
          email: "teste.barbeiro@dub.internal",
          password: "DubTeste@2026",
          email_confirm: true,
          user_metadata: { nome: "Barbeiro Teste DUB" },
        });
      if (e1) {
        // Se o usuário já existe, buscar o ID existente
        if (e1.message?.includes("already been registered")) {
          let page = 1;
          let found = false;
          while (!found) {
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
            const user = (listData?.users || []).find((u: any) => u.email === "teste.barbeiro@dub.internal");
            if (user) { barberOwnerId = user.id; found = true; }
            else if ((listData?.users || []).length < 1000) break;
            else page++;
          }
          if (!found) {
            return new Response(
              JSON.stringify({ error: "Usuário barbeiro teste existe mas não foi localizado" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          return new Response(
            JSON.stringify({ error: e1.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        barberOwnerId = barberOwner.user.id;
      }

      if (!barberOwnerId) {
        return new Response(JSON.stringify({ error: "Usuário barbeiro teste não localizado" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("profiles").upsert({
        id: barberOwnerId,
        nome: "Barbeiro Teste DUB",
      }, { onConflict: "id" });

      await supabaseAdmin.from("user_roles").upsert({
        user_id: barberOwnerId,
        role: "tenant_admin",
      }, { onConflict: "user_id,role" });

      // ── Criar tenant de teste ────────────────────
      // Check if tenant already exists for this owner
      const { data: existingTenant } = await supabaseAdmin
        .from("tenants")
        .select("*")
        .eq("owner_user_id", barberOwnerId)
        .eq("is_test", true)
        .maybeSingle();

      let testTenant = existingTenant;
      if (!testTenant) {
        const { data: newTenant, error: e2 } = await supabaseAdmin
        .from("tenants")
        .insert({
          owner_user_id: barberOwnerId,
          nome: "[TESTE] DUB Barbearia",
          slug: "dub-teste-interno-" + Date.now(),
          ativo: true,
          is_test: true,
          onboarding_completed: true,
          trial_ends_at: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString(),
          cidade: "São Paulo",
          estado: "SP",
        })
        .select()
        .single();
        if (e2) {
          return new Response(
            JSON.stringify({ error: e2.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        testTenant = newTenant;
      }

      // ── Criar barbeiro no tenant teste ───────────
      // Check if barber already exists
      const { data: existingBarber } = await supabaseAdmin
        .from("barbeiros")
        .select("id")
        .eq("user_id", barberOwnerId)
        .eq("tenant_id", testTenant.id)
        .maybeSingle();

      let testBarbeiro = existingBarber;
      if (!testBarbeiro) {
        const { data: newBarber } = await supabaseAdmin
        .from("barbeiros")
        .insert({
          user_id: barberOwnerId,
          tenant_id: testTenant.id,
          apelido: "Barbeiro Teste",
          ativo: true,
          setup_completed: true,
          comissao_pct: 50,
        })
        .select()
        .single();
        testBarbeiro = newBarber;
      }

      // ── Criar serviço de teste ───────────────────
      await supabaseAdmin.from("servicos").insert({
        tenant_id: testTenant.id,
        nome: "Corte Teste (Sandbox)",
        descricao: "Serviço de teste — sem cobrança real",
        duracao_minutos: 30,
        preco: 30,
        ativo: true,
      });

      // ── Criar cliente teste ──────────────────────
      let testClientId: string | undefined;
      const { data: testClient, error: e3 } =
        await supabaseAdmin.auth.admin.createUser({
          email: "teste.cliente@dub.internal",
          password: "DubTeste@2026",
          email_confirm: true,
          user_metadata: { nome: "Cliente Teste DUB" },
        });
      if (e3) {
        if (e3.message?.includes("already been registered")) {
          let page = 1;
          let found = false;
          while (!found) {
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
            const user = (listData?.users || []).find((u: any) => u.email === "teste.cliente@dub.internal");
            if (user) { testClientId = user.id; found = true; }
            else if ((listData?.users || []).length < 1000) break;
            else page++;
          }
          if (!found) {
            return new Response(
              JSON.stringify({ error: "Usuário cliente teste existe mas não foi localizado" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          return new Response(
            JSON.stringify({ error: e3.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        testClientId = testClient.user.id;
      }

      if (!testClientId) {
        return new Response(JSON.stringify({ error: "Usuário cliente teste não localizado" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("profiles").upsert({
        id: testClientId,
        nome: "Cliente Teste DUB",
        barbearia_preferida_id: testTenant.id,
      }, { onConflict: "id" });

      await supabaseAdmin.from("user_roles").upsert({
        user_id: testClientId,
        role: "cliente",
      }, { onConflict: "user_id,role" });

      // Adicionar créditos ao cliente teste
      await supabaseAdmin.rpc("add_wallet_credits", {
        p_user_id: testClientId,
        p_amount: 500,
        p_description: "Créditos iniciais de teste",
      });

      // Vincular cliente à barbearia teste
      await supabaseAdmin.from("tenant_clientes").upsert(
        { user_id: testClientId, tenant_id: testTenant.id, added_by: userId },
        { onConflict: "tenant_id,user_id" }
      );

      // ── Salvar IDs na system_config ──────────────
      const configUpdates = [
        { chave: "test_tenant_id", valor: testTenant.id },
        { chave: "test_barber_owner_id", valor: barberOwnerId },
        { chave: "test_client_id", valor: testClientId },
        { chave: "test_barber_id", valor: testBarbeiro?.id || "" },
      ];

      for (const cfg of configUpdates) {
        await supabaseAdmin
          .from("system_config")
          .upsert(
            { chave: cfg.chave, valor: cfg.valor, updated_by: userId },
            { onConflict: "chave" }
          );
      }

      // Log de auditoria
      const setupOperadorEmail = user.email || "desconhecido";
      await supabaseAdmin.from("audit_logs").insert({
        user_id: userId,
        action: "ti_setup_test_accounts",
        entity_type: "system",
        entity_id: testTenant.id,
        new_values: {
          test_tenant_id: testTenant.id,
          test_client_id: testClientId,
          criado_por: setupOperadorEmail,
        },
      });

      console.log(`[TI] Contas de teste criadas por ${setupOperadorEmail}`);

      return new Response(
        JSON.stringify({
          success: true,
          test_tenant_id: testTenant.id,
          test_barber_email: "teste.barbeiro@dub.internal",
          test_client_email: "teste.cliente@dub.internal",
          senha: "DubTeste@2026",
          mensagem: "Contas de teste criadas com sucesso",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════════════════
    // ACTION: reset_test_accounts — Reseta contas de teste
    // ══════════════════════════════════════════════════════
    if (action === "reset_test_accounts") {
      if (resolvedRole !== "admin" && resolvedRole !== "ti") {
        return new Response(
          JSON.stringify({ error: "Apenas admin/ti podem resetar contas de teste" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: resetConfigs } = await supabaseAdmin
        .from("system_config")
        .select("chave, valor")
        .in("chave", ["test_client_id", "test_tenant_id", "test_barber_id"]);

      const cfgMap = Object.fromEntries(
        (resetConfigs || []).map((c: any) => [c.chave, c.valor])
      );

      if (!cfgMap.test_client_id) {
        return new Response(
          JSON.stringify({ error: "Contas de teste não encontradas" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Resetar saldo do cliente — zerar e readicionar
      await supabaseAdmin
        .from("wallet_balances")
        .update({ balance: 0 })
        .eq("user_id", cfgMap.test_client_id);

      await supabaseAdmin.rpc("add_wallet_credits", {
        p_user_id: cfgMap.test_client_id,
        p_amount: 500,
        p_description: "Reset de conta teste",
      });

      // 2. Cancelar agendamentos pendentes de teste
      if (cfgMap.test_barber_id) {
        await supabaseAdmin
          .from("agendamentos")
          .update({ status: "cancelled_by_admin" })
          .eq("barbeiro_id", cfgMap.test_barber_id)
          .in("status", ["pending", "confirmed"]);
      }

      console.log(`[TI] Contas de teste resetadas por ${userId}`);

      return new Response(
        JSON.stringify({ success: true, mensagem: "Contas resetadas com sucesso" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in manage-clients:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
