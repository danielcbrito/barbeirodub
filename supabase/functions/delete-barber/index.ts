/**
 * DELETE-BARBER — Exclui completamente um barbeiro do sistema
 *
 * REFATORADO: Usa _shared/response.ts e _shared/auth.ts
 * 
 * Remove: agendamentos, pagamentos, comissões, avaliações,
 * horários, portfólio, financeiro, WhatsApp, dados privados,
 * perfil, roles e usuário do auth.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getAsaasConfig } from "../_shared/asaas-config.ts";
import { ok, fail, handleCors } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionApiToken = Deno.env.get("EVOLUTION_API_TOKEN");
    const asaasConfig = getAsaasConfig();

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // ═══ Autenticação ═══
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return fail("UNAUTHORIZED", "Não autorizado", 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return fail("INVALID_TOKEN", "Token inválido", 401);
    }

    const { barbeiro_id } = await req.json();
    if (!barbeiro_id) {
      return fail("MISSING_FIELDS", "barbeiro_id é obrigatório");
    }

    // ═══ Buscar dados do barbeiro ═══
    const { data: barber, error: fetchErr } = await supabase
      .from("barbeiros")
      .select("id, user_id, tenant_id, asaas_account_id, apelido")
      .eq("id", barbeiro_id)
      .maybeSingle();

    if (fetchErr || !barber) {
      return fail("BARBER_NOT_FOUND", "Barbeiro não encontrado", 404);
    }

    // ═══ Verificar permissão ═══
    const { data: tenant } = await supabase
      .from("tenants")
      .select("owner_user_id")
      .eq("id", barber.tenant_id)
      .maybeSingle();

    const isOwner = tenant?.owner_user_id === user.id;
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!isOwner && !adminRole) {
      return fail("FORBIDDEN", "Sem permissão para excluir este barbeiro", 403);
    }

    const log: string[] = [];
    const barbId = barber.id;
    const barberUserId = barber.user_id;

    console.log(`[delete-barber] Iniciando exclusão do barbeiro ${barbId} (${barber.apelido})`);

    // ═══ 1. Desativar subconta Asaas ═══
    if (asaasConfig && barber.asaas_account_id) {
      try {
        const resp = await fetch(`${asaasConfig.baseUrl}/accounts/${barber.asaas_account_id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", access_token: asaasConfig.apiKey },
        });
        log.push(`Asaas subconta ${barber.asaas_account_id}: ${resp.ok ? "desativada" : "erro"}`);
      } catch (e) {
        log.push(`Asaas subconta erro: ${e}`);
      }
    }

    // ═══ 2. Remover instância WhatsApp ═══
    if (evolutionApiUrl && evolutionApiToken) {
      const { data: whatsappInstances } = await supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("barbeiro_id", barbId);

      for (const inst of whatsappInstances || []) {
        try {
          await fetch(`${evolutionApiUrl}/instance/logout/${inst.instance_name}`, {
            method: "DELETE",
            headers: { apikey: evolutionApiToken },
          });
          await fetch(`${evolutionApiUrl}/instance/delete/${inst.instance_name}`, {
            method: "DELETE",
            headers: { apikey: evolutionApiToken },
          });
          log.push(`WhatsApp ${inst.instance_name}: removida`);
        } catch (e) {
          log.push(`WhatsApp ${inst.instance_name}: erro ${e}`);
        }
      }
    }

    // ═══ 3. Limpar dados do banco (filhos → pais) ═══
    const { data: appointments } = await supabase
      .from("agendamentos")
      .select("id")
      .eq("barbeiro_id", barbId);
    const appointmentIds = (appointments || []).map((a: { id: string }) => a.id);

    if (appointmentIds.length > 0) {
      await supabase.from("agendamento_lembretes_log").delete().in("agendamento_id", appointmentIds);
      await supabase.from("pagamentos").delete().in("agendamento_id", appointmentIds);
      await supabase.from("plano_agendamentos_usos").delete().in("agendamento_id", appointmentIds);
      await supabase.from("logs_agendamentos").delete().in("agendamento_id", appointmentIds);
    }

    await supabase.from("comissoes").delete().eq("barbeiro_id", barbId);
    await supabase.from("barbeiro_avaliacoes").delete().eq("barber_id", barbId);
    await supabase.from("agendamentos").update({ remarcado_de: null, usado_redemption_id: null }).eq("barbeiro_id", barbId);
    await supabase.from("agendamentos").delete().eq("barbeiro_id", barbId);
    await supabase.from("pending_bookings").delete().eq("barbeiro_id", barbId);
    await supabase.from("configuracoes_horario_barbeiro").delete().eq("barbeiro_id", barbId);
    await supabase.from("horarios_excepcionais_barbeiro").delete().eq("barbeiro_id", barbId);
    await supabase.from("barbeiro_servico_duracao").delete().eq("barbeiro_id", barbId);
    await supabase.from("barbeiro_portfolio").delete().eq("barbeiro_id", barbId);
    await supabase.from("barbeiro_unidades").delete().eq("barbeiro_id", barbId);
    await supabase.from("saques").delete().eq("barbeiro_id", barbId);
    await supabase.from("depositos").delete().eq("barbeiro_id", barbId);
    await supabase.from("chaves_pix").delete().eq("barbeiro_id", barbId);
    await supabase.from("contas_bancarias").delete().eq("barbeiro_id", barbId);
    await supabase.from("assinaturas").delete().eq("barbeiro_id", barbId);
    await supabase.from("barbeiro_google_tokens").delete().eq("barbeiro_id", barbId);
    await supabase.from("whatsapp_instances").delete().eq("barbeiro_id", barbId);
    await supabase.from("barbeiros_private").delete().eq("barbeiro_id", barbId);
    await supabase.from("barbeiros").delete().eq("id", barbId);

    log.push("Dados do barbeiro limpos");

    // ═══ 4. Limpar dados user-level e deletar auth user ═══
    if (barberUserId) {
      await supabase.from("financeiro_auth_sessions").delete().eq("user_id", barberUserId);
      await supabase.from("financeiro_auth_attempts").delete().eq("user_id", barberUserId);
      await supabase.from("pin_financeiro").delete().eq("user_id", barberUserId);
      await supabase.from("wallet_transactions").delete().eq("user_id", barberUserId);
      await supabase.from("wallet_deposits").delete().eq("user_id", barberUserId);
      await supabase.from("wallet_balances").delete().eq("user_id", barberUserId);
      await supabase.from("ai_feedback").delete().eq("user_id", barberUserId);
      await supabase.from("ai_actions_log").delete().eq("user_id", barberUserId);
      await supabase.from("support_conversations").delete().eq("user_id", barberUserId);
      await supabase.from("support_tickets").delete().eq("user_id", barberUserId);
      await supabase.from("pending_tickets").delete().eq("user_id", barberUserId);
      await supabase.from("resgates").delete().eq("user_id", barberUserId);
      await supabase.from("pontos").delete().eq("user_id", barberUserId);
      await supabase.from("creditos").delete().eq("user_id", barberUserId);
      await supabase.from("notificacoes").delete().eq("user_id", barberUserId);
      await supabase.from("dispositivos_conectados").delete().eq("user_id", barberUserId);
      await supabase.from("email_confirmation_tokens").delete().eq("user_id", barberUserId);
      await supabase.from("whatsapp_verification_codes").delete().eq("user_id", barberUserId);
      await supabase.from("admin_google_tokens").delete().eq("user_id", barberUserId);
      await supabase.from("audit_logs").delete().eq("user_id", barberUserId);
      await supabase.from("account_deletion_feedback").delete().eq("user_id", barberUserId);
      await supabase.from("profiles").delete().eq("id", barberUserId);
      await supabase.from("user_roles").delete().eq("user_id", barberUserId);

      try {
        const { error: delErr } = await supabase.auth.admin.deleteUser(barberUserId);
        log.push(delErr ? `Auth delete erro: ${delErr.message}` : "Auth user deletado");
      } catch (e) {
        log.push(`Auth delete exception: ${e}`);
      }
    }

    log.push("Exclusão completa finalizada");
    console.log(`[delete-barber] Concluído:`, log);

    return ok({ log });
  } catch (error) {
    console.error("[delete-barber] Erro fatal:", error);
    return fail(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Erro interno",
      500
    );
  }
});
