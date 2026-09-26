/**
 * efi-webhook
 * Recebe notificações de pagamento Pix da Efí.
 *
 * Novo fluxo (carteira interna):
 *  1. Idempotência via efi_webhook_events
 *  2. Marca cobrança como PAGO em efi_pix_charges
 *  3. Credita 100% do valor na carteira do barbeiro (RPC creditar_carteira)
 *  4. Se barbeiro tem pix_automatico_ativo + chave validada → invoca efi-send-pix
 *
 * URL configurada na Efí inclui ?hmac={EFI_WEBHOOK_HMAC_SECRET} para validação.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Validação HMAC via query string
  const url = new URL(req.url);
  const hmacReceived = url.searchParams.get("hmac");
  const hmacExpected = Deno.env.get("EFI_WEBHOOK_HMAC_SECRET");
  if (!hmacExpected || hmacReceived !== hmacExpected) {
    console.warn("efi-webhook: HMAC inválido");
    return new Response("forbidden", { status: 403 });
  }

  try {
    const payload = await req.json();
    console.log("efi-webhook payload:", JSON.stringify(payload).slice(0, 500));

    const pixEvents = Array.isArray(payload?.pix) ? payload.pix : [];
    if (pixEvents.length === 0) {
      return new Response(JSON.stringify({ ok: true, ping: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const internalKey = Deno.env.get("INTERNAL_FUNCTION_KEY") || "";
    const admin = createClient(supabaseUrl, serviceKey);

    for (const ev of pixEvents) {
      const { txid, endToEndId, valor, horario } = ev;
      if (!txid) continue;

      // 1. Idempotência
      const eventSig = await sha256(`${txid}|${endToEndId}|${valor}`);
      const { error: dupErr } = await admin.from("efi_webhook_events").insert({
        event_signature: eventSig, txid, e2e_id: endToEndId, payload: ev,
      });
      if (dupErr && dupErr.code === "23505") {
        console.log(`efi-webhook: duplicado txid=${txid}`);
        continue;
      }

      // 2. Localizar cobrança
      const { data: charge } = await admin
        .from("efi_pix_charges").select("*").eq("txid", txid).maybeSingle();
      if (!charge) {
        console.warn(`efi-webhook: cobrança não encontrada txid=${txid}`);
        continue;
      }
      if (charge.status === "PAGO") {
        console.log(`efi-webhook: já paga txid=${txid}`);
        continue;
      }

      await admin.from("efi_pix_charges").update({
        status: "PAGO",
        paid_at: horario || new Date().toISOString(),
        e2e_id: endToEndId,
      }).eq("id", charge.id);

      const valorNum = Number(valor);

      // 3. Creditar carteira (100%)
      const { error: credErr } = await admin.rpc("creditar_carteira", {
        p_barbeiro_id: charge.barbeiro_id,
        p_valor: valorNum,
        p_charge_id: charge.id,
        p_descricao: `Pagamento Pix recebido (txid: ${txid.slice(0, 12)}...)`,
      });
      if (credErr) {
        console.error(`efi-webhook: erro ao creditar charge=${charge.id}:`, credErr);
        continue;
      }
      console.log(`[efi-webhook] ✅ creditado R$ ${valorNum} → barbeiro=${charge.barbeiro_id}`);

      // 4. Pix automático?
      const { data: carteira } = await admin
        .from("carteiras")
        .select("pix_automatico_ativo, chave_pix_validada, saldo_disponivel")
        .eq("barbeiro_id", charge.barbeiro_id)
        .maybeSingle();

      if (carteira?.pix_automatico_ativo && carteira?.chave_pix_validada && Number(carteira.saldo_disponivel) >= 1) {
        try {
          const sendUrl = `${supabaseUrl}/functions/v1/efi-send-pix`;
          const sendResp = await fetch(sendUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-key": internalKey,
              "apikey": serviceKey,
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              barbeiro_id: charge.barbeiro_id,
              valor: Number(carteira.saldo_disponivel),
              tipo: "saque_automatico",
              descricao: `Saque automático após recebimento Pix`,
            }),
          });
          const sendJson = await sendResp.json();
          console.log(`[efi-webhook] saque-auto resp:`, sendJson);
        } catch (sendErr: any) {
          console.error("[efi-webhook] saque-auto falhou:", sendErr.message);
          // Saldo permanece — barbeiro pode sacar manualmente
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("efi-webhook fatal:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
