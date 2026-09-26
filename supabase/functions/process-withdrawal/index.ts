import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { getAsaasConfig } from '../_shared/asaas-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Edge Function: process-withdrawal
 * Processa saque de barbeiro via transferência bancária/PIX Asaas
 * 
 * Fluxo:
 * 1. Autentica o usuário
 * 2. Valida saldo via função do banco (anti-fraude)
 * 3. Busca conta bancária cadastrada
 * 4. Cria registro de saque como "processando"
 * 5. Chama API Asaas para transferência (PIX prioritário)
 * 6. Atualiza status do saque
 */

// ============================================
// HELPERS
// ============================================

/** Resposta padronizada com CORS */
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Chamada segura ao Asaas com parsing defensivo */
async function callAsaasTransfer(apiKey: string, payload: Record<string, unknown>) {
  const asaasConfig = getAsaasConfig();
  const transferUrl = asaasConfig ? `${asaasConfig.baseUrl}/transfers` : 'https://api.asaas.com/v3/transfers';

  console.log(`[process-withdrawal] Usando ${asaasConfig?.isSandbox ? 'SANDBOX' : 'PRODUÇÃO'}`);
  console.log('[process-withdrawal] Payload Asaas:', JSON.stringify({
    ...payload,
    bankAccount: payload.bankAccount
      ? { ...(payload.bankAccount as Record<string, unknown>), cpfCnpj: '[REDACTED]' }
      : undefined,
    pixAddressKey: payload.pixAddressKey ? '[REDACTED]' : undefined,
  }));

  const response = await fetch(transferUrl, {
    method: 'POST',
    headers: {
      'access_token': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // Parsing defensivo: checar content-type antes de parsear JSON
  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();

  console.log('[process-withdrawal] Asaas Status:', response.status);
  console.log('[process-withdrawal] Asaas Content-Type:', contentType);
  console.log('[process-withdrawal] Asaas Body (500 chars):', responseText.substring(0, 500));

  if (!contentType.includes('application/json')) {
    throw new Error(`Asaas retornou resposta inválida (não-JSON). Status: ${response.status}. Body: ${responseText.substring(0, 200)}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Asaas retornou JSON malformado. Status: ${response.status}`);
  }

  return { ok: response.ok, status: response.status, data };
}

// ============================================
// HANDLER PRINCIPAL
// ============================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');

    if (!asaasApiKey) {
      return jsonResponse({ error: 'Gateway de pagamento não configurado' }, 500);
    }

    // ============================================
    // AUTENTICAÇÃO
    // ============================================
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Não autorizado' }, 401);
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Não autorizado' }, 401);
    }

    const body = await req.json();
    const { valor, conta_bancaria_id, chave_pix_id } = body;

    // SEGURANÇA: barbeiro_id NUNCA vem do body — derivamos do JWT.
    // Se o usuário autenticado for um barbeiro, buscamos seu id na tabela barbeiros.
    // Admins (sem registro em barbeiros) operam sem barbeiro_id (conta principal).
    const { data: barbeiroRow } = await supabase
      .from('barbeiros')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const barbeiro_id: string | null = barbeiroRow?.id ?? null;

    console.log('[process-withdrawal] Solicitação:', {
      userId: user.id, valor, conta_bancaria_id, chave_pix_id, barbeiro_id,
    });

    // ============================================
    // VALIDAÇÃO DE SALDO
    // ============================================
    // Para admin (sem barbeiro_id), validar contra saldo real do Asaas
    // Para barbeiros com subconta, o saldo Asaas da subconta é a fonte de verdade
    // Para barbeiros sem subconta, usar RPC local
    let saldoReal = 0;
    let usarAsaas = false;

    if (!barbeiro_id) {
      // Admin: buscar saldo da conta principal no Asaas
      try {
        const balanceRes = await fetch('https://api.asaas.com/v3/finance/balance', {
          headers: { 'access_token': asaasApiKey!, 'Content-Type': 'application/json' },
        });
        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          saldoReal = Number(balanceData.balance || 0);
          usarAsaas = true;
          console.log('[process-withdrawal] Saldo Asaas (admin):', saldoReal);
        }
      } catch (e) {
        console.warn('[process-withdrawal] Falha ao buscar saldo Asaas, usando RPC local:', e);
      }
    } else {
      // Barbeiro: verificar se tem subconta
      const { data: bData } = await supabase
        .from('barbeiros')
        .select('asaas_account_id')
        .eq('id', barbeiro_id)
        .maybeSingle();

      if (bData?.asaas_account_id) {
        // Subconta: buscar saldo da subconta
        const { data: privData } = await supabase
          .from('barbeiros_private')
          .select('asaas_api_key')
          .eq('barbeiro_id', barbeiro_id)
          .maybeSingle();

        if (privData?.asaas_api_key) {
          try {
            const balanceRes = await fetch('https://api.asaas.com/v3/finance/balance', {
              headers: { 'access_token': privData.asaas_api_key, 'Content-Type': 'application/json' },
            });
            if (balanceRes.ok) {
              const balanceData = await balanceRes.json();
              saldoReal = Number(balanceData.balance || 0);
              usarAsaas = true;
              console.log('[process-withdrawal] Saldo Asaas (subconta):', saldoReal);
            }
          } catch (e) {
            console.warn('[process-withdrawal] Falha ao buscar saldo subconta:', e);
          }
        }
      }
    }

    if (usarAsaas) {
      // Validação direta contra saldo Asaas
      if (valor <= 0) {
        return jsonResponse({ error: 'Valor do saque deve ser maior que zero' }, 403);
      }
      if (valor < 1.00) {
        return jsonResponse({ error: 'Valor mínimo para saque é R$ 1,00' }, 403);
      }
      if (valor > saldoReal) {
        return jsonResponse({ error: 'Saldo insuficiente para este saque' }, 403);
      }

      // Verificar limite de 3 saques por dia (exclui cancelados, falhos e saques do sandbox)
      const { data: saquesRecentes } = await supabase
        .from('saques')
        .select('id, chave_pix_valor')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .not('status', 'in', '("cancelado","falhou")')
        .not('motivo_cancelamento', 'ilike', '%sandbox%');

      // Filtrar saques simulados do sandbox (transfer_id com prefixo sandbox_sim_)
      const saquesValidos = (saquesRecentes || []).filter(s => 
        !s.chave_pix_valor?.includes('sandbox_sim_')
      );

      if (saquesValidos.length >= 3) {
        return jsonResponse({ error: 'Limite de 3 saques por dia atingido' }, 403);
      }

      console.log('[process-withdrawal] Validação Asaas OK. Saldo:', saldoReal, 'Valor:', valor);
    } else {
      // Fallback: usar RPC local (barbeiros sem subconta)
      const { data: validacao, error: valError } = await supabase
        .rpc('validar_saque', {
          p_user_id: user.id,
          p_barbeiro_id: barbeiro_id || null,
          p_valor: valor,
        });

      if (valError) {
        console.error('[process-withdrawal] Erro na validação:', valError);
        return jsonResponse({ error: 'Erro ao validar saque' }, 500);
      }

      const resultado = validacao?.[0] || validacao;
      if (!resultado?.permitido) {
        return jsonResponse({ error: resultado?.motivo || 'Saque não autorizado' }, 403);
      }
    }

    // ============================================
    // MONTAR PAYLOAD DE TRANSFERÊNCIA
    // ============================================
    let transferBody: Record<string, unknown>;
    let descricaoConta = '';

    if (conta_bancaria_id) {
      const { data: bankAcc, error: bankErr } = await supabase
        .from('contas_bancarias')
        .select('*')
        .eq('id', conta_bancaria_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (bankErr || !bankAcc) {
        return jsonResponse({ error: 'Conta bancária não encontrada' }, 400);
      }

      // Limpar dados numéricos (remover formatação)
      const cpfCnpjClean = bankAcc.titular_cpf_cnpj.replace(/\D/g, '');
      const agenciaClean = bankAcc.agencia.replace(/\D/g, '');
      const contaClean = bankAcc.conta.replace(/\D/g, '');
      const digitoClean = bankAcc.conta_digito.replace(/\D/g, '');

      descricaoConta = `${bankAcc.banco_nome || bankAcc.banco_codigo} Ag:${agenciaClean} Cc:${contaClean}-${digitoClean}`;

      // Determinar tipo de conta
      const bankAccountType = bankAcc.tipo_conta === 'CONTA_POUPANCA'
        ? 'CONTA_POUPANCA'
        : 'CONTA_CORRENTE';

      transferBody = {
        value: valor,
        // CRÍTICO: operationType PIX garante transferência instantânea
        // TED pode ser rejeitado por bancos digitais (Nubank, Inter, etc.)
        operationType: 'PIX',
        bankAccount: {
          bank: { code: bankAcc.banco_codigo },
          ownerName: bankAcc.titular_nome,
          cpfCnpj: cpfCnpjClean,
          agency: agenciaClean,
          account: contaClean,
          accountDigit: digitoClean,
          bankAccountType,
        },
        description: 'Saque barbeiro',
      };

      console.log('[process-withdrawal] Dados conta formatados:', {
        banco: bankAcc.banco_codigo,
        agencia: agenciaClean,
        conta: `${contaClean}-${digitoClean}`,
        tipo: bankAccountType,
        cpfCnpjLength: cpfCnpjClean.length,
        isCnpj: cpfCnpjClean.length === 14,
      });

    } else if (chave_pix_id) {
      const { data: pixKey, error: pixError } = await supabase
        .from('chaves_pix')
        .select('*')
        .eq('id', chave_pix_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (pixError || !pixKey) {
        return jsonResponse({ error: 'Chave PIX não encontrada' }, 400);
      }

      const pixKeyTypeMap: Record<string, string> = {
        cpf: 'CPF', cnpj: 'CNPJ', email: 'EMAIL',
        telefone: 'PHONE', aleatoria: 'EVP',
      };

      // Formatar chave PIX conforme tipo para o Asaas
      let pixAddressKey = pixKey.chave;
      const pixType = pixKeyTypeMap[pixKey.tipo] || 'EVP';

      if (pixType === 'PHONE') {
        // Asaas exige formato +55XXXXXXXXXXX para chaves de telefone
        const cleanPhone = pixKey.chave.replace(/\D/g, '');
        if (!cleanPhone.startsWith('55')) {
          pixAddressKey = '+55' + cleanPhone;
        } else {
          pixAddressKey = '+' + cleanPhone;
        }
      } else if (pixType === 'CPF' || pixType === 'CNPJ') {
        // Remover formatação de CPF/CNPJ
        pixAddressKey = pixKey.chave.replace(/\D/g, '');
      }

      descricaoConta = `PIX ${pixAddressKey}`;
      console.log('[process-withdrawal] PIX formatado:', { tipo: pixType, chaveOriginal: '[REDACTED]', chaveFormatada: pixAddressKey.substring(0, 5) + '...' });

      transferBody = {
        value: valor,
        operationType: 'PIX',
        pixAddressKey,
        pixAddressKeyType: pixType,
        description: 'Saque barbeiro',
      };
    } else {
      return jsonResponse({ error: 'Conta bancária ou chave PIX é obrigatória' }, 400);
    }

    // ============================================
    // CRIAR REGISTRO DE SAQUE
    // ============================================
    const { data: saque, error: saqueError } = await supabase
      .from('saques')
      .insert({
        user_id: user.id,
        barbeiro_id: barbeiro_id || null,
        valor,
        chave_pix_valor: descricaoConta,
        chave_pix_tipo: conta_bancaria_id ? 'conta_bancaria' : 'pix',
        status: 'processando',
      })
      .select()
      .single();

    if (saqueError) {
      console.error('[process-withdrawal] Erro ao criar saque:', saqueError);
      return jsonResponse({ error: 'Erro ao registrar saque' }, 500);
    }

    // ============================================
    // DETERMINAR API KEY (subconta ou central)
    // ============================================
    let transferApiKey = asaasApiKey!;

    if (barbeiro_id) {
      const { data: barbeiroData } = await supabase
        .from('barbeiros')
        .select('asaas_account_id')
        .eq('id', barbeiro_id)
        .maybeSingle();

      if (barbeiroData?.asaas_account_id) {
        const { data: privData } = await supabase
          .from('barbeiros_private')
          .select('asaas_api_key')
          .eq('barbeiro_id', barbeiro_id)
          .maybeSingle();

        if (privData?.asaas_api_key) {
          transferApiKey = privData.asaas_api_key;
          console.log('[process-withdrawal] Usando API key da subconta:', barbeiroData.asaas_account_id);
        }
      }
    }

    // ============================================
    // TRANSFERÊNCIA VIA ASAAS (produção)
    // ============================================
    try {
      const { ok, data: asaasData } = await callAsaasTransfer(transferApiKey, transferBody);

      if (!ok) {
        console.error('[process-withdrawal] Erro Asaas:', JSON.stringify(asaasData));

        const errorMsg = asaasData?.errors?.[0]?.description
          || asaasData?.message
          || 'Erro na transferência';

        await supabase
          .from('saques')
          .update({ status: 'falhou', motivo_cancelamento: errorMsg })
          .eq('id', saque.id);

        return jsonResponse({
          error: `Erro ao processar transferência: ${errorMsg}`,
          details: errorMsg,
        }, 500);
      }

      console.log('[process-withdrawal] Transferência criada no Asaas:', asaasData.id);

      return jsonResponse({
        success: true,
        saque_id: saque.id,
        transfer_id: asaasData.id,
        valor,
        message: 'Saque processado com sucesso!',
      });

    } catch (transferError) {
      const errorMessage = transferError instanceof Error ? transferError.message : 'Erro de comunicação com gateway';
      console.error('[process-withdrawal] Erro na transferência:', errorMessage);

      await supabase
        .from('saques')
        .update({ status: 'falhou', motivo_cancelamento: errorMessage })
        .eq('id', saque.id);

      return jsonResponse({ error: errorMessage }, 500);
    }

  } catch (error) {
    console.error('[process-withdrawal] Erro geral:', error);
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Erro interno',
    }, 500);
  }
});
