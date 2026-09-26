/**
 * WOOVI-HISTORY
 * Retorna histórico unificado de entradas (cobranças pagas) e saídas (saques)
 * da carteira Woovi do barbeiro autenticado. Últimos 50 lançamentos.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, handleCors } from "../_shared/response.ts";

interface Tx {
  id: string;
  type: "deposit" | "withdraw";
  value_centavos: number;
  status: string;
  created_at: string;
  description?: string;
  blocked?: boolean;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail("UNAUTHORIZED", "Token ausente", 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: uerr } = await supabase.auth.getUser();
    if (uerr || !user) return fail("INVALID_TOKEN", "Token inválido", 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: barb } = await admin
      .from("barbeiros")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!barb) return ok({ transactions: [] });

    const [charges, saques] = await Promise.all([
      admin
        .from("woovi_charges")
        .select("id, value_centavos, status, created_at, paid_at, released_at, refunded_at")
        .eq("barbeiro_id", barb.id)
        .in("status", ["PAID", "paid", "COMPLETED", "ACTIVE_PAID", "REFUNDED", "refunded"])
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("saques")
        .select("id, valor, status, created_at, chave_pix_tipo, chave_pix_valor")
        .eq("barbeiro_id", barb.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const tx: Tx[] = [];
    for (const c of (charges.data ?? []) as any[]) {
      const refunded = ["REFUNDED", "refunded"].includes(c.status ?? "");
      const blocked = !refunded && !c.released_at;
      tx.push({
        id: `c-${c.id}`,
        type: refunded ? "withdraw" : "deposit",
        value_centavos: c.value_centavos ?? 0,
        status: refunded ? "Estornado" : blocked ? "Aguardando finalização do corte" : "Disponível",
        created_at: c.refunded_at ?? c.paid_at ?? c.created_at,
        description: refunded
          ? "Cancelamento — estornado ao cliente"
          : blocked
            ? "Pix recebido · aguardando confirmação"
            : "Pagamento recebido (Pix)",
        blocked,
      });
    }
    for (const s of (saques.data ?? [])) {
      tx.push({
        id: `s-${s.id}`,
        type: "withdraw",
        value_centavos: Math.round(Number(s.valor ?? 0) * 100),
        status: s.status ?? "processando",
        created_at: s.created_at,
        description: "Saque Pix",
      });
    }
    tx.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return ok({ transactions: tx.slice(0, 50) });
  } catch (err) {
    console.error("[woovi-history] erro:", err);
    return fail("INTERNAL", (err as Error).message ?? "Erro interno", 500);
  }
});
