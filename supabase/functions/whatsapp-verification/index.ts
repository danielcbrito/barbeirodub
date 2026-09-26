import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Formata o número de telefone no padrão WhatsApp: NUMERO@s.whatsapp.net
 */
function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return '';
  // Se já vier com DDI (12+ dígitos), usa como está. Só prefixa 55
  // quando é um número nacional BR (10-11 dígitos) para manter retrocompatibilidade.
  if (cleaned.length <= 11 && !cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Gera um código numérico de 6 dígitos
 */
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Resolve a instância conectada do mesmo tenant do usuário.
 * Nunca usa instância fixa nem faz fallback para outra barbearia.
 */
async function getWhatsAppInstance(
  supabase: any,
  userId: string,
): Promise<{ instance_name: string; api_key: string; status: string } | null> {
  try {
    const [{ data: ownBarber }, { data: ownedTenant }, { data: clientTenant }] = await Promise.all([
      supabase
        .from('barbeiros')
        .select('tenant_id')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('tenants')
        .select('id')
        .eq('owner_user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('tenant_clientes')
        .select('tenant_id')
        .eq('user_id', userId)
        .eq('blocked', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const tenantId = ownBarber?.tenant_id ?? ownedTenant?.id ?? clientTenant?.tenant_id ?? null;
    if (!tenantId) {
      console.info('[whatsapp-verification] Usuário ainda não possui tenant; envio segue sem instância vinculada');
      return null;
    }

    const { data: tenantBarbers } = await supabase
      .from('barbeiros')
      .select('id, user_id')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .is('deleted_at', null);

    if (!tenantBarbers?.length) return null;

    const ownerUserId = ownedTenant?.id === tenantId
      ? userId
      : (await supabase
          .from('tenants')
          .select('owner_user_id')
          .eq('id', tenantId)
          .maybeSingle()).data?.owner_user_id;
    const ownerBarberIds = tenantBarbers
      .filter((barber: { id: string; user_id: string | null }) => barber.user_id === ownerUserId)
      .map((barber: { id: string }) => barber.id);
    const tenantBarberIds = tenantBarbers.map((barber: { id: string }) => barber.id);

    const findConnected = async (barberIds: string[]) => {
      if (!barberIds.length) return null;
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, api_key, status')
        .in('barbeiro_id', barberIds)
        .eq('status', 'connected')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    };

    const connected = (await findConnected(ownerBarberIds)) ?? (await findConnected(tenantBarberIds));
    return connected
      ? {
          instance_name: connected.instance_name,
          api_key: connected.api_key,
          status: connected.status,
        }
      : null;
  } catch (e) {
    console.warn('[whatsapp-verification] Não foi possível resolver a instância do tenant:', e);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, ...data } = await req.json();
    console.log(`[whatsapp-verification] Action: ${action}`);

    // =============================================
    // ACTION: generate - Gerar e enviar código
    // =============================================
    if (action === "generate") {
      const { user_id, phone, user_name, user_email, user_cpf } = data;

      if (!user_id || !phone) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id e phone são obrigatórios" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      await supabase
        .from('whatsapp_verification_codes')
        .update({ expires_at: new Date().toISOString() })
        .eq('user_id', user_id)
        .is('verified_at', null);

      const code = generateCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const { error: insertError } = await supabase
        .from('whatsapp_verification_codes')
        .insert({
          user_id,
          phone,
          code,
          expires_at: expiresAt.toISOString(),
          user_name,
          user_email,
          user_cpf,
        });

      if (insertError) {
        console.error('[whatsapp-verification] Erro ao salvar código:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao gerar código" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      const { data: webhookConfig } = await supabase
        .from('webhook_config')
        .select('whatsapp_webhook_url, whatsapp_ativo, webhook_url, ativo')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const webhookUrl = webhookConfig?.whatsapp_webhook_url || webhookConfig?.webhook_url;
      const webhookAtivo = webhookConfig?.whatsapp_webhook_url 
        ? webhookConfig?.whatsapp_ativo 
        : webhookConfig?.ativo;

      const mensagemWhatsApp = `${code}`;

      if (webhookUrl && webhookAtivo) {
        // Buscar instância WhatsApp para incluir no payload
        const whatsappInstance = await getWhatsAppInstance(supabase, user_id);

        const webhookPayload = {
          evento: "verificacao_cadastro",
          cliente_nome: user_name || "Cliente",
          telefone: formatPhoneForWhatsApp(phone),
          codigo: code,
          mensagem: mensagemWhatsApp,
          timestamp: new Date().toISOString(),
          whatsapp_instance: whatsappInstance,
        };

        console.log('[whatsapp-verification] Enfileirando envio para webhook:', webhookUrl);
        if (whatsappInstance) {
          console.log('[whatsapp-verification] WhatsApp instance:', whatsappInstance.instance_name);
        }

        EdgeRuntime.waitUntil((async () => {
          let webhookSuccess = false;
          let lastError: string | null = null;

          try {
            const response = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookPayload),
            });

            if (response.ok) {
              webhookSuccess = true;
              console.log('[whatsapp-verification] Webhook enviado com sucesso');
            } else {
              lastError = `HTTP ${response.status}: ${await response.text()}`;
              console.warn('[whatsapp-verification] Falha ao enviar webhook:', lastError);
            }
          } catch (err: unknown) {
            lastError = err instanceof Error ? err.message : String(err);
            console.warn('[whatsapp-verification] Erro ao enviar webhook:', lastError);
          }

          try {
            await supabase.from('system_logs').insert({
              level: webhookSuccess ? 'info' : 'warn',
              category: 'whatsapp_verification',
              message: webhookSuccess 
                ? 'Código de verificação enviado via webhook' 
                : 'Falha ao enviar código via webhook',
              details: { 
                user_id, phone, webhook_success: webhookSuccess, error: lastError,
                whatsapp_instance_name: whatsappInstance?.instance_name || null,
              },
              user_id,
            });
          } catch (logErr) {
            console.error('[whatsapp-verification] Erro ao registrar log:', logErr);
          }
        })());
      } else {
        console.warn('[whatsapp-verification] Webhook não configurado ou inativo');
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Código enviado para seu WhatsApp" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: verify - Verificar código
    // =============================================
    if (action === "verify") {
      const { user_id, code } = data;

      if (!user_id || !code) {
        return new Response(
          JSON.stringify({ success: false, error: "Código inválido ou expirado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Se houver JWT, ele DEVE bater com o user_id informado (previne verificar em nome de outro).
      const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const { data: { user: caller } } = await supabaseAuth.auth.getUser();
        if (!caller || caller.id !== user_id) {
          return new Response(
            JSON.stringify({ success: false, error: "Código inválido ou expirado" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
      }

      const { data: verification, error: fetchError } = await supabase
        .from('whatsapp_verification_codes')
        .select('*')
        .eq('user_id', user_id)
        .is('verified_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError || !verification) {
        return new Response(
          JSON.stringify({ success: false, error: "Código inválido ou expirado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      await supabase
        .from('whatsapp_verification_codes')
        .update({ attempts: (verification.attempts || 0) + 1 })
        .eq('id', verification.id);

      if (verification.code !== code) {
        const attempts = (verification.attempts || 0) + 1;
        if (attempts >= 5) {
          await supabase
            .from('whatsapp_verification_codes')
            .update({ expires_at: new Date().toISOString() })
            .eq('id', verification.id);
        }
        return new Response(
          JSON.stringify({ success: false, error: "Código inválido ou expirado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Marca como consumido ATOMICAMENTE — só passa se ninguém consumiu antes.
      const { data: consumed, error: consumeErr } = await supabase
        .from('whatsapp_verification_codes')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', verification.id)
        .is('verified_at', null)
        .select('id')
        .maybeSingle();

      if (consumeErr || !consumed) {
        return new Response(
          JSON.stringify({ success: false, error: "Código inválido ou expirado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(user_id, {
        email_confirm: true,
      });

      if (updateAuthError) {
        console.error('[whatsapp-verification] Erro ao confirmar email:', updateAuthError);
      }

      const { data: verifiedUser } = await supabase.auth.admin.getUserById(user_id);
      const isTenantSignup =
        String(verifiedUser?.user?.user_metadata?.is_tenant_signup ?? '').toLowerCase() === 'true';

      if (isTenantSignup) {
        const { error: roleError } = await supabase.rpc('assign_tenant_admin_role', {
          p_user_id: user_id,
        });

        if (roleError) {
          console.error('[whatsapp-verification] Erro ao atribuir tenant_admin:', roleError);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Cadastro confirmado, mas não foi possível liberar o painel da barbearia. Tente entrar novamente.',
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
          );
        }
      }

      console.log('[whatsapp-verification] Verificação concluída com sucesso para:', user_id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Código verificado com sucesso! Seu cadastro está confirmado." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: resend - Reenviar código
    // =============================================
    if (action === "resend") {
      const { user_id } = data;

      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id é obrigatório" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const { data: lastCode } = await supabase
        .from('whatsapp_verification_codes')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!lastCode) {
        return new Response(
          JSON.stringify({ success: false, error: "Nenhum cadastro encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const lastCreated = new Date(lastCode.created_at);
      const now = new Date();
      const diffSeconds = (now.getTime() - lastCreated.getTime()) / 1000;

      if (diffSeconds < 60) {
        const remaining = Math.ceil(60 - diffSeconds);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Aguarde ${remaining} segundos para reenviar o código.`,
            cooldown_remaining: remaining
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
        );
      }

      await supabase
        .from('whatsapp_verification_codes')
        .update({ expires_at: new Date().toISOString() })
        .eq('user_id', user_id)
        .is('verified_at', null);

      const newCode = generateCode();
      const newExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const { error: insertError } = await supabase
        .from('whatsapp_verification_codes')
        .insert({
          user_id,
          phone: lastCode.phone,
          code: newCode,
          expires_at: newExpiresAt.toISOString(),
          user_name: lastCode.user_name,
          user_email: lastCode.user_email,
          user_cpf: lastCode.user_cpf,
        });

      if (insertError) {
        console.error('[whatsapp-verification] Erro ao salvar novo código:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao gerar novo código" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      const { data: webhookConfigResend } = await supabase
        .from('webhook_config')
        .select('whatsapp_webhook_url, whatsapp_ativo, webhook_url, ativo')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const resendWebhookUrl = webhookConfigResend?.whatsapp_webhook_url || webhookConfigResend?.webhook_url;
      const resendWebhookAtivo = webhookConfigResend?.whatsapp_webhook_url 
        ? webhookConfigResend?.whatsapp_ativo 
        : webhookConfigResend?.ativo;

      if (!resendWebhookUrl || !resendWebhookAtivo) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Código gerado (webhook não configurado)" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar instância WhatsApp para incluir no payload
      const whatsappInstance = await getWhatsAppInstance(supabase, user_id);

      const resendMensagemWhatsApp = `${newCode}`;

      const webhookPayload = {
        evento: "verificacao_cadastro",
        cliente_nome: lastCode.user_name || "Cliente",
        telefone: formatPhoneForWhatsApp(lastCode.phone),
        codigo: newCode,
        mensagem: resendMensagemWhatsApp,
        timestamp: new Date().toISOString(),
        whatsapp_instance: whatsappInstance,
      };

      try {
        await fetch(resendWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload),
        });
        if (whatsappInstance) {
          console.log('[whatsapp-verification] Resend com WhatsApp instance:', whatsappInstance.instance_name);
        }
      } catch (webhookErr) {
        console.warn('[whatsapp-verification] Erro no webhook:', webhookErr);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Novo código enviado para seu WhatsApp" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Ação inválida" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );

  } catch (error: any) {
    console.error("[whatsapp-verification] Erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Erro interno" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
