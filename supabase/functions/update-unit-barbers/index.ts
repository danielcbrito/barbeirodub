/**
 * UPDATE-UNIT-BARBERS EDGE FUNCTION
 *
 * Atualiza atomicamente os vínculos entre barbeiros e uma unidade.
 * 1. Deleta todos os vínculos existentes para a unidade
 * 2. Insere os novos vínculos (se houver)
 *
 * Se o insert falhar após o delete, a unidade ficará sem vínculos —
 * preferível a um estado inconsistente com vínculos duplicados.
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

    const { unidadeId, barbeiroIds } = await req.json();

    // ═══ Validação ═══
    if (!unidadeId || typeof unidadeId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'unidadeId obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ids: string[] = Array.isArray(barbeiroIds) ? barbeiroIds : [];

    // ═══ Passo 1 — Deleta vínculos existentes ═══
    const { error: deleteError } = await supabaseAdmin
      .from('barbeiro_unidades')
      .delete()
      .eq('unidade_id', unidadeId);

    if (deleteError) {
      console.error('[update-unit-barbers] delete error:', deleteError);
      throw deleteError;
    }

    // ═══ Passo 2 — Insere novos vínculos ═══
    if (ids.length > 0) {
      const novosVinculos = ids.map((barbeiroId: string, index: number) => ({
        unidade_id: unidadeId,
        barbeiro_id: barbeiroId,
        is_primary: index === 0,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('barbeiro_unidades')
        .insert(novosVinculos);

      if (insertError) {
        console.error('[update-unit-barbers] insert error:', insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({ success: true, count: ids.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[update-unit-barbers]', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Erro interno',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
