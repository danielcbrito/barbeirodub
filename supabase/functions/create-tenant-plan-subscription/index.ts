import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { wooviFetch, WooviError, corsHeaders, jsonResponse } from "../_shared/woovi-client.ts";

/**
 * create-tenant-plan-subscription
 * Assinatura SaaS da barbearia via Pix Automático Woovi (PIX_RECURRING, jornada 3:
 * o primeiro pagamento já autoriza a recorrência mensal). O valor é direcionado à
 * subconta "DUB". A barbearia só é liberada depois que o banco confirma o pagamento.
 *
 * Ações:
 *  - { action: "create", tenantId, planName } → { emv, correlationID }
 *  - { action: "status", tenantId, correlationID } → { paid, status }
 */

type SubResp = {
  subscription?: {
    globalID?: string;
    status?: string;
    value?: number;
    correlationID?: string;
    paymentLinkUrl?: string;
    pixRecurring?: { emv?: string; status?: string; recurrencyId?: string };
  };
};

const PAID_RECURRING = new Set(["APPROVED", "ACTIVE", "AUTHORIZED", "CONFIRMED"]);
const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");

async function resolveDubPixKey(admin: any): Promise<string | null> {
  const { data } = await admin.from("system_config").select("valor").eq("chave", "woovi_dub_pix_key").maybeSingle();
  if (data?.valor?.trim()) return data.valor.trim();
  try {
    const res = await wooviFetch<{ subAccounts?: Array<{ name?: string; pixKey?: string }> }>("/api/v1/subaccount");
    const dub = res.subAccounts?.find((s) => (s.name ?? "").trim().toUpperCase() === "DUB");
    return dub?.pixKey ?? null;
  } catch (e) {
    console.error("[tenant-plan] Falha ao listar subcontas:", e);
    return null;
  }
}

async function fetchSubscription(id: string) {
  return await wooviFetch<SubResp>(`/api/v1/subscriptions/${encodeURIComponent(id)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return jsonResponse({ success: false, error: "Não autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action === "status" ? "status" : "create";
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return jsonResponse({ success: false, error: "Barbearia inválida" }, 400);

    const { data: tenant } = await admin
      .from("tenants")
      .select("id, nome, owner_user_id, cpf, cnpj, email, telefone, whatsapp, rua, numero, bairro, cidade, estado")
      .eq("id", tenantId).maybeSingle();
    if (!tenant) return jsonResponse({ success: false, error: "Barbearia não encontrada" }, 404);

    // Somente o dono ou admin da barbearia pode assinar.
    let allowed = tenant.owner_user_id === user.id;
    if (!allowed) {
      const { data: m } = await admin.from("tenant_members").select("role")
        .eq("tenant_id", tenantId).eq("user_id", user.id).maybeSingle();
      allowed = !!m && ["owner", "admin", "tenant_admin"].includes(String(m.role));
    }
    if (!allowed) return jsonResponse({ success: false, error: "Sem permissão para esta barbearia" }, 403);

    // ───────────── STATUS: confere no banco e libera o plano ─────────────
    if (action === "status") {
      const correlationID = String(body.correlationID ?? "");
      if (!correlationID.startsWith(`dub-${tenantId.slice(0, 8)}`)) {
        return jsonResponse({ success: false, error: "Assinatura inválida" }, 400);
      }
      const { data: row } = await admin.from("woovi_charges").select("metadata, status, value_centavos")
        .eq("correlation_id", correlationID).maybeSingle();
      if (!row) return jsonResponse({ success: false, error: "Assinatura não encontrada" }, 404);
      const meta = (row.metadata ?? {}) as Record<string, any>;
      if (row.status === "paid") return jsonResponse({ success: true, paid: true });

      const remote = await fetchSubscription(meta.globalID || correlationID);
      const recStatus = String(remote.subscription?.pixRecurring?.status ?? "").toUpperCase();
      const paid = PAID_RECURRING.has(recStatus);
      if (!paid) return jsonResponse({ success: true, paid: false, status: recStatus || "PENDING" });

      const now = new Date();
      const next = new Date(now); next.setMonth(next.getMonth() + 1);
      await admin.from("woovi_charges").update({ status: "paid", paid_at: now.toISOString(), raw_response: remote })
        .eq("correlation_id", correlationID);
      const { error: upErr } = await admin.from("tenant_assinaturas").upsert({
        tenant_id: tenantId,
        status: "active",
        plano_id: meta.planoId,
        qtd_barbeiros: meta.maxBarbeiros ?? 1,
        payment_method: "pix_automatico",
        payment_reference: correlationID,
        paid_at: now.toISOString(),
        subscription_start: now.toISOString(),
        next_billing_date: next.toISOString(),
        cancelled_at: null,
        updated_at: now.toISOString(),
      }, { onConflict: "tenant_id" });
      if (upErr) {
        console.error("[tenant-plan] Pago, mas falhou ao liberar:", upErr);
        return jsonResponse({ success: false, error: "Pagamento confirmado, mas a liberação falhou. Avise o suporte." }, 500);
      }
      return jsonResponse({ success: true, paid: true });
    }

    // ───────────── CREATE: cria Pix Automático na Woovi ─────────────
    const planName = String(body.planName ?? "").trim();
    const { data: plano } = await admin.from("tenant_planos").select("id, nome, preco_mensal, max_barbeiros")
      .ilike("nome", planName).eq("ativo", true).maybeSingle();
    if (!plano) return jsonResponse({ success: false, error: "Plano não encontrado" }, 404);
    const cents = Math.round(Number(plano.preco_mensal) * 100);
    if (!Number.isSafeInteger(cents) || cents < 100) return jsonResponse({ success: false, error: "Plano sem valor definido" }, 400);

    // Fallback gracioso: busca dados da unidade (sede), informacoes_empresa e do proprietário antes de recusar
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
    for (const r of infoRows || []) {
      if (r.chave && r.valor) infoMap[r.chave] = String(r.valor).trim();
    }

    const { data: ownerProfile } = await admin
      .from("profiles")
      .select("cpf, phone, telefone, full_name, email")
      .eq("id", tenant.owner_user_id)
      .maybeSingle();

    const { data: ownerBarber } = await admin
      .from("barbeiros")
      .select("cpf, telefone, nome_completo, apelido, email")
      .eq("user_id", tenant.owner_user_id)
      .maybeSingle();

    const resolvedName = unit?.nome || tenant.nome || infoMap["nome"] || "Barbearia";
    const resolvedCnpj = digits(unit?.cnpj || tenant.cnpj || infoMap["cnpj"]);
    const resolvedCpf = digits(unit?.cpf || tenant.cpf || infoMap["cpf"] || ownerProfile?.cpf || ownerBarber?.cpf);
    const taxID = resolvedCnpj || resolvedCpf;

    if (taxID.length !== 11 && taxID.length !== 14) {
      return jsonResponse({ success: false, error: "Cadastre o CPF ou CNPJ da barbearia antes de assinar." }, 422);
    }

    const dubPixKey = await resolveDubPixKey(admin);
    if (!dubPixKey) return jsonResponse({ success: false, error: "Subconta DUB não encontrada no banco." }, 503);

    const correlationID = `dub-${tenantId.slice(0, 8)}-${plano.id.slice(0, 8)}-${Date.now()}`;
    const resolvedPhone = digits(
      unit?.whatsapp || unit?.telefone ||
      tenant.whatsapp || tenant.telefone ||
      infoMap["whatsapp"] || infoMap["telefone"] ||
      ownerProfile?.telefone || ownerProfile?.phone ||
      ownerBarber?.telefone
    );
    const resolvedEmail = unit?.email || tenant.email || infoMap["email"] || ownerProfile?.email || ownerBarber?.email;
    const resolvedCep = digits(unit?.cep || infoMap["cep"]);
    const resolvedRua = unit?.rua || tenant.rua || infoMap["rua"] || "Não informado";
    const resolvedNumero = unit?.numero || tenant.numero || infoMap["numero"] || "S/N";
    const resolvedBairro = unit?.bairro || tenant.bairro || infoMap["bairro"] || "Centro";
    const resolvedCidade = unit?.cidade || tenant.cidade || infoMap["cidade"] || "Sao Paulo";
    const resolvedEstado = unit?.estado || tenant.estado || infoMap["estado"] || "SP";

    const customer: Record<string, unknown> = {
      name: resolvedName,
      taxID,
      ...(resolvedEmail ? { email: resolvedEmail } : {}),
      ...(resolvedPhone ? { phone: resolvedPhone.startsWith("55") ? resolvedPhone : `55${resolvedPhone}` } : {}),
      address: {
        street: resolvedRua,
        number: resolvedNumero,
        neighborhood: resolvedBairro,
        city: resolvedCidade,
        state: resolvedEstado,
        country: "BR",
        ...(resolvedCep && resolvedCep.length === 8 ? { zipCode: resolvedCep } : {}),
      },
    };
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const subBody: Record<string, unknown> = {
      name: `DUB ${plano.nome}`,
      value: cents,
      customer,
      correlationID,
      comment: `DUB ${plano.nome} mensal`.slice(0, 29),
      frequency: "MONTHLY",
      type: "PIX_RECURRING",
      pixRecurringOptions: { journey: "PAYMENT_ON_APPROVAL", retryPolicy: "THREE_RETRIES_7_DAYS" },
      dayGenerateCharge: today.getDate(),
      dayDue: 3,
      splits: [{ splitType: "SPLIT_SUB_ACCOUNT", pixKey: dubPixKey, value: cents }],
    };

    const { error: intentErr } = await admin.from("woovi_charges").insert({
      correlation_id: correlationID,
      user_id: user.id,
      value_centavos: cents,
      status: "pending",
      metadata: { kind: "tenant_plan", tenantId, planoId: plano.id, planName: plano.nome, maxBarbeiros: plano.max_barbeiros },
    });
    if (intentErr) throw intentErr;

    let res: SubResp;
    try {
      res = await wooviFetch<SubResp>("/api/v1/subscriptions", { method: "POST", body: subBody });
    } catch (e) {
      await admin.from("woovi_charges").update({ status: "failed", raw_response: e instanceof WooviError ? (e.body as any) : null })
        .eq("correlation_id", correlationID);
      const msg = e instanceof Error ? e.message : "Erro no banco";
      console.error("[tenant-plan] Woovi recusou:", msg, e instanceof WooviError ? e.body : "");
      return jsonResponse({ success: false, error: `Banco recusou a assinatura: ${msg}` }, 502);
    }

    const emv = res.subscription?.pixRecurring?.emv;
    if (!emv) return jsonResponse({ success: false, error: "O banco não retornou o QR Code do Pix Automático." }, 502);

    await admin.from("woovi_charges").update({
      br_code: emv,
      charge_id: res.subscription?.globalID ?? null,
      raw_response: res,
      metadata: { kind: "tenant_plan", tenantId, planoId: plano.id, planName: plano.nome, maxBarbeiros: plano.max_barbeiros, globalID: res.subscription?.globalID },
    }).eq("correlation_id", correlationID);

    return jsonResponse({ success: true, data: { correlationID, emv, amount: cents / 100 } });
  } catch (err) {
    console.error("[create-tenant-plan-subscription] Erro:", err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
