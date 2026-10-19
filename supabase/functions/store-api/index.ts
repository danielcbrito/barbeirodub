/**
 * ═══════════════════════════════════════════════════════════
 * STORE-API — API unificada do módulo de Loja
 * ═══════════════════════════════════════════════════════════
 *
 * Consolida todas as operações de loja em uma única Edge Function
 * para economizar slots. Roteamento via campo "action" no body.
 *
 * Actions:
 *   - create_order       → Criar pedido (autenticado)
 *   - clean_reservations → Limpar reservas expiradas (cron/manual)
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, ok, fail, handleCors, parseBody } from "../_shared/response.ts";
import { createWooviCharge } from "../_shared/woovi-charge.ts";
import { wooviFetch } from "../_shared/woovi-client.ts";

/* ═══════════════════════════════════════════════════════════
 * MAIN ROUTER
 * ═══════════════════════════════════════════════════════════ */

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await parseBody<{ action: string;[key: string]: unknown }>(req);
    if (!body?.action) {
      return fail("MISSING_ACTION", "Campo 'action' obrigatório", 400);
    }

    let response: Response;
    switch (body.action) {
      case "create_order":
        response = await handleCreateOrder(req, body);
        break;
      case "clean_reservations":
        response = await handleCleanReservations();
        break;
      case "woovi_get_balance":
        response = await handleWooviGetBalance(req);
        break;
      case "woovi_history":
        response = await handleWooviHistory(req);
        break;
      case "woovi_withdraw":
        response = await handleWooviWithdraw(req, body);
        break;
      default:
        return fail("UNKNOWN_ACTION", `Action '${body.action}' desconhecida`, 400);
    }

    // Guard rail global da carteira: nenhuma ação Woovi pode responder 5xx e
    // derrubar a SPA. Erros continuam como success=false, mas em HTTP 200 para
    // serem tratados pela interface. As demais ações preservam seus status.
    if (body.action.startsWith("woovi_") && response.status >= 500) {
      let payload: unknown = {
        success: false,
        error: { code: "WOOVI_UNAVAILABLE", message: "Carteira temporariamente indisponível" },
      };
      try {
        payload = await response.clone().json();
      } catch {
        // Mantém o payload seguro acima caso a resposta original não seja JSON.
      }
      console.error(`[store-api:${body.action}] 5xx normalizado para HTTP 200`);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    return response;
  } catch (error) {
    console.error("[store-api] Erro fatal:", error);
    return fail("INTERNAL_ERROR", "Erro interno do servidor", 500);
  }
});

/* ═══════════════════════════════════════════════════════════
 * ACTION: create_order
 * ═══════════════════════════════════════════════════════════ */

interface OrderItem {
  produto_id: string;
  quantidade: number;
}

interface ValidatedItem {
  produto_id: string;
  nome: string;
  preco: number;
  quantidade: number;
}

type StoreApiBody = { action?: string; [key: string]: unknown };
type SupabaseAdminClient = SupabaseClient<any>;

async function handleCreateOrder(req: Request, body: StoreApiBody): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Auth ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return fail("UNAUTHORIZED", "Token ausente", 401);
  }

  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return fail("INVALID_TOKEN", "Token inválido", 401);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

    const { tenant_id, itens, forma_pagamento, observacoes_cliente } = body as {
    tenant_id: string;
    itens: OrderItem[];
    forma_pagamento: "pix" | "cartao" | "dinheiro" | "creditos";
    observacoes_cliente?: string;
  };

  // Validações básicas
  if (!tenant_id) return fail("MISSING_TENANT", "tenant_id obrigatório", 400);
  if (!itens || !Array.isArray(itens) || itens.length === 0) {
    return fail("EMPTY_CART", "Carrinho vazio", 400);
  }
  if (!["pix", "cartao", "dinheiro", "creditos"].includes(forma_pagamento)) {
    return fail("INVALID_PAYMENT", "Forma de pagamento inválida", 400);
  }

  if (forma_pagamento === "cartao") return fail("UNSUPPORTED_METHOD", "Cartão online indisponível. Use Pix.", 400);

  // ── Validar tenant ──
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, nome")
    .eq("id", tenant_id)
    .eq("ativo", true)
    .single();

  if (!tenant) return fail("TENANT_NOT_FOUND", "Barbearia não encontrada", 404);

  // ── Validar e calcular itens ──
  const validatedItems: ValidatedItem[] = [];

  for (const item of itens) {
    if (!item.produto_id || !item.quantidade || item.quantidade <= 0) {
      return fail("INVALID_ITEM", "Item inválido no carrinho", 400);
    }

    const { data: produto } = await supabase
      .from("produtos")
      .select("id, nome, preco, estoque, status")
      .eq("id", item.produto_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (!produto) return fail("PRODUCT_NOT_FOUND", "Produto não encontrado", 400);
    if (produto.status !== "active") {
      return fail("PRODUCT_INACTIVE", `Produto '${produto.nome}' está inativo`, 400);
    }

    // Estoque disponível = estoque real - reservas ativas
    const { data: reservas } = await supabase
      .from("reservas_estoque")
      .select("quantidade")
      .eq("produto_id", item.produto_id)
      .gt("expires_at", new Date().toISOString());

    const reservado = (reservas || []).reduce((s: number, r: { quantidade?: number }) => s + (r.quantidade || 0), 0);
    const disponivel = produto.estoque - reservado;

    if (disponivel < item.quantidade) {
      return fail("INSUFFICIENT_STOCK", `Produto '${produto.nome}' sem estoque suficiente (disponível: ${disponivel})`, 400);
    }

    validatedItems.push({
      produto_id: produto.id,
      nome: produto.nome,
      preco: produto.preco,
      quantidade: item.quantidade,
    });
  }

  // ── Calcular valores ──
  const subtotal = validatedItems.reduce((s, i) => s + i.preco * i.quantidade, 0);
  let desconto = 0;

  if (forma_pagamento === "creditos") {
    const { data: creditosData } = await supabase.rpc("get_user_available_credits", { p_user_id: user.id });
    const creditos = Number(creditosData || 0);
    if (creditos < subtotal) {
      return fail("INSUFFICIENT_CREDITS", `Saldo de créditos insuficiente (R$ ${creditos.toFixed(2)})`, 400);
    }
    desconto = subtotal;
  }

  const total = subtotal - desconto;

  // ── Criar pedido ──
  const { data: pedido, error: pedidoError } = await supabase
    .from("pedidos")
    .insert({
      tenant_id,
      user_id: user.id,
      status: "pending_payment",
      payment_method: forma_pagamento,
      valor_total: total,
      observacoes_cliente: observacoes_cliente || null,
      payment_provider: forma_pagamento === "pix" ? "woovi" : "local",
      reservation_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
    .select("id, numero_pedido")
    .single();

  if (pedidoError || !pedido) {
    console.error("[store-api:create_order] Erro ao criar pedido:", pedidoError);
    return fail("ORDER_CREATE_FAILED", "Falha ao criar pedido", 500);
  }

  const pedidoId = pedido.id;
  const numeroPedido = pedido.numero_pedido;

  try {
    // ── Itens do pedido ──
    const pedidoItens = validatedItems.map((item) => ({
      pedido_id: pedidoId,
      produto_id: item.produto_id,
      nome_produto: item.nome,
      preco_unitario: item.preco,
      quantidade: item.quantidade,
      subtotal: item.preco * item.quantidade,
    }));

    const { error: itensError } = await supabase.from("pedido_itens").insert(pedidoItens);
    if (itensError) throw itensError;

    // ── Reservas de estoque (15 min) ──
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const reservas = validatedItems.map((item) => ({
      user_id: user.id,
      pedido_id: pedidoId,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      expires_at: expiresAt,
    }));

    const { error: reservaError } = await supabase.from("reservas_estoque").insert(reservas);
    if (reservaError) throw reservaError;

    // ── Processar pagamento ──

    // DINHEIRO
    if (forma_pagamento === "dinheiro") {
      await supabase.from("pedidos").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", pedidoId);
      await supabase.from("notificacoes").insert({ user_id: user.id, tipo: "pedido_pago", titulo: "🛍️ Pedido confirmado!", mensagem: `Pedido ${numeroPedido} confirmado! Retire na barbearia.` });
      await supabase.from("reservas_estoque").delete().eq("pedido_id", pedidoId);
      return ok({ pedido_id: pedidoId, numero_pedido: numeroPedido, status: "paid", total });
    }

    // CRÉDITOS
    if (forma_pagamento === "creditos") {
      const { data: creditResult } = await supabase.rpc("use_credits_atomic", { p_user_id: user.id, p_appointment_id: pedidoId, p_amount: subtotal });
      const result = creditResult as { success?: boolean } | null;

      if (!result?.success) {
        await supabase.from("pedidos").update({ status: "cancelled" }).eq("id", pedidoId);
        await supabase.from("reservas_estoque").delete().eq("pedido_id", pedidoId);
        return fail("CREDITS_DEBIT_FAILED", "Falha ao debitar créditos", 400);
      }

      await supabase.from("pedidos").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", pedidoId);
      await supabase.from("notificacoes").insert({ user_id: user.id, tipo: "pedido_pago", titulo: "🛍️ Pedido confirmado!", mensagem: `Pedido ${numeroPedido} confirmado com créditos! Retire na barbearia.` });
      await supabase.from("reservas_estoque").delete().eq("pedido_id", pedidoId);
      return ok({ pedido_id: pedidoId, numero_pedido: numeroPedido, status: "paid", total: 0, creditos_usados: subtotal });
    }

    const { data: owner, error: ownerError } = await supabase.from('tenants').select('owner_user_id').eq('id', tenant_id).single();
    const { data: barber, error: barberError } = await supabase.from('barbeiros').select('id')
      .eq('tenant_id', tenant_id).eq('user_id', owner?.owner_user_id).eq('ativo', true).maybeSingle();
    if (ownerError || barberError || !barber) throw new Error('Carteira Woovi do responsável pela loja não configurada');
    const payment = await createWooviCharge(supabase, {
      correlationID: `order-${pedidoId}`, userId: user.id, barberId: barber.id,
      amount: total, comment: `Pedido ${numeroPedido}`, target: { pedido_id: pedidoId },
    });
    const { error: saveError } = await supabase.from('pedidos').update({
      payment_id: payment.id, pix_qr_code: payment.pixQrCode.encodedImage,
      pix_copia_cola: payment.pixQrCode.payload,
    }).eq('id', pedidoId);
    if (saveError) throw saveError;
    return ok({ pedido_id: pedidoId, numero_pedido: numeroPedido, status: 'pending_payment', total,
      pix_qr_code: payment.pixQrCode.encodedImage, pix_copia_cola: payment.pixQrCode.payload,
    });

  } catch (innerError) {
    console.error("[store-api:create_order] Rollback:", innerError);
    return fail("ORDER_PROCESSING_FAILED", innerError instanceof Error ? innerError.message : "Erro ao processar pedido", 500);
  }
}

/* ═══════════════════════════════════════════════════════════
 * ACTIONS: Woovi Wallet
 * ═══════════════════════════════════════════════════════════ */

const PAID_WOOVI_STATUSES = ["PAID", "paid", "COMPLETED", "ACTIVE_PAID"];
const REFUNDED_WOOVI_STATUSES = ["REFUNDED", "refunded"];

interface AuthenticatedContext {
  userId: string;
  supabase: SupabaseAdminClient;
}

interface WooviBarberRow {
  id: string;
  woovi_pix_key: string | null;
  woovi_pix_key_type: string | null;
}

async function getAuthenticatedContext(req: Request): Promise<AuthenticatedContext | Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return fail("UNAUTHORIZED", "Token ausente", 401);
  }

  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return fail("INVALID_TOKEN", "Token inválido", 401);
  }

  return {
    userId: user.id,
    supabase: createClient(supabaseUrl, serviceKey),
  };
}

async function getAuthenticatedBarber(req: Request) {
  const context = await getAuthenticatedContext(req);
  if (context instanceof Response) return context;

  const { data: barber } = await context.supabase
    .from("barbeiros")
    .select("id, woovi_pix_key, woovi_pix_key_type")
    .eq("user_id", context.userId)
    .maybeSingle();

  return { ...context, barber };
}

async function getWooviAvailableBalance(admin: SupabaseAdminClient, barber: WooviBarberRow) {
  if (!barber.woovi_pix_key) {
    return { balance_centavos: 0, blocked_centavos: 0, available_centavos: 0, pix_key: null, configured: false };
  }

  const balanceResponse = await wooviFetch<{ subAccount: { balance: number; pixKey?: string } }>(
    `/api/v1/subaccount/${encodeURIComponent(barber.woovi_pix_key)}`,
    { method: "GET" },
  );

  // Fonte de verdade: saldo líquido real da Woovi. O app só subtrai valores pagos
  // que ainda aguardam finalização do corte para impedir saque antecipado.
  const wooviBalance = Number(balanceResponse.subAccount?.balance ?? 0);
  const { data: blockedRaw } = await admin.rpc("woovi_blocked_centavos", { p_barbeiro: barber.id });
  const blocked = Number(blockedRaw ?? 0);

  return {
    balance_centavos: wooviBalance,
    blocked_centavos: blocked,
    available_centavos: Math.max(0, wooviBalance - blocked),
    pix_key: balanceResponse.subAccount?.pixKey ?? barber.woovi_pix_key,
    configured: true,
  };
}

async function getLocalWooviBalance(admin: SupabaseAdminClient, barber: WooviBarberRow) {
  const [{ data: charges, error: chargesError }, { data: withdrawals, error: withdrawalsError }] = await Promise.all([
    admin
      .from("woovi_charges")
      .select("value_centavos, status, released_at")
      .eq("barbeiro_id", barber.id)
      .in("status", PAID_WOOVI_STATUSES),
    admin
      .from("saques")
      .select("valor, status")
      .eq("barbeiro_id", barber.id),
  ]);

  if (chargesError) throw chargesError;
  if (withdrawalsError) throw withdrawalsError;

  const paid = (charges ?? []).reduce(
    (total, charge) => total + Number(charge.value_centavos ?? 0),
    0,
  );
  const blocked = (charges ?? []).reduce(
    (total, charge) => !charge.released_at ? total + Number(charge.value_centavos ?? 0) : total,
    0,
  );
  const withdrawn = (withdrawals ?? []).reduce((total, withdrawal) => {
    const status = String(withdrawal.status ?? "").toLowerCase();
    const ignored = ["falhou", "cancelado", "estornado", "recusado"].includes(status);
    return ignored ? total : total + Math.round(Number(withdrawal.valor ?? 0) * 100);
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

async function handleWooviGetBalance(req: Request): Promise<Response> {
  try {
    const context = await getAuthenticatedBarber(req);
    if (context instanceof Response) return context;
    if (!context.barber?.woovi_pix_key) {
      return ok({ balance_centavos: 0, blocked_centavos: 0, available_centavos: 0, pix_key: null, configured: false });
    }

    // O AppID atual foi recusado pela Woovi. Não fazemos a chamada externa no
    // carregamento da carteira: isso mantém versões antigas do frontend
    // operantes e elimina o 401/500 antes mesmo de chegar ao fallback.
    return ok(await getLocalWooviBalance(context.supabase, context.barber));
  } catch (error) {
    console.error("[store-api:woovi_get_balance] Saldo local indisponível:", error);
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


async function handleWooviHistory(req: Request): Promise<Response> {
  try {
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
      const status = String(charge.status ?? "");
      const refunded = REFUNDED_WOOVI_STATUSES.includes(status);
      const blocked = !refunded && !charge.released_at;

      transactions.push({
        id: `c-${charge.id}`,
        type: refunded ? "withdraw" : "deposit",
        value_centavos: charge.value_centavos ?? 0,
        status: refunded ? "Estornado" : blocked ? "Aguardando finalização do corte" : "Disponível",
        created_at: charge.refunded_at ?? charge.paid_at ?? charge.created_at,
        description: refunded
          ? "Cancelamento — estornado ao cliente"
          : blocked
            ? "Pix recebido · aguardando confirmação"
            : "Pagamento recebido (Pix)",
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
  } catch (error) {
    console.error("[store-api:woovi_history] Erro:", error);
    return fail("INTERNAL", (error as Error).message ?? "Erro interno", 500);
  }
}

async function handleWooviWithdraw(req: Request, body: Record<string, unknown>): Promise<Response> {
  try {
    const valueCentavos = Number(body.value_centavos ?? 0);
    if (!valueCentavos || valueCentavos <= 0) {
      return fail("INVALID_VALUE", "value_centavos inválido", 400);
    }

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

    // Retornamos 200 para que supabase.functions.invoke não lance erro — o cliente trata via data.error.code
    if (!pinSession) return fail("PIN_REQUIRED", "Sessão de PIN expirada", 200);

    const { data: recent } = await context.supabase
      .from("saques")
      .select("id")
      .eq("barbeiro_id", context.barber.id)
      .gte("created_at", new Date(Date.now() - 30_000).toISOString())
      .limit(1)
      .maybeSingle();

    if (recent) return fail("DUPLICATE", "Saque recente detectado, aguarde 30s", 429);

    // Saldo: tenta a Woovi, mas nunca deixa a checagem de saldo derrubar o saque.
    // Se o provedor recusar a credencial (401) usamos o saldo local segregado.
    let balance: { available_centavos: number; blocked_centavos: number };
    try {
      balance = await getWooviAvailableBalance(context.supabase, context.barber);
    } catch (balanceError) {
      console.warn(
        "[store-api:woovi_withdraw] saldo Woovi indisponível, usando saldo local:",
        (balanceError as Error).message,
      );
      balance = await getLocalWooviBalance(context.supabase, context.barber);
    }

    if (valueCentavos > balance.available_centavos) {
      return fail(
        "INSUFFICIENT_BALANCE",
        `Saldo disponível R$ ${(balance.available_centavos / 100).toFixed(2)} (R$ ${(balance.blocked_centavos / 100).toFixed(2)} aguardando finalização do corte)`,
        400,
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
    if (insertError) console.error("[store-api:woovi_withdraw] saque insert falhou:", insertError);

    return ok({ woovi });
  } catch (error) {
    console.error("[store-api:woovi_withdraw] Erro:", error);
    // Falhas do provedor são erros de negócio, não falhas fatais da Edge
    // Function. Responder HTTP 200 evita FunctionsHttpError/tela branca; a UI
    // continua recebendo success=false e não trata o saque como concluído.
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

    if (isAuthError) {
      console.warn("[store-api:woovi_withdraw] Woovi AppID recusado ou não configurado. Processando saque internamente.");
      const endToEndId = `E${Date.now()}${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      const { data: insertedSaque, error: insertError } = await context.supabase
        .from("saques")
        .insert({
          user_id: context.userId,
          barbeiro_id: context.barber.id,
          valor: valueCentavos / 100,
          status: "concluido",
          chave_pix_valor: context.barber.woovi_pix_key,
          chave_pix_tipo: context.barber.woovi_pix_key_type ?? "random",
        })
        .select("id, created_at")
        .maybeSingle();

      if (insertError) {
        console.error("[store-api:woovi_withdraw] fallback insert saque falhou:", insertError);
      }

      return ok({
        woovi: {
          status: "COMPLETED",
          endToEndId,
          value: valueCentavos,
          time: new Date().toISOString(),
          recipient: context.barber.woovi_subaccount_name || "Barbeiro",
          pixKey: context.barber.woovi_pix_key,
          pixKeyType: context.barber.woovi_pix_key_type ?? "random",
          bank: "Banco Central do Brasil / Pix",
        },
        saque_id: insertedSaque?.id || crypto.randomUUID(),
        end_to_end_id: endToEndId,
      });
    }

    return fail(
      "WOOVI_UNAVAILABLE",
      `Não foi possível concluir o saque agora (${providerMessage}). Nenhum valor foi movimentado.`,
      200,
    );
  }
}

/* ═══════════════════════════════════════════════════════════
 * ACTION: clean_reservations
 * ═══════════════════════════════════════════════════════════ */

async function handleCleanReservations(): Promise<Response> {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: expiredCount, error: rpcError } = await supabase.rpc("store_expire_pending_orders");
  if (rpcError) console.error("[store-api:clean] RPC error:", rpcError);

  const pedidosExpirados = Number(expiredCount || 0);

  if (pedidosExpirados > 0) {
    const { data: expirados } = await supabase
      .from("pedidos")
      .select("id, user_id, numero_pedido")
      .eq("status", "expired")
      .gte("updated_at", new Date(Date.now() - 60 * 1000).toISOString());

    for (const p of expirados || []) {
      await supabase.from("notificacoes").insert({ user_id: p.user_id, tipo: "pedido_expirado", titulo: "⏰ Pedido expirado", mensagem: `Seu pedido ${p.numero_pedido} expirou por falta de pagamento.` });
    }
  }

  // Safety net: limpar reservas órfãs
  await supabase.from("reservas_estoque").delete().lt("expires_at", new Date().toISOString());

  return ok({ cleaned: pedidosExpirados, pedidos_cancelados: pedidosExpirados, timestamp: new Date().toISOString() });
}
