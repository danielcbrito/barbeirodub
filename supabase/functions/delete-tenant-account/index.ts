import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { getAsaasConfig } from '../_shared/asaas-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Edge Function: delete-tenant-account
 * 
 * Remove completamente uma barbearia (tenant) do sistema:
 * 1. Desativa subcontas Asaas de todos os barbeiros
 * 2. Remove instâncias WhatsApp da Evolution API
 * 3. Apaga todos os dados do banco vinculados ao tenant
 * 4. Remove o registro do tenant e o user_role do owner
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiToken = Deno.env.get('EVOLUTION_API_TOKEN');
    const asaasConfig = getAsaasConfig();

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Autenticar o usuário que está chamando
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar tenant do owner
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, nome, owner_user_id')
      .eq('owner_user_id', user.id)
      .single();

    if (!tenant) {
      return new Response(JSON.stringify({ error: 'Barbearia não encontrada para este usuário' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tenantId = tenant.id;
    const ownerUserId = tenant.owner_user_id;
    const log: string[] = [];

    console.log(`[delete-tenant] Iniciando exclusão do tenant ${tenantId} (${tenant.nome})`);

    // ═══ 1. Buscar todos os barbeiros do tenant ═══
    const { data: barbeiros } = await supabase
      .from('barbeiros')
      .select('id, user_id, asaas_account_id')
      .eq('tenant_id', tenantId);

    const barbeiroIds = (barbeiros || []).map(b => b.id);
    const barbeiroUserIds = (barbeiros || []).filter(b => b.user_id).map(b => b.user_id!);

    log.push(`Barbeiros encontrados: ${barbeiroIds.length}`);

    // ═══ 2. Desativar subcontas Asaas ═══
    if (asaasConfig) {
      for (const barb of (barbeiros || [])) {
        if (!barb.asaas_account_id) continue;
        try {
          const resp = await fetch(`${asaasConfig.baseUrl}/accounts/${barb.asaas_account_id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'access_token': asaasConfig.apiKey },
          });
          log.push(`Asaas subconta ${barb.asaas_account_id}: ${resp.ok ? 'desativada' : 'erro'}`);
        } catch (e) {
          log.push(`Asaas subconta ${barb.asaas_account_id}: erro ${e}`);
        }
      }
    }

    // ═══ 3. Remover instâncias WhatsApp da Evolution API ═══
    if (evolutionApiUrl && evolutionApiToken) {
      const { data: whatsappInstances } = await supabase
        .from('whatsapp_instances')
        .select('instance_name')
        .in('barbeiro_id', barbeiroIds.length > 0 ? barbeiroIds : ['__none__']);

      for (const inst of (whatsappInstances || [])) {
        try {
          // Logout primeiro
          await fetch(`${evolutionApiUrl}/instance/logout/${inst.instance_name}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiToken },
          });
          // Deletar instância
          const resp = await fetch(`${evolutionApiUrl}/instance/delete/${inst.instance_name}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiToken },
          });
          log.push(`WhatsApp ${inst.instance_name}: ${resp.ok ? 'removida' : 'erro'}`);
        } catch (e) {
          log.push(`WhatsApp ${inst.instance_name}: erro ${e}`);
        }
      }
    }

    // ═══ 4. Limpar dados do banco (ordem: filhos → pais) ═══

    // Agendamentos e dependências
    if (barbeiroIds.length > 0) {
      // Logs de lembretes dos agendamentos
      await supabase.from('agendamento_lembretes_log').delete()
        .in('agendamento_id', 
          (await supabase.from('agendamentos').select('id').in('barbeiro_id', barbeiroIds)).data?.map(a => a.id) || ['__none__']
        );

      // Pagamentos dos agendamentos
      await supabase.from('pagamentos').delete()
        .in('agendamento_id',
          (await supabase.from('agendamentos').select('id').in('barbeiro_id', barbeiroIds)).data?.map(a => a.id) || ['__none__']
        );

      // Comissões
      await supabase.from('comissoes').delete().in('barbeiro_id', barbeiroIds);

      // Avaliações
      await supabase.from('barbeiro_avaliacoes').delete().in('barber_id', barbeiroIds);

      // Plano agendamentos usos (via user_ids dos barbeiros)
      if (barbeiroUserIds.length > 0) {
        await supabase.from('plano_agendamentos_usos').delete().in('user_id', barbeiroUserIds);
      }

      // Agendamentos
      // First remove FK references to avoid constraint issues
      await supabase.from('agendamentos').update({ remarcado_de: null, usado_redemption_id: null })
        .in('barbeiro_id', barbeiroIds);
      await supabase.from('agendamentos').delete().in('barbeiro_id', barbeiroIds);

      // Pending bookings
      await supabase.from('pending_bookings').delete().in('barbeiro_id', barbeiroIds);

      // Horários
      await supabase.from('configuracoes_horario_barbeiro').delete().in('barbeiro_id', barbeiroIds);
      await supabase.from('horarios_excepcionais_barbeiro').delete().in('barbeiro_id', barbeiroIds);
      await supabase.from('barbeiro_servico_duracao').delete().in('barbeiro_id', barbeiroIds);

      // Financeiro
      await supabase.from('saques').delete().in('barbeiro_id', barbeiroIds);
      await supabase.from('depositos').delete().in('barbeiro_id', barbeiroIds);
      await supabase.from('chaves_pix').delete().in('barbeiro_id', barbeiroIds);
      await supabase.from('contas_bancarias').delete().in('barbeiro_id', barbeiroIds);

      // Google tokens
      await supabase.from('barbeiro_google_tokens').delete().in('barbeiro_id', barbeiroIds);

      // WhatsApp instances (DB)
      await supabase.from('whatsapp_instances').delete().in('barbeiro_id', barbeiroIds);

      // Barbeiros private
      await supabase.from('barbeiros_private').delete().in('barbeiro_id', barbeiroIds);

      // Barbeiros
      await supabase.from('barbeiros').delete().in('id', barbeiroIds);
    }

    log.push('Dados de barbeiros limpos');

    // Dados vinculados ao tenant_id
    await supabase.from('discount_coupons').delete().eq('tenant_id', tenantId);
    await supabase.from('disparos_programados').delete().eq('tenant_id', tenantId);
    await supabase.from('servicos').delete().eq('tenant_id', tenantId);
    await supabase.from('planos').delete().eq('tenant_id', tenantId);
    await supabase.from('promocoes').delete().eq('tenant_id', tenantId);
    await supabase.from('tenant_mensagem_templates').delete().eq('tenant_id', tenantId);
    await supabase.from('tenant_webhook_config').delete().eq('tenant_id', tenantId);
    await supabase.from('tenant_members').delete().eq('tenant_id', tenantId);

    log.push('Dados do tenant limpos');

    // ═══ 5. Dados do owner e barbeiros (user-level) ═══
    const allUserIds = [...new Set([ownerUserId, ...barbeiroUserIds])];

    for (const uid of allUserIds) {
      if (!uid) continue;
      // Financeiro
      await supabase.from('financeiro_auth_sessions').delete().eq('user_id', uid);
      await supabase.from('financeiro_auth_attempts').delete().eq('user_id', uid);
      await supabase.from('pin_financeiro').delete().eq('user_id', uid);
      await supabase.from('wallet_transactions').delete().eq('user_id', uid);
      await supabase.from('wallet_deposits').delete().eq('user_id', uid);
      await supabase.from('wallet_balances').delete().eq('user_id', uid);

      // Suporte e IA
      await supabase.from('ai_feedback').delete().eq('user_id', uid);
      await supabase.from('ai_actions_log').delete().eq('user_id', uid);
      await supabase.from('support_conversations').delete().eq('user_id', uid);
      await supabase.from('support_tickets').delete().eq('user_id', uid);
      await supabase.from('pending_tickets').delete().eq('user_id', uid);

      // Pontos e resgates
      await supabase.from('resgates').delete().eq('user_id', uid);
      await supabase.from('pontos').delete().eq('user_id', uid);
      await supabase.from('creditos').delete().eq('user_id', uid);

      // Notificações e dispositivos
      await supabase.from('notificacoes').delete().eq('user_id', uid);
      await supabase.from('dispositivos_conectados').delete().eq('user_id', uid);

      // Email tokens e verificação WhatsApp
      await supabase.from('email_confirmation_tokens').delete().eq('user_id', uid);
      await supabase.from('whatsapp_verification_codes').delete().eq('user_id', uid);

      // Admin google tokens
      await supabase.from('admin_google_tokens').delete().eq('user_id', uid);

      // Audit logs
      await supabase.from('audit_logs').delete().eq('user_id', uid);

      // Account deletion feedback
      await supabase.from('account_deletion_feedback').delete().eq('user_id', uid);

      // Perfil público
      await supabase.from('profiles').delete().eq('id', uid);

      // User roles — limpar todos
      await supabase.from('user_roles').delete().eq('user_id', uid);
    }

    log.push('Dados de usuários limpos');

    // ═══ 6. Deletar o tenant ═══
    await supabase.from('tenants').delete().eq('id', tenantId);

    log.push('Tenant removido');

    // ═══ 7. Deletar usuários do auth (owner + barbeiros) ═══
    for (const uid of allUserIds) {
      if (!uid) continue;
      try {
        const { error: delErr } = await supabase.auth.admin.deleteUser(uid);
        if (delErr) {
          log.push(`Auth delete ${uid}: erro - ${delErr.message}`);
        } else {
          log.push(`Auth delete ${uid}: ok`);
        }
      } catch (e) {
        log.push(`Auth delete ${uid}: exception - ${e}`);
      }
    }

    log.push('Exclusão completa finalizada');
    console.log(`[delete-tenant] Concluído:`, log);

    return new Response(
      JSON.stringify({ success: true, log }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[delete-tenant] Erro fatal:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
