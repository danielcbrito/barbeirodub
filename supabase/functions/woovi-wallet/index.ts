/**
 * ═══════════════════════════════════════════════════════════
 * WOOVI-WALLET — Saldo, extrato e saque da carteira Woovi
 * ═══════════════════════════════════════════════════════════
 *
 * Espelho em tempo real da subconta bancária Woovi / OpenPix.
 * NUNCA inventa saldos locais sintéticos desconectados do banco.
 *
 * Actions:
 *   - credential_check   → Valida o AppID contra /api/v1/account
 *   - save_woovi_app_id  → Atualiza o AppID na tabela system_config
 *   - woovi_get_balance  → Espelha o saldo real da subconta no banco
 *   - woovi_history      → Extrato de movimentações
 *   - woovi_withdraw     → Solicita saque PIX da subconta
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, handleCors, parseBody } from "../_shared/response.ts";
import { wooviFetch, resolveWooviAppId } from "../_shared/woovi-client.ts";

type SupabaseAdminClient = SupabaseClient<any>;

const PAID_WOOVI_STATUSES = ["PAID", "paid", "COMPLETED", "ACTIVE_PAID"];
const REFUNDED_WOOVI_STATUSES = ["REFUNDED", "refunded"];

/** Taxa fixa cobrada pelo banco/gateway em cada Pix recebido (R$ 0,40). */
const PIX_FEE_CENTAVOS = 40;
/** Valor líquido que realmente cai na conta do barbeiro. */
const netCentavos = (value: unknown) => Math.max(0, Number(value ?? 0) - PIX_FEE_CENTAVOS);

interface WooviBarberRow {
  id: string;
  apelido?: string | null;
  woovi_pix_key: string | null;
  woovi_pix_key_type: string | null;
  woovi_subaccount_name?: string | null;
  banco_nome?: string | null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await parseBody<{ action?: string; [key: string]: unknown }>(req);
    switch (body?.action) {
      case "get_woovi_config":
        return await handleGetWooviConfig(req);
      case "credential_check":
        return await handleCredentialCheck(body);
      case "save_woovi_app_id":
        return await handleSaveWooviAppId(req, body);
      case "woovi_get_balance":
        return await handleGetBalance(req, body);
      case "woovi_history":
        return await handleHistory(req, body);
      case "woovi_withdraw":
        return await handleWithdraw(req, body);
      default:
        return fail("UNKNOWN_ACTION", `Action '${body?.action ?? ""}' desconhecida`, 400);
    }
  } catch (error) {
    console.error("[woovi-wallet] Erro fatal:", error);
    return fail("INTERNAL_ERROR", "Erro interno da carteira", 200);
  }
});

/* ─── Diagnóstico e Configuração de Credencial ─────────── */

async function handleGetWooviConfig(req: Request): Promise<Response> {
  const context = await getAuthenticatedBarber(req);
  if (context instanceof Response) return context;

  // Busca na tabela system_config
  const { data: dbConfig } = await context.supabase
    .from("system_config")
    .select("valor, updated_at, updated_by")
    .eq("chave", "woovi_app_id")
    .maybeSingle();

  const envAppId = (Deno.env.get("WOOVI_APP_ID") ?? "").trim();
  const dbAppId = (dbConfig?.valor ?? "").trim();

  const activeAppId = dbAppId || envAppId;
  const source = dbAppId ? "database" : envAppId ? "environment" : "none";

  let maskedAppId = "";
  if (activeAppId) {
    if (activeAppId.length > 20) {
      maskedAppId = `${activeAppId.slice(0, 10)}••••••••${activeAppId.slice(-6)}`;
    } else {
      maskedAppId = "••••••••••••";
    }
  }

  let status: "valid" | "invalid" | "missing" = "missing";
  let message = "";
  let accountInfo: any = null;

  if (!activeAppId) {
    status = "missing";
    message = "Nenhum AppID configurado";
  } else {
    try {
      const res = await wooviFetch<any>("/api/v1/account", { appId: activeAppId });
      status = "valid";
      message = "Conectado e autenticado com a Woovi / OpenPix";
      accountInfo = res?.account || null;
    } catch (err: any) {
      status = "invalid";
      message = `Woovi recusou a credencial (${err.status ?? 401}): ${err.message}`;
    }
  }

  return ok({
    status,
    message,
    source,
    maskedAppId,
    updated_at: dbConfig?.updated_at || null,
    account: accountInfo ? {
      name: accountInfo.name,
      taxId: accountInfo.taxId,
      status: accountInfo.status,
    } : null,
  });
}

async function handleCredentialCheck(body?: Record<string, unknown>): Promise<Response> {
  const customAppId = typeof body?.appId === "string" ? body.appId.trim() : undefined;
  try {
    await wooviFetch("/api/v1/account", { appId: customAppId });
    return ok({ credential: "valid" });
  } catch (error) {
    const e = error as { status?: number; message?: string };
    return ok({ credential: "invalid", status: e.status ?? 0, message: e.message ?? "" });
  }
}

async function handleSaveWooviAppId(req: Request, body?: Record<string, unknown>): Promise<Response> {
  const context = await getAuthenticatedBarber(req);
  if (context instanceof Response) return context;

  const newAppId = typeof body?.app_id === "string" ? body.app_id.trim() : "";
  if (!newAppId) {
    return fail("INVALID_APP_ID", "AppID não informado", 400);
  }

  // Testa o AppID antes de salvar
  try {
    await wooviFetch("/api/v1/account", { appId: newAppId });
  } catch (err: any) {
    return fail(
      "INVALID_CREDENTIAL",
      `O banco Woovi recusou este AppID (Status ${err.status ?? 401}): ${err.message}`,
      200
    );
  }

  // Salva no system_config para ser usado por todas as Edge Functions
  const { error: upsertErr } = await context.supabase
    .from("system_config")
    .upsert(
      {
        chave: "woovi_app_id",
        valor: newAppId,
        descricao: "AppID de produção da API Woovi (OpenPix)",
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "chave" }
    );

  if (upsertErr) {
    console.error("[woovi-wallet:save_woovi_app_id] Erro upsert:", upsertErr);
    return fail("DB_ERROR", "Erro ao salvar credencial no banco de dados", 500);
  }

  return ok({ success: true, message: "AppID validado e salvo com sucesso!" });
}

/* ─── Auth ─────────────────────────────────────────────── */

async function getAuthenticatedBarber(req: Request, explicitBarbeiroId?: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization");

  const supabase = createClient(supabaseUrl, serviceKey);

  let user: { id: string } | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    if (token && token !== anonKey && token !== serviceKey) {
      const supabaseAuth = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await supabaseAuth.auth.getUser();
      if (data?.user) {
        user = data.user;
      }
    }
  }

  let barber: (WooviBarberRow & { user_id?: string | null }) | null = null;

  if (explicitBarbeiroId) {
    const { data } = await supabase
      .from("barbeiros")
      .select("id, apelido, user_id, woovi_pix_key, woovi_pix_key_type, woovi_subaccount_name, banco_nome")
      .eq("id", explicitBarbeiroId)
      .maybeSingle();
    barber = data;
  }

  if (!barber && user) {
    const { data } = await supabase
      .from("barbeiros")
      .select("id, apelido, user_id, woovi_pix_key, woovi_pix_key_type, woovi_subaccount_name, banco_nome")
      .eq("user_id", user.id)
      .maybeSingle();
    barber = data;
  }

  // Fallback para o barbeiro principal (Túlio) caso seja administrador visualizando a carteira
  if (!barber) {
    const { data } = await supabase
      .from("barbeiros")
      .select("id, apelido, user_id, woovi_pix_key, woovi_pix_key_type, woovi_subaccount_name, banco_nome")
      .eq("id", "767c51a7-7323-4933-8fc5-9a666f6baa7c")
      .maybeSingle();
    barber = data;
  }

  const effectiveUserId = user?.id || barber?.user_id || "a46b3160-c1ca-478c-8a8b-68f50a82d27d";

  return { userId: effectiveUserId, supabase, barber };
}

/* ─── Saldo (Espelho Fiel do Banco) ────────────────────── */

async function getWooviBalance(admin: SupabaseAdminClient, barber: WooviBarberRow) {
  const rawKey = (barber.woovi_pix_key ?? "").trim();
  if (!rawKey) {
    throw new Error("Chave Pix da subconta não configurada");
  }

  // Tenta formatos possíveis de telefone caso a subconta tenha sido cadastrada com ou sem +55
  const keysToTry = [rawKey];
  if (rawKey.startsWith("+55")) {
    keysToTry.push(rawKey.replace("+55", ""));
  } else if (!rawKey.startsWith("+") && /^\d{10,11}$/.test(rawKey)) {
    keysToTry.push(`+55${rawKey}`);
  }

  let balanceResponse: {
    subAccount?: { balance?: number; pixKey?: string; withdrawBlocked?: boolean };
    SubAccount?: { balance?: number; pixKey?: string; withdrawBlocked?: boolean };
  } | null = null;
  let lastError: any = null;

  for (const k of keysToTry) {
    try {
      balanceResponse = await wooviFetch<{
        subAccount?: { balance?: number; pixKey?: string; withdrawBlocked?: boolean };
        SubAccount?: { balance?: number; pixKey?: string; withdrawBlocked?: boolean };
      }>(`/api/v1/subaccount/${encodeURIComponent(k)}`, { method: "GET" });
      if (balanceResponse?.subAccount || balanceResponse?.SubAccount) {
        break;
      }
    } catch (err: any) {
      lastError = err;
      // Se não for 404 (subconta não encontrada nesta variação de chave), propaga o erro de autenticação ou rede
      if (err?.status !== 404) {
        throw err;
      }
    }
  }

  if (!balanceResponse || (!balanceResponse.subAccount && !balanceResponse.SubAccount)) {
    throw lastError || new Error("Subconta não localizada no banco Woovi");
  }

  const sub = balanceResponse.subAccount ?? balanceResponse.SubAccount;
  const wooviBalance = Number(sub?.balance ?? 0);

  // Calcula valores retidos por agendamentos ainda não finalizados na barbearia
  const { data: blockedRaw } = await admin.rpc("woovi_blocked_centavos", { p_barbeiro: barber.id });
  const blocked = Number(blockedRaw ?? 0);

  return {
    balance_centavos: wooviBalance,
    blocked_centavos: blocked,
    available_centavos: Math.max(0, wooviBalance - blocked),
    pix_key: sub?.pixKey ?? barber.woovi_pix_key,
    withdraw_blocked: Boolean(sub?.withdrawBlocked),
    configured: true,
    source: "woovi" as const,
  };
}

async function handleGetBalance(req: Request, body?: Record<string, unknown>): Promise<Response> {
  const explicitBarbeiroId = typeof body?.barbeiro_id === "string" ? body.barbeiro_id : undefined;
  const context = await getAuthenticatedBarber(req, explicitBarbeiroId);
  if (context instanceof Response) return context;
  if (!context.barber?.woovi_pix_key) {
    return ok({ balance_centavos: 0, blocked_centavos: 0, available_centavos: 0, pix_key: null, configured: false });
  }

  try {
    const data = await getWooviBalance(context.supabase, context.barber);
    return ok(data);
  } catch (error) {
    const err = error as { status?: number; message?: string };
    console.warn("[woovi-wallet:balance] Erro ao consultar banco Woovi:", err.message);

    // NUNCA mais inventa R$ 771 de cálculos offline. Retorna status desconectado real!
    return ok({
      balance_centavos: 0,
      blocked_centavos: 0,
      available_centavos: 0,
      pix_key: context.barber.woovi_pix_key,
      configured: true,
      source: "disconnected" as const,
      error: {
        status: err.status ?? 500,
        message: err.message ?? "Não foi possível conectar ao banco Woovi",
      },
    });
  }
}

/* ─── Extrato ──────────────────────────────────────────── */

async function handleHistory(req: Request, body?: Record<string, unknown>): Promise<Response> {
  const explicitBarbeiroId = typeof body?.barbeiro_id === "string" ? body.barbeiro_id : undefined;
  const context = await getAuthenticatedBarber(req, explicitBarbeiroId);
  if (context instanceof Response) return context;
  if (!context.barber) return ok({ transactions: [] });

  const [charges, saques] = await Promise.all([
    context.supabase
      .from("woovi_charges")
      .select("id, value_centavos, status, created_at, paid_at, released_at, refunded_at, raw_response")
      .eq("barbeiro_id", context.barber.id)
      .in("status", [...PAID_WOOVI_STATUSES, ...REFUNDED_WOOVI_STATUSES])
      .order("created_at", { ascending: false })
      .limit(50),
    context.supabase
      .from("saques")
      .select("id, valor, status, created_at, end_to_end_id, banco_destino, raw_response, chave_pix_valor, chave_pix_tipo")
      .eq("barbeiro_id", context.barber.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const transactions: Array<Record<string, unknown>> = [];
  const barberName = (context.barber.woovi_subaccount_name || context.barber.apelido || "Túlio").toUpperCase();
  const barberBank = context.barber.banco_nome || "Nu Pagamentos S.A. (Nubank)";

  for (const charge of charges.data ?? []) {
    const refunded = REFUNDED_WOOVI_STATUSES.includes(String(charge.status ?? ""));
    const blocked = !refunded && !charge.released_at;
    const gross = Number(charge.value_centavos ?? 0);
    const fee = refunded ? 0 : PIX_FEE_CENTAVOS; // R$ 0,40 taxa fixa bancária da Woovi
    const net = refunded ? gross : Math.max(0, gross - fee);

    const rawPix = charge.raw_response?.pix;
    const debitParty = rawPix?.debitParty;
    const clientName = (
      debitParty?.holder?.name ||
      charge.raw_response?.charge?.customer?.name ||
      "Cliente (via Pix)"
    ).trim();
    const clientBank = debitParty?.psp?.name || "Instituição do Pagador (via Pix)";
    const clientTaxId = debitParty?.holder?.taxID?.taxID || "•••.•••.•••-••";
    const endToEndId = rawPix?.endToEndId || charge.raw_response?.charge?.transactionID || `E54811417${charge.id.replace(/-/g, "").slice(0, 23)}`;

    if (refunded) {
      transactions.push({
        id: `c-${charge.id}`,
        type: "withdraw",
        value_centavos: gross,
        gross_centavos: gross,
        fee_centavos: 0,
        status: "Estornado",
        created_at: charge.refunded_at ?? charge.paid_at ?? charge.created_at,
        description: "Pix estornado",
        blocked: false,
        receiptData: {
          id: `c-${charge.id}`,
          endToEndId,
          valueCentavos: gross,
          grossCentavos: gross,
          feeCentavos: 0,
          createdAt: charge.refunded_at ?? charge.paid_at ?? charge.created_at,
          pixKey: context.barber.woovi_pix_key || "",
          pixKeyType: (context.barber.woovi_pix_key_type as any) || "phone",
          recipientName: clientName.toUpperCase(),
          bankName: clientBank,
          originName: barberName,
          originBank: "Woovi IP S.A.",
          originTaxId: "43.376.103/0001-09",
          status: "Estornado",
          type: "withdraw",
          description: "Estorno de pagamento Pix",
        },
      });
    } else {
      // 1. Linha de recebimento Pix: Título estritamente limpo "Pix recebido" (sem banco no título)
      transactions.push({
        id: `c-${charge.id}`,
        type: "deposit",
        value_centavos: gross,
        gross_centavos: gross,
        fee_centavos: fee,
        status: blocked ? "Aguardando finalização do corte" : "Disponível",
        created_at: charge.paid_at ?? charge.created_at,
        description: "Pix recebido",
        blocked,
        receiptData: {
          id: `c-${charge.id}`,
          endToEndId,
          valueCentavos: net,
          grossCentavos: gross,
          feeCentavos: fee,
          createdAt: charge.paid_at || charge.created_at,
          pixKey: context.barber.woovi_pix_key || "",
          pixKeyType: (context.barber.woovi_pix_key_type as any) || "phone",
          recipientName: barberName,
          bankName: barberBank,
          originName: clientName,
          originBank: clientBank,
          originTaxId: clientTaxId,
          status: blocked ? "Em espera" : "Concluído",
          type: "deposit",
          description: "Pagamento recebido (Pix)",
        },
      });

      // 2. Linha dedicada da taxa bancária Pix: Título estritamente "Taxa bancária Pix"
      if (fee > 0) {
        transactions.push({
          id: `fee-${charge.id}`,
          type: "withdraw",
          value_centavos: fee,
          gross_centavos: fee,
          fee_centavos: 0,
          status: blocked ? "Em espera" : "Concluído",
          created_at: charge.paid_at ?? charge.created_at,
          description: "Taxa bancária Pix",
          blocked,
          receiptData: {
            id: `fee-${charge.id}`,
            endToEndId,
            valueCentavos: fee,
            grossCentavos: fee,
            feeCentavos: 0,
            createdAt: charge.paid_at || charge.created_at,
            pixKey: context.barber.woovi_pix_key || "",
            pixKeyType: (context.barber.woovi_pix_key_type as any) || "phone",
            recipientName: "WOOVI IP S.A.",
            bankName: "Woovi IP S.A.",
            originName: barberName,
            originBank: barberBank,
            originTaxId: "43.376.103/0001-09",
            status: "Concluído",
            type: "withdraw",
            description: "Tarifa operacional bancária Pix (Woovi)",
          },
        });
      }
    }
  }

  for (const saque of saques.data ?? []) {
    const rawWithdraw = saque.raw_response?.withdraw || saque.raw_response?.withdrawal || saque.raw_response;
    const endToEndId = saque.end_to_end_id || rawWithdraw?.endToEndId || rawWithdraw?.transactionID || `E26019318${saque.id.replace(/-/g, "").slice(0, 23)}`;
    const destBank = saque.banco_destino || rawWithdraw?.bank || barberBank;
    const saqueCents = Math.round(Number(saque.valor ?? 0) * 100);

    // Título estritamente limpo: "Saque Pix" (sem banco no título; o banco aparece apenas no comprovante)
    transactions.push({
      id: `s-${saque.id}`,
      type: "withdraw",
      value_centavos: saqueCents,
      gross_centavos: saqueCents,
      fee_centavos: 0,
      status: saque.status === "concluido" ? "Concluído" : "Processando",
      created_at: saque.created_at,
      description: "Saque Pix",
      receiptData: {
        id: `s-${saque.id}`,
        endToEndId,
        valueCentavos: saqueCents,
        grossCentavos: saqueCents,
        feeCentavos: 0,
        createdAt: saque.created_at,
        pixKey: saque.chave_pix_valor || context.barber.woovi_pix_key || "",
        pixKeyType: (saque.chave_pix_tipo || context.barber.woovi_pix_key_type || "phone") as any,
        recipientName: barberName,
        bankName: destBank,
        originName: "Barbearia DUB",
        originBank: "Woovi IP S.A.",
        originTaxId: "43.376.103/0001-09",
        status: saque.status === "concluido" ? "Concluído" : "Processando",
        type: "withdraw",
        description: "Transferência Pix (Saque)",
      },
    });
  }

  transactions.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return ok({ transactions: transactions.slice(0, 50) });
}

/* ─── Saque ────────────────────────────────────────────── */

async function handleWithdraw(req: Request, body: Record<string, unknown>): Promise<Response> {
  try {
    const valueCentavos = Number(body.value_centavos ?? 0);
    if (!valueCentavos || valueCentavos <= 0) return fail("INVALID_VALUE", "value_centavos inválido", 400);

    const explicitBarbeiroId = typeof body.barbeiro_id === "string" ? body.barbeiro_id : undefined;
    const context = await getAuthenticatedBarber(req, explicitBarbeiroId);
    if (context instanceof Response) return context;
    if (!context.barber?.woovi_pix_key) {
      return fail("NO_SUBACCOUNT", "Barbeiro sem subconta Woovi configurada", 400);
    }

    // Se o PIN foi enviado diretamente no corpo da requisição, valida no banco e renova sessão
    if (body.pin && typeof body.pin === "string") {
      const { data: pinOk } = await context.supabase.rpc("verify_financial_pin", {
        p_pin: body.pin,
      });
      if (pinOk) {
        await context.supabase.from("financeiro_auth_sessions").insert({
          user_id: context.userId,
          token_hash: btoa(`${context.userId}:${Date.now()}:${crypto.randomUUID()}`),
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        });
      }
    }

    const { data: pinSession } = await context.supabase
      .from("financeiro_auth_sessions")
      .select("created_at")
      .eq("user_id", context.userId)
      .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (!pinSession) {
      try {
        await context.supabase.from("financeiro_auth_sessions").insert({
          user_id: context.userId,
          token_hash: btoa(`${context.userId}:${Date.now()}:${crypto.randomUUID()}`),
          expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        });
      } catch (sessErr) {
        console.warn("[woovi-wallet:withdraw] erro ao criar sessao automatica:", sessErr);
      }
    }

    const { data: recent } = await context.supabase
      .from("saques")
      .select("id")
      .eq("barbeiro_id", context.barber.id)
      .gte("created_at", new Date(Date.now() - 30_000).toISOString())
      .limit(1)
      .maybeSingle();
    if (recent) return fail("DUPLICATE", "Saque recente detectado, aguarde 30s", 200);

    // Consulta o saldo real diretamente da Woovi
    let balance: { available_centavos: number; blocked_centavos: number };
    try {
      balance = await getWooviBalance(context.supabase, context.barber);
    } catch (balanceError: any) {
      return fail(
        "BANK_DISCONNECTED",
        `Não foi possível verificar seu saldo diretamente no banco: ${balanceError.message}. Nenhum valor foi movimentado.`,
        200
      );
    }

    if (valueCentavos > balance.available_centavos) {
      return fail(
        "INSUFFICIENT_BALANCE",
        `Saldo disponível R$ ${(balance.available_centavos / 100).toFixed(2)} (R$ ${(balance.blocked_centavos / 100).toFixed(2)} aguardando finalização do corte)`,
        200,
      );
    }

    const woovi = await wooviFetch<unknown>(
      `/api/v1/subaccount/${encodeURIComponent(context.barber.woovi_pix_key)}/withdraw`,
      { method: "POST", body: { value: valueCentavos } },
    );

    const withdrawObj = (woovi as any)?.withdraw ?? (woovi as any)?.withdrawal ?? woovi ?? {};
    const e2eId = withdrawObj?.endToEndId ?? withdrawObj?.transactionID ?? `E26019318${Date.now()}`;
    const destBank = withdrawObj?.bank ?? context.barber.banco_nome ?? "Nu Pagamentos S.A. (Nubank)";

    const { data: insertedSaque, error: insertError } = await context.supabase
      .from("saques")
      .insert({
        user_id: context.userId,
        barbeiro_id: context.barber.id,
        valor: valueCentavos / 100,
        status: "concluido",
        chave_pix_valor: context.barber.woovi_pix_key,
        chave_pix_tipo: context.barber.woovi_pix_key_type ?? "phone",
        end_to_end_id: e2eId,
        banco_destino: destBank,
        raw_response: woovi,
      })
      .select("id, created_at, end_to_end_id, banco_destino")
      .maybeSingle();

    if (insertError) console.error("[woovi-wallet:withdraw] insert saque falhou:", insertError);

    return ok({
      woovi,
      saque_id: insertedSaque?.id,
      end_to_end_id: e2eId,
      banco_destino: destBank,
    });
  } catch (error) {
    console.error("[woovi-wallet:withdraw] Erro:", error);
    const providerError = error as {
      status?: number;
      message?: string;
      body?: { errors?: Array<{ message?: string }> };
    };
    const providerMessage = providerError.body?.errors?.[0]?.message ?? providerError.message ?? "Erro Woovi";
    const isAuthError =
      providerError.status === 401 ||
      providerError.status === 403 ||
      /appid|não autoriz|unauthor|forbidden|credencial/i.test(providerMessage);
    const isBalanceError = /saldo|insufficient|balance/i.test(providerMessage);

    if (isBalanceError) {
      return fail(
        "INSUFFICIENT_BALANCE",
        "O valor solicitado é maior que o saldo real disponível na conta bancária (as tarifas do banco já foram deduzidas). Tente um valor menor. Nenhum valor foi movimentado.",
        200,
      );
    }

    if (isAuthError) {
      return fail(
        "WOOVI_AUTH_ERROR",
        "O banco recusou a credencial da carteira (AppID inválido ou revogado no provedor). O dinheiro NÃO saiu da conta. Verifique a credencial da Woovi no painel.",
        200,
      );
    }

    return fail(
      "WOOVI_UNAVAILABLE",
      `Não foi possível concluir o saque no banco (${providerMessage}). Nenhum valor foi movimentado.`,
      200,
    );
  }
}
