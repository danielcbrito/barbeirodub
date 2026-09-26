/**
 * WOOVI-AUTO-WITHDRAW-CRON
 * Agendada para rodar TODA QUARTA-FEIRA. Saca o saldo INTEGRAL da subconta
 * de cada barbeiro com `woovi_auto_withdraw_enabled = true` direto para a
 * chave Pix cadastrada na própria subconta.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, handleCors } from "../_shared/response.ts";
import { wooviFetch } from "../_shared/woovi-client.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // 🔒 Proteção do cron: exige header com segredo
    const cronSecret = Deno.env.get("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    if (!cronSecret || provided !== cronSecret) {
      return fail("UNAUTHORIZED", "cron secret inválido", 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: barbers, error } = await admin
      .from("barbeiros")
      .select("id, user_id, woovi_pix_key, woovi_pix_key_type")
      .eq("woovi_auto_withdraw_enabled", true)
      .not("woovi_pix_key", "is", null);

    if (error) return fail("DB_ERROR", error.message, 500);

    const results: Array<{ barbeiro_id: string; status: string; value?: number; reason?: string }> = [];

    for (const b of barbers ?? []) {
      try {
        const bal = await wooviFetch<{ subAccount: { balance: number } }>(
          `/api/v1/subaccount/${encodeURIComponent(b.woovi_pix_key!)}`,
        );
        const balance = bal.subAccount?.balance ?? 0;

        // Saca tudo (saque semanal de quarta). Ignora se zero.
        if (balance <= 0) {
          results.push({ barbeiro_id: b.id, status: "skipped", reason: "zero_balance" });
          continue;
        }

        await wooviFetch(
          `/api/v1/subaccount/${encodeURIComponent(b.woovi_pix_key!)}/withdraw`,
          { method: "POST", body: JSON.stringify({ value: balance }) },
        );

        await admin.from("saques").insert({
          user_id: b.user_id,
          barbeiro_id: b.id,
          valor: balance / 100,
          status: "processando",
          chave_pix_valor: b.woovi_pix_key!,
          chave_pix_tipo: b.woovi_pix_key_type ?? "random",
        });

        await admin
          .from("barbeiros")
          .update({ woovi_last_auto_withdraw_at: new Date().toISOString() })
          .eq("id", b.id);

        results.push({ barbeiro_id: b.id, status: "withdrawn", value: balance });
      } catch (err) {
        results.push({
          barbeiro_id: b.id,
          status: "error",
          reason: (err as Error).message ?? "woovi_error",
        });
      }
    }

    return ok({ processed: results.length, results });
  } catch (err) {
    console.error("[woovi-auto-withdraw-cron] erro:", err);
    return fail("INTERNAL", (err as Error).message ?? "Erro interno", 500);
  }
});
