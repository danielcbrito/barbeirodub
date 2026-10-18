/**
 * ═══════════════════════════════════════════════════════════
 * RENEW-SUBSCRIPTION — Renovação antecipada de plano
 * ═══════════════════════════════════════════════════════════
 *
 * Fluxo:
 *   1. Autenticação via JWT
 *   2. Chama RPC renovar_plano_cliente (valida usos restantes)
 *   3. Dinheiro → RPC já renovou, notifica cliente
 *   4. PIX → Cria cobrança Woovi, salva QR code
 *   5. Cartão → indisponível nesta integração Pix
 *
 * POST body: { assinatura_id, forma_pagamento: 'pix'|'credit_card'|'cash' }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, ok, fail, handleCors, parseBody } from "../_shared/response.ts";
import { authenticateRequest, createServiceClient } from "../_shared/auth.ts";
import { createWooviCharge } from "../_shared/woovi-charge.ts";
import { assertWooviMethod } from "../_shared/woovi-payment-policy.ts";

/* ─── Types ────────────────────────────────────────────── */

interface RenewRequest {
  assinatura_id: string;
  forma_pagamento: "pix" | "credit_card" | "cash";
}

/* ─── Helpers ──────────────────────────────────────────── */

/* ─── Main Handler ─────────────────────────────────────── */

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // ─── Step 1: Autenticação ───────────────────────
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { supabase, user } = authResult;
    const adminClient = createServiceClient();

    // ─── Step 2: Parse body ─────────────────────────
    const body = await parseBody<RenewRequest>(req);
    if (!body?.assinatura_id || !body?.forma_pagamento) {
      return fail("MISSING_PARAMS", "assinatura_id e forma_pagamento são obrigatórios");
    }

    const { assinatura_id, forma_pagamento } = body;

    // Validar forma_pagamento
    if (!["pix", "credit_card", "cash"].includes(forma_pagamento)) {
      return fail("INVALID_PAYMENT", "forma_pagamento deve ser 'pix', 'credit_card' ou 'cash'");
    }

    assertWooviMethod(forma_pagamento);
    const { data: original, error: originalError } = await adminClient.from("assinaturas").select("status, payment_method, total_renovacoes").eq("id", assinatura_id).eq("user_id", user.id).single();
    if (originalError || !original) return fail("NOT_FOUND", "Assinatura não encontrada", 404);

    console.log("[renew-subscription] Início:", { assinatura_id, forma_pagamento, userId: user.id });

    // ─── Step 3: Chamar RPC renovar_plano_cliente ───
    const { data: rpcResult, error: rpcError } = original.status === 'pending_renewal' && forma_pagamento === 'pix'
      ? { data: { success: true, novo_ciclo_fim: null, error: null, usos_restantes: null }, error: null }
      : await supabase.rpc("renovar_plano_cliente", {
      p_assinatura_id: assinatura_id,
      p_forma_pagamento: forma_pagamento,
    });

    if (rpcError) {
      console.error("[renew-subscription] RPC error:", rpcError);
      return fail("RPC_ERROR", rpcError.message, 500);
    }

    if (!rpcResult?.success) {
      console.log("[renew-subscription] RPC bloqueou:", rpcResult?.error);
      return fail("RENEWAL_BLOCKED", rpcResult?.error || "Renovação não permitida", 400, {
        usos_restantes: rpcResult?.usos_restantes,
      });
    }

    // ─── Step 4: Dinheiro → já renovado pela RPC ────
    if (forma_pagamento === "cash") {
      // Notificação in-app
      await adminClient.from("notificacoes").insert({
        user_id: user.id,
        tipo: "plano_renovado",
        titulo: "✅ Plano Renovado",
        mensagem: "Seu plano foi renovado! Você tem 4 novos serviços disponíveis. Pagamento pendente na barbearia.",
        lida: false,
      });

      console.log("[renew-subscription] Renovação cash concluída:", assinatura_id);
      return ok({
        renovado: true,
        forma_pagamento: "cash",
        novo_ciclo_fim: rpcResult.novo_ciclo_fim,
        aguardando_confirmacao: true,
      });
    }

    const { data: assinatura, error: subError } = await adminClient.from('assinaturas').select('user_id, plano_id, barbeiro_id').eq('id', assinatura_id).eq('user_id', user.id).single();
    const { data: plano, error: planError } = await adminClient.from('planos').select('nome, preco_mensal').eq('id', assinatura?.plano_id).single();
    if (subError || planError || !assinatura?.barbeiro_id || !plano) {
      await adminClient.from('assinaturas').update({ status: original.status, payment_method: original.payment_method }).eq('id', assinatura_id);
      return fail('PLAN_NOT_FOUND', 'Plano ou barbeiro não encontrado', 400);
    }
    try {
      const payment = await createWooviCharge(adminClient, {
        correlationID: `renewal-${assinatura_id}-${Number(original.total_renovacoes ?? 0) + 1}`,
        userId: user.id, barberId: assinatura.barbeiro_id, amount: plano.preco_mensal,
        comment: `Renovação ${plano.nome}`, target: { assinatura_id },
      });
      const { error: saveError } = await adminClient.from('assinaturas').update({
        pix_qr_code: payment.pixQrCode.encodedImage, pix_payload: payment.pixQrCode.payload,
        pix_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      }).eq('id', assinatura_id);
      if (saveError) throw saveError;
      return new Response(JSON.stringify({ success: true, aguardando_pagamento: true,
        forma_pagamento: 'pix', pix_qr_code: payment.pixQrCode.encodedImage,
        pix_copia_cola: payment.pixQrCode.payload, valor: plano.preco_mensal,
        woovi_payment_id: payment.id, initial_renovacoes: Number(original.total_renovacoes ?? 0),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (paymentError) {
      // Keep pending_renewal: the bank may have created the charge even when the response failed.
      console.error('[renew-subscription] Woovi reconciliation needed:', paymentError);
      return fail('PAYMENT_ERROR', paymentError instanceof Error ? paymentError.message : 'Erro Woovi', 400);
    }

  } catch (error: any) {
    console.error("[renew-subscription] Unhandled error:", error);
    return fail("INTERNAL_ERROR", error.message || "Erro interno", 500);
  }
});
