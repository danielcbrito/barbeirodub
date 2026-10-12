/**
 * DELETE-UNIT EDGE FUNCTION
 *
 * Exclusão atômica de uma unidade com cascade correto:
 * 1. Deleta vínculos em barbeiro_unidades
 * 2. Nullifica unidade_id em agendamentos
 * 3. Nullifica unidade_id em barbeiros
 * 4. Deleta o registro em tenant_unidades
 *
 * Ordem respeita FK constraints (filhas antes do pai).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { unidadeId } = await req.json();

    // ═══ Validação ═══
    if (!unidadeId || typeof unidadeId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'unidadeId obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══ Passo 1 — Deleta vínculos barbeiro_unidades ═══
    const { error: linkError } = await supabaseAdmin
      .from('barbeiro_unidades')
      .delete()
      .eq('unidade_id', unidadeId);

    if (linkError) {
      console.error('[delete-unit] barbeiro_unidades delete error:', linkError);
      throw linkError;
    }

    // ═══ Passo 2 — Nullifica unidade_id em agendamentos ═══
    const { error: agendaError } = await supabaseAdmin
      .from('agendamentos')
      .update({ unidade_id: null })
      .eq('unidade_id', unidadeId);

    if (agendaError) {
      console.error('[delete-unit] agendamentos nullify error:', agendaError);
      throw agendaError;
    }

    // ═══ Passo 3 — Nullifica unidade_id em barbeiros ═══
    const { error: barberError } = await supabaseAdmin
      .from('barbeiros')
      .update({ unidade_id: null })
      .eq('unidade_id', unidadeId);

    if (barberError) {
      console.error('[delete-unit] barbeiros nullify error:', barberError);
      throw barberError;
    }

    // ═══ Passo 4 — Deleta a unidade ═══
    const { error: deleteError } = await supabaseAdmin
      .from('tenant_unidades')
      .delete()
      .eq('id', unidadeId);

    if (deleteError) {
      console.error('[delete-unit] tenant_unidades delete error:', deleteError);
      throw deleteError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[delete-unit]', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Erro interno ao excluir unidade',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
