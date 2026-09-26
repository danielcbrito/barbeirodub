/**
 * efi-create-pix-charge
 * Cria uma cobrança PIX dinâmica na Efí Bank vinculada a um barbeiro.
 * O dinheiro cai na conta Efí da DUB e será repassado via webhook.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { efiRequest, resolveEfiEnvForTenant } from "../_shared/efi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateTxid(): string {
  // Efí exige txid 26-35 chars [a-zA-Z0-9]
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth do cliente
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { barbeiro_id, valor, descricao } = await req.json();
    if (!barbeiro_id || typeof valor !== "number" || valor <= 0) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (valor < 1) {
      return new Response(JSON.stringify({ error: "Valor mínimo: R$ 1,00" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Buscar chave PIX padrão do barbeiro (apenas para registro — repasse usa essa chave)
    const { data: barbeiro } = await admin
      .from("barbeiros").select("id, user_id, apelido, tenant_id").eq("id", barbeiro_id).maybeSingle();
    if (!barbeiro) return new Response(JSON.stringify({ error: "Barbeiro não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Resolver ambiente Efí (test/prod) com base no tenant do barbeiro
    const efiEnv = await resolveEfiEnvForTenant(admin, barbeiro.tenant_id);
    console.log(`[efi-create-pix-charge] tenant=${barbeiro.tenant_id} env=${efiEnv}`);

    const { data: pixKey } = await admin
      .from("chaves_pix").select("chave, tipo")
      .eq("user_id", barbeiro.user_id)
      .eq("is_default", true)
      .maybeSingle();
    if (!pixKey?.chave) {
      return new Response(JSON.stringify({ error: "Barbeiro não possui chave PIX cadastrada" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Chave PIX da DUB (recebedora) — configurada como secret
    const dubPixKey = Deno.env.get("EFI_DUB_PIX_KEY");
    if (!dubPixKey) {
      return new Response(JSON.stringify({ error: "Chave PIX da DUB não configurada (EFI_DUB_PIX_KEY)" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const txid = generateTxid();
    const valorStr = valor.toFixed(2);

    // Criar cobrança na Efí
    const cobBody = {
      calendario: { expiracao: 1800 }, // 30 min
      valor: { original: valorStr },
      chave: dubPixKey,
      solicitacaoPagador: descricao || `Pagamento ${barbeiro.apelido}`,
      infoAdicionais: [
        { nome: "barbeiro_id", valor: barbeiro_id },
        { nome: "chave_destino", valor: pixKey.chave },
      ],
    };

    const cob = await efiRequest<any>(`/v2/cob/${txid}`, { method: "PUT", body: cobBody, env: efiEnv });

    // Gerar QR Code
    const qr = await efiRequest<any>(`/v2/loc/${cob.loc.id}/qrcode`, { method: "GET", env: efiEnv });

    // Persistir no banco
    const { data: charge, error: insertErr } = await admin
      .from("efi_pix_charges")
      .insert({
        txid,
        loc_id: cob.loc.id,
        br_code: qr.qrcode,
        qr_code_image: qr.imagemQrcode,
        valor,
        barbeiro_id,
        user_id: user.id,
        chave_pix_destino: pixKey.chave,
        descricao: descricao || null,
        status: "PENDENTE",
        expires_at: new Date(Date.now() + 1800 * 1000).toISOString(),
        raw_charge: cob,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({
      success: true,
      data: {
        txid,
        br_code: qr.qrcode,
        qr_code_image: qr.imagemQrcode,
        valor,
        expires_at: charge.expires_at,
        charge_id: charge.id,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("efi-create-pix-charge error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
