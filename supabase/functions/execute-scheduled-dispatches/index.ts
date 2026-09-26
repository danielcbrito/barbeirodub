import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireInternalCaller } from '../_shared/internal-auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

interface ScheduledDispatch {
  id: string
  mensagem: string
  contatos_ids: string[]
  data_programada: string
  executado: boolean
  tenant_id: string | null
}

interface Profile {
  id: string
  nome: string
  telefone: string | null
}

/**
 * Resolve a instância WhatsApp ISOLADA por tenant_id.
 * Hierarquia: owner do tenant → qualquer barbeiro do tenant.
 * Se nenhuma encontrada → retorna null (NÃO envia).
 */
async function resolveWhatsAppInstanceForTenant(
  supabase: any,
  tenantId: string | null
): Promise<{ instance_name: string; api_key: string; status: string } | null> {
  if (!tenantId) return null

  try {
    // Prioridade 1: instância do owner do tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('owner_user_id')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenant?.owner_user_id) {
      const { data: ownerBarbers } = await supabase
        .from('barbeiros')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('user_id', tenant.owner_user_id)

      if (ownerBarbers?.length) {
        const ownerIds = ownerBarbers.map((b: any) => b.id)
        const { data: ownerInst } = await supabase
          .from('whatsapp_instances')
          .select('instance_name, api_key, status')
          .in('barbeiro_id', ownerIds)
          .eq('status', 'connected')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (ownerInst) return ownerInst
      }
    }

    // Prioridade 2: qualquer instância conectada do mesmo tenant
    const { data: tenantBarbers } = await supabase
      .from('barbeiros')
      .select('id')
      .eq('tenant_id', tenantId)

    if (tenantBarbers?.length) {
      const ids = tenantBarbers.map((b: any) => b.id)
      const { data: tenantInst } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, api_key, status')
        .in('barbeiro_id', ids)
        .eq('status', 'connected')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (tenantInst) return tenantInst
    }

    return null
  } catch (e) {
    console.warn('[Scheduled Dispatches] Erro ao resolver instância WhatsApp para tenant', tenantId, e)
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const unauthorized = requireInternalCaller(req)
  if (unauthorized) return unauthorized


  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    console.log('[Scheduled Dispatches] Checking for pending dispatches...')

    const now = new Date().toISOString()

    const { data: dispatches, error: dispatchError } = await supabase
      .from('disparos_programados')
      .select('*')
      .eq('executado', false)
      .lte('data_programada', now)

    if (dispatchError) {
      console.error('[Scheduled Dispatches] Error fetching dispatches:', dispatchError)
      throw dispatchError
    }

    if (!dispatches || dispatches.length === 0) {
      console.log('[Scheduled Dispatches] No pending dispatches found')
      return new Response(
        JSON.stringify({ message: 'No pending dispatches', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Scheduled Dispatches] Found ${dispatches.length} pending dispatch(es)`)

    // Busca configuração do webhook
    const { data: config, error: configError } = await supabase
      .from('webhook_config')
      .select('disparo_webhook_url, disparo_ativo')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (configError || !config?.disparo_webhook_url || !config?.disparo_ativo) {
      console.error('[Scheduled Dispatches] Webhook not configured or inactive')
      return new Response(
        JSON.stringify({ error: 'Webhook not configured or inactive' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cache de instâncias WhatsApp por tenant_id
    const whatsappCache = new Map<string, { instance_name: string; api_key: string; status: string } | null>()

    // Busca todos os profiles necessários
    const allContactIds = [...new Set(dispatches.flatMap(d => d.contatos_ids))]
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, nome, telefone')
      .in('id', allContactIds)

    if (profilesError) {
      console.error('[Scheduled Dispatches] Error fetching profiles:', profilesError)
      throw profilesError
    }

    const profilesMap = new Map(profiles?.map(p => [p.id, p]) || [])

    let processed = 0
    let errors = 0
    let skipped = 0

    for (const dispatch of dispatches as ScheduledDispatch[]) {
      try {
        console.log(`[Scheduled Dispatches] Processing dispatch ${dispatch.id} (tenant: ${dispatch.tenant_id || 'null'})...`)

        // Resolver instância WhatsApp POR TENANT do disparo
        const tenantId = dispatch.tenant_id
        if (!tenantId) {
          console.log(`[Scheduled Dispatches] Dispatch ${dispatch.id} sem tenant_id, pulando...`)
          await supabase
            .from('disparos_programados')
            .update({
              executado: true,
              executado_em: new Date().toISOString(),
              resultado: { success: false, error: 'Sem tenant_id associado', total: 0 }
            })
            .eq('id', dispatch.id)
          skipped++
          continue
        }

        if (!whatsappCache.has(tenantId)) {
          whatsappCache.set(tenantId, await resolveWhatsAppInstanceForTenant(supabase, tenantId))
        }

        const whatsappInstance = whatsappCache.get(tenantId) || null

        if (!whatsappInstance) {
          console.log(`[Scheduled Dispatches] Tenant ${tenantId} sem WhatsApp conectado, disparo ${dispatch.id} pulado`)
          await supabase
            .from('disparos_programados')
            .update({
              executado: true,
              executado_em: new Date().toISOString(),
              resultado: { success: false, error: 'Nenhuma instância WhatsApp conectada para este tenant', total: 0 }
            })
            .eq('id', dispatch.id)

          await supabase.from('system_logs').insert({
            level: 'warn',
            category: 'disparo_programado',
            message: `Disparo programado pulado: sem WhatsApp conectado`,
            details: {
              dispatch_id: dispatch.id,
              tenant_id: tenantId,
              reason: 'nenhuma_instancia_whatsapp_conectada',
            }
          })

          skipped++
          continue
        }

        const contatos = dispatch.contatos_ids
          .map(id => profilesMap.get(id))
          .filter((p): p is Profile => !!p && !!p.telefone)
          .map(client => ({
            cliente_id: client.id,
            cliente_nome: client.nome,
            cliente_telefone: client.telefone,
            cliente_telefone_whatsapp: formatPhoneForWhatsApp(client.telefone!),
            mensagem: dispatch.mensagem.replace('{nome}', client.nome)
          }))

        if (contatos.length === 0) {
          console.log(`[Scheduled Dispatches] No valid contacts for dispatch ${dispatch.id}`)
          await supabase
            .from('disparos_programados')
            .update({ 
              executado: true, 
              executado_em: new Date().toISOString(),
              resultado: { success: false, error: 'No valid contacts', total: 0 }
            })
            .eq('id', dispatch.id)
          continue
        }

        // Enviar para o webhook COM whatsapp_instance do tenant correto
        const response = await fetch(config.disparo_webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evento: 'disparo_mensagem_lote',
            total_contatos: contatos.length,
            contatos: contatos,
            programado: true,
            disparo_id: dispatch.id,
            tenant_id: tenantId,
            data_programada: dispatch.data_programada,
            data_programada_formatada: new Date(dispatch.data_programada).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            executado_em: new Date().toISOString(),
            executado_em_formatado: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            mensagem_original: dispatch.mensagem,
            timestamp: new Date().toISOString(),
            whatsapp_instance: whatsappInstance,
          })
        })

        const success = response.ok

        await supabase
          .from('disparos_programados')
          .update({ 
            executado: true, 
            executado_em: new Date().toISOString(),
            resultado: { 
              success, 
              total: contatos.length,
              status: response.status,
              whatsapp_instance_name: whatsappInstance.instance_name,
            }
          })
          .eq('id', dispatch.id)

        if (success) {
          processed++
          console.log(`[Scheduled Dispatches] ✅ Dispatch ${dispatch.id} executed via ${whatsappInstance.instance_name} (${contatos.length} contacts)`)
        } else {
          errors++
          console.error(`[Scheduled Dispatches] ❌ Dispatch ${dispatch.id} failed with status ${response.status}`)
        }

        await supabase.from('system_logs').insert({
          level: success ? 'info' : 'error',
          category: 'disparo_programado',
          message: success 
            ? `Disparo programado executado: ${contatos.length} contatos via ${whatsappInstance.instance_name}`
            : `Disparo programado falhou: status ${response.status}`,
          details: {
            dispatch_id: dispatch.id,
            tenant_id: tenantId,
            total: contatos.length,
            success,
            whatsapp_instance_name: whatsappInstance.instance_name,
          }
        })

      } catch (err) {
        console.error(`[Scheduled Dispatches] Error processing dispatch ${dispatch.id}:`, err)
        errors++

        await supabase
          .from('disparos_programados')
          .update({ 
            executado: true, 
            executado_em: new Date().toISOString(),
            resultado: { 
              success: false, 
              error: err instanceof Error ? err.message : 'Unknown error'
            }
          })
          .eq('id', dispatch.id)
      }
    }

    console.log(`[Scheduled Dispatches] Completed: ${processed} success, ${errors} errors, ${skipped} skipped (no WhatsApp)`)

    return new Response(
      JSON.stringify({ 
        message: 'Dispatches processed', 
        processed, 
        errors,
        skipped,
        total: dispatches.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Scheduled Dispatches] Fatal error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '')
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned
  }
  return `${cleaned}@s.whatsapp.net`
}
