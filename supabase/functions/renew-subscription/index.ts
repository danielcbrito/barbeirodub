/**
 * ═══════════════════════════════════════════════════════════
 * RENEW-SUBSCRIPTION — Renovação antecipada de plano
 * ═══════════════════════════════════════════════════════════
 *
 * Fluxo:
 *   1. Autenticação via JWT
 *   2. Chama RPC renovar_plano_cliente (valida usos restantes)
 *   3. Dinheiro → RPC já renovou, notifica cliente
 *   4. PIX → Cria cobrança Asaas, salva QR code
 *   5. Cartão → Cria cobrança Asaas, retorna URL de pagamento
 *
 * POST body: { assinatura_id, forma_pagamento: 'pix'|'credit_card'|'cash' }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, ok, fail, handleCors, parseBody } from "../_shared/response.ts";
import { authenticateRequest, createServiceClient } from "../_shared/auth.ts";
import { getAsaasConfig } from "../_shared/asaas-config.ts";

/* ─── Types ────────────────────────────────────────────── */

interface RenewRequest {
  assinatura_id: string;
  forma_pagamento: "pix" | "credit_card" | "cash";
}

/* ─── Helpers ──────────────────────────────────────────── */

/**
 * Busca ou cria customer no Asaas usando externalReference = user_id.
 */
async function getOrCreateAsaasCustomer(
  apiKey: string,
  baseUrl: string,
  userId: string,
  nome: string,
  email: string,
  cpf: string | null
): Promise<string> {
  // Buscar existente
  const searchRes = await fetch(
    `${baseUrl}/customers?externalReference=${userId}`,
    { headers: { "Content-Type": "application/json", access_token: apiKey } }
  );
  const searchData = await searchRes.json();

  if (searchData.data?.length > 0) {
    return searchData.data[0].id;
  }

  // Criar novo
  const createRes = await fetch(`${baseUrl}/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", access_token: apiKey },
    body: JSON.stringify({
      name: nome || "Cliente",
      email: email || "noemail@example.com",
      cpfCnpj: cpf || "",
      externalReference: userId,
    }),
  });

  const createData = await createRes.json();
  if (!createRes.ok || createData.errors) {
    throw new Error(createData.errors?.[0]?.description || "Erro ao criar cliente no Asaas");
  }

  return createData.id;
}

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

    console.log("[renew-subscription] Início:", { assinatura_id, forma_pagamento, userId: user.id });

    // ─── Step 3: Chamar RPC renovar_plano_cliente ───
    const { data: rpcResult, error: rpcError } = await supabase.rpc("renovar_plano_cliente", {
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

    // ─── Step 5: PIX ou Cartão → criar cobrança Asaas ─

    const asaasConfig = getAsaasConfig();
    if (!asaasConfig) {
      // Rollback: reverter status
      await adminClient
        .from("assinaturas")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", assinatura_id);
      return fail("GATEWAY_ERROR", "Gateway de pagamento não configurado", 500);
    }

    // Buscar dados complementares
    const { data: assinatura } = await adminClient
      .from("assinaturas")
      .select("user_id, plano_id, barbeiro_id")
      .eq("id", assinatura_id)
      .single();

    const { data: plano } = await adminClient
      .from("planos")
      .select("nome, preco_mensal")
      .eq("id", assinatura?.plano_id)
      .single();

    const { data: profile } = await adminClient
      .from("profiles")
      .select("nome, cpf")
      .eq("id", user.id)
      .single();

    if (!plano) {
      await adminClient
        .from("assinaturas")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", assinatura_id);
      return fail("PLAN_NOT_FOUND", "Plano não encontrado", 404);
    }

    // Buscar/criar customer Asaas
    let customerId: string;
    try {
      customerId = await getOrCreateAsaasCustomer(
        asaasConfig.apiKey,
        asaasConfig.baseUrl,
        user.id,
        profile?.nome || "Cliente",
        user.email || "noemail@example.com",
        profile?.cpf || null
      );
    } catch (custErr: any) {
      console.error("[renew-subscription] Customer error:", custErr);
      await adminClient
        .from("assinaturas")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", assinatura_id);
      return fail("CUSTOMER_ERROR", custErr.message || "Erro ao registrar cliente", 500);
    }

    // Montar payload de pagamento
    const paymentPayload: Record<string, unknown> = {
      customer: customerId,
      billingType: forma_pagamento === "pix" ? "PIX" : "CREDIT_CARD",
      value: plano.preco_mensal,
      dueDate: new Date().toISOString().split("T")[0],
      description: `Renovação do plano ${plano.nome}`,
      externalReference: `renewal_${assinatura_id}`,
    };

    // Split para subconta do barbeiro (se existir)
    if (assinatura?.barbeiro_id) {
      const { data: barbeiroData } = await adminClient
        .from("barbeiros")
        .select("asaas_wallet_id")
        .eq("id", assinatura.barbeiro_id)
        .single();

      if (barbeiroData?.asaas_wallet_id) {
        paymentPayload.split = [
          { walletId: barbeiroData.asaas_wallet_id, percentualValue: 100 },
        ];
        console.log("[renew-subscription] Split: 100% →", barbeiroData.asaas_wallet_id);
      }
    }

    // Chamar Asaas POST /payments
    console.log("[renew-subscription] Criando cobrança Asaas:", paymentPayload.billingType);

    const paymentRes = await fetch(`${asaasConfig.baseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: asaasConfig.apiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentData = await paymentRes.json();

    if (!paymentRes.ok || paymentData.errors) {
      console.error("[renew-subscription] Asaas error:", paymentData);
      // Rollback: reverter para active
      await adminClient
        .from("assinaturas")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", assinatura_id);
      return fail(
        "PAYMENT_ERROR",
        paymentData.errors?.[0]?.description || "Erro ao criar cobrança",
        500
      );
    }

    console.log("[renew-subscription] Cobrança criada:", paymentData.id);

    // ─── PIX: buscar QR code ────────────────────────
    if (forma_pagamento === "pix") {
      // Buscar dados PIX (QR Code)
      const pixRes = await fetch(`${asaasConfig.baseUrl}/payments/${paymentData.id}/pixQrCode`, {
        headers: { access_token: asaasConfig.apiKey },
      });
      const pixData = await pixRes.json();

      // Salvar na assinatura
      await adminClient
        .from("assinaturas")
        .update({
          asaas_payment_id: paymentData.id,
          pix_qr_code: pixData.encodedImage || null,
          pix_payload: pixData.payload || null,
          pix_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
          updated_at: new Date().toISOString(),
        })
        .eq("id", assinatura_id);

      return ok({
        aguardando_pagamento: true,
        forma_pagamento: "pix",
        pix_qr_code: pixData.encodedImage || null,
        pix_copia_cola: pixData.payload || null,
        valor: plano.preco_mensal,
        asaas_payment_id: paymentData.id,
      });
    }

    // ─── Cartão: retornar URL de pagamento ──────────
    if (forma_pagamento === "credit_card") {
      await adminClient
        .from("assinaturas")
        .update({
          asaas_payment_id: paymentData.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assinatura_id);

      return ok({
        aguardando_pagamento: true,
        forma_pagamento: "credit_card",
        payment_url: paymentData.invoiceUrl || paymentData.bankSlipUrl || null,
        valor: plano.preco_mensal,
        asaas_payment_id: paymentData.id,
      });
    }

    // Fallback (não deve chegar aqui)
    return fail("UNKNOWN_METHOD", "Método de pagamento não suportado");
  } catch (error: any) {
    console.error("[renew-subscription] Unhandled error:", error);
    return fail("INTERNAL_ERROR", error.message || "Erro interno", 500);
  }
});
