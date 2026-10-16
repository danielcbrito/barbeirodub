/**
 * ═══════════════════════════════════════════════════════════
 * WOOVI-WALLET — Saldo, extrato e saque da carteira Woovi
 * ═══════════════════════════════════════════════════════════
 *
 * Substitui as actions woovi_* da store-api (que ficou presa em uma
 * versão antiga no deploy). Roteamento via campo "action".
 *
 * Actions: woovi_get_balance | woovi_history | woovi_withdraw
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, handleCors, parseBody } from "../_shared/response.ts";
import { wooviFetch } from "../_shared/woovi-client.ts";

type SupabaseAdminClient = ReturnType<typeof createClient>;

const PAID_WOOVI_STATUSES = ["PAID", "paid", "COMPLETED", "ACTIVE_PAID"];
const REFUNDED_WOOVI_STATUSES = ["REFUNDED", "refunded"];

/** Taxa fixa cobrada pelo banco/gateway em cada Pix recebido (R$ 0,40). */
const PIX_FEE_CENTAVOS = 40;
/** Valor líquido que realmente cai na conta do barbeiro. */
const netCentavos = (value: unknown) => Math.max(0, Number(value ?? 0) - PIX_FEE_CENTAVOS);


interface WooviBarberRow {
  id: string;
  woovi_pix_key: string | null;
  woovi_pix_key_type: string | null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await parseBody<{ action?: string;[key: string]: unknown }>(req);
    switch (body?.action) {
      case "credential_check":
        return await handleCredentialCheck();
      case "woovi_get_balance":
        return await handleGetBalance(req);
      case "woovi_history":
        return await handleHistory(req);
      case "woovi_withdraw":
        return await handleWithdraw(req, body);
      default:
        return fail("UNKNOWN_ACTION", `Action '${body?.action ?? ""}' desconhecida`, 400);
    }
  } catch (error) {
    console.error("[woovi-wallet] Erro fatal:", error);
    // Nunca 5xx: a UI trata success=false sem tela branca.
    return fail("INTERNAL_ERROR", "Erro interno da carteira", 200);
  }
});

/* ─── Diagnóstico de credencial (sem dados sensíveis) ──── */

async function handleCredentialCheck(): Promise<Response> {
  try {
    await wooviFetch("/api/v1/account");
    return ok({ credential: "valid" });
  } catch (error) {
    const e = error as { status?: number; message?: string };
    return ok({ credential: "invalid", status: e.status ?? 0, message: e.message ?? "" });
  }
}

/* ─── Auth ─────────────────────────────────────────────── */

async function getAuthenticatedBarber(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) return fail("UNAUTHORIZED", "Token ausente", 401);

  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) return fail("INVALID_TOKEN", "Token inválido", 401);

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: barber } = await supabase
    .from("barbeiros")
    .select("id, woovi_pix_key, woovi_pix_key_type")
    .eq("user_id", user.id)
    .maybeSingle();

  return { userId: user.id, supabase, barber: barber as WooviBarberRow | null };
}

/* ─── Saldo ────────────────────────────────────────────── */

async function getWooviBalance(admin: SupabaseAdminClient, barber: WooviBarberRow) {
  const balanceResponse = await wooviFetch<{ subAccount: { balance: number; pixKey?: string } }>(
    `/api/v1/subaccount/${encodeURIComponent(barber.woovi_pix_key!)}`,
    { method: "GET" },
  );

  const wooviBalance = Number(balanceResponse.subAccount?.balance ?? 0);
  const { data: blockedRaw } = await admin.rpc("woovi_blocked_centavos", { p_barbeiro: barber.id });
  const blocked = Number(blockedRaw ?? 0);

  return {
    balance_centavos: wooviBalance,
    blocked_centavos: blocked,
    available_centavos: Math.max(0, wooviBalance - blocked),
    pix_key: balanceResponse.subAccount?.pixKey ?? barber.woovi_pix_key,
    configured: true,
    source: "woovi" as const,
  };
}

async function getLocalBalance(admin: SupabaseAdminClient, barber: WooviBarberRow) {
  const [{ data: charges }, { data: withdrawals }] = await Promise.all([
    admin
      .from("woovi_charges")
      .select("value_centavos, status, released_at")
      .eq("barbeiro_id", barber.id)
      .in("status", PAID_WOOVI_STATUSES),
    admin.from("saques").select("valor, status").eq("barbeiro_id", barber.id),
  ]);

  const paid = (charges ?? []).reduce((t, c) => t + netCentavos(c.value_centavos), 0);
  const blocked = (charges ?? []).reduce(
    (t, c) => (!c.released_at ? t + netCentavos(c.value_centavos) : t),
    0,
  );
  const withdrawn = (withdrawals ?? []).reduce((t, w) => {
    const status = String(w.status ?? "").toLowerCase();
    const ignored = ["falhou", "cancelado", "estornado", "recusado"].includes(status);
    return ignored ? t : t + Math.round(Number(w.valor ?? 0) * 100);
  }, 0);
  const balance = Math.max(0, paid - withdrawn);

  return {
    balance_centavos: balance,
    blocked_centavos: Math.min(blocked, balance),
    available_centavos: Math.max(0, balance - blocked),
    pix_key: barber.woovi_pix_key,
    configured: true,
    source: "local_fallback" as const,
  };
}

async function handleGetBalance(req: Request): Promise<Response> {
  const context = await getAuthenticatedBarber(req);
  if (context instanceof Response) return context;
  if (!context.barber?.woovi_pix_key) {
    return ok({ balance_centavos: 0, blocked_centavos: 0, available_centavos: 0, pix_key: null, configured: false });
  }

  try {
    return ok(await getWooviBalance(context.supabase, context.barber));
  } catch (error) {
    console.warn("[woovi-wallet:balance] Woovi indisponível, usando saldo local:", (error as Error).message);
    try {
      return ok(await getLocalBalance(context.supabase, context.barber));
    } catch (localError) {
      console.error("[woovi-wallet:balance] saldo local falhou:", localError);
      return ok({
        balance_centavos: 0,
        blocked_centavos: 0,
        available_centavos: 0,
        pix_key: null,
        configured: false,
        source: "safe_empty_fallback",
      });
    }
  }
}

/* ─── Extrato ──────────────────────────────────────────── */

async function handleHistory(req: Request): Promise<Response> {
  const context = await getAuthenticatedBarber(req);
  if (context instanceof Response) return context;
  if (!context.barber) return ok({ transactions: [] });

  const [charges, saques] = await Promise.all([
    context.supabase
      .from("woovi_charges")
      .select("id, value_centavos, status, created_at, paid_at, released_at, refunded_at")
      .eq("barbeiro_id", context.barber.id)
      .in("status", [...PAID_WOOVI_STATUSES, ...REFUNDED_WOOVI_STATUSES])
      .order("created_at", { ascending: false })
      .limit(50),
    context.supabase
      .from("saques")
      .select("id, valor, status, created_at")
      .eq("barbeiro_id", context.barber.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const transactions: Array<Record<string, unknown>> = [];

  for (const charge of charges.data ?? []) {
    const refunded = REFUNDED_WOOVI_STATUSES.includes(String(charge.status ?? ""));
    const blocked = !refunded && !charge.released_at;
    transactions.push({
      id: `c-${charge.id}`,
      type: refunded ? "withdraw" : "deposit",
      value_centavos: refunded ? Number(charge.value_centavos ?? 0) : netCentavos(charge.value_centavos),
      gross_centavos: Number(charge.value_centavos ?? 0),
      fee_centavos: refunded ? 0 : PIX_FEE_CENTAVOS,
      status: refunded ? "Estornado" : blocked ? "Aguardando finalização do corte" : "Disponível",
      created_at: charge.refunded_at ?? charge.paid_at ?? charge.created_at,
      description: refunded
        ? "Cancelamento — estornado ao cliente"
        : blocked
          ? "Pix recebido · aguardando confirmação (taxa R$ 0,40)"
          : "Pagamento recebido (Pix) · taxa R$ 0,40",
      blocked,
    });
  }

  for (const saque of saques.data ?? []) {
    transactions.push({
      id: `s-${saque.id}`,
      type: "withdraw",
      value_centavos: Math.round(Number(saque.valor ?? 0) * 100),
      status: saque.status ?? "processando",
      created_at: saque.created_at,
      description: "Saque Pix",
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

    const context = await getAuthenticatedBarber(req);
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
      .limit(1)
      .maybeSingle();
    if (!pinSession) return fail("PIN_REQUIRED", "Sessão de PIN expirada", 200);

    const { data: recent } = await context.supabase
      .from("saques")
      .select("id")
      .eq("barbeiro_id", context.barber.id)
      .gte("created_at", new Date(Date.now() - 30_000).toISOString())
      .limit(1)
      .maybeSingle();
    if (recent) return fail("DUPLICATE", "Saque recente detectado, aguarde 30s", 200);

    // Saldo: Woovi como fonte primária, saldo local como fallback quando o
    // provedor está indisponível/recusa a credencial.
    let balance: { available_centavos: number; blocked_centavos: number };
    try {
      balance = await getWooviBalance(context.supabase, context.barber);
    } catch (balanceError) {
      console.warn("[woovi-wallet:withdraw] saldo Woovi indisponível:", (balanceError as Error).message);
      balance = await getLocalBalance(context.supabase, context.barber);
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

    const { error: insertError } = await context.supabase.from("saques").insert({
      user_id: context.userId,
      barbeiro_id: context.barber.id,
      valor: valueCentavos / 100,
      status: "processando",
      chave_pix_valor: context.barber.woovi_pix_key,
      chave_pix_tipo: context.barber.woovi_pix_key_type ?? "random",
    });
    if (insertError) console.error("[woovi-wallet:withdraw] insert saque falhou:", insertError);

    return ok({ woovi });
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
        "O valor pedido é maior que o saldo real disponível na conta (a taxa do banco já foi descontada). Tente um valor um pouco menor. Nenhum valor foi movimentado.",
        200,
      );
    }

    return fail(
      isAuthError ? "WOOVI_AUTH_ERROR" : "WOOVI_UNAVAILABLE",
      isAuthError
        ? "O provedor recusou a credencial da carteira (AppID inválido). Nenhum valor foi movimentado."
        : `Não foi possível concluir o saque agora (${providerMessage}). Nenhum valor foi movimentado.`,
      200,
    );

  }
}
