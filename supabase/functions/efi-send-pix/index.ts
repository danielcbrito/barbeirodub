/**
 * efi-send-pix
 * Executa um Pix de saída a partir do saldo da carteira do barbeiro.
 *
 * Fluxo:
 *  1. Valida solicitação + barbeiro
 *  2. Debita saldo via RPC `debitar_carteira` (atômico)
 *  3. Cria transação `processando` em `transacoes_financeiras`
 *  4. Envia Pix via Efí (PUT /v2/gn/pix/{idEnvio})
 *  5. Sucesso → confirma transação (e2e_id, status=concluida)
 *     Falha   → reverte saldo + marca transação como `falhou`
 *
 * Pode ser chamada:
 *  - Pelo cliente autenticado (saque manual)
 *  - Pela própria webhook (saque automático) com header x-internal-key
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { efiRequest, resolveEfiEnvForTenant } from "../_shared/efi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
};

function genIdEnvio(): string {
  return `env${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function getMasterKey(): Uint8Array {
  const raw = Deno.env.get("PIX_ENCRYPTION_KEY");
  if (!raw) throw new Error("PIX_ENCRYPTION_KEY não configurada");

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(raw.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length !== 32) throw new Error("PIX_ENCRYPTION_KEY deve ter 32 bytes (AES-256)");
  return bytes;
}

function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function decryptPixKey(payload: {
  chave_encrypted: string | null;
  chave_iv: string | null;
  chave_auth_tag: string | null;
}) {
  if (!payload.chave_encrypted || !payload.chave_iv || !payload.chave_auth_tag) {
    throw new Error("Chave PIX criptografada incompleta");
  }

  const keyBytes = getMasterKey();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(keyBytes),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const ciphertext = b64ToBytes(payload.chave_encrypted);
  const authTag = b64ToBytes(payload.chave_auth_tag);
  const iv = b64ToBytes(payload.chave_iv);
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, cryptoKey, combined);
  return new TextDecoder().decode(decrypted).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const internalKey = Deno.env.get("INTERNAL_FUNCTION_KEY") || "";
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const { barbeiro_id, valor, tipo, descricao, chave_pix_id } = await req.json();

    // Auth: ou JWT do barbeiro, ou chamada interna
    const isInternal = internalKey && req.headers.get("x-internal-key") === internalKey;
    if (!isInternal) {
      const authHeader = req.headers.get("Authorization") || "";
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Não autenticado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Verifica se barbeiro pertence ao usuário
      const { data: b } = await admin.from("barbeiros").select("user_id").eq("id", barbeiro_id).maybeSingle();
      if (!b || b.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Barbeiro inválido" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!barbeiro_id || typeof valor !== "number" || valor < 1) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos (valor mínimo R$ 1,00)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tipoTransacao = tipo === "saque_automatico" ? "saque_automatico" : "saque_manual";

    const { data: barber } = await admin
      .from("barbeiros")
      .select("id, user_id, tenant_id")
      .eq("id", barbeiro_id)
      .maybeSingle();
    if (!barber) {
      return new Response(JSON.stringify({ error: "Barbeiro não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Buscar carteira + chave
    const { data: carteira } = await admin
      .from("carteiras").select("*").eq("barbeiro_id", barbeiro_id).maybeSingle();
    if (!carteira) {
      return new Response(JSON.stringify({ error: "Carteira não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pixKeyQuery = admin
      .from("chaves_pix")
      .select("id, chave, chave_encrypted, chave_iv, chave_auth_tag, is_default")
      .eq("user_id", barber.user_id)
      .order("is_default", { ascending: false })
      .limit(1);

    const { data: pixKey } = chave_pix_id
      ? await admin
          .from("chaves_pix")
          .select("id, chave, chave_encrypted, chave_iv, chave_auth_tag, is_default")
          .eq("id", chave_pix_id)
          .eq("user_id", barber.user_id)
          .maybeSingle()
      : await pixKeyQuery.maybeSingle();

    let plainPixKey = carteira.chave_pix || null;
    if (pixKey?.chave_encrypted && pixKey?.chave_iv && pixKey?.chave_auth_tag) {
      plainPixKey = await decryptPixKey(pixKey);
    }

    if (!plainPixKey) {
      return new Response(JSON.stringify({ error: "Chave Pix não cadastrada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (Number(carteira.saldo_disponivel) < valor) {
      return new Response(JSON.stringify({ error: "Saldo insuficiente" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Debitar saldo (atômico)
    const { data: debitOk, error: debitErr } = await admin.rpc("debitar_carteira", {
      p_barbeiro_id: barbeiro_id, p_valor: valor,
    });
    if (debitErr || !debitOk) {
      return new Response(JSON.stringify({ error: debitErr?.message || "Falha ao debitar saldo" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Criar transação processando
    const { data: tx, error: txErr } = await admin
      .from("transacoes_financeiras")
      .insert({
        barbeiro_id,
        carteira_id: carteira.id,
        tipo: tipoTransacao,
        valor,
        status: "processando",
        chave_pix_destino: pixKey?.chave || carteira.chave_pix || null,
        descricao: descricao || (tipoTransacao === "saque_automatico" ? "Saque automático Pix" : "Saque manual Pix"),
      }).select().single();
    if (txErr) {
      // rollback saldo
      await admin.rpc("reverter_transacao_falha", { p_barbeiro_id: barbeiro_id, p_valor: valor });
      throw txErr;
    }

    // 4. Resolver ambiente Efí + enviar Pix
    const efiEnv = await resolveEfiEnvForTenant(admin, barber?.tenant_id);
    const idEnvio = genIdEnvio();
    const dubPixKey = Deno.env.get("EFI_DUB_PIX_KEY");
    if (!dubPixKey) {
      await admin.rpc("reverter_transacao_falha", { p_barbeiro_id: barbeiro_id, p_valor: valor });
      await admin.from("transacoes_financeiras").update({
        status: "falhou", erro_mensagem: "EFI_DUB_PIX_KEY não configurada",
      }).eq("id", tx.id);
      return new Response(JSON.stringify({ error: "Chave Pix da DUB não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const pixOutBody = {
        valor: valor.toFixed(2),
        pagador: { chave: dubPixKey },
          favorecido: { chave: plainPixKey },
      };
      const pixResp = await efiRequest<any>(`/v2/gn/pix/${idEnvio}`, {
        method: "PUT", body: pixOutBody, env: efiEnv,
      });

      // 5. Sucesso
      await admin.from("transacoes_financeiras").update({
        status: "concluida",
        efi_e2e_id: pixResp?.e2eId || null,
        metadata: { ...pixResp, idEnvio },
        completed_at: new Date().toISOString(),
      }).eq("id", tx.id);

      console.log(`[efi-send-pix] ✅ tx=${tx.id} barbeiro=${barbeiro_id} valor=${valor} env=${efiEnv}`);

      return new Response(JSON.stringify({
        success: true,
        transaction_id: tx.id,
        e2e_id: pixResp?.e2eId,
        valor,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (pixErr: any) {
      console.error("[efi-send-pix] ❌ Pix out falhou:", pixErr);
      // ROLLBACK: devolver saldo
      await admin.rpc("reverter_transacao_falha", {
        p_barbeiro_id: barbeiro_id, p_valor: valor,
      });
      await admin.from("transacoes_financeiras").update({
        status: "falhou",
        erro_mensagem: pixErr.message?.slice(0, 500) || "Erro Efí",
      }).eq("id", tx.id);

      return new Response(JSON.stringify({
        error: "Falha ao executar Pix. Saldo restaurado.",
        details: pixErr.message,
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err: any) {
    console.error("efi-send-pix fatal:", err);
    return new Response(JSON.stringify({ error: err.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
