import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { wooviFetch, WooviError, corsHeaders, jsonResponse } from "../_shared/woovi-client.ts";
import {
  isApprovedTenantSubscription,
  isCompletedTenantCharge,
} from "../_shared/tenant-plan-policy.ts";
import {
  getMissingTenantCheckoutFields,
  isValidCustomerDocument,
} from "../_shared/tenant-checkout-requirements.ts";
import {
  buildTenantPlanCardPayload,
  buildTenantPlanPixAutomaticPayload,
} from "../_shared/tenant-plan-payload.ts";

type SubscriptionResponse = {
  subscription?: {
    globalID?: string;
    correlationID?: string;
    status?: string;
    value?: number;
    pixRecurring?: {
      emv?: string;
      status?: string;
      recurrencyId?: string;
      journey?: string;
    };
  };
};

type ChargeRow = {
  status: string;
  value_centavos: number;
  metadata: Record<string, unknown> | null;
};

type ChargeResponse = {
  charge?: {
    globalID?: string;
    correlationID?: string;
    status?: string;
    value?: number;
    brCode?: string;
    paymentLinkUrl?: string;
  };
};

const digits = (value?: string | null) => (value ?? "").replace(/\D/g, "");

async function fetchSubscription(id: string) {
  return await wooviFetch<SubscriptionResponse>(
    `/api/v1/subscriptions/${encodeURIComponent(id)}`,
  );
}

function remoteError(error: unknown) {
  if (error instanceof WooviError) return error.message;
  return error instanceof Error ? error.message : "Erro na comunicação com a Woovi";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Método não permitido" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return jsonResponse({ success: false, error: "Não autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action === "status" ? "status" : "create";
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
      return jsonResponse({ success: false, error: "Barbearia inválida" }, 400);
    }

    const { data: tenant } = await admin
      .from("tenants")
      .select("id, nome, owner_user_id, cpf, cnpj, email, telefone, whatsapp, rua, numero, bairro, cidade, estado")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenant) return jsonResponse({ success: false, error: "Barbearia não encontrada" }, 404);

    let allowed = tenant.owner_user_id === user.id;
    if (!allowed) {
      const { data: member } = await admin
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .maybeSingle();
      allowed = !!member && ["owner", "admin", "tenant_admin"].includes(String(member.role));
    }
    if (!allowed) {
      return jsonResponse({ success: false, error: "Sem permissão para esta barbearia" }, 403);
    }

    if (action === "status") {
      const correlationID = String(body.correlationID ?? "");
      if (!correlationID.startsWith(`dub-${tenantId.slice(0, 8)}`)) {
        return jsonResponse({ success: false, error: "Assinatura inválida" }, 400);
      }

      const { data: row, error: rowError } = await admin
        .from("woovi_charges")
        .select("metadata, status, value_centavos")
        .eq("correlation_id", correlationID)
        .eq("user_id", user.id)
        .maybeSingle();
      if (rowError) throw rowError;
      if (!row) return jsonResponse({ success: false, error: "Assinatura não encontrada" }, 404);

      const charge = row as ChargeRow;
      const metadata = charge.metadata ?? {};
      if (metadata.tenantId !== tenantId || metadata.kind !== "tenant_plan") {
        return jsonResponse({ success: false, error: "Assinatura não pertence a esta barbearia" }, 403);
      }

      if (metadata.paymentMethod === "credit_card") {
        let remote: ChargeResponse;
        try {
          remote = await wooviFetch<ChargeResponse>(
            `/api/v1/charge/${encodeURIComponent(correlationID)}`,
          );
        } catch (error) {
          console.error("[tenant-plan] Falha ao revalidar cartão:", remoteError(error));
          return jsonResponse({ success: false, error: "Não foi possível consultar a Woovi agora." }, 502);
        }

        if (!isCompletedTenantCharge(remote.charge, correlationID, charge.value_centavos)) {
          return jsonResponse({
            success: true,
            paid: false,
            status: remote.charge?.status || charge.status || "PENDING",
          });
        }

        const { data: confirmation, error: confirmError } = await admin.rpc(
          "confirm_tenant_plan_payment",
          {
            p_correlation_id: correlationID,
            p_value_centavos: charge.value_centavos,
            p_remote_payload: remote,
            p_renewal: false,
          },
        );
        if (confirmError) {
          console.error("[tenant-plan] Cartão confirmado, mas liberação falhou:", confirmError.message);
          return jsonResponse({
            success: false,
            error: "A Woovi confirmou o pagamento, mas a liberação falhou. Tente verificar novamente.",
          }, 500);
        }
        return jsonResponse({ success: true, paid: true, data: confirmation });
      }

      const globalID = typeof metadata.globalID === "string" ? metadata.globalID : correlationID;
      let remote: SubscriptionResponse;
      try {
        remote = await fetchSubscription(globalID);
      } catch (error) {
        console.error("[tenant-plan] Falha ao revalidar assinatura:", remoteError(error));
        return jsonResponse({ success: false, error: "Não foi possível consultar a Woovi agora." }, 502);
      }

      const subscription = remote.subscription;
      const recurringStatus = String(subscription?.pixRecurring?.status ?? "").toUpperCase();
      const subscriptionStatus = String(subscription?.status ?? "").toUpperCase();
      const validRemote = isApprovedTenantSubscription(
        subscription,
        correlationID,
        charge.value_centavos,
      );

      if (!validRemote) {
        return jsonResponse({
          success: true,
          paid: false,
          status: recurringStatus || subscriptionStatus || charge.status || "PENDING",
        });
      }

      const { data: confirmation, error: confirmError } = await admin.rpc(
        "confirm_tenant_plan_payment",
        {
          p_correlation_id: correlationID,
          p_value_centavos: Number(subscription.value),
          p_remote_payload: remote,
          p_renewal: false,
        },
      );
      if (confirmError) {
        console.error("[tenant-plan] Pagamento aprovado, mas liberação falhou:", confirmError.message);
        return jsonResponse({
          success: false,
          error: "A Woovi confirmou a assinatura, mas a liberação falhou. Tente verificar novamente.",
        }, 500);
      }

      return jsonResponse({ success: true, paid: true, data: confirmation });
    }

    const paymentMethod = String(body.paymentMethod ?? "pix_automatico");
    if (!["pix_automatico", "credit_card"].includes(paymentMethod)) {
      return jsonResponse({ success: false, error: "Forma de pagamento inválida." }, 422);
    }

    const planName = String(body.planName ?? "").trim();
    const { data: plan } = await admin
      .from("tenant_planos")
      .select("id, nome, preco_mensal, max_barbeiros")
      .ilike("nome", planName)
      .eq("ativo", true)
      .maybeSingle();
    if (!plan) return jsonResponse({ success: false, error: "Plano não encontrado" }, 404);

    const cents = Math.round(Number(plan.preco_mensal) * 100);
    if (!Number.isSafeInteger(cents) || cents < 100) {
      return jsonResponse({ success: false, error: "Plano sem valor definido" }, 400);
    }

    const { data: unit } = await admin
      .from("tenant_unidades")
      .select("nome, cpf, cnpj, email, telefone, whatsapp, cep, rua, numero, bairro, cidade, estado")
      .eq("tenant_id", tenantId)
      .order("is_sede", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: infoRows } = await admin
      .from("informacoes_empresa")
      .select("chave, valor")
      .eq("tenant_id", tenantId);
    const infoMap: Record<string, string> = {};
    for (const row of infoRows || []) {
      if (row.chave && row.valor) infoMap[row.chave] = String(row.valor).trim();
    }

    const { data: ownerProfile } = await admin
      .from("profiles")
      .select("cpf, telefone, nome, cep, endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf")
      .eq("id", tenant.owner_user_id)
      .maybeSingle();
    const { data: ownerBarber } = await admin
      .from("barbeiros")
      .select("apelido")
      .eq("user_id", tenant.owner_user_id)
      .maybeSingle();

    const resolvedCnpj = digits(unit?.cnpj || tenant.cnpj || infoMap.cnpj);
    const resolvedCpf = digits(
      unit?.cpf || tenant.cpf || infoMap.cpf || ownerProfile?.cpf,
    );
    const hasValidCnpj = isValidCustomerDocument(resolvedCnpj) && resolvedCnpj.length === 14;
    const taxID = hasValidCnpj ? resolvedCnpj : resolvedCpf;
    const resolvedName = hasValidCnpj
      ? unit?.nome || tenant.nome || infoMap.nome
      : ownerProfile?.nome || ownerBarber?.apelido || tenant.nome;
    const resolvedPhone = digits(
      unit?.whatsapp || unit?.telefone || tenant.whatsapp || tenant.telefone
      || infoMap.whatsapp || infoMap.telefone || ownerProfile?.telefone,
    );
    const resolvedEmail = unit?.email || tenant.email || infoMap.email || user.email;
    const resolvedCep = digits(unit?.cep || infoMap.cep || ownerProfile?.cep);
    const correlationID = `dub-${tenantId.slice(0, 8)}-${plan.id.slice(0, 8)}-${Date.now()}`;
    const customer = {
      name: String(resolvedName || "").trim(),
      taxID,
      email: String(resolvedEmail || "").trim(),
      phone: resolvedPhone.startsWith("55") ? resolvedPhone : `55${resolvedPhone}`,
      address: {
        street: String(unit?.rua || tenant.rua || infoMap.rua || ownerProfile?.endereco_rua || "").trim(),
        number: String(unit?.numero || tenant.numero || infoMap.numero || ownerProfile?.endereco_numero || "").trim(),
        neighborhood: String(unit?.bairro || tenant.bairro || infoMap.bairro || ownerProfile?.endereco_bairro || "").trim(),
        city: String(unit?.cidade || tenant.cidade || infoMap.cidade || ownerProfile?.endereco_cidade || "").trim(),
        state: String(unit?.estado || tenant.estado || infoMap.estado || ownerProfile?.endereco_uf || "").trim().toUpperCase(),
        country: "BR",
        zipcode: resolvedCep,
      },
    };
    const missingFields = getMissingTenantCheckoutFields(customer);
    if (missingFields.length > 0) {
      return jsonResponse({
        success: false,
        code: "CHECKOUT_DATA_INCOMPLETE",
        error: "Complete os dados obrigatórios da barbearia antes de assinar.",
        missingFields,
      }, 422);
    }

    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const subscriptionBody = buildTenantPlanPixAutomaticPayload({
      planName: plan.nome,
      value: cents,
      customer,
      correlationID,
      chargeDay: today.getDate(),
    });
    const metadata = {
      kind: "tenant_plan",
      tenantId,
      planoId: plan.id,
      planName: plan.nome,
      maxBarbeiros: plan.max_barbeiros,
      paymentMethod,
      settlementAccount: "woovi_main",
    };

    const { error: intentError } = await admin.from("woovi_charges").insert({
      correlation_id: correlationID,
      user_id: user.id,
      value_centavos: cents,
      status: "pending",
      metadata,
    });
    if (intentError) throw intentError;

    if (paymentMethod === "credit_card") {
      let remote: ChargeResponse;
      try {
        remote = await wooviFetch<ChargeResponse>("/api/v1/charge", {
          method: "POST",
          body: buildTenantPlanCardPayload({
            planName: plan.nome,
            correlationID,
            value: cents,
            customer,
          }),
        });
      } catch (error) {
        await admin.from("woovi_charges").update({
          status: "failed",
          raw_response: error instanceof WooviError ? error.body : null,
        }).eq("correlation_id", correlationID);
        console.error("[tenant-plan] Woovi recusou o cartão:", remoteError(error));
        return jsonResponse({
          success: false,
          error: `A Woovi recusou a cobrança no cartão: ${remoteError(error)}. Verifique se o cartão está habilitado na conta Woovi.`,
        }, 502);
      }

      const cardCharge = remote.charge;
      if (!cardCharge?.paymentLinkUrl
        || cardCharge.correlationID !== correlationID
        || Number(cardCharge.value) !== cents) {
        await admin.from("woovi_charges").update({
          status: "failed",
          raw_response: remote,
        }).eq("correlation_id", correlationID);
        return jsonResponse({
          success: false,
          error: "A resposta da Woovi está inconsistente. Nenhum plano foi ativado.",
        }, 502);
      }

      const { error: saveError } = await admin.from("woovi_charges").update({
        br_code: cardCharge.brCode ?? null,
        charge_id: cardCharge.globalID ?? null,
        raw_response: remote,
        metadata: { ...metadata, globalID: cardCharge.globalID },
      }).eq("correlation_id", correlationID);
      if (saveError) {
        console.error("[tenant-plan] Cartão criado, mas falhou ao salvar:", saveError.message);
        return jsonResponse({
          success: false,
          error: "A cobrança foi criada na Woovi, mas o registro local falhou. Não gere outra; solicite reconciliação.",
        }, 500);
      }

      return jsonResponse({
        success: true,
        data: {
          correlationID,
          paymentLinkUrl: cardCharge.paymentLinkUrl,
          amount: cents / 100,
        },
      });
    }

    let remote: SubscriptionResponse;
    try {
      remote = await wooviFetch<SubscriptionResponse>("/api/v1/subscriptions", {
        method: "POST",
        body: subscriptionBody,
      });
    } catch (error) {
      await admin.from("woovi_charges").update({
        status: "failed",
        raw_response: error instanceof WooviError ? error.body : null,
      }).eq("correlation_id", correlationID);
      console.error("[tenant-plan] Woovi recusou a assinatura:", remoteError(error));
      return jsonResponse({
        success: false,
        error: `A Woovi recusou a assinatura: ${remoteError(error)}`,
      }, 502);
    }

    const subscription = remote.subscription;
    const emv = subscription?.pixRecurring?.emv;
    if (!emv || subscription?.correlationID !== correlationID || Number(subscription?.value) !== cents) {
      await admin.from("woovi_charges").update({
        status: "failed",
        raw_response: remote,
      }).eq("correlation_id", correlationID);
      return jsonResponse({
        success: false,
        error: "A resposta da Woovi está inconsistente. Nenhum plano foi ativado.",
      }, 502);
    }

    const savedMetadata = { ...metadata, globalID: subscription.globalID };
    const { error: saveError } = await admin.from("woovi_charges").update({
      br_code: emv,
      charge_id: subscription.globalID ?? null,
      raw_response: remote,
      metadata: savedMetadata,
    }).eq("correlation_id", correlationID);
    if (saveError) {
      console.error("[tenant-plan] Assinatura criada, mas falhou ao salvar:", saveError.message);
      return jsonResponse({
        success: false,
        error: "A assinatura foi criada na Woovi, mas o registro local falhou. Não gere outra; solicite reconciliação.",
      }, 500);
    }

    return jsonResponse({
      success: true,
      data: { correlationID, emv, amount: cents / 100 },
    });
  } catch (error) {
    console.error("[create-tenant-plan-subscription] Erro:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Erro interno",
    }, 500);
  }
});
